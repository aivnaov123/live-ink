// Points = distance × multiplier. Bridges (gaps crossed on your own ink) build the multiplier.
export const MAX_MULT = 8;
export const COMBO_WINDOW_MS = 5000; // no new bridge for this long -> multiplier drops by 1

export class ScoreSystem {
  points = 0;
  mult = 1;
  bridges = 0;
  maxMult = 1;
  stars = 0;
  private lastBridge = 0;

  addDistance(meters: number) { this.points += meters * this.mult; }
  addBonus(base: number): number { const v = base * this.mult; this.points += v; return v; }

  bridge(time: number) {
    this.bridges++;
    this.mult = Math.min(MAX_MULT, this.mult + 1);
    this.maxMult = Math.max(this.maxMult, this.mult);
    this.lastBridge = time;
  }

  /** Returns true when the multiplier just decayed. */
  update(time: number): boolean {
    if (this.mult > 1 && time - this.lastBridge > COMBO_WINDOW_MS) {
      this.mult--;
      this.lastBridge = time;
      return true;
    }
    return false;
  }

  /** 1 -> 0 as the combo window runs out (for the HUD timer bar). */
  windowLeft(time: number) {
    return this.mult > 1 ? Math.max(0, 1 - (time - this.lastBridge) / COMBO_WINDOW_MS) : 0;
  }

  get total() { return Math.floor(this.points); }
}
