import Phaser from 'phaser';
import { InkSystem } from '../systems/InkSystem';
import { BallController } from '../systems/BallController';
import { LevelGenerator } from '../systems/LevelGenerator';
import { dailyNumber, dailySeed, mulberry32, todayKey } from '../systems/DailySeed';
import { load, save } from '../systems/Storage';
import { currentTheme, toggleTheme, type Theme } from '../theme';

type Mode = 'daily' | 'endless';
const PX_PER_M = 40;

export class GameScene extends Phaser.Scene {
  private mode: Mode = 'daily';
  private th!: Theme;
  private ink!: InkSystem;
  private ball!: BallController;
  private level!: LevelGenerator;
  private score!: Phaser.GameObjects.Text;
  private sub!: Phaser.GameObjects.Text;
  private inkBar!: Phaser.GameObjects.Graphics;
  private dead = false;
  private halftone?: Phaser.GameObjects.TileSprite;
  private best = 0;

  constructor() { super('Game'); }

  init(data: { mode?: Mode }) {
    this.mode = data.mode ?? 'daily';
    this.dead = false;
  }

  private get bestKey() {
    return this.mode === 'daily' ? `liveink.best.daily.${todayKey()}` : 'liveink.best.endless';
  }

  create() {
    this.th = currentTheme();
    const th = this.th;
    const cam = this.cameras.main;
    cam.setBackgroundColor(th.bg);
    document.body.style.background = th.bg;

    this.drawBackdrop();

    const seed = this.mode === 'daily' ? dailySeed() : (Math.random() * 2 ** 32) >>> 0;
    this.level = new LevelGenerator(this, mulberry32(seed), th);
    this.ball = new BallController(this, 0, this.level.startY - 40, th);
    this.ink = new InkSystem(this, th);
    this.best = load(this.bestKey, 0);

    cam.scrollX = this.ball.x - cam.width * 0.28;
    cam.scrollY = this.ball.y - cam.height * 0.55;

    // HUD
    this.score = this.add.text(24, 20, '0 m', {
      fontFamily: th.titleFont, fontSize: '44px', color: th.text, fontStyle: th.id === 'neon' ? 'bold' : 'normal',
    }).setScrollFactor(0).setDepth(20);
    if (th.id === 'neon') this.score.setShadow(0, 0, th.accent, 12, false, true);
    else this.score.setColor('#FFFFFF').setStroke('#111111', 8).setShadow(4, 5, '#111111', 0, true, true);
    this.sub = this.add.text(26, 74, '', {
      fontFamily: th.font, fontSize: '18px', color: th.textDim,
    }).setScrollFactor(0).setDepth(20);
    this.inkBar = this.add.graphics().setScrollFactor(0).setDepth(20);

    // Theme switch (top-right). Stops the tap from also starting a line.
    const tb = this.add.text(cam.width - 20, 24, th.id === 'neon' ? 'Style: Pop' : 'Style: Neon', {
      fontFamily: th.font, fontSize: '18px', color: th.textDim,
      backgroundColor: th.id === 'neon' ? '#141b33' : '#FFFFFF', padding: { x: 12, y: 8 },
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(25).setInteractive({ useHandCursor: true });
    tb.on('pointerdown', (_p: unknown, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
      e.stopPropagation();
      this.ink.enabled = false;
    });
    tb.on('pointerup', () => { toggleTheme(); this.scene.restart({ mode: this.mode }); });

    const hint = this.add.text(cam.width / 2, 300,
      'Draw a path ahead of the ball\nLines fade after 3 seconds', {
        fontFamily: th.font, fontSize: '24px', color: th.textDim, align: 'center',
      }).setOrigin(0.5).setScrollFactor(0).setDepth(20);
    this.time.delayedCall(4000, () => this.tweens.add({ targets: hint, alpha: 0, duration: 600 }));
  }

  /** Parallax decoration: stars/grid for Neon, halftone dots + sunburst for Pop Arcade. */
  private drawBackdrop() {
    const th = this.th;
    const rng = mulberry32(7);
    const g = this.add.graphics().setScrollFactor(0.15, 0.1).setDepth(0);
    const W = 4000, H = 2400;
    if (th.id === 'neon') {
      g.lineStyle(1, th.bgDecor, 0.18);
      for (let x = -400; x < W; x += 80) g.lineBetween(x, -600, x, H);
      for (let y = -600; y < H; y += 80) g.lineBetween(-400, y, W, y);
      for (let i = 0; i < 220; i++) {
        g.fillStyle(rng() < 0.2 ? 0xff4fd8 : 0x4df3ff, 0.15 + rng() * 0.5)
          .fillCircle(-400 + rng() * W, -600 + rng() * H, rng() * 1.8 + 0.4);
      }
    } else {
      // sunburst rays from a fixed point + halftone dot field
      const cx = 700, cy = 300;
      for (let i = 0; i < 24; i += 2) {
        const a0 = (i / 24) * Math.PI * 2, a1 = ((i + 1) / 24) * Math.PI * 2;
        g.fillStyle(0xffffff, 0.12).fillTriangle(cx, cy, cx + Math.cos(a0) * 3000, cy + Math.sin(a0) * 3000,
          cx + Math.cos(a1) * 3000, cy + Math.sin(a1) * 3000);
      }
      // halftone: draw one 56x56 tile once, then repeat it as a texture (cheap on phones)
      if (!this.textures.exists('halftone')) {
        const t = this.make.graphics({}, false);
        t.fillStyle(th.bgDecor, 0.55).fillCircle(14, 14, 2.4).fillCircle(42, 42, 2.4);
        t.generateTexture('halftone', 56, 56);
        t.destroy();
      }
      this.halftone = this.add.tileSprite(0, 0, this.cameras.main.width, this.cameras.main.height, 'halftone')
        .setOrigin(0).setScrollFactor(0).setDepth(0);
    }
  }

  update(time: number, delta: number) {
    if (this.dead) return;
    const cam = this.cameras.main;

    this.ball.update();
    this.ink.update(time, delta);
    this.level.update(cam.scrollX, cam.scrollX + cam.width);

    cam.scrollX = Phaser.Math.Linear(cam.scrollX, this.ball.x - cam.width * 0.28, 0.15);
    cam.scrollY = Phaser.Math.Linear(cam.scrollY, this.ball.y - cam.height * 0.55, 0.06);

    if (this.halftone) this.halftone.setTilePosition(cam.scrollX * 0.15, cam.scrollY * 0.1);
    this.score.setText(`${this.meters} m`);
    this.sub.setText(`${this.mode === 'daily' ? `DAILY #${dailyNumber()}` : 'ENDLESS'}  ·  best ${this.best} m`);

    const th = this.th, x = 24, y = cam.height - 50, w = cam.width - 48, h = 16;
    const r = th.id === 'neon' ? 8 : 2;
    this.inkBar.clear();
    this.inkBar.fillStyle(th.meterBg, 1).fillRoundedRect(x, y, w, h, r);
    const col = this.ink.ratio > 0.25 ? th.meterFill : th.meterLow;
    if (th.id === 'neon') this.inkBar.fillStyle(col, 0.2).fillRoundedRect(x - 3, y - 3, Math.max(h, w * this.ink.ratio) + 6, h + 6, r + 3);
    this.inkBar.fillStyle(col, 1).fillRoundedRect(x, y, Math.max(h, w * this.ink.ratio), h, r);

    if (this.ball.y > this.level.floorNear(this.ball.x) + 350) this.die();
  }

  private get meters() {
    return Math.max(0, Math.floor((this.ball.x - this.ball.startX) / PX_PER_M));
  }

  private die() {
    this.dead = true;
    this.ink.enabled = false;
    this.matter.world.pause();
    this.cameras.main.shake(180, 0.006);
    const th = this.th;
    const m = this.meters;
    const isBest = m > this.best;
    if (isBest) { this.best = m; save(this.bestKey, m); }

    const W = this.cameras.main.width, H = this.cameras.main.height;
    // (no container: input hit-tests on fixed-to-screen children inside containers are offset)
    const fix = <T extends Phaser.GameObjects.GameObject & { setScrollFactor(x: number): T; setDepth(d: number): T }>(o: T) =>
      o.setScrollFactor(0).setDepth(30);
    const t = (y: number, s: string, size: number, color = th.text, font = th.font) =>
      fix(this.add.text(W / 2, y, s, { fontFamily: font, fontSize: `${size}px`, color, align: 'center' }).setOrigin(0.5));

    fix(this.add.rectangle(W / 2, H / 2, W, H, th.overlay, th.overlayAlpha));
    const title = t(H * 0.27, th.deathTitle, th.id === 'neon' ? 54 : 44, th.id === 'pop' ? '#E5342B' : th.text, th.titleFont);
    if (th.id === 'pop') title.setStroke('#111111', 8).setShadow(5, 6, '#111111', 0, true, true).setAngle(-3);

    if (th.id === 'pop') {
      const card = fix(this.add.graphics());
      card.fillStyle(0x111111, 1).fillRoundedRect(W / 2 - 130 + 6, H * 0.4 - 70 + 7, 260, 140, 16);
      card.fillStyle(0xffffff, 1).fillRoundedRect(W / 2 - 130, H * 0.4 - 70, 260, 140, 16);
      card.lineStyle(5, 0x111111, 1).strokeRoundedRect(W / 2 - 130, H * 0.4 - 70, 260, 140, 16);
      t(H * 0.4, `${m} m`, 60, '#2B59FF', th.titleFont);
    } else {
      t(H * 0.4, `${m} m`, 76, th.text, th.titleFont).setShadow(0, 0, th.accent, 18, false, true);
    }
    t(H * 0.51, isBest ? 'NEW BEST!' : `best ${this.best} m`, 24, isBest ? th.accent : th.textDim);

    const button = (y: number, label: string, primary: boolean, fn: () => void) => {
      const g = fix(this.add.graphics());
      const r = Math.min(th.btnRadius, 34), bx = W / 2 - 150, by = y - 34;
      if (th.id === 'pop') {
        g.fillStyle(0x111111, 1).fillRoundedRect(bx + 5, by + 6, 300, 68, r);
        g.fillStyle(primary ? th.btnBg : 0xffffff, 1).fillRoundedRect(bx, by, 300, 68, r);
        g.lineStyle(4, 0x111111, 1).strokeRoundedRect(bx, by, 300, 68, r);
      } else if (primary) g.fillStyle(th.btnBg, 1).fillRoundedRect(bx, by, 300, 68, r);
      else g.lineStyle(2, th.btnBg, 1).strokeRoundedRect(bx, by, 300, 68, r);
      t(y, label, 26, primary ? th.btnText : th.text);
      const hit = fix(this.add.rectangle(W / 2, y, 300, 68, 0, 0).setInteractive({ useHandCursor: true }));
      hit.on('pointerup', fn);
    };
    button(H * 0.62, th.id === 'pop' ? 'PLAY AGAIN' : 'Try again', true, () => this.scene.restart({ mode: this.mode }));
    button(H * 0.71, this.mode === 'daily' ? 'Play endless' : 'Play daily', false, () =>
      this.scene.restart({ mode: this.mode === 'daily' ? 'endless' : 'daily' }));
    if (this.mode === 'daily') {
      const filled = Math.min(10, Math.floor(m / 40));
      const [on, off] = th.id === 'neon' ? ['🟦', '⬛'] : ['🟨', '⬜'];
      button(H * 0.8, 'Copy result', false, () => {
        const text = `Live Ink Daily #${dailyNumber()} — ${m} m\n${on.repeat(filled)}${off.repeat(10 - filled)}`;
        navigator.clipboard?.writeText(text).catch(() => {});
      });
    }
    const sw = t(H * 0.9, th.id === 'neon' ? 'Switch style → Pop' : 'Switch style → Neon', 18, th.textDim);
    sw.setInteractive({ useHandCursor: true }).on('pointerup', () => { toggleTheme(); this.scene.restart({ mode: this.mode }); });
  }
}
