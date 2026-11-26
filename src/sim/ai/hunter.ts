import { AI, armorMultiplier, BUILDINGS, DT, HUNTER, investedValue, ITEM_SLOTS, ITEMS, TILE, type ItemSlot } from '../../config/balance';
import { issueCommand } from '../commands';
import { tileCenter, tileOf } from '../grid';
import { findPath, type CostFn, type TileRect } from '../pathfinding';
import { ALTAR } from '../../config/lategame';
import { tryPounce, tryRend, tryRoar } from '../hunterSkills';
import { factionOf, isArmy, type Building, type Entity, type Point, type Unit, type World } from '../types';
import { hunterSees } from '../vision';
import { buildingCenter, distToBuilding, hunterPlayers, hunterUnitOf, unitStats } from '../world';
import type { Player } from '../types';

interface HunterMemory {
  think: number;
  retarget: number;
  mode: 'hunt' | 'retreat';
  targetId: number;
  breachId: number;
  lastSeen: Map<number, { x: number; y: number; t: number }>;
  explore: Point | null;
  visited: Map<number, number>;
  chasing: number;
  chaseTimer: number;
}

function mem(p: Player): HunterMemory {
  if (!p.aiState) {
    const m: HunterMemory = {
      think: 0,
      retarget: 0,
      mode: 'hunt',
      targetId: 0,
      breachId: 0,
      lastSeen: new Map(),
      explore: null,
      visited: new Map(),
      chasing: 0,
      chaseTimer: 0,
    };
    p.aiState = m as unknown as Record<string, unknown>;
  }
  return p.aiState as unknown as HunterMemory;
}

/** Siege cost: buildings are passable at the cost of the time needed to break them. */
export function siegeCost(world: World, h: Unit): CostFn {
  const st = unitStats(world, h);
  const tilesPerSec = st.speed / TILE;
  const cache = new Map<number, number>();
  const g = world.grid;
  return (x, y) => {
    if (!g.terrainPassable(x, y)) return Infinity;
    const id = g.occ[g.idx(x, y)];
    if (!id) return 1;
    let c = cache.get(id);
    if (c === undefined) {
      const b = world.buildings.get(id);
      if (!b) c = 1;
      else {
        const armor = BUILDINGS[b.btype].levels[b.level].armor;
        const dps = (st.dmg * st.siege * armorMultiplier(armor)) / st.cooldown;
        c = 1 + (b.hp / dps) * tilesPerSec;
      }
      cache.set(id, c);
    }
    return c;
  };
}

function towerThreat(world: World, x: number, y: number, hunterArmor: number): number {
  let dps = 0;
  for (const b of world.buildings.values()) {
    if (b.constructing) continue;
    const lv = BUILDINGS[b.btype].levels[b.level];
    if (!lv.dmg || !lv.range) continue;
    const c = buildingCenter(b);
    if (Math.hypot(c.x - x, c.y - y) <= (lv.range + 1.5) * TILE) dps += (lv.dmg / (lv.cooldown ?? 1)) * armorMultiplier(hunterArmor);
  }
  return dps;
}

function shop(world: World, p: Player, u: Unit): void {
  const h = p.hunter!;
  const maxHp = unitStats(world, u).maxHp;
  const w: Record<ItemSlot, number> = {
    claws: 1.25,
    hide: 0.55 + Math.min(1.2, h.towerDamageTaken / (maxHp * 4)),
    striders: 0.45 + Math.min(1, h.chaseFails * 0.15),
    heart: 0.75 + Math.min(0.8, h.towerDamageTaken / (maxHp * 6)),
    horn: 0.35 + Math.min(1.2, h.siegeTime / 90),
  };
  let best: ItemSlot | null = null;
  let bestScore = 0;
  for (const slot of ITEM_SLOTS) {
    const tier = ITEMS[slot].tiers[h.items[slot]];
    if (!tier) continue;
    const s = w[slot] / tier.cost;
    if (s > bestScore) {
      bestScore = s;
      best = slot;
    }
  }
  if (best && h.soulfire >= ITEMS[best].tiers[h.items[best]].cost) issueCommand(world, p.id, { t: 'buy', slot: best });
}

function issueAttack(world: World, h: Unit, id: number): void {
  const o = h.orders[0];
  if (o && o.type === 'attack' && o.targetId === id) return;
  issueCommand(world, h.owner, { t: 'order', unitIds: [h.id], order: { type: 'attack', targetId: id }, queue: false });
}

function issueMove(world: World, h: Unit, x: number, y: number): void {
  const o = h.orders[0];
  if (o && o.type === 'move' && Math.hypot(o.x - x, o.y - y) < TILE * 2) return;
  issueCommand(world, h.owner, { t: 'order', unitIds: [h.id], order: { type: 'move', x, y }, queue: false });
}

function entityRect(e: Entity): TileRect {
  if (e.kind === 'unit') {
    const tx = tileOf(e.x);
    const ty = tileOf(e.y);
    return { x0: tx, y0: ty, x1: tx, y1: ty };
  }
  return { x0: e.tx - 1, y0: e.ty - 1, x1: e.tx + e.size, y1: e.ty + e.size };
}

