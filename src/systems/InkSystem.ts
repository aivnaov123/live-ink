import Phaser from 'phaser';
import type { Theme } from '../theme';

// ---- Tuning knobs (play with these first!) ----
export const INK_MAX = 1400;        // px of line you can hold
const INK_REGEN = 260;              // px of ink regained per second while not drawing
const INK_COST = 1;                 // ink per px drawn
const MIN_STEP = 14;                // min distance between physics points
const THICK = 12;                   // physics thickness of a line (thicker = less tunneling)
const SOLID_MS = 2000;              // line fully solid for this long...
const LIFE_MS = 3000;               // ...then fades and disappears at this age
const INPUT_SMOOTH = 0.45;          // 0..1, lower = smoother but laggier finger tracking

interface Seg {
  body: MatterJS.BodyType;
  ax: number; ay: number; bx: number; by: number;
  born: number;
  stroke: number;
}

interface Pass { w: number; color: number; dx?: number; dy?: number }
interface Run { pts: Phaser.Math.Vector2[]; a: number }

const mix = (c1: number, c2: number, t: number) => {
  const r = (c1 >> 16 & 255) + ((c2 >> 16 & 255) - (c1 >> 16 & 255)) * t;
  const g = (c1 >> 8 & 255) + ((c2 >> 8 & 255) - (c1 >> 8 & 255)) * t;
  const b = (c1 & 255) + ((c2 & 255) - (c1 & 255)) * t;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
};

/** Chaikin corner-cutting: turns the polyline into a smooth curve (endpoints kept). */
function smooth(pts: Phaser.Math.Vector2[], iterations = 2): Phaser.Math.Vector2[] {
  let p = pts;
  for (let k = 0; k < iterations && p.length > 2; k++) {
    const out = [p[0]];
    for (let i = 0; i < p.length - 1; i++) {
      const a = p[i], b = p[i + 1];
      out.push(new Phaser.Math.Vector2(a.x * 0.75 + b.x * 0.25, a.y * 0.75 + b.y * 0.25));
      out.push(new Phaser.Math.Vector2(a.x * 0.25 + b.x * 0.75, a.y * 0.25 + b.y * 0.75));
    }
    out.push(p[p.length - 1]);
    p = out;
  }
  return p;
}

export class InkSystem {
  ink = INK_MAX;
  enabled = true;
  private segs: Seg[] = [];
  private gfx: Phaser.GameObjects.Graphics;
  private drawing = false;
  private last: { x: number; y: number } | null = null;   // last physics point
  private cursor: { x: number; y: number } | null = null; // smoothed finger position
  private strokeId = 0;
  private passes: Pass[];

