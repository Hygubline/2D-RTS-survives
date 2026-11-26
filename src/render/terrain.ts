import { TILE } from '../config/balance';
import { Grid, T_DIRT, T_MEADOW, T_ROCK, T_TREE, T_WATER } from '../sim/grid';
import { hash2 } from '../sim/rng';
import { artRng, blobPath, makeCanvas, shade, shadow, storybook, STORY_INK, type Ctx } from './draw';

export const CHUNK = 16; // tiles per chunk side

/** Storybook watercolours: fresh greens, honey paths, pastel water. */
const COL = {
  grass: '#86b35a',
  grassDark: '#6e9c48',
  grassLight: '#a6c96c',
  meadow: '#bdd27a',
  dirt: '#d9b07a',
  dirtDark: '#b88a57',
  sand: '#efdcac',
  water: '#7cbad6',
  waterDeep: '#5c9cc4',
  rock: '#a9a39a',
  moss: '#5f8c43',
};

function tileRnd(x: number, y: number, k: number): number {
  return hash2(x, y, k);
}

/** Pre-rendered terrain chunks (static ground layer). */
export class TerrainCache {
  private chunks = new Map<number, HTMLCanvasElement>();
  constructor(private grid: Grid) {}

  get(cx: number, cy: number): HTMLCanvasElement {
    const key = cy * 1000 + cx;
    let c = this.chunks.get(key);
    if (!c) {
      c = this.render(cx, cy);
      this.chunks.set(key, c);
    }
    return c;
  }

