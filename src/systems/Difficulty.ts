// Long-run difficulty curve, by distance in meters. Everything is gradual — no sudden jumps.
// Ink REGENERATION is deliberately never changed: running out of ink should come from the
// player's choices, not from the game starving them.

const lerp = (a: number, b: number, t: number) => a + (b - a) * Math.min(1, Math.max(0, t));

/** Ball target speed (px per physics step). 5 -> 9 over 0..500 m, then 9 -> 11 over 500..2000 m, then flat. */
export function targetSpeed(m: number): number {
  return m <= 500 ? lerp(5, 9, m / 500) : lerp(9, 11, (m - 500) / 1500);
}

/** How long a new ink line lives (ms). 3.0 s until 1000 m, then down to 2.5 s at 2500 m, then flat. */
export function inkLifeMs(m: number): number {
  return lerp(3000, 2500, (m - 1000) / 1500);
}

/** Distance milestones that get a "SPEED UP" banner. */
export const SPEED_MILESTONES: { m: number; text: string }[] = [
  { m: 1000, text: 'SPEED UP · ink fades a little faster' },
  { m: 2000, text: 'MAX SPEED · good luck' },
];
