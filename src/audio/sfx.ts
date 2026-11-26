/**
 * Procedural sound effects: every sound is synthesized with Web Audio (oscillators + a shared
 * noise buffer), no asset files. Render-side only: it reads sim events, never touches the sim.
 * Each sound has a cooldown and the mixer caps live voices, so large fights stay readable.
 */
import type { GameEvent } from '../sim/types';

type Wave = OscillatorType;

interface Tone {
  wave: Wave;
  f0: number;
  f1?: number;
  dur: number;
  vol: number;
  delay?: number;
  attack?: number;
}

interface Noise {
  filter: BiquadFilterType;
  f0: number;
  f1?: number;
  q?: number;
  dur: number;
  vol: number;
  delay?: number;
}

interface Sound {
  /** minimum seconds between two plays of this sound */
  cooldown: number;
  tones?: Tone[];
  noise?: Noise[];
}

const chord = (freqs: number[], f: (freq: number, i: number) => Omit<Tone, 'f0'>): Tone[] => freqs.map((f0, i) => ({ f0, ...f(f0, i) }));

/** All sound definitions, tuned by ear. Volumes are relative to the master gain. */
const SOUNDS = {
  bolt: { cooldown: 0.06, tones: [{ wave: 'triangle', f0: 1100, f1: 420, dur: 0.07, vol: 0.18 }] },
  frost: {
    cooldown: 0.12,
    tones: [
      { wave: 'sine', f0: 1600, f1: 2400, dur: 0.16, vol: 0.12 },
      { wave: 'sine', f0: 2400, f1: 3200, dur: 0.12, vol: 0.06, delay: 0.03 },
    ],
  },
  ember: {
    cooldown: 0.15,
    tones: [{ wave: 'sawtooth', f0: 180, f1: 60, dur: 0.22, vol: 0.12 }],
    noise: [{ filter: 'lowpass', f0: 900, f1: 200, dur: 0.25, vol: 0.18 }],
  },
  stone: { cooldown: 0.15, tones: [{ wave: 'sine', f0: 120, f1: 50, dur: 0.18, vol: 0.3 }] },
  arrow: { cooldown: 0.06, noise: [{ filter: 'bandpass', f0: 3000, f1: 1500, q: 2, dur: 0.06, vol: 0.12 }] },
  hitFlesh: { cooldown: 0.05, noise: [{ filter: 'bandpass', f0: 1400, f1: 600, q: 1.5, dur: 0.06, vol: 0.22 }] },
  hitWood: {
    cooldown: 0.07,
    tones: [{ wave: 'square', f0: 160, f1: 90, dur: 0.05, vol: 0.06 }],
    noise: [{ filter: 'lowpass', f0: 700, dur: 0.08, vol: 0.25 }],
  },
  swing: { cooldown: 0.12, noise: [{ filter: 'bandpass', f0: 500, f1: 2200, q: 1.2, dur: 0.16, vol: 0.18 }] },
  swingBig: {
    cooldown: 0.2,
    noise: [{ filter: 'bandpass', f0: 300, f1: 1600, q: 1, dur: 0.28, vol: 0.32 }],
    tones: [{ wave: 'sine', f0: 90, f1: 45, dur: 0.25, vol: 0.25 }],
  },
  death: { cooldown: 0.1, tones: [{ wave: 'triangle', f0: 420, f1: 110, dur: 0.3, vol: 0.14 }] },
  wardenDown: {
    cooldown: 1,
    tones: [
      { wave: 'triangle', f0: 523, f1: 392, dur: 0.25, vol: 0.2 },
      { wave: 'triangle', f0: 392, f1: 196, dur: 0.5, vol: 0.2, delay: 0.22 },
    ],
  },
  destroyed: {
    cooldown: 0.15,
    noise: [{ filter: 'lowpass', f0: 1200, f1: 120, dur: 0.6, vol: 0.4 }],
    tones: [{ wave: 'sine', f0: 80, f1: 35, dur: 0.5, vol: 0.3 }],
  },
  built: {
    cooldown: 0.08,
    tones: [
      { wave: 'triangle', f0: 660, dur: 0.08, vol: 0.14 },
      { wave: 'triangle', f0: 990, dur: 0.12, vol: 0.12, delay: 0.07 },
    ],
  },
  trained: { cooldown: 0.1, tones: [{ wave: 'square', f0: 440, f1: 660, dur: 0.1, vol: 0.06 }] },
  income: {
    cooldown: 0.6,
    tones: [
      { wave: 'sine', f0: 1320, dur: 0.18, vol: 0.05 },
      { wave: 'sine', f0: 1760, dur: 0.22, vol: 0.04, delay: 0.05 },
    ],
  },
  levelup: { cooldown: 0.3, tones: chord([523, 659, 784, 1047], (_, i) => ({ wave: 'triangle', dur: 0.16, vol: 0.13, delay: i * 0.07 })) },
  alert: {
    cooldown: 4,
    tones: [
      { wave: 'square', f0: 440, dur: 0.16, vol: 0.08 },
      { wave: 'square', f0: 330, dur: 0.22, vol: 0.08, delay: 0.18 },
    ],
  },
  roar: {
    cooldown: 0.5,
    tones: [{ wave: 'sawtooth', f0: 110, f1: 55, dur: 0.7, vol: 0.16, attack: 0.08 }],
    noise: [{ filter: 'lowpass', f0: 600, f1: 200, dur: 0.7, vol: 0.22 }],
  },
  evolve: {
    cooldown: 2,
    tones: [
      { wave: 'sawtooth', f0: 70, f1: 140, dur: 1.2, vol: 0.2, attack: 0.3 },
      { wave: 'sawtooth', f0: 104, f1: 52, dur: 1.4, vol: 0.14, delay: 0.5 },
    ],
    noise: [{ filter: 'lowpass', f0: 300, f1: 1200, dur: 1.4, vol: 0.2 }],
  },
  bannerGood: { cooldown: 1, tones: chord([523, 659, 784], () => ({ wave: 'triangle', dur: 0.9, vol: 0.08, attack: 0.04 })) },
  bannerBad: { cooldown: 1, tones: chord([220, 262, 330], (f, i) => ({ wave: 'triangle', f1: f * 0.94, dur: 1.0, vol: 0.09, delay: i * 0.05 })) },
  bannerEpic: {
    cooldown: 1,
    tones: [
      { wave: 'sine', f0: 65, dur: 2.2, vol: 0.3, attack: 0.02 },
      { wave: 'triangle', f0: 131, dur: 1.8, vol: 0.1 },
      { wave: 'triangle', f0: 196, dur: 1.6, vol: 0.06, delay: 0.1 },
    ],
  },
  win: { cooldown: 2, tones: chord([392, 523, 659, 784, 1047], (_, i) => ({ wave: 'triangle', dur: 1.4 - i * 0.12, vol: 0.1, delay: i * 0.12, attack: 0.02 })) },
  lose: {
    cooldown: 2,
    tones: [
      { wave: 'sine', f0: 98, f1: 82, dur: 2.4, vol: 0.3 },
      { wave: 'triangle', f0: 233, f1: 196, dur: 2, vol: 0.08, delay: 0.1 },
    ],
  },
  click: { cooldown: 0.04, tones: [{ wave: 'sine', f0: 880, f1: 660, dur: 0.04, vol: 0.06 }] },
} satisfies Record<string, Sound>;

