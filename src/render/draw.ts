/** Shared procedural drawing helpers for the hand-painted look. */

export type Ctx = CanvasRenderingContext2D;

export function makeCanvas(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  const ctx = c.getContext('2d')!;
  return [c, ctx];
}

/** Small deterministic PRNG for art (independent of sim RNG). */
export function artRng(seed: number): () => number {
  let s = seed >>> 0 || 7;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function shade(hex: string, amt: number): string {
  const [r, g, b] = hexToRgb(hex);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt))));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

export function rgba(hex: string, a: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

/** Irregular blob path (hand-drawn circle). */
export function blobPath(ctx: Ctx, cx: number, cy: number, r: number, rnd: () => number, wobble = 0.18, pts = 10, sy = 1): void {
  ctx.beginPath();
  const offs: number[] = [];
  for (let i = 0; i < pts; i++) offs.push(1 + (rnd() * 2 - 1) * wobble);
  for (let i = 0; i <= pts; i++) {
    const a0 = ((i - 1) / pts) * Math.PI * 2;
    const a1 = (i / pts) * Math.PI * 2;
    const r0 = r * offs[(i - 1 + pts) % pts];
    const r1 = r * offs[i % pts];
    const x1 = cx + Math.cos(a1) * r1;
    const y1 = cy + Math.sin(a1) * r1 * sy;
    if (i === 0) ctx.moveTo(x1, y1);
    else {
      const am = (a0 + a1) / 2;
      const rm = ((r0 + r1) / 2) * 1.04;
      ctx.quadraticCurveTo(cx + Math.cos(am) * rm, cy + Math.sin(am) * rm * sy, x1, y1);
    }
  }
  ctx.closePath();
}

export function ellipse(ctx: Ctx, x: number, y: number, rx: number, ry: number, color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

export function shadow(ctx: Ctx, x: number, y: number, rx: number, ry: number, a = 0.32): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, rx);
  g.addColorStop(0, `rgba(60,45,30,${a * 0.8})`);
  g.addColorStop(1, 'rgba(60,45,30,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

const glowCache = new Map<string, HTMLCanvasElement>();
const GLOW_RES = 64;

/** Pre-rendered radial glow per colour; drawing a cached sprite is far cheaper than a fresh gradient each frame. */
function glowSprite(color: string): HTMLCanvasElement {
  let c = glowCache.get(color);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = GLOW_RES;
  const g = c.getContext('2d')!;
  const h = GLOW_RES / 2;
  const grd = g.createRadialGradient(h, h, 0, h, h, h);
  grd.addColorStop(0, rgba(color, 1));
  grd.addColorStop(0.5, rgba(color, 0.42));
  grd.addColorStop(1, rgba(color, 0));
  g.fillStyle = grd;
  g.fillRect(0, 0, GLOW_RES, GLOW_RES);
  glowCache.set(color, c);
  return c;
}

export function glow(ctx: Ctx, x: number, y: number, r: number, color: string, a = 0.6): void {
  if (r <= 0 || a <= 0) return;
  const prev = ctx.globalAlpha;
  ctx.globalAlpha = prev * Math.min(1, a);
  ctx.drawImage(glowSprite(color), x - r, y - r, r * 2, r * 2);
  ctx.globalAlpha = prev;
}

export function poly(ctx: Ctx, pts: number[], fill?: string, stroke?: string, lw = 1): void {
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    ctx.stroke();
  }
}

/** Ink outline + fill for the cel-painted look. */
export function inked(ctx: Ctx, fill: string, ink = 'rgba(61,40,23,0.9)', lw = 1.5): void {
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = ink;
  ctx.lineWidth = lw;
  ctx.stroke();
}

/** Stone-textured rounded rectangle. */
export function stoneBlock(ctx: Ctx, x: number, y: number, w: number, h: number, base: string, rnd: () => number, rows = 2): void {
  ctx.save();
  roundRect(ctx, x, y, w, h, 3);
  ctx.fillStyle = base;
  ctx.fill();
  ctx.clip();
  const rh = h / rows;
  for (let r = 0; r < rows; r++) {
    let cx = x - rnd() * 8;
    while (cx < x + w) {
      const bw = 7 + rnd() * 9;
      ctx.fillStyle = shade(base, (rnd() - 0.5) * 0.25);
      roundRect(ctx, cx + 0.8, y + r * rh + 0.8, bw - 1.6, rh - 1.6, 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.fillRect(cx + 1.5, y + r * rh + 1.2, bw - 3, 1.2);
      cx += bw;
    }
  }
  ctx.restore();
  roundRect(ctx, x, y, w, h, 3);
  ctx.strokeStyle = 'rgba(61,40,23,0.85)';
  ctx.lineWidth = 1.4;
  ctx.stroke();
}

export function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Wood plank fill with grain lines. */
export function planks(ctx: Ctx, x: number, y: number, w: number, h: number, base: string, rnd: () => number, vertical = false): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = base;
  ctx.fillRect(x, y, w, h);
  const n = Math.max(2, Math.round((vertical ? w : h) / 5));
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = shade(base, (rnd() - 0.5) * 0.22);
    if (vertical) ctx.fillRect(x + (i * w) / n, y, w / n - 0.8, h);
    else ctx.fillRect(x, y + (i * h) / n, w, h / n - 0.8);
  }
  ctx.strokeStyle = 'rgba(30,18,8,0.35)';
  ctx.lineWidth = 0.6;
  for (let i = 0; i < n * 2; i++) {
    ctx.beginPath();
    if (vertical) {
      const gx = x + rnd() * w;
      ctx.moveTo(gx, y + rnd() * h * 0.3);
      ctx.lineTo(gx + (rnd() - 0.5) * 1.5, y + h * (0.6 + rnd() * 0.4));
    } else {
      const gy = y + rnd() * h;
      ctx.moveTo(x + rnd() * w * 0.3, gy);
      ctx.lineTo(x + w * (0.6 + rnd() * 0.4), gy + (rnd() - 0.5) * 1.5);
    }
    ctx.stroke();
  }
  ctx.restore();
}

/** Warm sepia-brown ink used by the storybook look. */
export const STORY_INK = '#3d2817';

/**
 * Storybook finish for a cached sprite: a thick warm-brown "sticker" outline around the whole
 * silhouette, then the art itself, gently warmed and lifted like watercolour on cream paper.
 * Returns a new canvas of the same size (sprites keep their padding, so the outline fits).
 */
export function storybook(src: HTMLCanvasElement, outline = 2): HTMLCanvasElement {
  const [out, ctx] = makeCanvas(src.width, src.height);
  // silhouette of the solid parts only (soft shadows and glows stay un-outlined)
  const [sil, sctx] = makeCanvas(src.width, src.height);
  const sctxSrc = src.getContext('2d')!;
  const img = sctxSrc.getImageData(0, 0, src.width, src.height);
  const d = img.data;
  const [ir, ig, ib] = hexToRgb(STORY_INK);
  for (let k = 0; k < d.length; k += 4) {
    const solid = d[k + 3] > 170;
    d[k] = ir;
    d[k + 1] = ig;
    d[k + 2] = ib;
    d[k + 3] = solid ? 255 : 0;
  }
  sctx.putImageData(img, 0, 0);
  const steps = 12;
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    ctx.drawImage(sil, Math.cos(a) * outline, Math.sin(a) * outline);
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.filter = 'saturate(1.12) brightness(1.1) sepia(0.12)';
  ctx.drawImage(src, 0, 0);
  ctx.filter = 'none';
  return out;
}
