import { BUILDINGS, DT, TILE } from '../config/balance';
import { HUNTER_SKILLS, type HunterSkill } from '../config/lategame';
import { walkableLine } from './pathfinding';
import type { Unit, World } from './types';
import { damageEntity, distToBuilding, emit, hunterPlayers, hunterState, unitStats } from './world';

/** 0 = locked, 1..3 = rank by hunter level. */
export function skillRank(level: number, skill: HunterSkill): number {
  let r = 0;
  for (const lv of HUNTER_SKILLS[skill].unlock) if (level >= lv) r++;
  return r;
}

function ready(world: World, h: Unit, skill: HunterSkill): number {
  const hs = hunterState(world, h.owner);
  // frozen or stunned hunters cannot cast: this is the wardens' counterplay
  if (h.status.rootT > 0 || h.status.stunT > 0) return 0;
  if (hs.skillCd[skill] > 0) return 0;
  return skillRank(hs.level, skill);
}

export function tickSkills(world: World): void {
  for (const p of hunterPlayers(world)) {
    const hs = p.hunter!;
    for (const k of Object.keys(hs.skillCd) as HunterSkill[]) if (hs.skillCd[k] > 0) hs.skillCd[k] -= DT;
  }
}

/** Leap onto a reachable warden/army unit, striking and stunning it. */
export function tryPounce(world: World, h: Unit, target: Unit): boolean {
  const rank = ready(world, h, 'pounce');
  if (!rank) return false;
  const cfg = HUNTER_SKILLS.pounce;
  const d = Math.hypot(target.x - h.x, target.y - h.y);
  if (d > cfg.range * TILE || d < TILE * 2) return false;
  if (!walkableLine(world.grid, h.x, h.y, target.x, target.y, h.radius * 0.6, 'hunter')) return false;
  const nx = (target.x - h.x) / d;
  const ny = (target.y - h.y) / d;
  const land = d - target.radius - h.radius;
  const x0 = h.x;
  const y0 = h.y;
  h.x += nx * land;
  h.y += ny * land;
  h.px = h.x;
  h.py = h.y;
  h.facing = Math.atan2(ny, nx);
  h.attackAnim = 0.35;
  const st = unitStats(world, h);
  target.status.stunT = Math.max(target.status.stunT, cfg.stun[rank - 1]);
  damageEntity(world, target, st.dmg * cfg.dmgMult[rank - 1], h, 'skill');
  hunterState(world, h.owner).skillCd.pounce = cfg.cd[rank - 1];
  emit(world, { e: 'skill', skill: 'pounce', x: x0, y: y0, x2: h.x, y2: h.y, radius: 0 });
  return true;
}

/** Shockwave that silences nearby towers and damages structures. */
export function tryRoar(world: World, h: Unit, force = false): boolean {
  const rank = ready(world, h, 'roar');
  if (!rank) return false;
  const cfg = HUNTER_SKILLS.roar;
  const r = cfg.radius[rank - 1] * TILE;
  const towers = [...world.buildings.values()].filter((b) => !b.constructing && BUILDINGS[b.btype].category === 'tower' && b.silenceT <= 0 && distToBuilding(h.x, h.y, b) <= r);
  if (!force && towers.length < 2) return false;
  for (const b of towers) b.silenceT = cfg.silence[rank - 1];
  for (const b of [...world.buildings.values()]) {
    if (distToBuilding(h.x, h.y, b) > r) continue;
    damageEntity(world, b, cfg.bldDmg[rank - 1], h, 'skill');
  }
  hunterState(world, h.owner).skillCd.roar = cfg.cd[rank - 1];
  emit(world, { e: 'skill', skill: 'roar', x: h.x, y: h.y, x2: h.x, y2: h.y, radius: r });
  return true;
}

/** Empower the next few strikes against buildings (+100%, armour ignored). */
export function tryRend(world: World, h: Unit): boolean {
  const rank = ready(world, h, 'rend');
  if (!rank) return false;
  const hs = hunterState(world, h.owner);
  if (hs.rendHits > 0) return false;
  const cfg = HUNTER_SKILLS.rend;
  hs.rendHits = cfg.hits[rank - 1];
  hs.skillCd.rend = cfg.cd[rank - 1];
  const c = { x: h.x, y: h.y };
  emit(world, { e: 'skill', skill: 'rend', x: c.x, y: c.y, x2: c.x, y2: c.y, radius: 0 });
  return true;
}

