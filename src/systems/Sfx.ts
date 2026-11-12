// Procedural sound effects (Web Audio). No audio files: tiny build, no licensing, instant load.
// Neon = soft sine/triangle synth; Pop = square-wave chiptune.
import { load, save } from './Storage';

type Wave = OscillatorType;
const MUTE_KEY = 'liveink.muted';
// pentatonic steps (semitones) so rising combos always sound musical
const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19];

class Sfx {
  private ctx?: AudioContext;
  private master?: GainNode;
  private drawGain?: GainNode;
  private drawFilter?: BiquadFilterNode;
  private wave: Wave = 'triangle';
  private pop = false;
  muted = load(MUTE_KEY, 0) === 1;
  private held = false; // deliberately suspended (pause menu / hidden tab / ads)

  setTheme(id: 'neon' | 'pop') {
    this.pop = id === 'pop';
    this.wave = this.pop ? 'square' : 'triangle';
    if (this.drawFilter) this.drawFilter.frequency.value = this.pop ? 1100 : 2400;
  }

  /** Must be called from a user gesture (first tap/click) — browsers block audio before that. */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
      this.buildDrawLoop();
    }
    if (this.ctx.state === 'suspended' && !this.held) this.ctx.resume().catch(() => {});
  }

  setMuted(m: boolean) {
    this.muted = m;
    save(MUTE_KEY, m ? 1 : 0);
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.02);
  }

  /** Pause menu / tab hidden / (later) ads: silence everything. */
  suspend() { this.held = true; this.drawLevel(0); this.ctx?.suspend().catch(() => {}); }
  resume() { this.held = false; if (this.ctx?.state === 'suspended') this.ctx.resume().catch(() => {}); }

  // ---------------------------------------------------------------- continuous drawing "scratch"

  private buildDrawLoop() {
    const ctx = this.ctx!, len = ctx.sampleRate;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    this.drawFilter = ctx.createBiquadFilter();
    this.drawFilter.type = 'bandpass';
    this.drawFilter.frequency.value = this.pop ? 1100 : 2400;
    this.drawFilter.Q.value = 1.2;
    this.drawGain = ctx.createGain();
    this.drawGain.gain.value = 0;
    src.connect(this.drawFilter).connect(this.drawGain).connect(this.master!);
    src.start();
  }

  /** 0..1 — how fast the player is drawing right now (0 = silent). */
  drawLevel(v: number) {
    if (!this.ctx || !this.drawGain) return;
    this.drawGain.gain.setTargetAtTime(Math.min(1, v) * 0.13, this.ctx.currentTime, 0.04);
  }

  // ---------------------------------------------------------------- one-shots

  private tone(freq: number, dur: number, opts: { wave?: Wave; vol?: number; to?: number; delay?: number; attack?: number } = {}) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime + (opts.delay ?? 0);
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = opts.wave ?? this.wave;
    o.frequency.setValueAtTime(freq, t);
    if (opts.to) o.frequency.exponentialRampToValueAtTime(opts.to, t + dur);
    const vol = (opts.vol ?? 0.3) * (o.type === 'square' ? 0.45 : 1); // squares are loud
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + (opts.attack ?? 0.008));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master!);
    o.start(t); o.stop(t + dur + 0.02);
  }

  private noise(dur: number, vol: number, freq: number, delay = 0) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = buf; f.type = 'lowpass'; f.frequency.value = freq; g.gain.value = vol;
    src.connect(f).connect(g).connect(this.master!);
    src.start(t);
  }

  private note(step: number, base = 523.25) { return base * Math.pow(2, step / 12); }

  /** Gap crossed on your ink — pitch climbs with the multiplier. */
  bridge(mult: number) {
    const s = SCALE[Math.min(SCALE.length - 1, mult - 1)];
    this.tone(this.note(s), 0.22, { vol: 0.32 });
    this.tone(this.note(s + 12), 0.16, { vol: 0.12, delay: 0.04, wave: 'sine' });
    if (mult >= 5) this.tone(this.note(s + 7), 0.2, { vol: 0.14, delay: 0.08 });
  }

  star() {
    this.tone(this.note(16, 1046.5), 0.09, { vol: 0.22, wave: this.pop ? 'square' : 'sine' });
    this.tone(this.note(23, 1046.5), 0.16, { vol: 0.2, delay: 0.07, wave: this.pop ? 'square' : 'sine' });
  }

  /** Landing after a jump. */
  land(strength: number) {
    this.tone(140, 0.12, { wave: 'sine', vol: 0.25 * strength, to: 55 });
    this.noise(0.06, 0.12 * strength, 900);
  }

  air() { this.tone(this.note(7), 0.12, { vol: 0.15, to: this.note(14) }); }

  comboDrop() { this.tone(330, 0.15, { vol: 0.12, to: 220 }); }

  die(cause: 'fall' | 'spikes') {
    if (cause === 'spikes') { this.noise(0.25, 0.35, 3000); this.tone(220, 0.3, { vol: 0.2, to: 90, wave: 'sawtooth' }); }
    else this.tone(440, 0.6, { vol: 0.22, to: 70, wave: this.pop ? 'square' : 'triangle' });
  }

  jingle() { [0, 4, 7, 12].forEach((s, i) => this.tone(this.note(s), 0.18, { vol: 0.22, delay: i * 0.07 })); }

  click() { this.tone(1200, 0.035, { vol: 0.1, wave: 'square' }); }
}

/** One shared instance for the whole game (survives scene restarts). */
export const sfx = new Sfx();