interface Plan {
  target: Entity;
  breach: Building | null;
  score: number;
}

function planTo(world: World, h: Unit, target: Entity, cost: CostFn): { breach: Building | null; cost: number; reached: boolean } {
  const res = findPath(world.grid, tileOf(h.x), tileOf(h.y), entityRect(target), cost, 9000);
  let breach: Building | null = null;
  for (const t of res.tiles) {
    const id = world.grid.occ[world.grid.idx(t.x, t.y)];
    if (id && id !== target.id) {
      breach = world.buildings.get(id) ?? null;
      if (breach) break;
    }
  }
  return { breach, cost: res.cost, reached: res.reached };
}

function chooseTarget(world: World, h: Unit, m: HunterMemory, taken: Set<number>): Plan | null {
  const st = unitStats(world, h);
  const cost = siegeCost(world, h);
  const cands: { e: Entity; value: number }[] = [];
  for (const u of world.units.values()) {
    if (!u.alive || factionOf(u.utype) !== 'survivor') continue;
    if (hunterSees(world, h, u)) m.lastSeen.set(u.id, { x: u.x, y: u.y, t: world.time });
    const seen = m.lastSeen.get(u.id);
    if (!seen || world.time - seen.t > 25) continue;
    const frac = u.hp / unitStats(world, u).maxHp;
    // wardens are the real prize; army units are worth less but still feed soulfire
    const base = isArmy(u.utype) ? (u.utype === 'ranger' ? 34 : 24) : 70;
    cands.push({ e: u, value: base + (1 - frac) * 40 });
  }
  const blds: { e: Building; value: number }[] = [];
  for (const id of world.hunterKnown) {
    const b = world.buildings.get(id);
    if (!b) continue;
    const def = BUILDINGS[b.btype];
    let value = 4;
    if (b.btype === 'harvester') value = 14 + investedValue(b.btype, b.level) / 35;
    else if (b.btype === 'shelter') value = 18;
    else if (b.btype === 'lab') value = 16 + b.level * 8;
    else if (def.category === 'tower') value = 8 + b.level * 3;
    else if (b.btype === 'repair') value = 10;
    else if (b.btype === 'barracks') value = 22;
    else if (b.btype === 'altar') value = 40 * ALTAR.hunterPriority;
    if (b.constructing) value *= 1.3;
    blds.push({ e: b, value: value / Math.max(1, Math.hypot(buildingCenter(b).x - h.x, buildingCenter(b).y - h.y) / (TILE * 12)) });
  }
  blds.sort((a, b) => b.value - a.value);
  for (const b of blds.slice(0, 4)) cands.push(b);

  let best: Plan | null = null;
  for (const c of cands) {
    const plan = planTo(world, h, c.e, cost);
    if (!plan.reached) continue;
    const p = c.e.kind === 'unit' ? { x: c.e.x, y: c.e.y } : buildingCenter(c.e);
    const threat = towerThreat(world, p.x, p.y, st.armor);
    // seconds until the towers would kill us vs how long the job takes
    const survive = h.hp / Math.max(1, threat - st.regen);
    const jobTime = plan.cost / (st.speed / TILE) + 4;
    let score = (c.value * 40) / (plan.cost + 12);
    // the altar is an existential threat: the hunter ignores tower danger for it
    const isAltar = c.e.kind === 'building' && c.e.btype === 'altar';
    if (!isAltar && threat > 0 && survive < jobTime * AI.hunterRiskTolerance) score *= 0.25 * AI.turretAvoidFactor;
    if (c.e.id === m.targetId) score *= 1.25; // commitment
    if (c.e.kind === 'building' && taken.has(c.e.id)) score *= 0.6; // a packmate is on it
    if (!best || score > best.score) best = { target: c.e, breach: plan.breach, score };
  }
  return best;
}

function explorePoint(world: World, h: Unit, m: HunterMemory): Point {
  const pts: Point[] = world.groves.map((g) => ({ x: g.cx, y: g.cy }));
  pts.push(world.plaza);
  let best = pts[0];
  let bs = -1e9;
  pts.forEach((p, i) => {
    const last = m.visited.get(i) ?? -999;
    const d = Math.hypot(tileCenter(p.x) - h.x, tileCenter(p.y) - h.y) / TILE;
    const s = (world.time - last) * 0.8 - d + world.rng.next() * 6;
    if (s > bs) {
      bs = s;
      best = p;
    }
  });
  pts.forEach((p, i) => {
    if (p === best) m.visited.set(i, world.time);
  });
  return { x: tileCenter(best.x), y: tileCenter(best.y) };
}

