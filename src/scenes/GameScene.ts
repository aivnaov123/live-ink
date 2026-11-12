import Phaser from 'phaser';
import { InkSystem } from '../systems/InkSystem';
import { BallController, BALL_R } from '../systems/BallController';
import { ScoreSystem } from '../systems/Score';
import { LevelGenerator, type Platform } from '../systems/LevelGenerator';
import { dailyNumber, dailySeed, mulberry32, todayKey } from '../systems/DailySeed';
import { load, save } from '../systems/Storage';
import { currentTheme, toggleTheme, type Theme } from '../theme';
import { PauseMenu } from '../ui/PauseMenu';
import { inkLifeMs, SPEED_MILESTONES } from '../systems/Difficulty';
import { sfx } from '../systems/Sfx';
import { Juice } from '../systems/Juice';
import { setBall, setLine, getRecord, setRecord, newlyUnlocked } from '../skins';

type Mode = 'daily' | 'endless';
const PX_PER_M = 40;
// Fixed physics step: same game speed on 30 / 60 / 120 / 144 Hz screens.
const STEP_MS = 1000 / 60;

export class GameScene extends Phaser.Scene {
  private mode: Mode = 'daily';
  private th!: Theme;
  private ink!: InkSystem;
  private ball!: BallController;
  private level!: LevelGenerator;
  private score!: Phaser.GameObjects.Text;
  private sub!: Phaser.GameObjects.Text;
  // bars are plain rectangles (cheap quads) resized each frame, not Graphics redrawn each frame
  private inkBar!: { bg: Phaser.GameObjects.Rectangle; glow?: Phaser.GameObjects.Rectangle; fill: Phaser.GameObjects.Rectangle; w: number };
  private dead = false;
  private halftone?: Phaser.GameObjects.TileSprite;
  private parallax: { ts: Phaser.GameObjects.TileSprite; fx: number; fy: number }[] = [];
  private hudAt = 0; // last HUD text refresh (ms)
  private best = 0;
  private sc!: ScoreSystem;
  private multText!: Phaser.GameObjects.Text;
  private comboBar!: { bg: Phaser.GameObjects.Rectangle; fill: Phaser.GameObjects.Rectangle };
  // combo tracking
  private lastX = 0;
  private lastPlat?: Platform;
  private usedInk = false;
  private airMs = 0;
  private acc = 0;
  private gameTime = 0;   // our own clock: stops while paused (ink fade, combo timer)
  private paused = false;
  private menu?: PauseMenu;
  private hint?: Phaser.GameObjects.Text;
  private milestone = 0;   // index of next SPEED_MILESTONES banner
  private juice!: Juice;
  private record = 0;        // best score ever at the start of this run
  private announced = 0;     // highest unlock threshold already announced this run

  constructor() { super('Game'); }

  init(data: { mode?: Mode }) {
    this.mode = data.mode ?? 'daily';
    this.dead = false;
  }

