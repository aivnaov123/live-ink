import Phaser from 'phaser';
import type { Theme } from '../theme';
import { BALLS, LINES, getRecord, isUnlocked } from '../skins';
import { sfx } from '../systems/Sfx';
import { designFit } from './fit';

/** Shared building blocks for full-screen menus (start, pause): laid out in 540x960 design space. */
export abstract class MenuBase {
  protected objs: Phaser.GameObjects.GameObject[] = [];
  protected fit: ReturnType<typeof designFit>;
  private flashText?: Phaser.GameObjects.Text;

  constructor(protected scene: Phaser.Scene, protected theme: Theme) {
    this.fit = designFit(scene);
  }

  destroy() { for (const g of this.objs) g.destroy(); this.objs = []; }

  protected fix<T extends Phaser.GameObjects.GameObject>(g: T, raw = false): T {
    if (!raw) this.fit.place(g);
    (g as unknown as { setScrollFactor(n: number): void }).setScrollFactor(0);
    (g as unknown as { setDepth(n: number): void }).setDepth(40);
    this.objs.push(g);
    return g;
  }

  protected text(x: number, y: number, s: string, size: number, color: string, font = this.theme.font) {
    return this.fix(this.scene.add.text(x, y, s, { fontFamily: font, fontSize: `${size}px`, color, align: 'center' }).setOrigin(0.5));
  }

  protected hit(x: number, y: number, w: number, h: number, fn: () => void, raw = false, click = true) {
    const r = this.fix(this.scene.add.rectangle(x, y, w, h, 0, 0).setInteractive({ useHandCursor: true }), raw);
    r.on('pointerdown', (_p: unknown, _x: number, _y: number, e: Phaser.Types.Input.EventData) => e.stopPropagation());
    r.on('pointerup', () => { if (click) sfx.click(); fn(); });
  }

  protected flash(msg: string) {
    this.flashText?.setText(msg).setAlpha(1);
    this.scene.tweens.add({ targets: this.flashText, alpha: 0, delay: 1400, duration: 400 });
  }

  /** Small selectable tile; draws its content via `paint`. Locked tiles explain how to unlock. */
  private tile(cx: number, cy: number, selected: boolean, paint: (g: Phaser.GameObjects.Graphics) => void, fn: () => void, lockAt = 0) {
    const th = this.theme;
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

  /** Ball + line skin rows (labels at yBall/yLine, tiles 55px below), plus the best-score / unlock hint. */
  protected skinRows(yBall: number, yLine: number, ball: number, line: number, onBall: (i: number) => void, onLine: (i: number) => void) {
    const th = this.theme, W = 540, rec = getRecord();
    this.text(W / 2, yBall, `BALL  ·  ${BALLS[ball].name}`, 16, th.textDim);
    BALLS.forEach((b, i) => {
      const cx = W / 2 + (i - 2) * 84, cy = yBall + 55;
      this.tile(cx, cy, i === ball, (g) => {
        const c = b.color ?? th.ball;
        if (th.id === 'pop') g.fillStyle(0x111111, 1).fillCircle(cx + 2, cy + 3, 17);
        g.fillStyle(c, 1).fillCircle(cx, cy, 16);
        if (b.ring !== undefined) g.lineStyle(2, b.ring, 0.9).strokeCircle(cx, cy, 11);
        if (th.id === 'pop') g.lineStyle(3, 0x111111, 1).strokeCircle(cx, cy, 16);
        g.lineStyle(3, b.mark ?? th.ballMark, 0.85).lineBetween(cx, cy, cx + 11, cy - 11);
      }, () => onBall(i), isUnlocked(b, rec) ? 0 : b.unlock);
    });

    this.text(W / 2, yLine, `LINE  ·  ${LINES[line].name}`, 16, th.textDim);
    LINES.forEach((l, i) => {
      const cx = W / 2 + (i - 2) * 84, cy = yLine + 55;
      this.tile(cx, cy, i === line, (g) => {
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
      }, () => onLine(i), isUnlocked(l, rec) ? 0 : l.unlock);
    });
    const next = [...BALLS, ...LINES].map((s) => s.unlock).filter((u) => u > rec).sort((a, b) => a - b)[0];
    this.text(W / 2, yLine + 117, next ? `Score ${next.toLocaleString('en-US')} to unlock more` : 'Everything unlocked!', 14, th.textDim);
    this.flashText = this.text(W / 2, yLine + 140, '', 16, th.id === 'pop' ? '#E5342B' : '#FFE14D').setAlpha(0);
  }
}
