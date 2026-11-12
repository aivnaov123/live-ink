import Phaser from 'phaser';
import type { Theme } from '../theme';
import { BALLS, LINES, getRecord, isUnlocked } from '../skins';
import { sfx } from '../systems/Sfx';

export interface PauseMenuOpts {
  theme: Theme;
  mode: 'daily' | 'endless';
  ball: number;
  line: number;
  onResume(): void;
  onRestart(mode: 'daily' | 'endless'): void;
  onTheme(id: Theme['id']): void;
  onBall(i: number): void;
  onLine(i: number): void;
  onSound(): void;
}

/** Pause overlay: resume, style, ball & line skins, restart, mode. All objects fixed to screen. */
export class PauseMenu {
  private objs: Phaser.GameObjects.GameObject[] = [];

  constructor(private scene: Phaser.Scene, private o: PauseMenuOpts) {
    this.build();
  }

  destroy() {
    for (const g of this.objs) g.destroy();
    this.objs = [];
  }

  private fix<T extends Phaser.GameObjects.GameObject>(g: T): T {
    (g as unknown as { setScrollFactor(n: number): void }).setScrollFactor(0);
    (g as unknown as { setDepth(n: number): void }).setDepth(40);
    this.objs.push(g);
    return g;
  }

  private text(x: number, y: number, s: string, size: number, color: string, font = this.o.theme.font) {
    return this.fix(this.scene.add.text(x, y, s, { fontFamily: font, fontSize: `${size}px`, color, align: 'center' }).setOrigin(0.5));
  }

  private hit(x: number, y: number, w: number, h: number, fn: () => void) {
    const r = this.fix(this.scene.add.rectangle(x, y, w, h, 0, 0).setInteractive({ useHandCursor: true }));
    r.on('pointerdown', (_p: unknown, _x: number, _y: number, e: Phaser.Types.Input.EventData) => e.stopPropagation());
    r.on('pointerup', () => { sfx.click(); fn(); });
  }

  private button(y: number, label: string, primary: boolean, fn: () => void, w = 300) {
    const th = this.o.theme, W = this.scene.cameras.main.width;
    const g = this.fix(this.scene.add.graphics());
    const r = Math.min(th.btnRadius, 30), bx = W / 2 - w / 2, by = y - 30;
    if (th.id === 'pop') {
      g.fillStyle(0x111111, 1).fillRoundedRect(bx + 5, by + 6, w, 60, r);
      g.fillStyle(primary ? th.btnBg : 0xffffff, 1).fillRoundedRect(bx, by, w, 60, r);
      g.lineStyle(4, 0x111111, 1).strokeRoundedRect(bx, by, w, 60, r);
    } else if (primary) g.fillStyle(th.btnBg, 1).fillRoundedRect(bx, by, w, 60, r);
    else g.lineStyle(2, th.btnBg, 1).strokeRoundedRect(bx, by, w, 60, r);
    this.text(W / 2, y, label, 24, primary ? th.btnText : th.text);
    this.hit(W / 2, y, w, 60, fn);
  }

