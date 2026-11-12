import Phaser from 'phaser';
import type { Rng } from './DailySeed';
import type { Theme } from '../theme';

const DEPTH = 700;     // platforms are tall pillars (top surface + body below)
const MIN_Y = 420;
const MAX_Y = 900;
const PX_PER_M = 40;

export interface Star { x: number; y: number; taken: boolean; gfx: Phaser.GameObjects.Graphics }

export interface Platform {
  x: number; y: number; w: number;
  body: MatterJS.BodyType;
  gfx: Phaser.GameObjects.Graphics;
  move?: { baseX: number; amp: number; period: number; phase: number }; // slides left/right
}

interface Ceiling { x: number; w: number; bottom: number; body: MatterJS.BodyType; gfx: Phaser.GameObjects.Graphics }

/** First time an obstacle type appears in a run — the scene shows a short banner. */
export interface Intro { x: number; id: PatternId; text: string; shown: boolean }

export type PatternId = 'basic' | 'drop' | 'step' | 'wide' | 'stairs' | 'islands' | 'moving' | 'ceiling';

// from = distance (m) where the pattern starts appearing; weight = how often once unlocked
const PATTERNS: { id: PatternId; from: number; weight: number; intro?: string }[] = [
  { id: 'basic', from: 0, weight: 3 },
  { id: 'drop', from: 50, weight: 1.2 },
  { id: 'step', from: 100, weight: 2, intro: 'STEP UP · draw a ramp' },
  { id: 'wide', from: 200, weight: 1.4, intro: 'WIDE GAP · draw a long bridge' },
  { id: 'stairs', from: 300, weight: 1.1, intro: 'STAIRS · ramp, ramp, ramp' },
  { id: 'islands', from: 400, weight: 1, intro: 'ISLANDS · quick bridges, one after another' },
  { id: 'moving', from: 500, weight: 1.2, intro: 'SLIDING PLATFORM · time your bridge' },
  { id: 'ceiling', from: 600, weight: 1, intro: 'SPIKES ABOVE · keep your line low' },
];

/** Endless level built from obstacle patterns. Harder patterns unlock with distance.
 *  Every random decision uses the seeded rng in a fixed order -> the daily level is identical for everyone. */
export class LevelGenerator {
  private platforms: Platform[] = [];
  private ceilings: Ceiling[] = [];
  readonly stars: Star[] = [];
  readonly intros: Intro[] = [];
  private introduced = new Set<PatternId>();
  private nextX = -200;
  private lastY = 700;
  /** Debug/testing: force one pattern (set window.__LIVEINK_FORCE = 'moving'). */
  private force?: PatternId = (window as unknown as { __LIVEINK_FORCE?: PatternId }).__LIVEINK_FORCE;

  constructor(private scene: Phaser.Scene, private rng: Rng, private theme: Theme) {
    // Long safe start so the player learns to draw before the first gap.
    this.add(this.nextX, this.lastY, 900);
  }

  get startY() { return this.lastY; }

  update(camLeft: number, camRight: number) {
    while (this.nextX < camRight + 900) this.spawn();
    const gone = (x: number, w: number) => x + w < camLeft - 300;
    while (this.platforms.length && gone(this.platforms[0].x, this.platforms[0].w)) {
      const p = this.platforms.shift()!;
      this.scene.matter.world.remove(p.body);
      p.gfx.destroy();
    }
    while (this.ceilings.length && gone(this.ceilings[0].x, this.ceilings[0].w)) {
      const c = this.ceilings.shift()!;
      this.scene.matter.world.remove(c.body);
      c.gfx.destroy();
    }
    while (this.stars.length && this.stars[0].x < camLeft - 300) this.stars.shift()!.gfx.destroy();
  }

  /** Per physics step: move the moving platforms (time = game clock in ms). */
  step(time: number) {
    for (const p of this.platforms) {
      if (!p.move) continue;
      const m = p.move;
      p.x = m.baseX + Math.sin((time / m.period) * Math.PI * 2 + m.phase) * m.amp;
      this.scene.matter.body.setPosition(p.body, { x: p.x + p.w / 2, y: p.y + DEPTH / 2 }, false);
      p.gfx.x = p.x - m.baseX;
    }
  }

  /** Spiked ceiling touching a ball at (x,y) with radius r? */
  hitsCeiling(x: number, y: number, r: number): boolean {
    return this.ceilings.some((c) => x + r * 0.6 > c.x && x - r * 0.6 < c.x + c.w && y - r < c.bottom + 4);
  }

