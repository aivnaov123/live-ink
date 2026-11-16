// Daily missions, streak and achievements — the "come back tomorrow" + "one more run" layer.
// All state lives in localStorage; nothing needs a server.
import { hashString, mulberry32, todayKey } from './DailySeed';
import { loadJSON, saveJSON } from './Storage';

// ---------------------------------------------------------------- missions

export type MissionType = 'dist' | 'score' | 'mult' | 'stars' | 'bridges' | 'runs';

interface MissionDef { type: MissionType; targets: number[]; text: (n: number) => string; perRun: boolean }

const fmt = (n: number) => n.toLocaleString('en-US');
const MISSION_DEFS: MissionDef[] = [
  { type: 'dist', targets: [150, 300, 500], text: (n) => `Reach ${fmt(n)} m in one run`, perRun: true },
  { type: 'score', targets: [600, 1200, 2500], text: (n) => `Score ${fmt(n)} in one run`, perRun: true },
  { type: 'mult', targets: [3, 5, 7], text: (n) => `Reach a x${n} combo`, perRun: true },
  { type: 'stars', targets: [5, 10, 15], text: (n) => `Collect ${n} stars today`, perRun: false },
  { type: 'bridges', targets: [15, 30, 50], text: (n) => `Make ${n} bridges today`, perRun: false },
  { type: 'runs', targets: [3, 5, 8], text: (n) => `Play ${n} runs today`, perRun: false },
];

export interface Mission { type: MissionType; target: number; text: string; progress: number; done: boolean }

interface DailyState { date: string; progress: number[]; done: boolean[]; allDone: boolean }

/** Today's 3 missions: same for everyone (seeded by the date), easy -> medium -> hard. */
function todaysMissionDefs(date: string): { def: MissionDef; target: number }[] {
  const rng = mulberry32(hashString('missions-' + date));
  const pool = [...MISSION_DEFS];
  const out: { def: MissionDef; target: number }[] = [];
  for (let tier = 0; tier < 3; tier++) {
    const def = pool.splice(Math.floor(rng() * pool.length), 1)[0];
    out.push({ def, target: def.targets[tier] });
  }
  return out;
}

// ---------------------------------------------------------------- achievements

export interface Stats { totalStars: number; totalBridges: number; bestDist: number; bestMult: number; dailyAllDone: number; streak: number; streakDate: string }

export interface AchievementDef { id: string; name: string; desc: string; done: (s: Stats) => boolean }

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'd100', name: 'Rolling', desc: 'Reach 100 m', done: (s) => s.bestDist >= 100 },
  { id: 'd500', name: 'Long Road', desc: 'Reach 500 m', done: (s) => s.bestDist >= 500 },
  { id: 'd1000', name: 'Marathon', desc: 'Reach 1,000 m', done: (s) => s.bestDist >= 1000 },
  { id: 'd2000', name: 'Max Speed', desc: 'Reach 2,000 m', done: (s) => s.bestDist >= 2000 },
  { id: 'x8', name: 'Combo Master', desc: 'Reach a x8 combo', done: (s) => s.bestMult >= 8 },
  { id: 's50', name: 'Stargazer', desc: 'Collect 50 stars', done: (s) => s.totalStars >= 50 },
  { id: 'b100', name: 'Bridge Builder', desc: 'Make 100 bridges', done: (s) => s.totalBridges >= 100 },
  { id: 'daily', name: 'Daily Grinder', desc: 'Complete all 3 daily missions', done: (s) => s.dailyAllDone >= 1 },
  { id: 'streak3', name: 'On Fire', desc: 'Complete daily missions 3 days in a row', done: (s) => s.streak >= 3 },
];

// ---------------------------------------------------------------- progress (singleton)

const STATS_KEY = 'liveink.stats', ACH_KEY = 'liveink.ach', DAILY_KEY = 'liveink.daily';

export interface ProgressEvent { kind: 'mission' | 'achievement' | 'allMissions'; text: string; id?: string }

class Progress {
  stats: Stats = loadJSON<Stats>(STATS_KEY, { totalStars: 0, totalBridges: 0, bestDist: 0, bestMult: 1, dailyAllDone: 0, streak: 0, streakDate: '' });
  private ach = new Set<string>(loadJSON<{ ids: string[] }>(ACH_KEY, { ids: [] }).ids);
  private daily!: DailyState;
  private defs!: { def: MissionDef; target: number }[];
  // per-run values (for "in one run" missions)
  private run = { dist: 0, score: 0, mult: 1 };