  /** Small selectable tile; draws its content via `paint`. */
  private tile(cx: number, cy: number, selected: boolean, paint: (g: Phaser.GameObjects.Graphics) => void, fn: () => void, lockAt = 0) {
    const th = this.o.theme;
    const g = this.fix(this.scene.add.graphics());
    const s = 64, x = cx - s / 2, y = cy - s / 2;
    if (th.id === 'pop') {
      g.fillStyle(0x111111, 1).fillRoundedRect(x + 4, y + 5, s, s, 10);
      g.fillStyle(0xffffff, 1).fillRoundedRect(x, y, s, s, 10);
      g.lineStyle(selected ? 5 : 3, selected ? 0xe5342b : 0x111111, 1).strokeRoundedRect(x, y, s, s, 10);
    } else {
      g.fillStyle(0x10162a, 1).fillRoundedRect(x, y, s, s, 12);
      g.lineStyle(selected ? 3 : 1, selected ? 0xffe14d : 0x2a3a66, 1).strokeRoundedRect(x, y, s, s, 12);
    }
    paint(g);
    if (lockAt > 0) {
      // dim + padlock + required score; tapping explains instead of selecting
      g.fillStyle(th.id === 'pop' ? 0xffffff : 0x070a14, 0.72).fillRoundedRect(x, y, s, s, 10);
      const lc = th.id === 'pop' ? 0x111111 : 0x9aa4c4;
      g.lineStyle(3, lc, 1).strokeCircle(cx, cy - 8, 6);
      g.fillStyle(lc, 1).fillRoundedRect(cx - 9, cy - 6, 18, 14, 3);
      this.text(cx, cy + 20, lockAt.toLocaleString('en-US'), 13, th.id === 'pop' ? '#111111' : '#9aa4c4');
      this.hit(cx, cy, s + 8, s + 8, () => this.flash(`Score ${lockAt.toLocaleString('en-US')} to unlock`));
      return;
    }
    this.hit(cx, cy, s + 8, s + 8, fn);
  }

  private flashText?: Phaser.GameObjects.Text;
  private flash(msg: string) {
    this.flashText?.setText(msg).setAlpha(1);
    this.scene.tweens.add({ targets: this.flashText, alpha: 0, delay: 1400, duration: 400 });
  }

