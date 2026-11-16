import Phaser from 'phaser';
import type { Theme } from '../theme';
import { LINES, getLine } from '../skins';

// ---- Tuning knobs (play with these first!) ----
export const INK_MAX = 1400;        // px of line you can hold
const INK_REGEN = 260;              // px of ink regained per second while not drawing
const INK_COST = 1;                 // ink per px drawn
const MIN_STEP = 22;                // min distance between physics points (fewer joints = smoother roll)
const THICK = 12;                   // physics thickness of a line (thicker = less tunneling)
// Line lifetime: set per segment at creation (see Difficulty.inkLifeMs, 3.0 s -> 2.5 s late in a run).
// It's fully solid for the first 2/3 of its life, then fades out during the last 1/3 (the warning).
const SOLID_FRACTION = 2 / 3;
const INPUT_SMOOTH = 0.45;          // 0..1, lower = smoother but laggier finger tracking

interface Seg {
  body: MatterJS.BodyType;
  ax: number; ay: number; bx: number; by: number;
  born: number;
  life: number;      // ms this segment lives
  stroke: number;
}

interface Pass { w: number; color: number; dx?: number; dy?: number; cap?: boolean }

const mix = (c1: number, c2: number, t: number) => {
  const r = (c1 >> 16 & 255) + ((c2 >> 16 & 255) - (c1 >> 16 & 255)) * t;
  const g = (c1 >> 8 & 255) + ((c2 >> 8 & 255) - (c1 >> 8 & 255)) * t;
  const b = (c1 & 255) + ((c2 & 255) - (c1 & 255)) * t;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
};

export class InkSystem {
  ink = INK_MAX;
  enabled = true;
  private segs: Seg[] = [];
  private gfx: Phaser.GameObjects.Graphics;
  private drawing = false;
  private last: { x: number; y: number } | null = null;   // last physics point
  private cursor: { x: number; y: number } | null = null; // smoothed finger position
  private strokeId = 0;
  private passCache = new Map<number, Pass[]>();
  private bg: number;
  lineSkin = getLine();
  /** Lifetime for newly drawn lines (ms); the scene lowers it slowly with distance. */
  lifeMs = 3000;
  /** px of line laid down this frame (drives the drawing sound + sparks). */
  drawnPx = 0;

  constructor(private scene: Phaser.Scene, private theme: Theme) {
    this.gfx = scene.add.graphics().setDepth(5);
    this.bg = Phaser.Display.Color.HexStringToColor(theme.bg).color;

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

  /** Stop the current stroke (pause, menu, death). */
  cancel() { this.drawing = false; this.last = null; this.cursor = null; }

  get isDrawing() { return this.drawing && this.enabled; }
  /** Pen tip in world coords while drawing. */
  get tip() { return this.cursor; }
  /** Color of the stroke being drawn now. */
  currentColor() { return this.strokeColor(this.strokeId); }

  private strokeColor(stroke: number): number {
    const c = LINES[this.lineSkin].color;
    if (c === 'prism') return Phaser.Display.Color.HSVToRGB(((stroke * 67) % 360) / 360, 0.75, 1).color as number;
    if (c === 'aurora') return stroke % 2 ? 0xb47cff : 0x5ef2c8;
    return c ?? this.theme.ink;
  }

  /** Render passes for a given ink color. All OPAQUE (glow pre-mixed with the background),
   *  so overlapping pieces never stack into beads. */
  private passesFor(color: number): Pass[] {
    let p = this.passCache.get(color);
    if (p) return p;
    p = this.theme.id === 'neon'
      ? [
          { w: 20, color: mix(this.bg, color, 0.24) },          // one soft glow layer
          { w: 7, color, cap: true },
          { w: 2.5, color: mix(color, 0xffffff, 0.8) },
        ]
      : [
          { w: 15, color: 0x111111, dx: 3, dy: 4, cap: true }, // hard offset shadow
          { w: 15, color: 0x111111, cap: true },               // thick black outline
          { w: 8, color, cap: true },
          { w: 2, color: mix(color, 0xffffff, 0.55), dx: -1, dy: -2 }, // shine
        ];
    this.passCache.set(color, p);
    return p;
  }

  /** Unit normal (pointing from the line toward the ball) of the closest touching ink segment, or null. */
  contactNormal(x: number, y: number, r: number): { nx: number; ny: number } | null {
    const lim = r + THICK / 2 + 3;
    let best = lim, out: { nx: number; ny: number } | null = null;
    for (const s of this.segs) {
      const vx = s.bx - s.ax, vy = s.by - s.ay;
      const t = Phaser.Math.Clamp(((x - s.ax) * vx + (y - s.ay) * vy) / (vx * vx + vy * vy || 1), 0, 1);
      const dx = x - (s.ax + vx * t), dy = y - (s.ay + vy * t), d = Math.hypot(dx, dy);
      if (d < best && d > 0) { best = d; out = { nx: dx / d, ny: dy / d }; }
    }
    return out;
  }

  /** Is a circle at (x,y) with radius r touching any live ink line? */
  touches(x: number, y: number, r: number): boolean {
    const lim = r + THICK / 2 + 3;
    for (const s of this.segs) {
      const vx = s.bx - s.ax, vy = s.by - s.ay;
      const t = Phaser.Math.Clamp(((x - s.ax) * vx + (y - s.ay) * vy) / (vx * vx + vy * vy || 1), 0, 1);
      if (Math.hypot(s.ax + vx * t - x, s.ay + vy * t - y) < lim) return true;
    }
    return false;
  }

  private world(p: Phaser.Input.Pointer) {
    const v = this.scene.cameras.main.getWorldPoint(p.x, p.y);
    return { x: v.x, y: v.y };
  }

  update(time: number, dtMs: number) {
    this.drawnPx = 0;
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
        this.drawnPx += step;
        this.last = { x: nx, y: ny };
        dx = p.x - nx; dy = p.y - ny; d = Math.hypot(dx, dy);
      }
    } else {
      this.ink = Math.min(INK_MAX, this.ink + (INK_REGEN * dtMs) / 1000);
    }