  constructor() { this.ensureToday(); }

  /** Roll over to a new day's missions if the date changed. */
  private ensureToday() {
    const date = todayKey();
    if (this.daily?.date === date) return;
    this.defs = todaysMissionDefs(date);
    const saved = loadJSON<DailyState>(DAILY_KEY, { date: '', progress: [0, 0, 0], done: [false, false, false], allDone: false });
    this.daily = saved.date === date ? saved : { date, progress: [0, 0, 0], done: [false, false, false], allDone: false };
  }

  missions(): Mission[] {
    this.ensureToday();
    return this.defs.map((d, i) => ({
      type: d.def.type, target: d.target, text: d.def.text(d.target),
      progress: Math.min(d.target, this.daily.progress[i]), done: this.daily.done[i],
    }));
  }

  hasAchievement(id: string) { return this.ach.has(id); }
  achievementCount() { return this.ach.size; }

  // ---- events from the game ----
  startRun() { this.ensureToday(); this.run = { dist: 0, score: 0, mult: 1 }; }
  star() { this.stats.totalStars++; this.bump('stars', 1); }
  bridge() { this.stats.totalBridges++; this.bump('bridges', 1); }

  /** Called a few times per second during a run. Returns completions to announce. */
  live(dist: number, score: number, mult: number): ProgressEvent[] {
    this.run.dist = Math.max(this.run.dist, dist);
    this.run.score = Math.max(this.run.score, score);
    this.run.mult = Math.max(this.run.mult, mult);
    this.stats.bestDist = Math.max(this.stats.bestDist, dist);
    this.stats.bestMult = Math.max(this.stats.bestMult, mult);
    this.setMax('dist', this.run.dist);
    this.setMax('score', this.run.score);
    this.setMax('mult', this.run.mult);
    return this.collect();
  }

  /** End of a run: counts the run, saves everything. */
  endRun(): ProgressEvent[] {
    this.bump('runs', 1);
    const ev = this.collect();
    this.save();
    return ev;
  }

  // ---- internals ----
  private pending: ProgressEvent[] = [];

  private bump(type: MissionType, n: number) {
    this.defs.forEach((d, i) => { if (d.def.type === type) this.daily.progress[i] += n; });
    this.check();
  }

  private setMax(type: MissionType, v: number) {
    this.defs.forEach((d, i) => { if (d.def.type === type) this.daily.progress[i] = Math.max(this.daily.progress[i], v); });
    this.check();
  }

  private check() {
    let changed = false;
    this.defs.forEach((d, i) => {
      if (!this.daily.done[i] && this.daily.progress[i] >= d.target) {
        this.daily.done[i] = true; changed = true;
        this.pending.push({ kind: 'mission', text: d.def.text(d.target) });
      }
    });
    if (!this.daily.allDone && this.daily.done.every(Boolean)) {
      this.daily.allDone = true; changed = true;
      this.stats.dailyAllDone++;
      // streak: consecutive days with all 3 missions done
      const y = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
      this.stats.streak = this.stats.streakDate === y ? this.stats.streak + 1 : 1;
      this.stats.streakDate = this.daily.date;
      this.pending.push({ kind: 'allMissions', text: `All daily missions done! 🔥 ${this.stats.streak}-day streak` });
    }
    for (const a of ACHIEVEMENTS) {
      if (!this.ach.has(a.id) && a.done(this.stats)) {
        this.ach.add(a.id); changed = true;
        this.pending.push({ kind: 'achievement', text: a.name, id: a.id });
      }
    }
    if (changed) this.save();
  }

  private collect() { const e = this.pending; this.pending = []; return e; }

  private save() {
    saveJSON(DAILY_KEY, this.daily);
    saveJSON(STATS_KEY, this.stats);
    saveJSON(ACH_KEY, { ids: [...this.ach] });
  }

  /** Current streak, or 0 if it was broken (no completed day yesterday or today). */
  streakNow() {
    const today = todayKey(), y = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    return this.stats.streakDate === today || this.stats.streakDate === y ? this.stats.streak : 0;
  }
}

export const progress = new Progress();