  /** The platform whose top spans x (if any). */
  platformAt(x: number): Platform | undefined {
    return this.platforms.find((p) => x >= p.x && x <= p.x + p.w);
  }

  /** Lowest platform top near x — used for death detection. */
  floorNear(x: number): number {
    let y = 0;
    for (const p of this.platforms) if (p.x < x + 800 && p.x + p.w > x - 800) y = Math.max(y, p.y);
    return y || this.lastY;
  }

  // ---------------------------------------------------------------- patterns

  private pick(m: number): PatternId {
    if (this.force && m > 0) return this.force;
    const avail = PATTERNS.filter((p) => p.from <= m);
    const total = avail.reduce((s, p) => s + p.weight, 0);
    let r = this.rng() * total;
    for (const p of avail) { if ((r -= p.weight) <= 0) return p.id; }
    return 'basic';
  }

  private spawn() {
    const m = this.nextX / PX_PER_M;
    const diff = Math.min(1, m / 800); // 0 -> 1 over 800 m: gaps slowly widen inside each pattern
    const id = this.pick(m);
    const r = () => this.rng();
    const startX = this.nextX;

    switch (id) {
      case 'basic':
        this.gapTo(130 + r() * (70 + 110 * diff), (r() - 0.5) * 60, 180 + r() * 240);
        break;
      case 'drop':
        this.gapTo(120 + r() * 80, 80 + r() * 70, 200 + r() * 200);
        break;
      case 'step': // higher platform -> must draw a ramp
        this.gapTo(160 + r() * 60, -(60 + r() * (40 + 20 * diff)), 220 + r() * 160);
        break;
      case 'wide':
        this.gapTo(260 + r() * (40 + 40 * diff), (r() - 0.5) * 40, 260 + r() * 160);
        break;
      case 'stairs':
        for (let i = 0; i < 3; i++) this.gapTo(110 + r() * 40, -(40 + r() * 25), 110 + r() * 40);
        this.gapTo(120 + r() * 40, (r() - 0.5) * 30, 280);
        break;
      case 'islands': {
        const n = 2 + (r() < 0.5 ? 1 : 0);
        for (let i = 0; i < n; i++) this.gapTo(130 + r() * 50, (r() - 0.5) * 50, 60 + r() * 30);
        this.gapTo(140 + r() * 40, (r() - 0.5) * 30, 280);
        break;
      }
      case 'moving': { // platform slides left/right: the gap grows and shrinks -> time your bridge
        const amp = 50 + r() * (25 + 25 * diff), period = 2800 - r() * 600, phase = r() * Math.PI * 2;
        this.gapTo(130 + amp + r() * 30, (r() - 0.5) * 30, 220 + r() * 80);
        const p = this.platforms[this.platforms.length - 1];
        p.move = { baseX: p.x, amp, period, phase };
        this.gapTo(130 + amp + r() * 30, (r() - 0.5) * 30, 260, false); // solid landing, never overlaps
        break;
      }
      case 'ceiling': {
        const gap = 170 + r() * 70;
        const top = this.lastY;
        this.gapTo(gap, (r() - 0.5) * 30, 240 + r() * 120, false); // no star: it would sit in the ceiling
        // ceiling over the gap: bottom 78 px above the higher edge -> a flat bridge fits, a big arc doesn't
        const bottom = Math.min(top, this.lastY) - 78;
        this.addCeiling(startX - 60, gap + 140, bottom);
        break;
      }
    }

    const def = PATTERNS.find((p) => p.id === id)!;
    if (def.intro && !this.introduced.has(id)) {
      this.introduced.add(id);
      this.intros.push({ x: startX, id, text: def.intro, shown: false });
    }
  }

  /** Gap of `gap` px, then a platform `dy` px lower (negative = higher) and `w` wide. */
  private gapTo(gap: number, dy: number, w: number, allowStar = true) {
    const y = Phaser.Math.Clamp(this.lastY + dy, MIN_Y, MAX_Y);
    // Star over ~55% of gaps, low enough that a gentle arc collects it.
    // (rng is always called the same number of times -> daily level stays identical)
    const hasStar = this.rng() < 0.55, lift = 35 + this.rng() * 45;
    if (allowStar && hasStar) this.addStar(this.nextX + gap / 2, Math.min(this.lastY, y) - lift);
    this.add(this.nextX + gap, y, w);
  }

  // ---------------------------------------------------------------- drawing