  private get bestKey() {
    // v2 keys: score is now points (distance × multiplier), not meters
    return this.mode === 'daily' ? `liveink.best2.daily.${todayKey()}` : 'liveink.best2.endless';
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
    this.juice = new Juice(this, th);
    sfx.setTheme(th.id);
    sfx.resume();
    // browsers only allow audio after a user gesture
    this.input.on('pointerdown', () => sfx.unlock());
    this.input.keyboard?.on('keydown', () => sfx.unlock());
    this.input.keyboard?.on('keydown-M', () => { sfx.setMuted(!sfx.muted); if (this.paused) this.openMenu(); });
    this.best = load(this.bestKey, 0);
    this.record = getRecord();
    this.announced = this.record;
    this.sc = new ScoreSystem();
    this.lastX = this.ball.x;
    this.lastPlat = undefined; this.usedInk = false; this.airMs = 0; this.acc = 0;
    this.gameTime = 0; this.paused = false; this.menu = undefined; this.milestone = 0; this.parallax = []; this.hudAt = -1e9;

    cam.scrollX = this.ball.x - cam.width * 0.2;
    cam.scrollY = this.ball.y - cam.height * 0.55;

    // HUD
    this.score = this.add.text(24, 20, '0', {
      fontFamily: th.titleFont, fontSize: '44px', color: th.text, fontStyle: th.id === 'neon' ? 'bold' : 'normal',
    }).setScrollFactor(0).setDepth(20);
    if (th.id === 'neon') this.score.setShadow(0, 0, th.accent, 12, false, true);
    else this.score.setColor('#FFFFFF').setStroke('#111111', 8).setShadow(4, 5, '#111111', 0, true, true);
    this.sub = this.add.text(26, 74, '', {
      fontFamily: th.font, fontSize: '18px', color: th.textDim,
    }).setScrollFactor(0).setDepth(20);
    {
      const x = 24, y = cam.height - 50, w = cam.width - 48, h = 16;
      const mk = (xx: number, yy: number, ww: number, hh: number, c: number, a = 1) =>
        this.add.rectangle(xx, yy, ww, hh, c, a).setOrigin(0).setScrollFactor(0).setDepth(20);
      if (th.id === 'pop') mk(x - 3, y - 3, w + 6, h + 6, 0x111111);           // chunky outline
      this.inkBar = {
        bg: mk(x, y, w, h, th.meterBg),
        glow: th.id === 'neon' ? mk(x - 3, y - 3, w + 6, h + 6, th.meterFill, 0.2) : undefined,
        fill: mk(x, y, w, h, th.meterFill),
        w,
      };
    }
    this.multText = this.add.text(0, 26, '', {
      fontFamily: th.titleFont, fontSize: '30px', fontStyle: 'bold',
      color: th.id === 'neon' ? '#FFE14D' : '#E5342B',
    }).setScrollFactor(0).setDepth(20).setOrigin(0, 0);
    if (th.id === 'pop') this.multText.setStroke('#111111', 6);
    else this.multText.setShadow(0, 0, '#FFE14D', 10, false, true);
    this.comboBar = {
      bg: this.add.rectangle(0, 64, 40, 5, th.id === 'neon' ? 0x141b33 : 0xffffff).setOrigin(0).setScrollFactor(0).setDepth(20).setVisible(false),
      fill: this.add.rectangle(0, 64, 40, 5, th.id === 'neon' ? 0xffe14d : 0xe5342b).setOrigin(0).setScrollFactor(0).setDepth(20).setVisible(false),
    };

    // Pause button (top-right). Stops the tap from also starting a line.
    const pb = this.add.graphics().setScrollFactor(0).setDepth(25);
    const px = cam.width - 70, py = 22;
    if (th.id === 'pop') {
      pb.fillStyle(0x111111, 1).fillRoundedRect(px + 4, py + 5, 48, 48, 10);
      pb.fillStyle(0xffffff, 1).fillRoundedRect(px, py, 48, 48, 10);
      pb.lineStyle(4, 0x111111, 1).strokeRoundedRect(px, py, 48, 48, 10);
      pb.fillStyle(0x111111, 1).fillRect(px + 15, py + 13, 6, 22).fillRect(px + 27, py + 13, 6, 22);
    } else {
      pb.fillStyle(0x141b33, 1).fillRoundedRect(px, py, 48, 48, 24);
      pb.lineStyle(1, 0x4df3ff, 0.6).strokeRoundedRect(px, py, 48, 48, 24);
      pb.fillStyle(0xeaf6ff, 1).fillRect(px + 16, py + 14, 5, 20).fillRect(px + 27, py + 14, 5, 20);
    }
    const pHit = this.add.rectangle(px + 24, py + 24, 64, 64, 0, 0).setScrollFactor(0).setDepth(26)
      .setInteractive({ useHandCursor: true });
    pHit.on('pointerdown', (_p: unknown, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
      e.stopPropagation();
      this.ink.cancel();
    });
    pHit.on('pointerup', () => this.pause());

    // Desktop keys + auto-pause when the tab/window loses focus
    const key = () => (this.paused ? this.resume() : this.pause());
    this.input.keyboard?.on('keydown-ESC', key);
    this.input.keyboard?.on('keydown-P', key);
    const onBlur = () => this.pause();
    this.game.events.on('blur', onBlur);
    this.game.events.on('hidden', onBlur);
    this.events.once('shutdown', () => { this.game.events.off('blur', onBlur); this.game.events.off('hidden', onBlur); });

    const hint = this.hint = this.add.text(cam.width / 2, 300,
      'Draw a path ahead of the ball\nCross gaps on your ink to build a COMBO', {
        fontFamily: th.font, fontSize: '24px', color: th.textDim, align: 'center',
      }).setOrigin(0.5).setScrollFactor(0).setDepth(20);
    this.time.delayedCall(4000, () => this.tweens.add({ targets: hint, alpha: 0, duration: 600 }));
  }

