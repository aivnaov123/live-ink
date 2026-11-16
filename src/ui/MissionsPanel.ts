import type Phaser from 'phaser';
import type { Theme } from '../theme';
import { MenuBase } from './MenuBase';
import { missionRow } from './missionRow';
import { ACHIEVEMENTS, progress } from '../systems/Progress';
import { BALLS, LINES } from '../skins';

/** Full-screen panel: today's 3 missions + streak, and the achievement list. */
export class MissionsPanel extends MenuBase {
  constructor(scene: Phaser.Scene, theme: Theme, private onBack: () => void) {
    super(scene, theme);
    this.build();
  }

  private build() {
    const th = this.theme, sc = this.scene, F = this.fit, W = 540, pop = th.id === 'pop';
    this.fix(sc.add.rectangle(F.W / 2, F.H / 2, F.W, F.H, th.overlay, pop ? 0.96 : 0.94), true);
    this.hit(F.W / 2, F.H / 2, F.W, F.H, () => {}, true, false); // swallow taps

    const title = this.text(W / 2, 70, 'MISSIONS', 44, pop ? '#E5342B' : th.text, th.titleFont);
    if (pop) title.setStroke('#111111', 8).setShadow(4, 5, '#111111', 0, true, true);
    else title.setShadow(0, 0, th.accent, 14, false, true);

    const ms = progress.missions(), streak = progress.streakNow();
    this.text(W / 2, 122, streak > 0 ? `🔥 ${streak}-day streak  ·  new missions every day` : 'New missions every day  ·  finish all 3 to start a streak', 15, th.textDim);
    const fix = <T extends Phaser.GameObjects.GameObject>(o: T) => this.fix(o);
    ms.forEach((m, i) => missionRow(sc, fix, th, 172 + i * 44, m));

    // achievements
    this.text(W / 2, 320, `ACHIEVEMENTS  ${progress.achievementCount()} / ${ACHIEVEMENTS.length}`, 16, th.textDim);
    const g = this.fix(sc.add.graphics());
    ACHIEVEMENTS.forEach((a, i) => {
      const y = 362 + i * 50, done = progress.hasAchievement(a.id);
      const reward = [...BALLS.map((b) => ({ n: b.name + ' ball', ach: b.ach })), ...LINES.map((l) => ({ n: l.name + ' line', ach: l.ach }))].find((r) => r.ach === a.id);
      // badge
      const c = done ? (pop ? 0xe5342b : 0xff4fd8) : (pop ? 0xd8b52c : 0x1c2440);
      g.fillStyle(c, 1).fillCircle(64, y, 16);
      if (pop) g.lineStyle(3, 0x111111, 1).strokeCircle(64, y, 16);
      this.text(64, y, done ? '★' : '·', done ? 18 : 22, done ? '#FFFFFF' : (pop ? '#5c4a00' : '#5b6a93'));
      const nameColor = done ? th.text : (pop ? '#5c4a00' : '#7d8bb0');
      this.fix(sc.add.text(94, y - 9, a.name, { fontFamily: th.font, fontSize: '18px', fontStyle: 'bold', color: nameColor }).setOrigin(0, 0.5));
      this.fix(sc.add.text(94, y + 11, a.desc + (reward ? `  ·  unlocks ${reward.n}` : ''), { fontFamily: th.font, fontSize: '13px', color: th.textDim }).setOrigin(0, 0.5));
    });

    // back
    const by = 860, bw = 260;
    const bg = this.fix(sc.add.graphics());
    if (pop) {
      bg.fillStyle(0x111111, 1).fillRoundedRect(W / 2 - bw / 2 + 5, by - 30 + 6, bw, 60, 10);
      bg.fillStyle(0xe5342b, 1).fillRoundedRect(W / 2 - bw / 2, by - 30, bw, 60, 10);
      bg.lineStyle(4, 0x111111, 1).strokeRoundedRect(W / 2 - bw / 2, by - 30, bw, 60, 10);
    } else bg.fillStyle(th.btnBg, 1).fillRoundedRect(W / 2 - bw / 2, by - 30, bw, 60, 30);
    this.text(W / 2, by, 'Back', 24, th.btnText);
    this.hit(W / 2, by, bw, 60, () => this.onBack());
  }
}