export type SoundName = keyof typeof SOUNDS;

const MASTER_VOL = 0.55;
const MAX_VOICES = 28;
const MUTE_KEY = 'ashwood.muted';

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export interface Placement {
  /** -1 (left) .. 1 (right) */
  pan: number;
  /** 0..1 loudness factor */
  gain: number;
}

const CENTER: Placement = { pan: 0, gain: 1 };

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private lastPlayed = new Map<SoundName, number>();
  private voices = 0;
  /** sounds actually started (read by the playtest) */
  played = 0;
  muted = readMuted();

  /** Create (or resume) the AudioContext; must run inside a user gesture (autoplay rules). */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    if (typeof AudioContext === 'undefined') return;
    try {
      this.ctx = new AudioContext();
    } catch {
      return;
    }
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : MASTER_VOL;
    const comp = this.ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(this.ctx.destination);
    const len = Math.floor(this.ctx.sampleRate * 1.5);
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  /** audio engine state, for diagnostics */
  state(): AudioContextState | 'none' {
    return this.ctx ? this.ctx.state : 'none';
  }

  setMuted(m: boolean): void {
    this.muted = m;
    try {
      localStorage.setItem(MUTE_KEY, m ? '1' : '0');
    } catch {
      /* storage unavailable: the choice just won't persist */
    }
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : MASTER_VOL, this.ctx.currentTime, 0.02);
  }

  play(name: SoundName, at: Placement = CENTER): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.muted || ctx.state !== 'running') return;
    const def: Sound = SOUNDS[name];
    const now = ctx.currentTime;
    if (now - (this.lastPlayed.get(name) ?? -99) < def.cooldown || this.voices >= MAX_VOICES) return;
    this.lastPlayed.set(name, now);
    const out = ctx.createStereoPanner();
    out.pan.value = Math.max(-1, Math.min(1, at.pan));
    const g = ctx.createGain();
    g.gain.value = Math.max(0, Math.min(1, at.gain));
    g.connect(out).connect(this.master);
    let end = now;
    for (const t of def.tones ?? []) end = Math.max(end, this.tone(ctx, g, now, t));
    for (const n of def.noise ?? []) end = Math.max(end, this.noise(ctx, g, now, n));
    this.voices++;
    this.played++;
    window.setTimeout(
      () => {
        this.voices--;
        out.disconnect();
      },
      (end - now) * 1000 + 60,
    );
  }

  private envelope(ctx: AudioContext, start: number, dur: number, vol: number, attack = 0.005): GainNode {
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, start);
    env.gain.exponentialRampToValueAtTime(vol, start + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    return env;
  }

  private tone(ctx: AudioContext, dest: AudioNode, now: number, t: Tone): number {
    const start = now + (t.delay ?? 0);
    const end = start + t.dur;
    const osc = ctx.createOscillator();
    osc.type = t.wave;
    osc.frequency.setValueAtTime(t.f0, start);
    if (t.f1) osc.frequency.exponentialRampToValueAtTime(t.f1, end);
    osc.connect(this.envelope(ctx, start, t.dur, t.vol, t.attack)).connect(dest);
    osc.start(start);
    osc.stop(end + 0.02);
    return end;
  }

  private noise(ctx: AudioContext, dest: AudioNode, now: number, n: Noise): number {
    const start = now + (n.delay ?? 0);
    const end = start + n.dur;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = n.filter;
    f.Q.value = n.q ?? 0.8;
    f.frequency.setValueAtTime(n.f0, start);
    if (n.f1) f.frequency.exponentialRampToValueAtTime(n.f1, end);
    src.connect(f).connect(this.envelope(ctx, start, n.dur, n.vol)).connect(dest);
    src.start(start, Math.random());
    src.stop(end + 0.02);
    return end;
  }
}