  private render(cx: number, cy: number): HTMLCanvasElement {
    const size = CHUNK * TILE;
    const [c, ctx] = makeCanvas(size, size);
    const g = this.grid;
    const ox = cx * CHUNK;
    const oy = cy * CHUNK;
    ctx.translate(-ox * TILE, -oy * TILE);
    ctx.fillStyle = COL.grass;
    ctx.fillRect(ox * TILE, oy * TILE, size, size);

    const each = (fn: (x: number, y: number, t: number) => void) => {
      for (let y = oy - 1; y <= oy + CHUNK; y++)
        for (let x = ox - 1; x <= ox + CHUNK; x++) {
          if (!g.inBounds(x, y)) continue;
          fn(x, y, g.terrain[g.idx(x, y)]);
        }
    };

    // grass mottling
    each((x, y) => {
      const r = artRng(x * 7919 + y * 104729);
      const px = x * TILE;
      const py = y * TILE;
      ctx.fillStyle = r() < 0.5 ? COL.grassDark : COL.grassLight;
      ctx.globalAlpha = 0.25;
      blobPath(ctx, px + 16 + (r() - 0.5) * 10, py + 16 + (r() - 0.5) * 10, 10 + r() * 10, r, 0.3, 8);
      ctx.fill();
      ctx.globalAlpha = 1;
    });
    // forest floor under trees
    each((x, y, t) => {
      if (t !== T_TREE) return;
      const r = artRng(x * 31 + y * 977);
      ctx.fillStyle = COL.moss;
      blobPath(ctx, x * TILE + 16, y * TILE + 16, 21, r, 0.25, 9);
      ctx.fill();
    });
    // meadow
    each((x, y, t) => {
      if (t !== T_MEADOW) return;
      const r = artRng(x * 131 + y * 7);
      ctx.fillStyle = COL.meadow;
      ctx.globalAlpha = 0.7;
      blobPath(ctx, x * TILE + 16, y * TILE + 16, 20, r, 0.3, 9);
      ctx.fill();
      ctx.globalAlpha = 1;
    });
    // shore + dirt
    each((x, y, t) => {
      if (t !== T_WATER) return;
      const r = artRng(x * 17 + y * 3131);
      ctx.fillStyle = COL.sand;
      blobPath(ctx, x * TILE + 16, y * TILE + 16, 29, r, 0.2, 9);
      ctx.fill();
    });
    each((x, y, t) => {
      if (t !== T_DIRT && t !== T_ROCK) return;
      const r = artRng(x * 53 + y * 8191);
      ctx.fillStyle = 'rgba(120,80,40,0.45)';
      blobPath(ctx, x * TILE + 16, y * TILE + 17, 23.5, r, 0.22, 9);
      ctx.fill();
    });
    each((x, y, t) => {
      if (t !== T_DIRT && t !== T_ROCK) return;
      const r = artRng(x * 53 + y * 8191);
      ctx.fillStyle = t === T_ROCK ? '#b9a88c' : COL.dirt;
      blobPath(ctx, x * TILE + 16, y * TILE + 16, 22, r, 0.22, 9);
      ctx.fill();
    });
    // inked shoreline, then the water body on top
    each((x, y, t) => {
      if (t !== T_WATER) return;
      const r = artRng(x * 19 + y * 313);
      ctx.fillStyle = STORY_INK;
      blobPath(ctx, x * TILE + 16, y * TILE + 16, 25.2, r, 0.12, 10);
      ctx.fill();
    });
    each((x, y, t) => {
      if (t !== T_WATER) return;
      const r = artRng(x * 19 + y * 313);
      ctx.fillStyle = COL.water;
      blobPath(ctx, x * TILE + 16, y * TILE + 16, 23.5, r, 0.12, 10);
      ctx.fill();
    });
    each((x, y, t) => {
      if (t !== T_WATER) return;
      // deep centre where surrounded by water
      let n = 0;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ])
        if (g.terrainAt(x + dx, y + dy) === T_WATER) n++;
      if (n === 4) {
        const r = artRng(x * 23 + y * 41);
        ctx.fillStyle = COL.waterDeep;
        ctx.globalAlpha = 0.55;
        blobPath(ctx, x * TILE + 16, y * TILE + 16, 24, r, 0.1, 10);
        ctx.globalAlpha = 1;
        ctx.fill();
      }
    });

    // detail pass (only tiles inside chunk)
    for (let y = oy; y < oy + CHUNK; y++)
      for (let x = ox; x < ox + CHUNK; x++) {
        if (!g.inBounds(x, y)) continue;
        this.detail(ctx, x, y, g.terrain[g.idx(x, y)]);
      }
    // paper grain: faint light and dark flecks like watercolour on cream paper
    const pr = artRng(cx * 7907 + cy * 31337 + 3);
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = pr() < 0.5 ? 'rgba(255,248,225,0.16)' : 'rgba(90,60,30,0.08)';
      ctx.fillRect(ox * TILE + pr() * size, oy * TILE + pr() * size, 1 + pr() * 1.5, 1 + pr());
    }
    return c;
  }

  private detail(ctx: Ctx, x: number, y: number, t: number): void {
    const r = artRng(x * 92821 + y * 68917 + 5);
    const px = x * TILE;
    const py = y * TILE;
    if (t === 0 || t === T_MEADOW) {
      // grass tufts
      const n = 3 + Math.floor(r() * 4);
      for (let i = 0; i < n; i++) {
        const gx = px + r() * TILE;
        const gy = py + r() * TILE;
        ctx.strokeStyle = r() < 0.5 ? shade(COL.grassLight, 0.15) : COL.grassDark;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let k = -1; k <= 1; k++) {
          ctx.moveTo(gx, gy);
          ctx.lineTo(gx + k * 2 + (r() - 0.5), gy - 3 - r() * 3);
        }
        ctx.stroke();
      }
      if (t === T_MEADOW || r() < 0.06) {
        const fl = t === T_MEADOW ? 3 + Math.floor(r() * 4) : 1;
        for (let i = 0; i < fl; i++) {
          const fx = px + r() * TILE;
          const fy = py + r() * TILE;
          const colors = ['#e8d27a', '#f0efe0', '#d98ab0', '#9ac2e8', '#f2a65a'];
          ctx.fillStyle = colors[Math.floor(r() * colors.length)];
          for (let p = 0; p < 4; p++) {
            ctx.beginPath();
            ctx.arc(fx + Math.cos((p * Math.PI) / 2) * 1.4, fy + Math.sin((p * Math.PI) / 2) * 1.4, 1.1, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.fillStyle = '#7a5a1a';
          ctx.fillRect(fx - 0.5, fy - 0.5, 1, 1);
        }
      }
    } else if (t === T_DIRT) {
      const n = 2 + Math.floor(r() * 4);
      for (let i = 0; i < n; i++) {
        const sx = px + r() * TILE;
        const sy = py + r() * TILE;
        const rr = 0.8 + r() * 1.8;
        ctx.fillStyle = shade(COL.dirtDark, -0.1);
        ctx.beginPath();
        ctx.ellipse(sx + 0.5, sy + 0.6, rr, rr * 0.7, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = shade(COL.dirt, 0.25);
        ctx.beginPath();
        ctx.ellipse(sx, sy, rr, rr * 0.7, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      if (r() < 0.3) {
        ctx.strokeStyle = 'rgba(120,80,40,0.45)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        const sx = px + r() * TILE;
        const sy = py + r() * TILE;
        ctx.moveTo(sx, sy);
        ctx.quadraticCurveTo(sx + 6, sy + (r() - 0.5) * 6, sx + 12, sy + (r() - 0.5) * 4);
        ctx.stroke();
      }
    } else if (t === T_WATER) {
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 1.4;
      ctx.lineCap = 'round';
      for (let i = 0; i < 2; i++) {
        const wx = px + r() * TILE;
        const wy = py + r() * TILE;
        ctx.beginPath();
        ctx.moveTo(wx - 5, wy);
        ctx.quadraticCurveTo(wx, wy - 2, wx + 5, wy);
        ctx.stroke();
      }
    } else if (t === T_ROCK) {
      drawBoulders(ctx, px + 16, py + 16, r);
    }
  }
}

export function drawBoulders(ctx: Ctx, cx: number, cy: number, r: () => number): void {
  const n = 1 + Math.floor(r() * 3);
  const list: [number, number, number][] = [];
  for (let i = 0; i < n; i++) list.push([cx + (r() - 0.5) * 14, cy + (r() - 0.5) * 12, 7 + r() * 7]);
  list.sort((a, b) => a[1] - b[1]);
  for (const [x, y, s] of list) {
    shadow(ctx, x + 3, y + s * 0.55, s * 1.2, s * 0.5, 0.45);
    // faceted boulder
    const pts: number[] = [];
    const k = 7;
    for (let i = 0; i < k; i++) {
      const a = (i / k) * Math.PI * 2 + r() * 0.3;
      const rr = s * (0.8 + r() * 0.3);
      pts.push(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.78);
    }
    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.closePath();
    const grd = ctx.createLinearGradient(x - s, y - s, x + s, y + s);
    grd.addColorStop(0, '#a7a395');
    grd.addColorStop(0.5, '#77736a');
    grd.addColorStop(1, '#4a4740');
    ctx.fillStyle = grd;
    ctx.fill();
    ctx.strokeStyle = 'rgba(25,22,18,0.85)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    // facet lines
    ctx.strokeStyle = 'rgba(30,28,24,0.4)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(x - s * 0.3, y - s * 0.5);
    ctx.lineTo(x + s * 0.1, y + s * 0.1);
    ctx.lineTo(x + s * 0.6, y - s * 0.1);
    ctx.moveTo(x + s * 0.1, y + s * 0.1);
    ctx.lineTo(x - s * 0.1, y + s * 0.6);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,240,0.25)';
    ctx.beginPath();
    ctx.ellipse(x - s * 0.35, y - s * 0.35, s * 0.3, s * 0.15, -0.5, 0, Math.PI * 2);
    ctx.fill();
    if (r() < 0.6) {
      ctx.fillStyle = 'rgba(90,120,60,0.7)';
      ctx.beginPath();
      ctx.ellipse(x + s * 0.2, y - s * 0.55, s * 0.35, s * 0.15, 0.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// ---------------- trees ----------------

const treeCache = new Map<number, HTMLCanvasElement>();
export const TREE_W = 72;
export const TREE_H = 88;

/** Tree sprite variants: 0-3 broadleaf, 4-5 pine, 6-7 ash-ember trees. */
export function treeSprite(variant: number): HTMLCanvasElement {
  let c = treeCache.get(variant);
  if (c) return c;
  const [cv, ctx] = makeCanvas(TREE_W, TREE_H);
  c = cv;
  const r = artRng(variant * 1013 + 77);
  const bx = TREE_W / 2;
  const by = TREE_H - 14; // trunk base
  shadow(ctx, bx + 8, by + 2, 26, 9, 0.45);
  // trunk
  ctx.beginPath();
  ctx.moveTo(bx - 4, by);
  ctx.quadraticCurveTo(bx - 3, by - 14, bx - 2, by - 24);
  ctx.lineTo(bx + 3, by - 24);
  ctx.quadraticCurveTo(bx + 4, by - 12, bx + 6, by);
  ctx.closePath();
  ctx.fillStyle = variant >= 6 ? '#8a5a3a' : '#9a6a40';
  ctx.fill();
  ctx.strokeStyle = STORY_INK;
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,220,180,0.15)';
  ctx.fillRect(bx - 2, by - 22, 1.5, 20);

  if (variant >= 4 && variant <= 5) {
    // pine: stacked jagged tiers
    const tiers = 4;
    for (let i = 0; i < tiers; i++) {
      const w = 26 - i * 5;
      const ty = by - 14 - i * 13;
      const tone = i / tiers;
      const pts: number[] = [];
      pts.push(bx, ty - 20);
      const teeth = 5;
      for (let k = 0; k <= teeth; k++) {
        const t = k / teeth;
        pts.push(bx + w * t, ty - 20 + 22 * t + (k % 2 ? -3 : 0));
      }
      for (let k = teeth; k >= 0; k--) {
        const t = k / teeth;
        pts.push(bx - w * t, ty - 20 + 22 * t + (k % 2 ? -3 : 0));
      }
      ctx.beginPath();
      ctx.moveTo(pts[0], pts[1]);
      for (let k = 2; k < pts.length; k += 2) ctx.lineTo(pts[k], pts[k + 1]);
      ctx.closePath();
      const grd = ctx.createLinearGradient(bx - w, ty - 20, bx + w, ty);
      grd.addColorStop(0, shade('#4f9a72', 0.1 + tone * 0.15));
      grd.addColorStop(1, shade('#367a5c', 0));
      ctx.fillStyle = grd;
      ctx.fill();
      ctx.strokeStyle = STORY_INK;
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(220,240,230,0.12)';
    ctx.beginPath();
    ctx.moveTo(bx, by - 72);
    ctx.lineTo(bx - 10, by - 30);
    ctx.lineTo(bx - 3, by - 30);
    ctx.fill();
  } else {
    const ember = variant >= 6;
    const base = ember ? '#e0943f' : ['#68a84c', '#7fb553', '#58994c', '#93bd5a'][variant % 4];
    const cy = by - 40;
    const lobes: [number, number, number][] = [];
    const n = 8 + Math.floor(r() * 4);
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2;
      const d = r() * 14;
      lobes.push([bx + Math.cos(a) * d * 1.2, cy + Math.sin(a) * d * 0.9, 10 + r() * 7]);
    }
    // dark underside silhouette
    for (const [x, y, s] of lobes) {
      blobPath(ctx, x + 1.5, y + 3, s, r, 0.2, 9);
      ctx.fillStyle = shade(base, -0.3);
      ctx.fill();
    }
    ctx.strokeStyle = STORY_INK;
    ctx.lineWidth = 1.6;
    for (const [x, y, s] of lobes) {
      blobPath(ctx, x + 1.5, y + 3, s, r, 0.2, 9);
      ctx.stroke();
    }
    for (const [x, y, s] of lobes) {
      blobPath(ctx, x + 1.5, y + 3, s - 0.8, r, 0.2, 9);
      ctx.fillStyle = shade(base, -0.3);
      ctx.fill();
    }
    // mid tone
    for (const [x, y, s] of lobes) {
      blobPath(ctx, x - 1, y, s * 0.82, r, 0.22, 9);
      ctx.fillStyle = base;
      ctx.fill();
    }
    // highlights from top-left
    for (const [x, y, s] of lobes) {
      if (y > cy + 4) continue;
      blobPath(ctx, x - s * 0.3, y - s * 0.35, s * 0.45, r, 0.3, 7);
      ctx.fillStyle = shade(base, 0.28);
      ctx.fill();
    }
    // leaf dabs
    for (let i = 0; i < 26; i++) {
      const x = bx + (r() - 0.5) * 40;
      const y = cy + (r() - 0.6) * 32;
      ctx.fillStyle = r() < 0.5 ? shade(base, 0.4) : shade(base, -0.3);
      ctx.beginPath();
      ctx.ellipse(x, y, 1.8, 1, r() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    if (ember) {
      for (let i = 0; i < 10; i++) {
        const x = bx + (r() - 0.5) * 36;
        const y = cy + (r() - 0.5) * 26;
        ctx.fillStyle = r() < 0.5 ? '#d8553a' : '#f6d06a';
        ctx.beginPath();
        ctx.ellipse(x, y, 2, 1.2, r() * 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  c = storybook(c, 1.6);
  treeCache.set(variant, c);
  return c;
}

export function treeVariant(x: number, y: number): number {
  const h = tileRnd(x, y, 9);
  if (h < 0.22) return 4 + Math.floor(tileRnd(x, y, 3) * 2);
  if (h > 0.92) return 6 + Math.floor(tileRnd(x, y, 4) * 2);
  return Math.floor(tileRnd(x, y, 5) * 4);
}

export function treeOffset(x: number, y: number): [number, number] {
  return [(tileRnd(x, y, 11) - 0.5) * 8, (tileRnd(x, y, 12) - 0.5) * 6];
}

export { T_TREE };
