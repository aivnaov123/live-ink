import Phaser from 'phaser';
import type { Theme } from '../theme';
import { sfx } from '../systems/Sfx';
import { MenuBase } from './MenuBase';
import { progress } from '../systems/Progress';

export interface StartMenuOpts {
  theme: Theme;
  mode: 'daily' | 'endless';
  dailyNo: number;
  best: number;
  record: number;
  ball: number;
  line: number;
  onPlay(): void;
  onMode(mode: 'daily' | 'endless'): void;
  onTheme(): void;
  onSound(): void;
  onBall(i: number): void;
  onLine(i: number): void;
  onMissions(): void;
}

/** First screen: logo + "tap to play" over the frozen first level. One tap anywhere starts the run. */
export class StartMenu extends MenuBase {
  constructor(scene: Phaser.Scene, private o: StartMenuOpts) {
    super(scene, o.theme);
    this.build();
  }

  /** Small pill toggle (mode / style / sound). */
  private chip(cx: number, cy: number, w: number, label: string, selected: boolean, fn: () => void) {
    const th = this.theme, g = this.fix(this.scene.add.graphics());
    const x = cx - w / 2, y = cy - 24;
    if (th.id === 'pop') {
      g.fillStyle(0x111111, 1).fillRoundedRect(x + 4, y + 5, w, 48, 10);
      g.fillStyle(selected ? 0xe5342b : 0xffffff, 1).fillRoundedRect(x, y, w, 48, 10);
      g.lineStyle(4, 0x111111, 1).strokeRoundedRect(x, y, w, 48, 10);
    } else {
      g.fillStyle(selected ? 0x4df3ff : 0x141b33, 1).fillRoundedRect(x, y, w, 48, 24);
      g.lineStyle(1, 0x4df3ff, 0.7).strokeRoundedRect(x, y, w, 48, 24);
    }
    const color = th.id === 'pop' ? (selected ? '#FFFFFF' : '#111111') : (selected ? '#070A14' : '#EAF6FF');
    this.text(cx, cy, label, 19, color);
    this.hit(cx, cy, w + 6, 54, fn);
  }

  private build() {
    const th = this.theme, sc = this.scene, F = this.fit, W = 540;
    const pop = th.id === 'pop';

    // dim the frozen level; tapping anywhere (not on a button) starts the run
    this.fix(sc.add.rectangle(F.W / 2, F.H / 2, F.W, F.H, th.overlay, pop ? 0.82 : 0.78), true);
    this.hit(F.W / 2, F.H / 2, F.W, F.H, () => this.o.onPlay(), true, false);

    // --- logo: title + a hand-drawn ink stroke under it
    const g = this.fix(sc.add.graphics());
    const pts: Phaser.Math.Vector2[] = [];
    for (let i = 0; i <= 24; i++) pts.push(new Phaser.Math.Vector2(120 + i * 12.5, 182 + Math.sin(i / 3.2) * 10 - i * 0.6));
    if (pop) {
      g.lineStyle(16, 0x111111, 1).strokePoints(pts.map((p) => new Phaser.Math.Vector2(p.x + 3, p.y + 4)));
      g.lineStyle(16, 0x111111, 1).strokePoints(pts);
      g.lineStyle(9, th.ink, 1).strokePoints(pts);
    } else {
      g.lineStyle(20, th.ink, 0.18).strokePoints(pts);
      g.lineStyle(7, th.ink, 1).strokePoints(pts);
      g.lineStyle(2.5, 0xffffff, 0.85).strokePoints(pts);
    }
    const title = this.text(W / 2, 112, 'LIVE INK', pop ? 76 : 82, pop ? '#FFFFFF' : '#EAF6FF', th.titleFont);
    if (pop) title.setStroke('#111111', 12).setShadow(6, 7, '#111111', 0, true, true).setAngle(-3);
    else title.setFontStyle('bold').setShadow(0, 0, th.accent, 22, false, true);
    this.text(W / 2, 230, 'Draw the road. Before it fades.', 20, pop ? '#111111' : th.textDim);

    // --- big pulsing call to action
    const cta = this.text(W / 2, 305, 'TAP TO PLAY', 40, pop ? '#E5342B' : '#4DF3FF', th.titleFont);
    if (pop) cta.setStroke('#111111', 8).setShadow(4, 5, '#111111', 0, true, true);
    else cta.setShadow(0, 0, '#4DF3FF', 16, false, true);
    sc.tweens.add({ targets: cta, scale: cta.scaleX * 1.08, duration: 650, yoyo: true, repeat: -1, ease: 'Sine.inOut' });

    // --- mode
    this.chip(W / 2 - 105, 390, 190, `Daily #${this.o.dailyNo}`, this.o.mode === 'daily', () => this.o.onMode('daily'));
    this.chip(W / 2 + 105, 390, 190, 'Endless', this.o.mode === 'endless', () => this.o.onMode('endless'));
    const bestLine = this.o.record > 0
      ? `${this.o.mode === 'daily' ? 'Best today' : 'Best'}: ${this.o.best.toLocaleString('en-US')}   ·   Record: ${this.o.record.toLocaleString('en-US')}`
      : 'Same level for everyone, every day';
    this.text(W / 2, 436, bestLine, 17, pop ? '#5c4a00' : th.textDim);

    // --- daily missions + achievements
    const ms = progress.missions(), done = ms.filter((m) => m.done).length, streak = progress.streakNow();
    this.chip(W / 2, 488, 400, `🎯 Daily missions ${done}/3${streak ? `  ·  🔥 ${streak}` : ''}  ·  🏆 ${progress.achievementCount()}`, false, () => this.o.onMissions());

    // --- ball + line skins (shared with the pause menu)
    this.skinRows(545, 662, this.o.ball, this.o.line, this.o.onBall, this.o.onLine);

    // --- style + sound
    this.chip(W / 2 - 105, 862, 190, pop ? 'Style: Pop' : 'Style: Neon', false, () => this.o.onTheme());
    this.chip(W / 2 + 105, 862, 190, sfx.muted ? '🔇 Sound off' : '🔊 Sound on', false, () => this.o.onSound());

    this.text(W / 2, 925, 'Draw with your finger or mouse  ·  Space to start', 15, pop ? '#5c4a00' : th.textDim);
  }
}
