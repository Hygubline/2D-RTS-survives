import { BUILDINGS, HUNTER, TILE } from '../config/balance';
import { tileOf } from './grid';
import { factionOf, type Entity, type World } from './types';
import { buildingCenter, hunterState, hunterUnits } from './world';
import type { Unit } from './types';

const discCache = new Map<number, Int16Array>();
function disc(r: number): Int16Array {
  const key = Math.round(r * 2);
  let d = discCache.get(key);
  if (d) return d;
  const pts: number[] = [];
  const R = Math.ceil(r);
  for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) if (x * x + y * y <= r * r) pts.push(x, y);
  d = new Int16Array(pts);
  discCache.set(key, d);
  return d;
}

function stamp(world: World, tx: number, ty: number, r: number): void {
  const g = world.grid;
  const d = disc(r);
  for (let i = 0; i < d.length; i += 2) {
    const x = tx + d[i];
    const y = ty + d[i + 1];
    if (x < 0 || y < 0 || x >= g.w || y >= g.h) continue;
    world.vision[y * g.w + x] = 2;
  }
}

/** Recompute survivor-team fog of war. 0 = unexplored, 1 = explored, 2 = visible. */
export function updateVision(world: World): void {
  const v = world.vision;
  for (let i = 0; i < v.length; i++) if (v[i] === 2) v[i] = 1;
  for (const u of world.units.values()) {
    if (!u.alive || factionOf(u.utype) !== 'survivor') continue;
    stamp(world, tileOf(u.x), tileOf(u.y), u.utype === 'survivor' ? 9 : 8);
  }
  for (const b of world.buildings.values()) {
    const c = buildingCenter(b);
    stamp(world, tileOf(c.x), tileOf(c.y), BUILDINGS[b.btype].vision + b.size / 2);
  }
  // hunter pack memory of buildings in sight (shared between the hunters)
  for (const h of hunterUnits(world)) {
    const r = HUNTER.vision * TILE;
    for (const b of world.buildings.values()) {
      const c = buildingCenter(b);
      if (Math.hypot(c.x - h.x, c.y - h.y) <= r + b.size * TILE) world.hunterKnown.add(b.id);
    }
  }
}

export function visibleToSurvivors(world: World, x: number, y: number): boolean {
  const tx = tileOf(x);
  const ty = tileOf(y);
  if (!world.grid.inBounds(tx, ty)) return false;
  return world.vision[ty * world.grid.w + tx] === 2;
}

/** Whether hunter h currently perceives entity e. */
export function hunterSees(world: World, h: Unit, e: Entity): boolean {
  if (e.kind === 'building') return world.hunterKnown.has(e.id);
  if (hunterState(world, h.owner).scentActive > 0) return true;
  if (h.lastHitBy === e.id) return true;
  return Math.hypot(e.x - h.x, e.y - h.y) <= HUNTER.vision * TILE;
}
