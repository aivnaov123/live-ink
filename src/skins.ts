import { load, save } from './systems/Storage';
import { progress, ACHIEVEMENTS } from './systems/Progress';

// color: null = use the current theme's default color.
// unlock: best score ever (any mode) needed to use it. 0 = free.
// ach: alternatively, an achievement id that unlocks it (reward skins).
export interface BallSkin { name: string; color: number | null; mark?: number; ring?: number; unlock: number; ach?: string }
export interface LineSkin { name: string; color: number | null | 'prism' | 'aurora'; unlock: number; ach?: string }

export const BALLS: BallSkin[] = [
  { name: 'Classic', color: null, unlock: 0 },
  { name: 'Ember', color: 0xff7a2b, unlock: 0 },
  { name: 'Lime', color: 0x7cff4d, mark: 0x10240a, unlock: 1000 },
  { name: 'Gold', color: 0xffc928, mark: 0x3a2a00, unlock: 2000 },
  { name: 'Void', color: 0x161616, mark: 0xffffff, ring: 0xffffff, unlock: 3000 },
  { name: 'Comet', color: 0x9b7bff, mark: 0xffffff, ring: 0xd9ccff, unlock: 0, ach: 'daily' },
];

export const LINES: LineSkin[] = [
  { name: 'Classic', color: null, unlock: 0 },
  { name: 'Fire', color: 0xff5a1f, unlock: 0 },
  { name: 'Toxic', color: 0x5dff3a, unlock: 1000 },
  { name: 'Gold', color: 0xffc928, unlock: 2000 },
  { name: 'Prism', color: 'prism', unlock: 3000 }, // every stroke gets a new color
  { name: 'Aurora', color: 'aurora', unlock: 0, ach: 'streak3' }, // alternates mint / violet
];

const BALL_KEY = 'liveink.ball', LINE_KEY = 'liveink.line', RECORD_KEY = 'liveink.record';

/** Best score ever, across daily + endless. Drives unlocks. */
export const getRecord = () => load(RECORD_KEY, 0);
export const setRecord = (pts: number) => { if (pts > getRecord()) save(RECORD_KEY, pts); };
export const isUnlocked = (s: { unlock: number; ach?: string }, record = getRecord()) =>
  s.ach ? progress.hasAchievement(s.ach) : record >= s.unlock;

/** Human text for how to unlock a locked skin. */
export const unlockHint = (s: { unlock: number; ach?: string }) =>
  s.ach ? `Achievement: ${ACHIEVEMENTS.find((a) => a.id === s.ach)?.name ?? s.ach}` : `Score ${s.unlock.toLocaleString('en-US')} to unlock`;

/** Skins newly unlocked when going from `before` to `after` points. */
export function newlyUnlocked(before: number, after: number): string[] {
  const out: string[] = [];
  for (const b of BALLS) if (b.unlock > before && b.unlock <= after) out.push(`${b.name} ball`);
  for (const l of LINES) if (l.unlock > before && l.unlock <= after) out.push(`${l.name} line`);
  return out;
}

const pick = <T extends { unlock: number }>(list: T[], i: number) =>
  i >= 0 && i < list.length && isUnlocked(list[i]) ? i : 0; // locked/invalid -> Classic
export const getBall = () => pick(BALLS, load(BALL_KEY, 0));
export const getLine = () => pick(LINES, load(LINE_KEY, 0));
export const setBall = (i: number) => save(BALL_KEY, i);
export const setLine = (i: number) => save(LINE_KEY, i);