  constructor(private scene: Phaser.Scene, private theme: Theme) {
    this.gfx = scene.add.graphics().setDepth(5);
    const bg = Phaser.Display.Color.HexStringToColor(theme.bg).color;
    // All passes are OPAQUE colors (glow pre-mixed with the background), so
    // overlapping pieces never stack into dark/bright beads.
    this.passes = theme.id === 'neon'
      ? [
          { w: 26, color: mix(bg, theme.ink, 0.14) },
          { w: 15, color: mix(bg, theme.ink, 0.38) },
          { w: 7, color: theme.ink },
          { w: 2.5, color: mix(theme.ink, 0xffffff, 0.8) },
        ]
      : [
          { w: 15, color: 0x111111, dx: 3, dy: 4 }, // hard offset shadow
          { w: 15, color: 0x111111 },               // thick black outline
          { w: 8, color: theme.ink },
          { w: 2, color: mix(theme.ink, 0xffffff, 0.55), dx: -1, dy: -2 }, // shine
        ];

    scene.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (!this.enabled) return;
      this.drawing = true;
      this.strokeId++;
      this.last = this.world(p);
      this.cursor = { ...this.last };
    });
    const stop = () => { this.drawing = false; this.last = null; this.cursor = null; };
    scene.input.on('pointerup', stop);
    scene.input.on('pointerupoutside', stop);
    scene.game.events.on('blur', stop);
    scene.events.once('shutdown', () => scene.game.events.off('blur', stop));
  }

  get ratio() { return this.ink / INK_MAX; }

  private world(p: Phaser.Input.Pointer) {
    const v = this.scene.cameras.main.getWorldPoint(p.x, p.y);
    return { x: v.x, y: v.y };
  }

  update(time: number, dtMs: number) {
    if (this.drawing && this.enabled && this.last && this.cursor) {
      // low-pass filter the finger so jittery input doesn't make a zig-zag line
      const raw = this.world(this.scene.input.activePointer);
      this.cursor.x += (raw.x - this.cursor.x) * INPUT_SMOOTH;
      this.cursor.y += (raw.y - this.cursor.y) * INPUT_SMOOTH;
      const p = this.cursor;
      let dx = p.x - this.last.x, dy = p.y - this.last.y;
      let d = Math.hypot(dx, dy);
      while (d >= MIN_STEP && this.ink >= MIN_STEP * INK_COST) {
        const step = Math.min(d, 40);
        const nx: number = this.last.x + (dx / d) * step;
        const ny: number = this.last.y + (dy / d) * step;
        this.addSeg(this.last.x, this.last.y, nx, ny, time);
        this.ink -= step * INK_COST;
        this.last = { x: nx, y: ny };
        dx = p.x - nx; dy = p.y - ny; d = Math.hypot(dx, dy);
      }
    } else {
      this.ink = Math.min(INK_MAX, this.ink + (INK_REGEN * dtMs) / 1000);
    }

    // expire old segments
    this.segs = this.segs.filter((s) => {
      if (time - s.born < LIFE_MS) return true;
      this.scene.matter.world.remove(s.body);
      return false;
    });
    this.render(time);
  }

  /** Group segments into continuous runs (same stroke + same fade level), then draw each as one smooth path. */
  private render(time: number) {
    const runs: Run[] = [];
    let cur: Run | null = null;
    let curStroke = -1;
    for (const s of this.segs) {
      const age = time - s.born;
      const raw = age < SOLID_MS ? 1 : 1 - (age - SOLID_MS) / (LIFE_MS - SOLID_MS);
      const a = raw >= 1 ? 1 : Math.ceil(raw * 10) / 10; // quantize so runs stay long
      const contiguous = cur && s.stroke === curStroke &&
        Math.abs(cur.pts[cur.pts.length - 1].x - s.ax) < 0.5 && Math.abs(cur.pts[cur.pts.length - 1].y - s.ay) < 0.5;
      if (!cur || !contiguous || cur.a !== a) {
        cur = { pts: [new Phaser.Math.Vector2(s.ax, s.ay)], a };
        runs.push(cur);
        curStroke = s.stroke;
      }
      cur.pts.push(new Phaser.Math.Vector2(s.bx, s.by));
    }

    const g = this.gfx;
    g.clear();
    const smoothed = runs.map((r) => ({ a: r.a, pts: smooth(r.pts) }));
    for (const pass of this.passes) {
      const ox = pass.dx ?? 0, oy = pass.dy ?? 0;
      for (const r of smoothed) {
        const pts = ox || oy ? r.pts.map((p) => new Phaser.Math.Vector2(p.x + ox, p.y + oy)) : r.pts;
        g.lineStyle(pass.w, pass.color, r.a);
        g.strokePoints(pts, false, false);
        // round caps; joins are already smooth after Chaikin, so no per-point circles needed
        g.fillStyle(pass.color, r.a);
        g.fillCircle(pts[0].x, pts[0].y, pass.w / 2);
        g.fillCircle(pts[pts.length - 1].x, pts[pts.length - 1].y, pass.w / 2);
      }
    }
  }

  private addSeg(ax: number, ay: number, bx: number, by: number, time: number) {
    const len = Math.hypot(bx - ax, by - ay);
    const body = this.scene.matter.add.rectangle(
      (ax + bx) / 2, (ay + by) / 2, len + THICK, THICK,
      {
        isStatic: true,
        angle: Math.atan2(by - ay, bx - ax),
        friction: 0.02,
        chamfer: { radius: THICK / 2 }, // capsule ends -> smooth joints
        label: 'ink',
      },
    );
    this.segs.push({ body, ax, ay, bx, by, born: time, stroke: this.strokeId });
  }
}
