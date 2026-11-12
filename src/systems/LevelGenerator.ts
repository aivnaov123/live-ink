import Phaser from 'phaser';
import type { Rng } from './DailySeed';
import type { Theme } from '../theme';

const DEPTH = 700;     // platforms are tall pillars (top surface + body below)
const MIN_Y = 420;
const MAX_Y = 900;
const PX_PER_M = 40;

export interface Star { x: number; y: number; taken: boolean; gfx: Phaser.GameObjects.Image } // gfx.y bobs around y

export interface Platform {
  x: number; y: number; w: number;
  body: MatterJS.BodyType;
  gfx: Phaser.GameObjects.Container; // shapes + tiles: drawn as cheap quads (no per-frame tessellation)
  move?: { baseX: number; amp: number; period: number; phase: number }; // slides left/right
}

interface Ceiling { x: number; w: number; bottom: number; body: MatterJS.BodyType; gfx: Phaser.GameObjects.Container }

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
    return this.ceilings.some((c) => x + r * 0.6 > c.x && x - r * 0.6 < c.x + c.w && y - r < c.bottom + 1); // touching the spikes (ceiling is solid, so the ball can never overlap them)
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
        // ceiling over the gap: bottom 100 px above the higher edge -> a flat bridge fits, a big arc doesn't
        const bottom = Math.min(top, this.lastY) - 100;
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

  /** Star sprite baked once per theme (polygons re-triangulated every frame were slow on phones). */
  private starTexture(): string {
    const key = `star-${this.theme.id}`;
    if (this.scene.textures.exists(key)) return key;
    const g = this.scene.make.graphics({}, false);
    const c = 32, pts: Phaser.Math.Vector2[] = [];
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 7 : 16, a = -Math.PI / 2 + (i * Math.PI) / 5;
      pts.push(new Phaser.Math.Vector2(c + Math.cos(a) * r, c + Math.sin(a) * r));
    }
    if (this.theme.id === 'neon') {
      g.fillStyle(0xffe14d, 0.15).fillCircle(c, c, 26);
      g.fillStyle(0xffe14d, 1).fillPoints(pts, true);
    } else {
      g.fillStyle(0x111111, 1).fillPoints(pts.map((p) => new Phaser.Math.Vector2(p.x + 3, p.y + 4)), true);
      g.fillStyle(0xffffff, 1).fillPoints(pts, true);
      g.lineStyle(3, 0x111111, 1).strokePoints(pts, true);
    }
    g.generateTexture(key, 64, 64);
    g.destroy();
    return key;
  }

  private addStar(x: number, y: number) {
    const img = this.scene.add.image(x, y, this.starTexture()).setDepth(4);
    this.scene.tweens.add({ targets: img, y: y - 6, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    this.stars.push({ x, y, taken: false, gfx: img });
  }

  // ---- static scenery: plain rectangles + repeating tile textures. Phaser re-tessellates Graphics
  // objects EVERY frame (lots of garbage -> GC stutter on phones); rectangles/tiles are just quads.

  private rect(c: Phaser.GameObjects.Container, x: number, y: number, w: number, h: number, color: number, alpha = 1) {
    c.add(this.scene.add.rectangle(x, y, w, h, color, alpha).setOrigin(0));
  }

  private tile(c: Phaser.GameObjects.Container, x: number, y: number, w: number, h: number, key: string) {
    c.add(this.scene.add.tileSprite(x, y, w, h, key).setOrigin(0));
  }

  /** Bake the small repeating textures once. */
  private bakeTiles() {
    const t = this.scene.textures;
    if (t.exists('pop-stripe')) return;
    const g = this.scene.make.graphics({}, false);
    g.fillStyle(0xffffff, 1).fillRect(0, 0, 36, 16).fillStyle(0xe5342b, 1).fillRect(18, 2, 18, 12);
    g.generateTexture('pop-stripe', 36, 16); g.clear();
    g.fillStyle(0xff4fd8, 0.9).fillTriangle(10, 0, 21, 0, 15.5, 8);
    g.generateTexture('neon-spikes', 22, 8); g.clear();
    g.fillStyle(0xe5342b, 1).fillRect(0, 0, 28, 16).fillStyle(0x111111, 1)
      .fillTriangle(0, 16, 14, 16, 28, 0).fillTriangle(14, 16, 28, 16, 28, 9).fillTriangle(0, 0, 0, 9, 7, 0);
    g.generateTexture('pop-hazard', 28, 16);
    g.destroy();
  }

  private addCeiling(x: number, w: number, bottom: number) {
    const H = 900;
    const body = this.scene.matter.add.rectangle(x + w / 2, bottom - H / 2, w, H, {
      isStatic: true, friction: 0.05, label: 'ceiling',
    });
    this.bakeTiles();
    const c = this.scene.add.container(0, 0).setDepth(2);
    const top = bottom - H;
    if (this.theme.id === 'neon') {
      this.rect(c, x - 1, top, w + 2, H + 1, 0xff4fd8, 0.4);       // 1px border
      this.rect(c, x, top, w, H, 0x160a22);
      this.rect(c, x, bottom - 8, w, 12, 0xff4fd8, 0.18);
      this.rect(c, x, bottom - 3, w, 3, 0xff4fd8);
      this.tile(c, x, bottom, w, 8, 'neon-spikes');
    } else {
      this.rect(c, x + 6, top + 7, w, H, 0x111111);                  // hard shadow
      this.rect(c, x - 2.5, top, w + 5, H + 2.5, 0x111111);          // thick outline
      this.rect(c, x, top, w, H, 0xe5342b);
      this.tile(c, x, bottom - 16, w, 16, 'pop-hazard');
    }
    this.ceilings.push({ x, w, bottom, body, gfx: c });
  }

  private add(x: number, y: number, w: number) {
    const body = this.scene.matter.add.rectangle(x + w / 2, y + DEPTH / 2, w, DEPTH, {
      isStatic: true, friction: 0.05, label: 'ground',
    });
    this.bakeTiles();
    const c = this.scene.add.container(0, 0).setDepth(2);
    const th = this.theme;
    if (th.id === 'neon') {
      this.rect(c, x - 1, y, w + 2, DEPTH, th.bgDecor, 0.5);        // 1px border
      this.rect(c, x, y, w, DEPTH, th.platform);
      this.rect(c, x, y - 4, w, 10, th.platformTop, 0.15);
      this.rect(c, x, y, w, th.platformTopH, th.platformTop);
    } else {
      // pop arcade: dark block, thick black outline, hard offset shadow, striped top
      this.rect(c, x + 6, y + 7, w, DEPTH, 0x111111);
      this.rect(c, x - 2.5, y - 2.5, w + 5, DEPTH + 2.5, 0x111111);
      this.rect(c, x, y, w, DEPTH, th.platform);
      this.tile(c, x, y, w, 16, 'pop-stripe');
      this.rect(c, x, y + 14, w, 5, 0x111111);
    }
    this.platforms.push({ x, y, w, body, gfx: c });
    this.nextX = x + w;
    this.lastY = y;
  }
}
