import { MAP_H, MAP_W } from '../config/balance';
import { Grid, T_DIRT, T_GRASS, T_MEADOW, T_ROCK, T_TREE, T_WATER } from './grid';
import { fbm, Rng } from './rng';
import type { Grove, Point } from './types';

export interface MapData {
  grid: Grid;
  groves: Grove[];
  plaza: Point;
  lair: Point;
}

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return dist(p.x, p.y, a.x + dx * t, a.y + dy * t);
}

function carveDisc(g: Grid, cx: number, cy: number, r: number, t: number): void {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      if (x < 2 || y < 2 || x >= g.w - 2 || y >= g.h - 2) continue;
      if (dist(x, y, cx, cy) <= r) g.terrain[g.idx(x, y)] = t;
    }
}

function carveRoad(g: Grid, rng: Rng, a: Point, b: Point, width: number): void {
  const steps = Math.ceil(dist(a.x, a.y, b.x, b.y) * 2);
  const wob = rng.range(0, Math.PI * 2);
  const amp = rng.range(1.5, 4);
  const nx = -(b.y - a.y);
  const ny = b.x - a.x;
  const nl = Math.hypot(nx, ny) || 1;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const off = Math.sin(t * Math.PI * 2 + wob) * amp * Math.sin(t * Math.PI);
    const x = a.x + (b.x - a.x) * t + (nx / nl) * off;
    const y = a.y + (b.y - a.y) * t + (ny / nl) * off;
    carveDisc(g, x, y, width / 2, T_DIRT);
  }
}

function floodPassable(g: Grid, sx: number, sy: number, blocked?: Set<number>): Uint8Array {
  const seen = new Uint8Array(g.w * g.h);
  const stack = [g.idx(sx, sy)];
  seen[stack[0]] = 1;
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % g.w;
    const y = (i - x) / g.w;
    const nb = [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ];
    for (const [nx, ny] of nb) {
      if (!g.terrainPassable(nx, ny)) continue;
      const j = g.idx(nx, ny);
      if (seen[j] || blocked?.has(j)) continue;
      seen[j] = 1;
      stack.push(j);
    }
  }
  return seen;
}