  private addStar(x: number, y: number) {
    const g = this.scene.add.graphics().setDepth(4);
    const pts: Phaser.Math.Vector2[] = [];
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 7 : 16, a = -Math.PI / 2 + (i * Math.PI) / 5;
      pts.push(new Phaser.Math.Vector2(x + Math.cos(a) * r, y + Math.sin(a) * r));
    }
    if (this.theme.id === 'neon') {
      g.fillStyle(0xffe14d, 0.15).fillCircle(x, y, 26);
      g.fillStyle(0xffe14d, 1).fillPoints(pts, true);
    } else {
      g.fillStyle(0x111111, 1).fillPoints(pts.map((p) => new Phaser.Math.Vector2(p.x + 3, p.y + 4)), true);
      g.fillStyle(0xffffff, 1).fillPoints(pts, true);
      g.lineStyle(3, 0x111111, 1).strokePoints(pts, true);
    }
    this.scene.tweens.add({ targets: g, y: -6, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    this.stars.push({ x, y, taken: false, gfx: g });
  }

  private addCeiling(x: number, w: number, bottom: number) {
    const H = 900;
    const body = this.scene.matter.add.rectangle(x + w / 2, bottom - H / 2, w, H, {
      isStatic: true, friction: 0.05, label: 'ceiling',
    });
    const g = this.scene.add.graphics().setDepth(2);
    const top = bottom - H;
    if (this.theme.id === 'neon') {
      g.fillStyle(0x160a22, 1).fillRect(x, top, w, H);
      g.lineStyle(1, 0xff4fd8, 0.4).strokeRect(x, top, w, H);
      g.fillStyle(0xff4fd8, 0.18).fillRect(x, bottom - 8, w, 12);
      g.fillStyle(0xff4fd8, 1).fillRect(x, bottom - 3, w, 3);
      for (let sx = x + 10; sx < x + w - 10; sx += 22) g.fillStyle(0xff4fd8, 0.9).fillTriangle(sx, bottom, sx + 11, bottom, sx + 5.5, bottom + 8);
    } else {
      g.fillStyle(0x111111, 1).fillRect(x + 6, top + 7, w, H);
      g.fillStyle(0xe5342b, 1).fillRect(x, top, w, H);
      // hazard stripes along the bottom edge
      g.fillStyle(0x111111, 1);
      for (let sx = x - 20; sx < x + w; sx += 28) g.fillTriangle(sx, bottom, sx + 14, bottom, sx + 30, bottom - 16).fillTriangle(sx, bottom, sx + 30, bottom - 16, sx + 16, bottom - 16);
      g.lineStyle(5, 0x111111, 1).strokeRect(x, top, w, H);
    }
    this.ceilings.push({ x, w, bottom, body, gfx: g });
  }

  private add(x: number, y: number, w: number) {
    const body = this.scene.matter.add.rectangle(x + w / 2, y + DEPTH / 2, w, DEPTH, {
      isStatic: true, friction: 0.05, label: 'ground',
    });
    const gfx = this.scene.add.graphics().setDepth(2);
    const th = this.theme;
    if (th.id === 'neon') {
      gfx.fillStyle(th.platform, 1).fillRect(x, y, w, DEPTH);
      gfx.lineStyle(1, th.bgDecor, 0.5).strokeRect(x, y, w, DEPTH);
      gfx.fillStyle(th.platformTop, 0.15).fillRect(x, y - 4, w, 10);
      gfx.fillStyle(th.platformTop, 1).fillRect(x, y, w, th.platformTopH);
    } else {
      // pop arcade: dark block, thick black outline, hard offset shadow, striped top
      gfx.fillStyle(0x111111, 1).fillRect(x + 6, y + 7, w, DEPTH);
      gfx.fillStyle(th.platform, 1).fillRect(x, y, w, DEPTH);
      gfx.fillStyle(0xffffff, 1).fillRect(x, y, w, 16);
      for (let sx = x + 18; sx < x + w - 8; sx += 36) gfx.fillStyle(0xe5342b, 1).fillRect(sx, y + 2, 18, 12);
      gfx.lineStyle(th.platformTopH, th.platformTop, 1).strokeRect(x, y, w, DEPTH);
      gfx.lineStyle(th.platformTopH, th.platformTop, 1).lineBetween(x, y + 16, x + w, y + 16);
    }
    this.platforms.push({ x, y, w, body, gfx });
    this.nextX = x + w;
    this.lastY = y;
  }
}
