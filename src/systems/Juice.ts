import Phaser from 'phaser';
import type { Theme } from '../theme';
import { TEX } from '../res';

interface P { img: Phaser.GameObjects.Image; vx: number; vy: number; life: number; max: number; size: number; grav: number }
interface Ring { x: number; y: number; life: number; color: number }

const MAX = 180;      // particle pool size
const TRAIL = 14;     // trail sprites

/** Particles + ball trail. Uses a pool of pre-baked, tinted sprites: the GPU draws them all in one
 *  batch, which is far cheaper on phones than redrawing hundreds of vector circles every frame. */
export class Juice {
  private ps: P[] = [];
  private free: Phaser.GameObjects.Image[] = [];
  private trailImgs: Phaser.GameObjects.Image[] = [];
  private trailShadow: Phaser.GameObjects.Image[] = [];
  private trail: { x: number; y: number }[] = [];
  private rings: Ring[] = [];
  private rg: Phaser.GameObjects.Graphics;
  private pop: boolean;
  private tex: string;

  constructor(private scene: Phaser.Scene, theme: Theme) {
    this.pop = theme.id === 'pop';
    this.tex = this.bake();
    for (let i = 0; i < MAX; i++) this.free.push(scene.add.image(0, 0, this.tex).setDepth(7).setVisible(false));
    for (let i = 0; i < TRAIL; i++) {
      if (this.pop) this.trailShadow.push(scene.add.image(0, 0, 'juice-disc').setDepth(5.4).setTint(0x111111).setVisible(false));
      this.trailImgs.push(scene.add.image(0, 0, 'juice-disc').setDepth(5.5).setVisible(false));
    }
    this.rg = scene.add.graphics().setDepth(7);
  }

  /** Bake the sprite textures once: a soft glow dot (Neon) or a square with a hard shadow (Pop), plus a disc for the trail. */
  private bake(): string {
    const t = this.scene.textures;
    if (!t.exists('juice-glow')) {
      const g = this.scene.make.graphics({}, false), T = TEX; // drawn TEX x larger, shown at 1/TEX
      for (let r = 12; r > 0; r--) g.fillStyle(0xffffff, r <= 4 ? 1 : 0.05).fillCircle(12 * T, 12 * T, r * T);
      g.generateTexture('juice-glow', 24 * T, 24 * T); g.clear();
      g.fillStyle(0x111111, 1).fillRect(3 * T, 4 * T, 10 * T, 10 * T).fillStyle(0xffffff, 1).fillRect(0, 0, 10 * T, 10 * T);
      g.generateTexture('juice-square', 14 * T, 14 * T);
      g.destroy();
    }
    return this.pop ? 'juice-square' : 'juice-glow';
  }

  private spawn(x: number, y: number, vx: number, vy: number, max: number, color: number, size: number, grav: number) {
    const img = this.free.pop();
    if (!img) return; // pool exhausted: just skip (never allocate mid-game)
    img.setPosition(x, y).setTint(color).setVisible(true).setAlpha(1);
    this.ps.push({ img, vx, vy, life: 0, max, size, grav });
  }

  /** Sparks falling off the pen tip while drawing. */
  drawSpark(x: number, y: number, color: number) {
    this.spawn(x + (Math.random() - 0.5) * 6, y + (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 60, -20 - Math.random() * 50,
      0.35 + Math.random() * 0.2, color, 1.6 + Math.random() * 2, 260);
  }

  /** Radial burst (bridge, star, death). */
  burst(x: number, y: number, color: number, n: number, speed: number, size = 3) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.4, v = speed * (0.6 + Math.random() * 0.6);
      this.spawn(x, y, Math.cos(a) * v, Math.sin(a) * v - speed * 0.2, 0.45 + Math.random() * 0.3, color, size * (0.7 + Math.random() * 0.6), 300);
    }
  }

  /** Expanding ring (bridge confirmation). */
  ring(x: number, y: number, color: number) { this.rings.push({ x, y, life: 0, color }); }

  update(dt: number, ballX: number, ballY: number, ballColor: number, speed: number) {
    const s = dt / 1000;
    // particles
    for (let i = this.ps.length - 1; i >= 0; i--) {
      const p = this.ps[i];
      p.life += s;
      if (p.life >= p.max) { p.img.setVisible(false); this.free.push(p.img); this.ps.splice(i, 1); continue; }
      p.vy += p.grav * s;
      p.img.x += p.vx * s; p.img.y += p.vy * s;
      const k = 1 - p.life / p.max;
      // glow texture is 24px with a ~8px core; square is 10px
      p.img.setScale((this.pop ? (p.size * 2) / 10 : (p.size * 2.4) / 8) / TEX).setAlpha(k);
    }

    // trail: recent interpolated positions, longer when fast
    this.trail.unshift({ x: ballX, y: ballY });
    const len = Math.min(TRAIL, Math.round(6 + Math.min(8, speed)));
    if (this.trail.length > len) this.trail.length = len;
    for (let i = 0; i < TRAIL; i++) {
      const img = this.trailImgs[i], sh = this.trailShadow[i];
      const t = this.trail[i];
      const vis = i >= 1 && !!t;
      img.setVisible(vis); sh?.setVisible(vis);
      if (!vis) continue;
      const k = 1 - i / this.trail.length, sc = (14 * k) / 16 / TEX;
      img.setPosition(t.x, t.y).setScale(sc).setTint(ballColor).setAlpha((this.pop ? 0.45 : 0.3) * k);
      sh?.setPosition(t.x + 3, t.y + 4).setScale(sc).setAlpha(0.25 * k);
    }

    // rings (rare, few) — fine as vector
    this.rg.clear();
    this.rings = this.rings.filter((r) => (r.life += s) < 0.35);
    for (const r of this.rings) {
      const k = 1 - r.life / 0.35;
      this.rg.lineStyle(this.pop ? 5 : 3, r.color, k).strokeCircle(r.x, r.y, 18 + (1 - k) * 50);
    }
  }

  clearTrail() { this.trail.length = 0; }
}