export function generateMap(seed: number): MapData {
  const rng = new Rng(seed);
  const g = new Grid(MAP_W, MAP_H);
  const s = seed % 10000;

  for (let y = 0; y < g.h; y++)
    for (let x = 0; x < g.w; x++) {
      const forest = fbm(x / 9, y / 9, s + 1);
      const rock = fbm(x / 6, y / 6, s + 50);
      const water = fbm(x / 13, y / 13, s + 99);
      const flowers = fbm(x / 5, y / 5, s + 150);
      let t = T_GRASS;
      if (water > 0.69) t = T_WATER;
      else if (rock > 0.73) t = T_ROCK;
      else if (forest > 0.55) t = T_TREE;
      else if (flowers > 0.64) t = T_MEADOW;
      else if (fbm(x / 4, y / 4, s + 200) > 0.7) t = T_DIRT;
      if (x < 2 || y < 2 || x >= g.w - 2 || y >= g.h - 2) t = x === 0 || y === 0 || x === g.w - 1 || y === g.h - 1 ? T_ROCK : T_TREE;
      g.terrain[g.idx(x, y)] = t;
    }

  const plaza = { x: 48, y: 50 };
  const lair = { x: 9, y: 9 };

  // grove centres
  const centres: Point[] = [];
  for (let tries = 0; tries < 2000 && centres.length < 8; tries++) {
    const p = { x: rng.int(11, g.w - 12), y: rng.int(11, g.h - 12) };
    if (dist(p.x, p.y, plaza.x, plaza.y) < 17) continue;
    if (dist(p.x, p.y, lair.x, lair.y) < 20) continue;
    if (centres.some((c) => dist(c.x, c.y, p.x, p.y) < 20)) continue;
    // never let a clearing's tree ring cut the hunter's road out of its lair
    if (distToSegment(p, plaza, lair) < 13) continue;
    centres.push(p);
  }

  for (const c of centres) carveRoad(g, rng, plaza, c, 3);
  carveRoad(g, rng, plaza, lair, 3);
  // a ring road so the hunter has multiple approaches
  for (let i = 0; i < centres.length; i++) {
    const a = centres[i];
    let best: Point | null = null;
    let bd = 1e9;
    for (const b of centres) {
      if (b === a) continue;
      const d = dist(a.x, a.y, b.x, b.y);
      if (d < bd) {
        bd = d;
        best = b;
      }
    }
    if (best && rng.next() < 0.6) carveRoad(g, rng, a, best, 2);
  }
  carveDisc(g, plaza.x, plaza.y, 6.5, T_DIRT);
  carveDisc(g, lair.x, lair.y, 6, T_DIRT);

  const groves: Grove[] = [];
  centres.forEach((c, id) => {
    const r = rng.int(5, 6) + 0.5;
    const ringOut = r + 2.2;
    const a1 = Math.atan2(plaza.y - c.y, plaza.x - c.x);
    const a2 = a1 + rng.range(2.3, 3.9);
    const gapAngles = [a1, a2];
    const gapSector: Point[] = [];
    const gapInner: Point[] = [];
    const interior: Point[] = [];
    for (let y = Math.floor(c.y - ringOut - 1); y <= Math.ceil(c.y + ringOut + 1); y++)
      for (let x = Math.floor(c.x - ringOut - 1); x <= Math.ceil(c.x + ringOut + 1); x++) {
        if (!g.inBounds(x, y)) continue;
        const d = dist(x, y, c.x, c.y);
        const i = g.idx(x, y);
        if (d <= r) {
          g.terrain[i] = fbm(x / 3, y / 3, s + 300) > 0.6 ? T_MEADOW : T_GRASS;
          interior.push({ x, y });
        } else if (d <= ringOut) {
          const ang = Math.atan2(y - c.y, x - c.x);
          const inGap = gapAngles.some((ga) => {
            let da = Math.abs(ang - ga) % (Math.PI * 2);
            if (da > Math.PI) da = Math.PI * 2 - da;
            return da * d < 1.05;
          });
          if (inGap) {
            g.terrain[i] = T_DIRT;
            gapSector.push({ x, y });
            if (d <= r + 1.5) gapInner.push({ x, y });
          } else {
            g.terrain[i] = rng.next() < 0.1 ? T_ROCK : T_TREE;
          }
        }
      }
    // corridor out of the second gap
    const ox = c.x + Math.cos(a2) * (ringOut + 2);
    const oy = c.y + Math.sin(a2) * (ringOut + 2);
    carveRoad(g, rng, { x: c.x + Math.cos(a2) * ringOut, y: c.y + Math.sin(a2) * ringOut }, { x: ox, y: oy }, 2);
    groves.push({ id, cx: c.x, cy: c.y, r, gaps: gapInner, interior, claimedBy: -1, _sector: gapSector } as Grove & { _sector: Point[] });
  });

  // remove pockets not connected to the plaza
  const reach = floodPassable(g, plaza.x, plaza.y);
  for (let i = 0; i < g.w * g.h; i++) {
    const t = g.terrain[i];
    if ((t === T_GRASS || t === T_DIRT || t === T_MEADOW) && !reach[i]) g.terrain[i] = T_TREE;
  }

  // verify gap seals; fallback to the full gap sector if inner tiles do not seal
  for (const gr of groves as (Grove & { _sector: Point[] })[]) {
    gr.interior = gr.interior.filter((p) => g.terrainPassable(p.x, p.y));
    gr.gaps = gr.gaps.filter((p) => g.terrainPassable(p.x, p.y));
    const blocked = new Set(gr.gaps.map((p) => g.idx(p.x, p.y)));
    const f = floodPassable(g, Math.round(gr.cx), Math.round(gr.cy), blocked);
    if (f[g.idx(plaza.x, plaza.y)]) {
      gr.gaps = gr._sector.filter((p) => g.terrainPassable(p.x, p.y));
    }
    delete (gr as Partial<Grove & { _sector: Point[] }>)._sector;
  }

  const good = groves.filter((gr) => gr.interior.length >= 50 && gr.gaps.length > 0);
  good.forEach((gr, i) => (gr.id = i));
  // safety net: the lair must connect to the plaza (otherwise the hunter would be sealed in)
  const reachLair = floodPassable(g, plaza.x, plaza.y);
  if (!g.terrainPassable(lair.x, lair.y) || !reachLair[g.idx(lair.x, lair.y)]) {
    carveDisc(g, lair.x, lair.y, 6, T_DIRT);
    carveRoad(g, rng, plaza, lair, 3);
  }
  return { grid: g, groves: good, plaza, lair };
}