  /** Parallax decoration: stars/grid for Neon, halftone dots + sunburst for Pop Arcade. */
  private drawBackdrop() {
    const th = this.th;
    const rng = mulberry32(7);
    const cw = this.cameras.main.width, ch = this.cameras.main.height;
    if (th.id === 'neon') {
      // Baked once into small tiles, then repeated by the GPU (rebuilding geometry every frame was slow on phones)
      if (!this.textures.exists('neon-bg')) {
        // ONE opaque tile (background color + grid + stars): a single full-screen layer with no blending
        const g = this.make.graphics({}, false), T = 320;
        g.fillStyle(Phaser.Display.Color.HexStringToColor(th.bg).color, 1).fillRect(0, 0, T, T);
        g.lineStyle(1, th.bgDecor, 0.18);
        for (let k = 0; k < T; k += 80) g.lineBetween(0, k + 0.5, T, k + 0.5).lineBetween(k + 0.5, 0, k + 0.5, T);
        for (let i = 0; i < 14; i++) {
          g.fillStyle(rng() < 0.2 ? 0xff4fd8 : 0x4df3ff, 0.15 + rng() * 0.5).fillCircle(rng() * T, rng() * T, rng() * 1.8 + 0.4);
        }
        g.generateTexture('neon-bg', T, T); g.destroy();
      }
      this.parallax = [
        { ts: this.add.tileSprite(0, 0, cw, ch, 'neon-bg').setOrigin(0).setScrollFactor(0).setDepth(0), fx: 0.15, fy: 0.1 },
      ];
    } else {
      // sunburst rays from a fixed point + halftone dot field
      // rays baked once into a screen-sized texture -> one cheap quad per frame
      const W = this.cameras.main.width, H = this.cameras.main.height;
      if (!this.textures.exists('sunburst')) {
        const r = this.make.graphics({}, false);
        const cx = W * 0.85, cy = H * 0.3;
        for (let i = 0; i < 24; i += 2) {
          const a0 = (i / 24) * Math.PI * 2, a1 = ((i + 1) / 24) * Math.PI * 2;
          r.fillStyle(0xffffff, 0.14).fillTriangle(cx, cy, cx + Math.cos(a0) * 2000, cy + Math.sin(a0) * 2000,
            cx + Math.cos(a1) * 2000, cy + Math.sin(a1) * 2000);
        }
        r.generateTexture('sunburst', W, H);
        r.destroy();
      }
      this.add.image(0, 0, 'sunburst').setOrigin(0).setScrollFactor(0).setDepth(0);
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

  update(_time: number, rawDelta: number) {
    if (this.paused) return;
    if (this.dead) { this.juice.update(Math.min(rawDelta, 100), this.ball.rx, this.ball.ry, this.ball.color, 0); return; }
    const cam = this.cameras.main;
    const delta = Math.min(rawDelta, 100); // clamp: a hiccup shouldn't simulate seconds at once
    this.gameTime += delta;
    const time = this.gameTime;

    this.acc += delta;
    while (this.acc >= STEP_MS) {
      this.level.step(time);
      this.ball.savePrev();
      this.ball.update(this.surfaceNormal());
      this.matter.world.step(STEP_MS);
      this.updateCombo(time, STEP_MS); // per physics step: never misses a short contact
      this.acc -= STEP_MS;
    }
    // Interpolate between the last two physics steps -> smooth on 60/120/144 Hz screens
    this.ball.draw(this.acc / STEP_MS);
    this.ink.update(time, delta);
    // drawing sound + sparks at the pen tip
    const drawSpeed = this.ink.drawnPx / Math.max(1, delta / STEP_MS) / 12; // ~12 px per frame = full
    sfx.drawLevel(this.ink.isDrawing ? drawSpeed : 0);
    const tip = this.ink.tip;
    if (tip && this.ink.drawnPx > 0) {
      const n = Math.min(3, 1 + Math.floor(drawSpeed * 2));
      for (let i = 0; i < n; i++) this.juice.drawSpark(tip.x, tip.y, this.ink.currentColor());
    }
    this.juice.update(delta, this.ball.rx, this.ball.ry, this.ball.color, this.ball.body.velocity.x);
    this.level.update(cam.scrollX, cam.scrollX + cam.width);

    // Frame-rate independent camera smoothing, following the interpolated ball
    const k = (base: number) => 1 - Math.pow(1 - base, delta / STEP_MS);
    cam.scrollX = Phaser.Math.Linear(cam.scrollX, this.ball.rx - cam.width * 0.2, k(0.15));
    cam.scrollY = Phaser.Math.Linear(cam.scrollY, this.ball.ry - cam.height * 0.55, k(0.06));

    if (this.halftone) this.halftone.setTilePosition(cam.scrollX * 0.15, cam.scrollY * 0.1);
    for (const l of this.parallax) l.ts.setTilePosition(cam.scrollX * l.fx, cam.scrollY * l.fy);

    // Long-run difficulty: shorter ink life late in the run (speed is handled in BallController)
    this.ink.lifeMs = inkLifeMs(this.meters);
    const ms = SPEED_MILESTONES[this.milestone];
    if (ms && this.meters >= ms.m) { this.milestone++; this.introBanner(ms.text); sfx.jingle(); }

    // First time a new obstacle shows up: short banner (only the first 3 times ever per obstacle)
    for (const it of this.level.intros) {
      if (!it.shown && this.ball.x > it.x - 450) {
        it.shown = true;
        const key = `liveink.intro.${it.id}`, n = load(key, 0);
        if (n < 3) { save(key, n + 1); this.introBanner(it.text); }
      }
    }

    // Mid-run unlock announcements
    if (this.sc.total > this.announced) {
      newlyUnlocked(this.announced, this.sc.total).forEach((name, i) => this.unlockToast(name, i));
      this.announced = this.sc.total;
    }
    // Text re-renders are costly on phones: refresh the HUD ~12x per second, not every frame
    if (this.gameTime - this.hudAt >= 80) {
      this.hudAt = this.gameTime;
      this.score.setText(this.sc.total.toLocaleString('en-US'));
      this.sub.setText(`${this.meters} m  ·  ${this.mode === 'daily' ? `DAILY #${dailyNumber()}` : 'ENDLESS'}  ·  best ${this.best.toLocaleString('en-US')}`);
      this.multText.setText(this.sc.mult > 1 ? `x${this.sc.mult}` : '').setX(this.score.x + this.score.width + 14);
    }
    const left = this.sc.windowLeft(time);
    this.comboBar.bg.setVisible(left > 0); this.comboBar.fill.setVisible(left > 0);
    if (left > 0) {
      const bx = this.multText.x, bw = Math.max(40, this.multText.width);
      this.comboBar.bg.setPosition(bx, 64).setSize(bw, 5);
      this.comboBar.fill.setPosition(bx, 64).setSize(bw * left, 5);
    }

    const th = this.th, ib = this.inkBar;
    const col = this.ink.ratio > 0.25 ? th.meterFill : th.meterLow;
    const fw = Math.max(16, ib.w * this.ink.ratio);
    ib.fill.setSize(fw, 16).setFillStyle(col);
    ib.glow?.setSize(fw + 6, 22).setFillStyle(col, 0.2);

    if (this.ball.y > this.level.floorNear(this.ball.x) + 350) this.die();
    else if (this.level.hitsCeiling(this.ball.x, this.ball.y, BALL_R)) this.die('spikes');
  }

  /** Bridges, stars, air time, multiplier decay. */
  private updateCombo(time: number, delta: number) {
    const bx = this.ball.x, by = this.ball.y;
    if (bx > this.lastX) this.sc.addDistance((bx - this.lastX) / PX_PER_M);
    this.lastX = bx;

    const plat = this.level.platformAt(bx);
    const onGround = !!plat && Math.abs(by + BALL_R - plat.y) < 6;
    const onInk = this.ink.touches(bx, by, BALL_R);

    // Ink used near the end of the platform we left (ramp) or over the gap -> this crossing is a bridge
    if (onInk && this.lastPlat && bx > this.lastPlat.x + this.lastPlat.w - 120) this.usedInk = true;
    // Reached a new platform while still above its top (on ink, in the air or landing) = gap crossed
    if (plat && plat !== this.lastPlat && by < plat.y + 4) {
      if (this.lastPlat && this.usedInk) {
        this.sc.bridge(time);
        this.popup(this.sc.mult > 1 ? `BRIDGE  x${this.sc.mult}` : 'BRIDGE', 'big');
        sfx.bridge(this.sc.mult);
        const bc = this.ink.currentColor();
        this.juice.burst(bx, by + BALL_R, bc, 8 + this.sc.mult * 2, 140 + this.sc.mult * 15);
        this.juice.ring(bx, by, bc);
        if (this.sc.mult >= 5) this.cameras.main.shake(90, 0.003);
        this.tweens.add({ targets: this.multText, scale: { from: 1.5, to: 1 }, duration: 250, ease: 'Back.out' });
      }
      this.lastPlat = plat;
      this.usedInk = false;
    }

    // Air time: launched off your own ramp
    if (!onGround && !onInk) this.airMs += delta;
    else {
      if (this.airMs > 450 && this.usedInk) { this.popup(`AIR +${this.sc.addBonus(Math.round(this.airMs / 20))}`, 'small'); sfx.air(); }
      if (this.airMs > 250) {
        const k = Math.min(1, this.airMs / 900);
        sfx.land(k);
        this.juice.burst(bx, by + BALL_R, this.th.id === 'pop' ? 0xffffff : 0x9fb4ff, Math.round(4 + 8 * k), 90 + 80 * k, 2);
      }
      this.airMs = 0;
    }

    for (const st of this.level.stars) {
      // hit circle matches the drawn star (radius ~16) + its floating offset
      if (!st.taken && Math.hypot(st.x - bx, st.gfx.y - by) < BALL_R + 13) {
        st.taken = true;
        this.sc.stars++;
        sfx.star();
        this.juice.burst(st.x, st.gfx.y, this.th.id === 'pop' ? 0xffffff : 0xffe14d, 16, 200);
        this.popup(`+${this.sc.addBonus(50)}`, 'star', st.x, st.y);
        this.tweens.add({ targets: st.gfx, alpha: 0, scale: 1.6, duration: 250, onComplete: () => st.gfx.setVisible(false) });
      }
    }

    if (this.sc.update(time)) { this.popup(`x${this.sc.mult}`, 'drop'); sfx.comboDrop(); }
  }

  private popup(text: string, kind: 'big' | 'small' | 'star' | 'drop', x = this.ball.x, y = this.ball.y - 50) {
    const th = this.th;
    const color = kind === 'drop' ? th.textDim
      : th.id === 'neon' ? (kind === 'star' ? '#FFE14D' : '#FF4FD8') : (kind === 'star' ? '#2B59FF' : '#E5342B');
    const size = kind === 'big' ? 34 : kind === 'drop' ? 22 : 26;
    const t = this.add.text(x, y, text, { fontFamily: th.titleFont, fontSize: `${size}px`, fontStyle: 'bold', color })
      .setOrigin(0.5).setDepth(15);
    if (th.id === 'pop') t.setStroke('#111111', 6);
    else t.setShadow(0, 0, color, 12, false, true);
    this.tweens.add({ targets: t, y: y - 70, alpha: { from: 1, to: 0 }, scale: { from: 1.3, to: 1 }, duration: 900, ease: 'Cubic.out', onComplete: () => t.destroy() });
  }

  /** Normal of the surface the ball is resting on (platform top or ink line), or null when airborne. */
  private surfaceNormal() {
    const bx = this.ball.x, by = this.ball.y;
    const plat = this.level.platformAt(bx);
    if (plat && Math.abs(by + BALL_R - plat.y) < 3) return { nx: 0, ny: -1 };
    return this.ink.contactNormal(bx, by, BALL_R + 1);
  }

  private introBanner(text: string) {
    const th = this.th, W = this.cameras.main.width;
    const [title, sub] = text.split(' · ');
    const bg = this.add.graphics().setScrollFactor(0).setDepth(22);
    if (th.id === 'pop') {
      bg.fillStyle(0x111111, 1).fillRect(5, 236, W, 86);
      bg.fillStyle(0xffffff, 1).fillRect(0, 230, W, 86);
      bg.lineStyle(4, 0x111111, 1).lineBetween(0, 230, W, 230).lineBetween(0, 316, W, 316);
    } else {
      bg.fillStyle(0x070a14, 0.85).fillRect(0, 230, W, 86);
      bg.fillStyle(0xff4fd8, 1).fillRect(0, 230, W, 2).fillRect(0, 314, W, 2);
    }
    const t1 = this.add.text(W / 2, 258, title, {
      fontFamily: th.titleFont, fontSize: '30px', fontStyle: 'bold', color: th.id === 'pop' ? '#E5342B' : '#FF4FD8',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(23);
    if (th.id === 'pop') t1.setStroke('#111111', 6); else t1.setShadow(0, 0, '#FF4FD8', 12, false, true);
    const t2 = this.add.text(W / 2, 293, sub ?? '', { fontFamily: th.font, fontSize: '18px', color: th.text })
      .setOrigin(0.5).setScrollFactor(0).setDepth(23);
    const all = [bg, t1, t2];
    this.tweens.add({ targets: bg, x: { from: -W, to: 0 }, duration: 250, ease: 'Cubic.out' });
    this.tweens.add({ targets: [t1, t2], x: { from: -W / 2, to: W / 2 }, duration: 250, ease: 'Cubic.out' });
    this.tweens.add({ targets: all, alpha: 0, delay: 2200, duration: 400, onComplete: () => all.forEach((o) => o.destroy()) });
  }

  private unlockToast(name: string, i = 0) {
    if (i === 0) sfx.jingle();
    const th = this.th, W = this.cameras.main.width;
    const y = 150 + i * 58;
    const t = this.add.text(W / 2, y, `UNLOCKED: ${name}!`, {
      fontFamily: th.titleFont, fontSize: '26px', fontStyle: 'bold', color: th.id === 'pop' ? '#FFFFFF' : '#FFE14D',
      backgroundColor: th.id === 'pop' ? '#2B59FF' : '#141b33', padding: { x: 16, y: 10 },
    }).setOrigin(0.5).setScrollFactor(0).setDepth(22);
    if (th.id === 'pop') t.setStroke('#111111', 5);
    this.tweens.add({ targets: t, scale: { from: 0.6, to: 1 }, duration: 300, ease: 'Back.out' });
    this.tweens.add({ targets: t, alpha: 0, y: y - 30, delay: 2200 + i * 300, duration: 500, onComplete: () => t.destroy() });
  }

  private pause() {
    if (this.paused || this.dead) return;
    this.paused = true;
    this.ink.cancel();
    this.ink.enabled = false;
    this.tweens.pauseAll();
    this.time.paused = true;
    sfx.suspend();
    this.hint?.setVisible(false);
    this.openMenu();
  }

  private resume() {
    if (!this.paused) return;
    this.menu?.destroy();
    this.menu = undefined;
    this.paused = false;
    this.tweens.resumeAll();
    this.time.paused = false;
    sfx.resume();
    this.hint?.setVisible(true);
    // re-enable drawing on the next frame so the "Resume" tap doesn't start a line
    this.time.delayedCall(0, () => { this.ink.enabled = true; });
  }

  private openMenu() {
    this.menu?.destroy();
    this.menu = new PauseMenu(this, {
      theme: this.th, mode: this.mode, ball: this.ball.skin, line: this.ink.lineSkin,
      onResume: () => this.resume(),
      onRestart: (mode) => this.scene.restart({ mode }),
      onTheme: () => { toggleTheme(); this.scene.restart({ mode: this.mode }); },
      onBall: (i) => { setBall(i); this.ball.skin = i; this.ball.draw(1); this.openMenu(); },
      onLine: (i) => { setLine(i); this.ink.lineSkin = i; this.openMenu(); },
      onSound: () => { sfx.setMuted(!sfx.muted); this.openMenu(); },
    });
  }

  private get meters() {
    return Math.max(0, Math.floor((this.ball.x - this.ball.startX) / PX_PER_M));
  }

  private die(cause: 'fall' | 'spikes' = 'fall') {
    this.dead = true;
    sfx.drawLevel(0);
    sfx.die(cause);
    this.juice.burst(this.ball.x, this.ball.y, this.ball.color, 26, 260, 4);
    this.ink.cancel();
    this.ink.enabled = false;
    this.matter.world.pause();
    this.cameras.main.shake(180, 0.006);
    const th = this.th;
    const m = this.meters;
    const pts = this.sc.total;
    const isBest = pts > this.best;
    if (isBest) { this.best = pts; save(this.bestKey, pts); }
    const unlocked = newlyUnlocked(this.record, pts);
    setRecord(pts);
    const ptsStr = pts.toLocaleString('en-US');

    const W = this.cameras.main.width, H = this.cameras.main.height;
    // (no container: input hit-tests on fixed-to-screen children inside containers are offset)
    const fix = <T extends Phaser.GameObjects.GameObject & { setScrollFactor(x: number): T; setDepth(d: number): T }>(o: T) =>
      o.setScrollFactor(0).setDepth(30);
    const t = (y: number, s: string, size: number, color = th.text, font = th.font) =>
      fix(this.add.text(W / 2, y, s, { fontFamily: font, fontSize: `${size}px`, color, align: 'center' }).setOrigin(0.5));

    fix(this.add.rectangle(W / 2, H / 2, W, H, th.overlay, th.overlayAlpha));
    const title = t(H * 0.27, cause === 'spikes' ? (th.id === 'pop' ? 'OUCH! SPIKES!' : 'Spiked.') : th.deathTitle, th.id === 'neon' ? 54 : 44, th.id === 'pop' ? '#E5342B' : th.text, th.titleFont);
    if (th.id === 'pop') title.setStroke('#111111', 8).setShadow(5, 6, '#111111', 0, true, true).setAngle(-3);

    if (th.id === 'pop') {
      const card = fix(this.add.graphics());
      card.fillStyle(0x111111, 1).fillRoundedRect(W / 2 - 130 + 6, H * 0.4 - 70 + 7, 260, 140, 16);
      card.fillStyle(0xffffff, 1).fillRoundedRect(W / 2 - 130, H * 0.4 - 70, 260, 140, 16);
      card.lineStyle(5, 0x111111, 1).strokeRoundedRect(W / 2 - 130, H * 0.4 - 70, 260, 140, 16);
      t(H * 0.4, ptsStr, 60, '#2B59FF', th.titleFont);
    } else {
      t(H * 0.4, ptsStr, 76, th.text, th.titleFont).setShadow(0, 0, th.accent, 18, false, true);
    }
    t(H * 0.495, `${m} m  ·  ${this.sc.bridges} bridge${this.sc.bridges === 1 ? "" : "s"}  ·  max x${this.sc.maxMult}  ·  ★ ${this.sc.stars}`, 18, th.textDim);
    t(H * 0.535, isBest ? 'NEW BEST!' : `best ${this.best.toLocaleString('en-US')}`, 24, isBest ? th.accent : th.textDim);
    if (unlocked.length) t(H * 0.565, `🔓 ${unlocked.join(' + ')} unlocked!`, 18, th.id === 'pop' ? '#2B59FF' : '#FFE14D');

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
      hit.on('pointerup', () => { sfx.click(); fn(); });
    };
    button(H * 0.62, th.id === 'pop' ? 'PLAY AGAIN' : 'Try again', true, () => this.scene.restart({ mode: this.mode }));
    button(H * 0.71, this.mode === 'daily' ? 'Play endless' : 'Play daily', false, () =>
      this.scene.restart({ mode: this.mode === 'daily' ? 'endless' : 'daily' }));
    if (this.mode === 'daily') {
      const filled = Math.min(10, this.sc.bridges);
      const [on, off] = th.id === 'neon' ? ['🟦', '⬛'] : ['🟨', '⬜'];
      button(H * 0.8, 'Copy result', false, () => {
        const text = `Live Ink Daily #${dailyNumber()} — ${ptsStr} pts (max x${this.sc.maxMult}, ★${this.sc.stars})\n${on.repeat(filled)}${off.repeat(10 - filled)}`;
        navigator.clipboard?.writeText(text).catch(() => {});
      });
    }
    const sw = t(H * 0.9, th.id === 'neon' ? 'Switch style → Pop' : 'Switch style → Neon', 18, th.textDim);
    sw.setInteractive({ useHandCursor: true }).on('pointerup', () => { toggleTheme(); this.scene.restart({ mode: this.mode }); });
  }
}