/** What the event mapper needs from the game, kept small so it is easy to test. */
export interface SoundView {
  me: number;
  /** stereo placement for a world point, or null when the player can't see / isn't looking there */
  place(x: number, y: number): Placement | null;
}

export interface SoundCue {
  name: SoundName;
  at?: Placement;
}

/** Pure mapping from a sim event to the sound it should make, if any. */
export function soundFor(e: GameEvent, v: SoundView): SoundCue | null {
  const near = (x: number, y: number, name: SoundName): SoundCue | null => {
    const at = v.place(x, y);
    return at ? { name, at } : null;
  };
  switch (e.e) {
    case 'shoot':
      return near(e.x, e.y, e.ptype);
    case 'hit':
      return e.source === 'burn' ? null : near(e.x, e.y, e.onBuilding ? 'hitWood' : 'hitFlesh');
    case 'swing':
      return near(e.x, e.y, e.big ? 'swingBig' : 'swing');
    case 'death':
      return e.utype === 'survivor' && e.owner === v.me ? { name: 'wardenDown' } : near(e.x, e.y, 'death');
    case 'destroyed':
      // losing your own building is always audible, even off-screen
      return e.owner === v.me ? { name: 'destroyed', at: v.place(e.x, e.y) ?? { pan: 0, gain: 0.5 } } : near(e.x, e.y, 'destroyed');
    case 'built':
      return e.owner === v.me ? near(e.x, e.y, 'built') : null;
    case 'trained':
      return e.owner === v.me ? near(e.x, e.y, 'trained') : null;
    case 'income':
      return e.owner === v.me ? near(e.x, e.y, 'income') : null;
    case 'levelup':
      return near(e.x, e.y, 'levelup');
    case 'alert':
      return e.player === v.me ? { name: 'alert' } : null;
    case 'skill':
      return near(e.x, e.y, 'roar');
    case 'evolve':
      return { name: 'evolve' };
    case 'banner':
      return { name: e.tone === 'good' ? 'bannerGood' : e.tone === 'bad' ? 'bannerBad' : 'bannerEpic' };
    case 'gameover':
      return { name: e.winner === 'survivor' ? 'win' : 'lose' };
    default:
      return null;
  }
}
