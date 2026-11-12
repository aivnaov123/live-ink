import Phaser from 'phaser';
import type { Theme } from '../theme';

interface P { x: number; y: number; vx: number; vy: number; life: number; max: number; color: number; size: number; grav: number }

/** Lightweight particles + ball trail, all drawn into one Graphics per frame (cheap on phones). */
export class Juice {
  private ps: P[] = [];
  private trail: { x: number; y: number }[] = [];
  private g: Phaser.GameObjects.Graphics;
  private tg: Phaser.GameObjects.Graphics;
  private static MAX = 260;

  constructor(scene: Phaser.Scene, private theme: Theme) {
    this.tg = scene.add.graphics().setDepth(5.5); // trail under the ball
    this.g = scene.add.graphics().setDepth(7);    // particles above everything in the world
  }

  private add(p: P) { if (this.ps.length < Juice.MAX) this.ps.push(p); }

  /** Sparks falling off the pen tip while drawing. */
  drawSpark(x: number, y: number, color: number) {
    this.add({ x: x + (Math.random() - 0.5) * 6, y: y + (Math.random() - 0.5) * 6,
      vx: (Math.random() - 0.5) * 60, vy: -20 - Math.random() * 50, life: 0, max: 0.35 + Math.random() * 0.2,
      color, size: 1.6 + Math.random() * 2, grav: 260 });
  }

  /** Radial burst (bridge, star, death). */
  burst(x: number, y: number, color: number, n: number, speed: number, size = 3) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.4, v = speed * (0.6 + Math.random() * 0.6);
      this.add({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.2, life: 0, max: 0.45 + Math.random() * 0.3,
        color, size: size * (0.7 + Math.random() * 0.6), grav: 300 });
    }
  }

  /** Expanding ring (bridge confirmation). */
  ring(x: number, y: number, color: number) {
    this.add({ x, y, vx: 0, vy: 0, life: 0, max: 0.35, color, size: -1, grav: 0 }); // size -1 marks a ring
  }

  update(dt: number, ballX: number, ballY: number, ballColor: number, speed: number) {
    const s = dt / 1000;
    for (const p of this.ps) { p.life += s; p.vy += p.grav * s; p.x += p.vx * s; p.y += p.vy * s; }
    this.ps = this.ps.filter((p) => p.life < p.max);

    // trail: remember recent interpolated positions; longer when fast
    this.trail.unshift({ x: ballX, y: ballY });
    const len = Math.round(6 + Math.min(8, speed));
    if (this.trail.length > len) this.trail.length = len;

    const pop = this.theme.id === 'pop';
    this.tg.clear();
    for (let i = this.trail.length - 1; i >= 1; i--) {
      const t = this.trail[i], k = 1 - i / this.trail.length;
      if (pop) this.tg.fillStyle(0x111111, 0.25 * k).fillCircle(t.x + 3, t.y + 4, 14 * k);
      this.tg.fillStyle(ballColor, (pop ? 0.45 : 0.3) * k).fillCircle(t.x, t.y, 14 * k);
    }

    this.g.clear();
    for (const p of this.ps) {
      const k = 1 - p.life / p.max;
      if (p.size < 0) { // ring
        const r = 18 + (1 - k) * 50;
        this.g.lineStyle(pop ? 5 : 3, p.color, k).strokeCircle(p.x, p.y, r);
        continue;
      }
      if (pop) {
        this.g.fillStyle(0x111111, k).fillRect(p.x - p.size + 1.5, p.y - p.size + 2, p.size * 2, p.size * 2);
        this.g.fillStyle(p.color, k).fillRect(p.x - p.size, p.y - p.size, p.size * 2, p.size * 2);
      } else {
        this.g.fillStyle(p.color, 0.25 * k).fillCircle(p.x, p.y, p.size * 2.2);
        this.g.fillStyle(p.color, k).fillCircle(p.x, p.y, p.size);
      }
    }
  }

  clearTrail() { this.trail.length = 0; }
}