    // expire old segments
    this.segs = this.segs.filter((s) => {
      if (time - s.born < s.life) return true;
      this.scene.matter.world.remove(s.body);
      return false;
    });
    this.render(time);
  }

  /** Group segments into continuous runs (same stroke + same fade level), then draw each as one smooth path. */
  // ---- allocation-free rendering (garbage made phones stutter on GC) ----
  // Runs are pooled objects with flat [x0,y0,x1,y1,...] arrays that are reused every frame.
  private runPool: { pts: number[]; sm: number[]; a: number; stroke: number }[] = [];
  private scratch: number[] = [];

  private runAt(i: number, a: number, stroke: number) {
    let r = this.runPool[i];
    if (!r) { r = { pts: [], sm: [], a, stroke }; this.runPool[i] = r; }
    r.pts.length = 0; r.a = a; r.stroke = stroke;
    return r;
  }

  /** Chaikin smoothing (2 passes) of flat points `src` into `out`, reusing `this.scratch`. */
  private smoothInto(src: number[], out: number[]) {
    let from = src, to = this.scratch;
    for (let it = 0; it < 2; it++) {
      to.length = 0;
      const n = from.length / 2;
      if (n <= 2) { to.push(...from); }
      else {
        to.push(from[0], from[1]);
        for (let i = 0; i < n - 1; i++) {
          const ax = from[i * 2], ay = from[i * 2 + 1], bx = from[i * 2 + 2], by = from[i * 2 + 3];
          to.push(ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25, ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75);
        }
        to.push(from[from.length - 2], from[from.length - 1]);
      }
      // ping-pong: second pass writes into `out`
      from = to; to = it === 0 ? out : this.scratch;
    }
    if (from !== out) { out.length = 0; for (let i = 0; i < from.length; i++) out.push(from[i]); }
  }

  /** Group segments into continuous runs (same stroke + same fade level), then draw each as one smooth path. */
  private render(time: number) {
    let nRuns = 0;
    let cur: { pts: number[]; sm: number[]; a: number; stroke: number } | null = null;
    for (const s of this.segs) {
      const age = time - s.born;
      const solid = s.life * SOLID_FRACTION;
      const raw = age < solid ? 1 : 1 - (age - solid) / (s.life - solid);
      const a = raw >= 1 ? 1 : Math.ceil(raw * 10) / 10; // quantize so runs stay long
      const contiguous = cur && s.stroke === cur.stroke && cur.a === a &&
        Math.abs(cur.pts[cur.pts.length - 2] - s.ax) < 0.5 && Math.abs(cur.pts[cur.pts.length - 1] - s.ay) < 0.5;
      if (!contiguous) { cur = this.runAt(nRuns++, a, s.stroke); cur.pts.push(s.ax, s.ay); }
      cur!.pts.push(s.bx, s.by);
    }

    // Live tail: the physics line grows in MIN_STEP chunks, so draw the remaining bit from the last
    // point to the finger every frame — the line follows the finger smoothly even when drawing slowly.
    if (this.drawing && this.last && this.cursor && this.ink >= MIN_STEP * INK_COST) { // no tail when out of ink
      const tx = this.cursor.x, ty = this.cursor.y;
      const attach = cur && cur.a === 1 && cur.stroke === this.strokeId &&
        Math.abs(cur.pts[cur.pts.length - 2] - this.last.x) < 0.5 && Math.abs(cur.pts[cur.pts.length - 1] - this.last.y) < 0.5;
      if (attach) { if (Math.hypot(tx - this.last.x, ty - this.last.y) > 1) cur!.pts.push(tx, ty); }
      else if (Math.hypot(tx - this.last.x, ty - this.last.y) > 1) {
        const r = this.runAt(nRuns++, 1, this.strokeId);
        r.pts.push(this.last.x, this.last.y, tx, ty);
      }
    }

    for (let i = 0; i < nRuns; i++) this.smoothInto(this.runPool[i].pts, this.runPool[i].sm);

    const g = this.gfx;
    g.clear();
    const nPass = this.theme.id === 'neon' ? 3 : 4;
    for (let pi = 0; pi < nPass; pi++) {
      for (let i = 0; i < nRuns; i++) {
        const r = this.runPool[i], pts = r.sm, n = pts.length;
        if (n < 4) continue;
        const pass = this.passesFor(this.strokeColor(r.stroke))[pi];
        const ox = pass.dx ?? 0, oy = pass.dy ?? 0;
        g.lineStyle(pass.w, pass.color, r.a);
        g.beginPath();
        g.moveTo(pts[0] + ox, pts[1] + oy);
        for (let k = 2; k < n; k += 2) g.lineTo(pts[k] + ox, pts[k + 1] + oy);
        g.strokePath();
        // round caps only where they're visible; joins are already smooth after Chaikin
        if (pass.cap) {
          g.fillStyle(pass.color, r.a);
          g.fillCircle(pts[0] + ox, pts[1] + oy, pass.w / 2);
          g.fillCircle(pts[n - 2] + ox, pts[n - 1] + oy, pass.w / 2);
        }
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
        restitution: 0,
        chamfer: { radius: THICK / 2 }, // capsule ends -> smooth joints
        label: 'ink',
      },
    );
    this.segs.push({ body, ax, ay, bx, by, born: time, life: this.lifeMs, stroke: this.strokeId });
  }
}
