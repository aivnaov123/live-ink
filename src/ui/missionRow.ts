import type Phaser from 'phaser';
import type { Theme } from '../theme';
import type { Mission } from '../systems/Progress';

type Fix = <T extends Phaser.GameObjects.GameObject>(o: T) => T;

/** One mission line (design coords): checkbox, text, "120 / 300", thin progress bar. 440 px wide, centered on x=270. */
export function missionRow(scene: Phaser.Scene, fix: Fix, theme: Theme, y: number, m: Mission) {
  const pop = theme.id === 'pop', x0 = 50, x1 = 490;
  const accent = pop ? 0x2b59ff : 0x5ef2c8, dim = pop ? 0xd8b52c : 0x1c2440;
  const g = fix(scene.add.graphics());
  // checkbox
  if (m.done) {
    g.fillStyle(accent, 1).fillRoundedRect(x0, y - 11, 22, 22, 5);
    g.lineStyle(3, pop ? 0xffffff : 0x070a14, 1).beginPath();
    g.moveTo(x0 + 5, y); g.lineTo(x0 + 10, y + 5); g.lineTo(x0 + 17, y - 5); g.strokePath();
  } else g.lineStyle(2, pop ? 0x111111 : 0x5b6a93, 1).strokeRoundedRect(x0, y - 11, 22, 22, 5);
  // progress bar under the text
  const w = x1 - (x0 + 34), k = m.target ? m.progress / m.target : 0;
  g.fillStyle(dim, 1).fillRect(x0 + 34, y + 14, w, 4);
  g.fillStyle(accent, 1).fillRect(x0 + 34, y + 14, w * Math.min(1, k), 4);

  const txtColor = m.done ? (pop ? '#5c4a00' : '#7d8bb0') : theme.text;
  fix(scene.add.text(x0 + 34, y - 2, m.text, { fontFamily: theme.font, fontSize: '17px', color: txtColor }).setOrigin(0, 0.5));
  const right = m.done ? 'DONE' : `${m.progress.toLocaleString('en-US')} / ${m.target.toLocaleString('en-US')}`;
  fix(scene.add.text(x1, y - 2, right, {
    fontFamily: theme.font, fontSize: '15px', fontStyle: 'bold', color: m.done ? (pop ? '#2B59FF' : '#5EF2C8') : theme.textDim,
  }).setOrigin(1, 0.5));
}
