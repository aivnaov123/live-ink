import type { Theme } from '../theme';
import { sfx } from '../systems/Sfx';
import { MenuBase } from './MenuBase';

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

/** Pause overlay: resume, style, ball & line skins, restart, mode, sound. */
export class PauseMenu extends MenuBase {
  constructor(scene: Phaser.Scene, private o: PauseMenuOpts) {
    super(scene, o.theme);
    this.build();
  }

  private button(y: number, label: string, primary: boolean, fn: () => void, w = 300) {
    const th = this.theme, W = 540;
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

  private build() {
    const th = this.theme, sc = this.scene, W = 540, F = this.fit;
    this.fix(sc.add.rectangle(F.W / 2, F.H / 2, F.W, F.H, th.overlay, th.id === 'neon' ? 0.86 : 0.93), true);
    // swallow taps on the background so they don't start drawing
    this.hit(F.W / 2, F.H / 2, F.W, F.H, () => {}, true, false);

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

    // --- Ball + Line ---
    this.skinRows(415, 545, this.o.ball, this.o.line, this.o.onBall, this.o.onLine);

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
