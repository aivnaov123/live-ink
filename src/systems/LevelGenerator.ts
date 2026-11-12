import Phaser from 'phaser';
import type { Rng } from './DailySeed';
import type { Theme } from '../theme';

const DEPTH = 700;     // platforms are tall pillars (top surface + body below)
const MIN_Y = 420;
const MAX_Y = 900;

interface Platform {
  x: number; y: number; w: number;
  body: MatterJS.BodyType;
  gfx: Phaser.GameObjects.Graphics;
}

/** Endless chunks: platform -> gap -> platform. Difficulty grows with distance. */
export class LevelGenerator {
  private platforms: Platform[] = [];
  private nextX = -200;
  private lastY = 700;

  constructor(private scene: Phaser.Scene, private rng: Rng, private theme: Theme) {
    // Long safe start so the player learns to draw before the first gap.
    this.add(this.nextX, this.lastY, 900);
  }

  get startY() { return this.lastY; }

  update(camLeft: number, camRight: number) {
    while (this.nextX < camRight + 900) this.spawn();
    while (this.platforms.length && this.platforms[0].x + this.platforms[0].w < camLeft - 300) {
      const p = this.platforms.shift()!;
      this.scene.matter.world.remove(p.body);
      p.gfx.destroy();
    }
  }

  /** Lowest platform top near x — used for death detection. */
  floorNear(x: number): number {
    let y = 0;
    for (const p of this.platforms) if (p.x < x + 800 && p.x + p.w > x - 800) y = Math.max(y, p.y);
    return y || this.lastY;
  }

  private spawn() {
    const diff = Math.min(1, this.nextX / 20000); // 0 -> 1 over ~500 m
    // Gap stays well under what the ink can bridge (INK_MAX), so it's always fair.
    const gap = 130 + this.rng() * (80 + 220 * diff);
    const w = 160 + this.rng() * (360 - 180 * diff);
    let dy = (this.rng() - 0.55) * (90 + 170 * diff); // negative = higher = needs a ramp
    let y = Phaser.Math.Clamp(this.lastY + dy, MIN_Y, MAX_Y);
    this.add(this.nextX + gap, y, w);
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
      // pop arcade: white block, thick black outline, hard offset shadow, stripe on top
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
