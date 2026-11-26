/**
 * Animated storybook backdrop for the title and end screens: a painted sky, a moon or sun,
 * rolling ink-outlined hills dotted with round trees, and drifting fireflies / petals / leaves.
 * Pure Canvas 2D, no assets.
 */
export type SceneMode = 'night' | 'dawn' | 'ash';

interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
  phase: number;
}

interface Palette {
  sky: [string, string, string];
  glow: string;
  orb: string;
  orbAt: [number, number];
  crescent: boolean;
  stars: number;
  clouds: string;
  hills: [string, string, string];
  trees: [string, string, string];
  ink: string;
  mote: string;
  rise: boolean;
}

const PALETTES: Record<SceneMode, Palette> = {
  night: {
    sky: ['#232a5e', '#4d4f96', '#e9a990'],
    glow: 'rgba(255, 214, 160, 0.35)',
    orb: '#fff4cf',
    orbAt: [0.8, 0.17],
    crescent: true,
    stars: 70,
    clouds: '#7c83c6',
    hills: ['#6a7fb8', '#4f679f', '#3a5184'],
    trees: ['#5d77ad', '#456197', '#334b7c'],
    ink: '#1d2045',
    mote: '255, 236, 140',
    rise: true,
  },
  dawn: {
    sky: ['#86bfe6', '#ffd7a8', '#fff0cc'],
    glow: 'rgba(255, 236, 170, 0.6)',
    orb: '#ffe58a',
    orbAt: [0.5, 0.62],
    crescent: false,
    stars: 0,
    clouds: '#ffffff',
    hills: ['#b5da8e', '#8fc46c', '#6aa852'],
    trees: ['#9ccf78', '#76b35c', '#58984a'],
    ink: '#3d2817',
    mote: '255, 196, 210',
    rise: false,
  },
  ash: {
    sky: ['#34254a', '#86495c', '#e08c6c'],
    glow: 'rgba(255, 140, 110, 0.4)',
    orb: '#ff9a7a',
    orbAt: [0.76, 0.2],
    crescent: false,
    stars: 25,
    clouds: '#a8728e',
    hills: ['#7d5a7f', '#61456a', '#493354'],
    trees: ['#6e4f72', '#563f60', '#40304d'],
    ink: '#21142b',
    mote: '236, 170, 120',
    rise: false,
  },
};

/** Deterministic tiny PRNG so the scenery is stable between frames and resizes. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type C2D = CanvasRenderingContext2D;

function hillY(x: number, base: number, amp: number, seed: number): number {
  return base - amp * (0.55 * Math.sin(x * 0.004 + seed) + 0.3 * Math.sin(x * 0.011 + seed * 2.3) + 0.15 * Math.sin(x * 0.027 + seed * 5.1));
}

function inkStroke(ctx: C2D, ink: string, lw: number): void {
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = ink;
  ctx.lineWidth = lw;
  ctx.stroke();
}

/** Round storybook tree: a stubby trunk and a puffy canopy of overlapping circles. */
function roundTree(ctx: C2D, x: number, y: number, s: number, fill: string, ink: string, r: () => number): void {
  ctx.beginPath();
  ctx.moveTo(x - s * 0.08, y);
  ctx.lineTo(x - s * 0.05, y - s * 0.55);
  ctx.lineTo(x + s * 0.05, y - s * 0.55);
  ctx.lineTo(x + s * 0.08, y);
  ctx.closePath();
  ctx.fillStyle = '#8a6a5a';
  ctx.fill();
  inkStroke(ctx, ink, Math.max(1.5, s * 0.035));
  const puffs: [number, number, number][] = [];
  const n = 4 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r();
    puffs.push([x + Math.cos(a) * s * 0.24, y - s * 0.82 + Math.sin(a) * s * 0.18, s * (0.24 + r() * 0.08)]);
  }
  puffs.push([x, y - s * 0.86, s * 0.3]);
  ctx.beginPath();
  for (const [px, py, pr] of puffs) {
    ctx.moveTo(px + pr, py);
    ctx.arc(px, py, pr, 0, Math.PI * 2);
  }
  ctx.fillStyle = fill;
  ctx.fill();
  inkStroke(ctx, ink, Math.max(1.8, s * 0.04));
  ctx.fill(); // repaint the fill so only the outer silhouette keeps its ink
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.beginPath();
  ctx.arc(x - s * 0.12, y - s * 0.98, s * 0.12, 0, Math.PI * 2);
  ctx.fill();
}

