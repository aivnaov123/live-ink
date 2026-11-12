// Deterministic RNG so the daily level is identical for every player, no server needed.

export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** UTC date key, e.g. "2026-11-12" — same for everyone on Earth at the same moment. */
export function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Daily #1 = 2026-11-12 (launch day of the prototype). */
export function dailyNumber(): number {
  const start = Date.UTC(2026, 10, 12);
  return Math.floor((Date.now() - start) / 86_400_000) + 1;
}

export function dailySeed(): number {
  return hashString('live-ink-' + todayKey());
}