/** Tactical skill use: rend on sieges, roar into tower clusters, pounce on exposed prey. */
function useSkills(world: World, h: Unit): void {
  const o = h.orders[0];
  if (o?.type === 'attack') {
    const tb = world.buildings.get(o.targetId);
    if (tb && distToBuilding(h.x, h.y, tb) < TILE * 2.5) tryRend(world, h);
  }
  if (tryRoar(world, h)) return;
  let best: Unit | null = null;
  let bs = -1e9;
  for (const u of world.units.values()) {
    if (!u.alive || factionOf(u.utype) !== 'survivor' || !hunterSees(world, h, u)) continue;
    const d = Math.hypot(u.x - h.x, u.y - h.y);
    const s = (u.utype === 'survivor' ? 100 : u.utype === 'ranger' ? 40 : 10) - d / TILE;
    if (s > bs) {
      bs = s;
      best = u;
    }
  }
  if (best) tryPounce(world, h, best);
}

export function runHunterAI(world: World): void {
  for (const hp of hunterPlayers(world)) {
    const h = hunterUnitOf(world, hp.id);
    if (h && hp.isAI) thinkHunter(world, hp, h);
  }
}

/** Building targets a packmate is already working on: spread out instead of stacking. */
function packTargets(world: World, self: Player): Set<number> {
  const out = new Set<number>();
  for (const p of hunterPlayers(world)) {
    if (p.id === self.id || !p.aiState) continue;
    const m = p.aiState as unknown as HunterMemory;
    if (m.targetId) out.add(m.targetId);
  }
  return out;
}

function thinkHunter(world: World, hp: Player, h: Unit): void {
  const m = mem(hp);
  const hs = hp.hunter!;
  // stats for shopping heuristics
  const cur = h.orders[0];
  if (cur?.type === 'attack') {
    const t = world.buildings.get(cur.targetId);
    if (t && (t.btype === 'wall' || t.btype === 'gate')) hs.siegeTime += DT;
  }
  m.think -= DT;
  if (m.think > 0) return;
  m.think = AI.hunterThink;
  shop(world, hp, h);
  useSkills(world, h);
  const st = unitStats(world, h);

  if (m.mode === 'retreat') {
    if (h.hp >= st.maxHp * HUNTER.resumeHp) m.mode = 'hunt';
    else {
      issueMove(world, h, tileCenter(world.lair.x), tileCenter(world.lair.y));
      return;
    }
  }
  const retreatAt = hs.lives > 1 && !world.bloodMoon ? HUNTER.cautiousRetreatHp : HUNTER.retreatHp;
  if (h.hp < st.maxHp * retreatAt) {
    // finish a nearly dead warden instead of retreating
    const t = world.units.get(m.targetId);
    const close = t && t.alive && Math.hypot(t.x - h.x, t.y - h.y) < TILE * 2.5 && t.hp < 60;
    if (!close) {
      m.mode = 'retreat';
      m.targetId = 0;
      issueMove(world, h, tileCenter(world.lair.x), tileCenter(world.lair.y));
      return;
    }
  }

  // opportunistic: a warden walked into reach
  for (const u of world.units.values()) {
    if (!u.alive || factionOf(u.utype) !== 'survivor') continue;
    if (Math.hypot(u.x - h.x, u.y - h.y) < TILE * 3) {
      const quick = findPath(world.grid, tileOf(h.x), tileOf(h.y), entityRect(u), (x, y) => (world.grid.passable(x, y, 'hunter') ? 1 : Infinity), 300);
      if (quick.reached) {
        m.targetId = u.id;
        m.retarget = 1.5;
        issueAttack(world, h, u.id);
        return;
      }
    }
  }

  m.retarget -= AI.hunterThink;
  const target = m.targetId ? (world.units.get(m.targetId) ?? world.buildings.get(m.targetId)) : undefined;
  if (m.retarget <= 0 || !target || !target.alive) {
    m.retarget = AI.hunterRetarget;
    const plan = chooseTarget(world, h, m, packTargets(world, hp));
    if (!plan) {
      if (target && target.kind === 'unit') hs.chaseFails++;
      m.targetId = 0;
      m.breachId = 0;
      if (!m.explore || Math.hypot(m.explore.x - h.x, m.explore.y - h.y) < TILE * 3) m.explore = explorePoint(world, h, m);
      issueMove(world, h, m.explore.x, m.explore.y);
      return;
    }
    m.targetId = plan.target.id;
    m.breachId = plan.breach?.id ?? 0;
  } else if (m.breachId && !world.buildings.get(m.breachId)) {
    // breach broken: replan the remaining route
    const plan = planTo(world, h, target, siegeCost(world, h));
    m.breachId = plan.breach?.id ?? 0;
  }
  const attackId = m.breachId || m.targetId;
  if (attackId) {
    // keep sight of a fleeing target
    const t = world.units.get(m.targetId);
    if (t && !hunterSees(world, h, t)) {
      const seen = m.lastSeen.get(t.id);
      if (seen && world.time - seen.t > 6) {
        hs.chaseFails++;
        m.lastSeen.delete(t.id);
        m.targetId = 0;
        m.retarget = 0;
        return;
      }
      if (seen && !m.breachId) {
        issueMove(world, h, seen.x, seen.y);
        return;
      }
    }
    issueAttack(world, h, attackId);
  }
}