/** Tall rounded pine: stacked soft tiers. */
function pineTree(ctx: C2D, x: number, y: number, s: number, fill: string, ink: string): void {
  const tiers = 3;
  const top = y - s * 1.3;
  const tierY = (i: number) => top + ((i + 1) * s * 1.15) / tiers;
  const tierW = (i: number) => s * (0.18 + i * 0.1);
  ctx.beginPath();
  ctx.moveTo(x, top);
  for (let i = 0; i < tiers; i++) {
    ctx.quadraticCurveTo(x + tierW(i) * 0.6, tierY(i) - s * 0.15, x + tierW(i), tierY(i));
    if (i < tiers - 1) ctx.lineTo(x + tierW(i) * 0.45, tierY(i) - s * 0.02);
  }
  ctx.lineTo(x + s * 0.06, tierY(tiers - 1));
  ctx.lineTo(x + s * 0.06, y);
  ctx.lineTo(x - s * 0.06, y);
  ctx.lineTo(x - s * 0.06, tierY(tiers - 1));
  for (let i = tiers - 1; i >= 0; i--) {
    ctx.lineTo(x - tierW(i), tierY(i));
    const prevY = i === 0 ? top : tierY(i - 1) - s * 0.02;
    const prevX = i === 0 ? x : x - tierW(i - 1) * 0.45;
    ctx.quadraticCurveTo(x - tierW(i) * 0.6, tierY(i) - s * 0.15, prevX, prevY);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  inkStroke(ctx, ink, Math.max(1.6, s * 0.035));
}

/** One rolling hill band with its row of trees standing on the crest. */
function drawHillRow(ctx: C2D, w: number, h: number, base: number, amp: number, size: number, hill: string, tree: string, ink: string, seed: number): void {
  const r = rng(seed);
  let x = -size * r();
  while (x < w + size) {
    const s = size * (0.7 + r() * 0.6);
    const y = hillY(x, base, amp, seed) + s * 0.08;
    if (r() < 0.35) pineTree(ctx, x, y, s, tree, ink);
    else roundTree(ctx, x, y, s, tree, ink, r);
    x += s * (0.55 + r() * 0.9);
  }
  ctx.beginPath();
  ctx.moveTo(-10, h + 10);
  for (let px = -10; px <= w + 10; px += 8) ctx.lineTo(px, hillY(px, base, amp, seed));
  ctx.lineTo(w + 10, h + 10);
  ctx.closePath();
  ctx.fillStyle = hill;
  ctx.fill();
  inkStroke(ctx, ink, 3);
  // little grass tufts below the crest
  ctx.strokeStyle = ink;
  ctx.lineWidth = 1.5;
  for (let px = 0; px < w; px += 30 + r() * 60) {
    const py = hillY(px, base, amp, seed) + 10 + r() * 30;
    ctx.beginPath();
    ctx.moveTo(px - 4, py);
    ctx.lineTo(px - 2, py - 6);
    ctx.moveTo(px, py);
    ctx.lineTo(px + 1, py - 8);
    ctx.moveTo(px + 4, py);
    ctx.lineTo(px + 5, py - 5);
    ctx.stroke();
  }
}

function cloud(ctx: C2D, x: number, y: number, s: number, fill: string, ink: string): void {
  const puffs: [number, number, number][] = [
    [x - s * 0.55, y, s * 0.3],
    [x - s * 0.15, y - s * 0.18, s * 0.4],
    [x + s * 0.3, y - s * 0.08, s * 0.34],
    [x + s * 0.65, y + s * 0.03, s * 0.25],
  ];
  ctx.beginPath();
  for (const [px, py, pr] of puffs) {
    ctx.moveTo(px + pr, py);
    ctx.arc(px, py, pr, 0, Math.PI * 2);
  }
  ctx.moveTo(x + s * 0.9, y + s * 0.1);
  ctx.ellipse(x + s * 0.05, y + s * 0.1, s * 0.85, s * 0.2, 0, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.globalAlpha = 0.45;
  inkStroke(ctx, ink, 2.5);
  ctx.globalAlpha = 1;
  ctx.fill();
}

/** Crescent moon: a disk with a bite taken out, ink drawn along both edges (inside the shape only). */
function drawCrescent(ctx: C2D, x: number, y: number, r: number, fill: string, ink: string): void {
  const lw = 2.5;
  const size = Math.ceil(r * 2 + lw * 4);
  const m = document.createElement('canvas');
  m.width = m.height = size;
  const g = m.getContext('2d')!;
  const c = size / 2;
  const bx = c + r * 0.45;
  const by = c - r * 0.25;
  const br = r * 0.85;
  g.fillStyle = fill;
  g.beginPath();
  g.arc(c, c, r, 0, Math.PI * 2);
  g.fill();
  g.globalCompositeOperation = 'destination-out';
  g.beginPath();
  g.arc(bx, by, br, 0, Math.PI * 2);
  g.fill();
  // strokes twice as wide, clipped to the crescent: the visible half is a clean outline
  g.globalCompositeOperation = 'source-atop';
  g.strokeStyle = ink;
  g.lineWidth = lw * 2;
  for (const [cx, cy, rr] of [[c, c, r], [bx, by, br]]) {
    g.beginPath();
    g.arc(cx, cy, rr, 0, Math.PI * 2);
    g.stroke();
  }
  ctx.drawImage(m, x - c, y - c);
}

function sparkle(ctx: C2D, x: number, y: number, s: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y - s);
  ctx.quadraticCurveTo(x, y, x + s, y);
  ctx.quadraticCurveTo(x, y, x, y + s);
  ctx.quadraticCurveTo(x, y, x - s, y);
  ctx.quadraticCurveTo(x, y, x, y - s);
  ctx.fill();
}

export class Backdrop {
  private ctx: CanvasRenderingContext2D;
  private layers: HTMLCanvasElement | null = null;
  private motes: Mote[] = [];
  private raf = 0;
  private last = 0;
  private t = 0;
  private pal: Palette;
  private onResize = () => this.resize();

  constructor(
    private canvas: HTMLCanvasElement,
    mode: SceneMode,
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.pal = PALETTES[mode];
    window.addEventListener('resize', this.onResize);
    this.resize();
    this.raf = requestAnimationFrame((n) => this.frame(n));
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);
  }

  private resize(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // pre-render the static scenery once per size
    const off = document.createElement('canvas');
    off.width = Math.round(w * dpr);
    off.height = Math.round(h * dpr);
    const o = off.getContext('2d')!;
    o.scale(dpr, dpr);
    this.paintStatic(o, w, h);
    this.layers = off;
    const count = Math.round((w * h) / 22000);
    this.motes = Array.from({ length: count }, () => this.spawn(w, h, true));
  }

  /** Sky, glow, moon/sun, stars, clouds, hills with trees and a soft vignette: drawn once per size. */
  private paintStatic(o: CanvasRenderingContext2D, w: number, h: number): void {
    const pal = this.pal;
    const sky = o.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, pal.sky[0]);
    sky.addColorStop(0.6, pal.sky[1]);
    sky.addColorStop(1, pal.sky[2]);
    o.fillStyle = sky;
    o.fillRect(0, 0, w, h);

    const g = o.createRadialGradient(w / 2, h * 0.85, 0, w / 2, h * 0.85, Math.max(w, h) * 0.6);
    g.addColorStop(0, pal.glow);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    o.fillStyle = g;
    o.fillRect(0, 0, w, h);

    const r = rng(99);
    o.fillStyle = 'rgba(255, 250, 220, 0.85)';
    for (let i = 0; i < pal.stars; i++) sparkle(o, r() * w, r() * h * 0.55, 1.5 + r() * 3.5);

    // moon (a crescent at night) or sun, with a halo
    const ox = w * pal.orbAt[0];
    const oy = h * pal.orbAt[1];
    const or = Math.min(w, h) * (pal.crescent ? 0.06 : 0.08);
    const og = o.createRadialGradient(ox, oy, or * 0.5, ox, oy, or * 3.5);
    og.addColorStop(0, `${pal.orb}88`);
    og.addColorStop(1, 'rgba(0,0,0,0)');
    o.fillStyle = og;
    o.fillRect(0, 0, w, h);
    if (pal.crescent) drawCrescent(o, ox, oy, or, pal.orb, pal.ink);
    else {
      o.beginPath();
      o.arc(ox, oy, or, 0, Math.PI * 2);
      o.fillStyle = pal.orb;
      o.fill();
      inkStroke(o, pal.ink, 2.5);
    }

    const cr = rng(7);
    for (let i = 0; i < 4; i++) cloud(o, cr() * w, h * (0.12 + cr() * 0.3), 60 + cr() * 70, pal.clouds, pal.ink);

    const sizes = [h * 0.12, h * 0.16, h * 0.2];
    const bases = [h * 0.74, h * 0.85, h * 0.97];
    const amps = [h * 0.05, h * 0.045, h * 0.04];
    for (let i = 0; i < 3; i++) drawHillRow(o, w, h, bases[i], amps[i], sizes[i], pal.hills[i], pal.trees[i], pal.ink, 17 + i * 31);

    // soft vignette, like the edge of an old picture book
    const v = o.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.4, w / 2, h / 2, Math.max(w, h) * 0.8);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(40,25,30,0.45)');
    o.fillStyle = v;
    o.fillRect(0, 0, w, h);
  }

  private spawn(w: number, h: number, anywhere: boolean): Mote {
    const rise = this.pal.rise;
    return {
      x: Math.random() * w,
      y: anywhere ? Math.random() * h : rise ? h + 10 : -10,
      vx: (Math.random() - 0.5) * 14,
      vy: rise ? -(8 + Math.random() * 18) : 10 + Math.random() * 22,
      r: 1.2 + Math.random() * 2,
      life: 0,
      phase: Math.random() * Math.PI * 2,
    };
  }

  private frame(now: number): void {
    const dt = Math.min(0.05, this.last ? (now - this.last) / 1000 : 0.016);
    this.last = now;
    this.t += dt;
    const { ctx, pal } = this;
    const w = window.innerWidth;
    const h = window.innerHeight;

    if (this.layers) ctx.drawImage(this.layers, 0, 0, w, h);

    // motes: fireflies drift up and blink; petals / leaves flutter down
    for (let i = 0; i < this.motes.length; i++) {
      const m = this.motes[i];
      m.life += dt;
      m.x += (m.vx + Math.sin(this.t * 1.3 + m.phase) * 14) * dt;
      m.y += m.vy * dt;
      if (m.y < -20 || m.y > h + 20 || m.x < -20 || m.x > w + 20) {
        this.motes[i] = this.spawn(w, h, false);
        continue;
      }
      const a = Math.max(0, Math.min(1, m.life * 1.5)) * (0.5 + 0.45 * Math.sin(this.t * 3 + m.phase));
      if (pal.rise) {
        ctx.fillStyle = `rgba(${pal.mote}, ${(a * 0.22).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.r * 3.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(${pal.mote}, ${a.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // a tumbling petal / leaf
        ctx.save();
        ctx.translate(m.x, m.y);
        ctx.rotate(this.t * 1.5 + m.phase);
        ctx.fillStyle = `rgba(${pal.mote}, ${Math.max(0.35, a).toFixed(3)})`;
        ctx.beginPath();
        ctx.ellipse(0, 0, m.r * 2.2, m.r * 1.1, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    this.raf = requestAnimationFrame((n) => this.frame(n));
  }
}
