import { TILE } from '../config/balance';
import type { Grid } from './grid';
import type { Faction, Point } from './types';

/** Cost to enter a tile. Infinity = blocked. 1 = normal ground. */
export type CostFn = (tx: number, ty: number) => number;

export interface TileRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface PathResult {
  tiles: Point[];
  reached: boolean;
  cost: number;
}

const SQRT2 = Math.SQRT2;

class Heap {
  items: number[] = [];
  constructor(private f: Float64Array) {}
  push(i: number): void {
    const a = this.items;
    a.push(i);
    let c = a.length - 1;
    while (c > 0) {
      const p = (c - 1) >> 1;
      if (this.f[a[p]] <= this.f[a[c]]) break;
      [a[p], a[c]] = [a[c], a[p]];
      c = p;
    }
  }
  pop(): number {
    const a = this.items;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let p = 0;
      for (;;) {
        const l = p * 2 + 1;
        const r = l + 1;
        let m = p;
        if (l < a.length && this.f[a[l]] < this.f[a[m]]) m = l;
        if (r < a.length && this.f[a[r]] < this.f[a[m]]) m = r;
        if (m === p) break;
        [a[p], a[m]] = [a[m], a[p]];
        p = m;
      }
    }
    return top;
  }
  get size(): number {
    return this.items.length;
  }
}

let bufSize = 0;
let gScore: Float64Array;
let fScore: Float64Array;
let parent: Int32Array;
let stamp: Uint32Array;
let closed: Uint32Array;
let gen = 0;

function ensure(n: number): void {
  if (bufSize >= n) return;
  bufSize = n;
  gScore = new Float64Array(n);
  fScore = new Float64Array(n);
  parent = new Int32Array(n);
  stamp = new Uint32Array(n);
  closed = new Uint32Array(n);
}

function rectH(x: number, y: number, r: TileRect): number {
  const dx = x < r.x0 ? r.x0 - x : x > r.x1 ? x - r.x1 : 0;
  const dy = y < r.y0 ? r.y0 - y : y > r.y1 ? y - r.y1 : 0;
  return dx > dy ? dx + (SQRT2 - 1) * dy : dy + (SQRT2 - 1) * dx;
}

/**
 * Grid A*: 8 directions, octile heuristic, no corner cutting, node cap.
 * If the goal is unreachable, returns the path to the closest explored node (reached=false).
 */
export function findPath(grid: Grid, sx: number, sy: number, goal: TileRect, cost: CostFn, maxNodes = 14000): PathResult {
  const n = grid.w * grid.h;
  ensure(n);
  gen++;
  if (gen === 0xffffffff) {
    stamp.fill(0);
    closed.fill(0);
    gen = 1;
  }
  const w = grid.w;
  const start = sy * w + sx;
  const heap = new Heap(fScore);
  stamp[start] = gen;
  gScore[start] = 0;
  fScore[start] = rectH(sx, sy, goal);
  parent[start] = -1;
  heap.push(start);
  let best = start;
  let bestH = fScore[start];
  let expanded = 0;
  let found = -1;

  while (heap.size) {
    const cur = heap.pop();
    if (closed[cur] === gen) continue;
    closed[cur] = gen;
    const cx = cur % w;
    const cy = (cur - cx) / w;
    if (cx >= goal.x0 && cx <= goal.x1 && cy >= goal.y0 && cy <= goal.y1) {
      found = cur;
      break;
    }
    const h = rectH(cx, cy, goal);
    if (h < bestH) {
      bestH = h;
      best = cur;
    }
    if (++expanded > maxNodes) break;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= grid.h) continue;
        const c = cost(nx, ny);
        if (c === Infinity) continue;
        let step = c;
        if (dx && dy) {
          // no corner cutting past any obstacle (walls included, even when siege-passable)
          if (cost(cx + dx, cy) > 1.5 || cost(cx, cy + dy) > 1.5) continue;
          step = c * SQRT2;
        }
        const ni = ny * w + nx;
        if (closed[ni] === gen) continue;
        const ng = gScore[cur] + step;
        if (stamp[ni] !== gen || ng < gScore[ni]) {
          stamp[ni] = gen;
          gScore[ni] = ng;
          parent[ni] = cur;
          fScore[ni] = ng + rectH(nx, ny, goal);
          heap.push(ni);
        }
      }
  }
  const end = found >= 0 ? found : best;
  const tiles: Point[] = [];
  for (let i = end; i !== -1; i = parent[i]) tiles.push({ x: i % w, y: Math.floor(i / w) });
  tiles.reverse();
  return { tiles, reached: found >= 0, cost: gScore[end] };
}

export function passCost(grid: Grid, faction: Faction): CostFn {
  return (x, y) => (grid.passable(x, y, faction) ? 1 : Infinity);
}

/** Can a circle of radius r travel the straight segment a->b without touching blocked tiles? */
export function walkableLine(grid: Grid, ax: number, ay: number, bx: number, by: number, r: number, faction: Faction): boolean {
  const d = Math.hypot(bx - ax, by - ay);
  const steps = Math.max(1, Math.ceil(d / 6));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = ax + (bx - ax) * t;
    const y = ay + (by - ay) * t;
    for (const [ox, oy] of [
      [-r, -r],
      [r, -r],
      [-r, r],
      [r, r],
    ]) {
      if (!grid.passable(Math.floor((x + ox) / TILE), Math.floor((y + oy) / TILE), faction)) return false;
    }
  }
  return true;
}

/** Convert tile path to world waypoints with string-pulling. */
export function smoothPath(grid: Grid, from: Point, tiles: Point[], r: number, faction: Faction): Point[] {
  const pts = tiles.map((t) => ({ x: t.x * TILE + TILE / 2, y: t.y * TILE + TILE / 2 }));
  if (pts.length <= 1) return pts;
  const out: Point[] = [];
  let anchor = from;
  let i = 0;
  while (i < pts.length) {
    let j = pts.length - 1;
    while (j > i && !walkableLine(grid, anchor.x, anchor.y, pts[j].x, pts[j].y, r, faction)) j--;
    out.push(pts[j]);
    anchor = pts[j];
    i = j + 1;
  }
  return out;
}

/** Nearest tile passable for faction (spiral search). */
export function nearestPassable(grid: Grid, tx: number, ty: number, faction: Faction, maxR = 12): Point | null {
  if (grid.passable(tx, ty, faction)) return { x: tx, y: ty };
  for (let r = 1; r <= maxR; r++) {
    let best: Point | null = null;
    let bd = 1e9;
    for (let y = ty - r; y <= ty + r; y++)
      for (let x = tx - r; x <= tx + r; x++) {
        if (Math.max(Math.abs(x - tx), Math.abs(y - ty)) !== r) continue;
        if (!grid.passable(x, y, faction)) continue;
        const d = (x - tx) ** 2 + (y - ty) ** 2;
        if (d < bd) {
          bd = d;
          best = { x, y };
        }
      }
    if (best) return best;
  }
  return null;
}
