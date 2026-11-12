// localStorage can throw (private mode, iframes) — never let that crash the game.
export function load(key: string, fallback: number): number {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : Number(v) || fallback;
  } catch {
    return fallback;
  }
}

export function save(key: string, value: number): void {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    /* ignore */
  }
}