  private build() {
    const { theme: th } = this.o;
    const sc = this.scene, W = sc.cameras.main.width, H = sc.cameras.main.height;
    this.fix(sc.add.rectangle(W / 2, H / 2, W, H, th.overlay, th.id === 'neon' ? 0.86 : 0.93));
    // swallow taps on the background so they don't start drawing
    this.hit(W / 2, H / 2, W, H, () => {});

    const title = this.text(W / 2, 110, 'PAUSED', 48, th.id === 'pop' ? '#E5342B' : th.text, th.titleFont);
    if (th.id === 'pop') title.setStroke('#111111', 8).setShadow(4, 5, '#111111', 0, true, true);
    else title.setShadow(0, 0, th.accent, 14, false, true);

    this.button(205, 'Resume', true, () => this.o.onResume());

    // --- Style ---
    this.text(W / 2, 290, 'STYLE  (restarts the run)', 16, th.textDim);
    const styles: { id: Theme['id']; label: string }[] = [{ id: 'neon', label: 'Neon' }, { id: 'pop', label: 'Pop' }];
    styles.forEach((s, i) => {
      const cx = W / 2 + (i === 0 ? -80 : 80), cy = 335, sel = th.id === s.id;
      const g = this.fix(sc.add.graphics());
      if (s.id === 'neon') {
        g.fillStyle(0x070a14, 1).fillRoundedRect(cx - 70, cy - 24, 140, 48, 24);
        g.lineStyle(sel ? 3 : 1, 0x4df3ff, 1).strokeRoundedRect(cx - 70, cy - 24, 140, 48, 24);
      } else {
        g.fillStyle(0x111111, 1).fillRoundedRect(cx - 66, cy - 19, 140, 48, 8);
        g.fillStyle(0xffd23f, 1).fillRoundedRect(cx - 70, cy - 24, 140, 48, 8);
        g.lineStyle(sel ? 5 : 3, sel ? 0xe5342b : 0x111111, 1).strokeRoundedRect(cx - 70, cy - 24, 140, 48, 8);
      }
      this.text(cx, cy, s.label, 20, s.id === 'neon' ? '#4DF3FF' : '#111111', s.id === 'neon' ? '"Space Grotesk", sans-serif' : '"Bungee", Impact, sans-serif');
      this.hit(cx, cy, 140, 48, () => { if (!sel) this.o.onTheme(s.id); });
    });

    const rec = getRecord();
    // --- Ball ---
    this.text(W / 2, 415, `BALL  ·  ${BALLS[this.o.ball].name}`, 16, th.textDim);
    BALLS.forEach((b, i) => {
      const cx = W / 2 + (i - 2) * 84, cy = 470;
      this.tile(cx, cy, i === this.o.ball, (g) => {
        const c = b.color ?? th.ball;
        if (th.id === 'pop') g.fillStyle(0x111111, 1).fillCircle(cx + 2, cy + 3, 17);
        g.fillStyle(c, 1).fillCircle(cx, cy, 16);
        if (b.ring !== undefined) g.lineStyle(2, b.ring, 0.9).strokeCircle(cx, cy, 11);
        if (th.id === 'pop') g.lineStyle(3, 0x111111, 1).strokeCircle(cx, cy, 16);
        g.lineStyle(3, b.mark ?? th.ballMark, 0.85).lineBetween(cx, cy, cx + 11, cy - 11);
      }, () => this.o.onBall(i), isUnlocked(b, rec) ? 0 : b.unlock);
    });

    // --- Line ---
    this.text(W / 2, 545, `LINE  ·  ${LINES[this.o.line].name}`, 16, th.textDim);
    LINES.forEach((l, i) => {
      const cx = W / 2 + (i - 2) * 84, cy = 600;
      this.tile(cx, cy, i === this.o.line, (g) => {
        const cols = l.color === 'prism' ? [0xff4f6d, 0xffd23f, 0x4dff8a, 0x4d9bff] : [l.color ?? th.ink];
        const seg = 40 / cols.length;
        if (cols.length > 1) cols.forEach((c, k) => {
          const x0 = cx - 20 + k * seg;
          if (th.id === 'pop') g.lineStyle(11, 0x111111, 1).lineBetween(x0, cy + 8 - k * 4, x0 + seg, cy + 4 - k * 4);
          g.lineStyle(6, c, 1).lineBetween(x0, cy + 8 - k * 4, x0 + seg, cy + 4 - k * 4);
        });
        if (cols.length === 1) {
          if (th.id === 'pop') g.lineStyle(11, 0x111111, 1).lineBetween(cx - 20, cy + 10, cx + 20, cy - 10);
          g.lineStyle(6, cols[0], 1).lineBetween(cx - 20, cy + 10, cx + 20, cy - 10);
        }
      }, () => this.o.onLine(i), isUnlocked(l, rec) ? 0 : l.unlock);
    });
    this.text(W / 2, 662, `Your best: ${rec.toLocaleString('en-US')}  ·  beat scores to unlock more`, 14, th.textDim);
    this.flashText = this.text(W / 2, 685, '', 16, th.id === 'pop' ? '#E5342B' : '#FFE14D').setAlpha(0);

    // --- Run ---
    this.button(735, 'Restart', false, () => this.o.onRestart(this.o.mode));
    this.button(815, this.o.mode === 'daily' ? 'Switch to Endless' : 'Switch to Daily', false,
      () => this.o.onRestart(this.o.mode === 'daily' ? 'endless' : 'daily'));
    // sound toggle (top-right of the menu)
    const sx = W - 70, sy = 110;
    const sg = this.fix(sc.add.graphics());
    if (th.id === 'pop') {
      sg.fillStyle(0x111111, 1).fillRoundedRect(sx - 40 + 4, sy - 24 + 5, 80, 48, 10);
      sg.fillStyle(0xffffff, 1).fillRoundedRect(sx - 40, sy - 24, 80, 48, 10);
      sg.lineStyle(4, 0x111111, 1).strokeRoundedRect(sx - 40, sy - 24, 80, 48, 10);
    } else {
      sg.fillStyle(0x141b33, 1).fillRoundedRect(sx - 40, sy - 24, 80, 48, 24);
      sg.lineStyle(1, 0x4df3ff, 0.6).strokeRoundedRect(sx - 40, sy - 24, 80, 48, 24);
    }
    this.text(sx, sy, sfx.muted ? '🔇 Off' : '🔊 On', 18, th.text);
    this.hit(sx, sy, 84, 52, () => this.o.onSound());
    this.text(W / 2, 885, 'Esc / P pause  ·  M sound', 14, th.textDim);
  }
}
