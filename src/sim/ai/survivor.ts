import {
  AI,
  armorMultiplier,
  BUILDINGS,
  DT,
  investedValue,
  STRATEGIES,
  SURVIVOR,
  TILE,
  type BuildingType,
  type StrategyProfile,
} from '../../config/balance';
import { ALTAR, ARMY, ARMY_RULES, PHASES } from '../../config/lategame';
import { checkTrain, issueCommand } from '../commands';
import { tileCenter } from '../grid';
import { isArmy, type Building, type Grove, type Order, type Player, type Point, type Unit, type World } from '../types';
import { visibleToSurvivors } from '../vision';
import {
  armyCap,
  buildCost,
  buildingCenter,
  canPlace,
  checkBuild,
  countBuildings,
  distToBuilding,
  hunterPlayers,
  hunterUnits,
  nearestHunter,
  playerBuildings,
  survivorPlayers,
  unitStats,
} from '../world';

interface WardenMemory {
  think: number;
  groveId: number;
  failed: Set<string>;
  pending: { key: string; t: number } | null;
  fleeUntil: number;
  lastThreat: number;
}

function mem(p: Player): WardenMemory {
  if (!p.aiState) {
    const m: WardenMemory = { think: p.id * 0.13, groveId: -1, failed: new Set(), pending: null, fleeUntil: 0, lastThreat: -99 };
    p.aiState = m as unknown as Record<string, unknown>;
  }
  return p.aiState as unknown as WardenMemory;
}

const interiorCache = new WeakMap<Grove, Set<number>>();
function interiorSet(world: World, g: Grove): Set<number> {
  let s = interiorCache.get(g);
  if (!s) {
    s = new Set(g.interior.map((p) => world.grid.idx(p.x, p.y)));
    interiorCache.set(g, s);
  }
  return s;
}

function inGrove(g: Grove, x: number, y: number, pad = 0.6): boolean {
  return Math.hypot(x / TILE - (g.cx + 0.5), y / TILE - (g.cy + 0.5)) <= g.r + pad;
}

function gateTile(world: World, g: Grove): Point | null {
  let best: Point | null = null;
  let bd = 1e9;
  for (const t of g.gaps) {
    const d = Math.hypot(t.x - world.plaza.x, t.y - world.plaza.y);
    if (d < bd) {
      bd = d;
      best = t;
    }
  }
  return best;
}

function gapBuilding(world: World, t: Point): Building | undefined {
  const id = world.grid.occ[world.grid.idx(t.x, t.y)];
  return id ? world.buildings.get(id) : undefined;
}

function isSealed(world: World, g: Grove): boolean {
  return g.gaps.every((t) => {
    const b = gapBuilding(world, t);
    return b && !b.constructing;
  });
}

function minGapDist(g: Grove, x: number, y: number): number {
  let d = 1e9;
  for (const t of g.gaps) d = Math.min(d, Math.max(Math.abs(t.x - x), Math.abs(t.y - y)));
  return d;
}

/** Best top-left tile for a building inside the grove. */
/** Tiles the given warden can currently walk to (flood fill, cached per tick and unit). */
let reachCache: { tick: number; id: number; map: Uint8Array } | null = null;
let currentWarden: Unit | null = null;
function reachable(world: World, u: Unit): Uint8Array {
  if (reachCache && reachCache.tick === world.tick && reachCache.id === u.id) return reachCache.map;
  const g = world.grid;
  const map = new Uint8Array(g.w * g.h);
  const sx = Math.floor(u.x / TILE);
  const sy = Math.floor(u.y / TILE);
  if (!g.inBounds(sx, sy)) return map;
  const stack = [g.idx(sx, sy)];
  map[stack[0]] = 1;
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % g.w;
    const y = (i - x) / g.w;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (!g.passable(nx, ny, 'survivor')) continue;
      const j = g.idx(nx, ny);
      if (map[j]) continue;
      map[j] = 1;
      stack.push(j);
    }
  }
  reachCache = { tick: world.tick, id: u.id, map };
  return map;
}

/** True when some tile bordering the footprint is reachable by the current warden. */
function spotReachable(world: World, x: number, y: number, size: number): boolean {
  if (!currentWarden) return true;
  const map = reachable(world, currentWarden);
  const g = world.grid;
  for (let ty = y - 1; ty <= y + size; ty++)
    for (let tx = x - 1; tx <= x + size; tx++) {
      if (tx >= x && tx < x + size && ty >= y && ty < y + size) continue;
      if (g.inBounds(tx, ty) && map[g.idx(tx, ty)]) return true;
    }
  return false;
}

function findSpot(world: World, g: Grove, btype: BuildingType, m: WardenMemory, score: (cx: number, cy: number) => number, margin = 2): Point | null {
  const size = BUILDINGS[btype].size;
  const inside = interiorSet(world, g);
  const cands: { p: Point; s: number }[] = [];
  for (const p of g.interior) {
    let ok = true;
    for (let y = p.y; y < p.y + size && ok; y++)
      for (let x = p.x; x < p.x + size && ok; x++) {
        if (!inside.has(world.grid.idx(x, y))) ok = false;
        else if (minGapDist(g, x, y) < margin) ok = false;
      }
    if (!ok) continue;
    if (m.failed.has(`${btype}:${p.x},${p.y}`)) continue;
    if (!canPlace(world, btype, p.x, p.y) || !spotReachable(world, p.x, p.y, size)) continue;
    cands.push({ p, s: score(p.x + size / 2, p.y + size / 2) });
  }
  return bestConnected(world, cands, size);
}

/** Highest-scoring candidate whose footprint does not cut the warden off (checks the top few). */
function bestConnected(world: World, cands: { p: Point; s: number }[], size: number): Point | null {
  cands.sort((a, b) => b.s - a.s);
  for (const c of cands.slice(0, 8)) if (keepsConnected(world, c.p.x, c.p.y, size)) return c.p;
  return null;
}

/** Placing a footprint here must not seal the warden into a pocket. */
function keepsConnected(world: World, x0: number, y0: number, size: number): boolean {
  if (!currentWarden) return true;
  const g = world.grid;
  const before = reachable(world, currentWarden);
  let total = 0;
  for (const v of before) total += v;
  const blocked = (x: number, y: number) => x >= x0 && x < x0 + size && y >= y0 && y < y0 + size;
  const map = new Uint8Array(g.w * g.h);
  let sx = Math.floor(currentWarden.x / TILE);
  let sy = Math.floor(currentWarden.y / TILE);
  if (blocked(sx, sy)) {
    // the builder is nudged out of the footprint: start from any reachable bordering tile
    let found = false;
    for (let ty = y0 - 1; ty <= y0 + size && !found; ty++)
      for (let tx = x0 - 1; tx <= x0 + size && !found; tx++)
        if (!blocked(tx, ty) && g.inBounds(tx, ty) && before[g.idx(tx, ty)]) {
          sx = tx;
          sy = ty;
          found = true;
        }
    if (!found) return false;
  }
  const stack = [g.idx(sx, sy)];
  map[stack[0]] = 1;
  let count = 1;
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % g.w;
    const y = (i - x) / g.w;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (blocked(nx, ny) || !g.passable(nx, ny, 'survivor')) continue;
      const j = g.idx(nx, ny);
      if (map[j]) continue;
      map[j] = 1;
      count++;
      stack.push(j);
    }
  }
  return count >= total - size * size - 3;
}

/** Recovery: a warden boxed in by its own buildings demolishes the cheapest neighbour to get out. */
function escapePocket(world: World, p: Player, u: Unit): boolean {
  const map = reachable(world, u);
  let n = 0;
  for (const v of map) if (v && ++n >= 24) return false;
  let best: Building | null = null;
  let bv = 1e9;
  for (const b of world.buildings.values()) {
    if (b.owner !== p.id || b.btype === 'shelter' || b.btype === 'altar') continue;
    if (distToBuilding(u.x, u.y, b) > TILE * 1.6) continue;
    const v = investedValue(b.btype, b.level);
    if (v < bv) {
      bv = v;
      best = b;
    }
  }
  if (!best) return false;
  issueCommand(world, p.id, { t: 'demolish', buildingIds: [best.id] });
  return true;
}

let canBuild = true;
function orderBuild(world: World, p: Player, u: Unit, m: WardenMemory, btype: BuildingType, at: Point): void {
  if (!canBuild) return;
  const o: Order = { type: 'build', btype, tx: at.x, ty: at.y };
  m.pending = { key: `${btype}:${at.x},${at.y}`, t: world.time };
  issueCommand(world, p.id, { t: 'order', unitIds: [u.id], order: o, queue: false });
}

function hunterProjection(world: World): ReturnType<typeof unitStats> {
  // plan against the strongest hunter of the pack
  const top = hunterPlayers(world).reduce((a, b) => (b.hunter!.level > a.hunter!.level ? b : a));
  return unitStats(world, { utype: 'hunter', elite: false, owner: top.id });
}

function claimGrove(world: World, p: Player, u: Unit, m: WardenMemory): Grove | null {
  let best: Grove | null = null;
  let bs = 1e9;
  const hunters = hunterUnits(world);
  for (const g of world.groves) {
    if (g.claimedBy !== -1 && g.claimedBy !== p.id) continue;
    // skip groves somebody else (e.g. the human) is building in
    const foreign = [...world.buildings.values()].some((b) => b.owner !== p.id && inGrove(g, buildingCenter(b).x, buildingCenter(b).y, 1));
    if (foreign) continue;
    if (hunters.some((h) => inGrove(g, h.x, h.y, 3))) continue;
    const d = Math.hypot(tileCenter(g.cx) - u.x, tileCenter(g.cy) - u.y) / TILE;
    const s = d + g.gaps.length * 2.5 - g.interior.length * 0.05;
    if (s < bs) {
      bs = s;
      best = g;
    }
  }
  if (best) {
    best.claimedBy = p.id;
    m.groveId = best.id;
    m.failed.clear();
  }
  return best;
}

function flee(world: World, p: Player, u: Unit, h: Unit, m: WardenMemory, g: Grove | null): void {
  const spots: Point[] = [];
  for (const gr of world.groves) {
    if (inGrove(gr, h.x, h.y, 2)) continue;
    if (gr.claimedBy !== -1 && !isSealed(world, gr)) continue;
    spots.push({ x: tileCenter(gr.cx), y: tileCenter(gr.cy) });
  }
  spots.push({ x: tileCenter(world.plaza.x), y: tileCenter(world.plaza.y) });
  const home = g && isSealed(world, g) && !inGrove(g, h.x, h.y, 1) ? { x: tileCenter(g.cx), y: tileCenter(g.cy) } : null;
  if (home) spots.push(home);
  let best = spots[0];
  let bs = -1e9;
  for (const s of spots) {
    const dh = Math.hypot(s.x - h.x, s.y - h.y);
    const du = Math.hypot(s.x - u.x, s.y - u.y);
    // must not run through the hunter
    const toward = (s.x - u.x) * (h.x - u.x) + (s.y - u.y) * (h.y - u.y) > 0 && Math.hypot(h.x - u.x, h.y - u.y) < du;
    const sc = dh - du * 0.6 - (toward ? 800 : 0) + (s === home ? 600 : 0);
    if (sc > bs) {
      bs = sc;
      best = s;
    }
  }
  m.fleeUntil = world.time + 3;
  issueCommand(world, p.id, { t: 'order', unitIds: [u.id], order: { type: 'move', x: best.x, y: best.y }, queue: false });
}

type Result = 'done' | 'wait' | 'none';

function towerDps(b: Building, hunterArmor: number): number {
  const lv = BUILDINGS[b.btype].levels[b.level];
  return lv.dmg ? (lv.dmg / (lv.cooldown ?? 1)) * armorMultiplier(hunterArmor) : 0;
}

function upgradeOrWait(world: World, p: Player, b: Building, needLab: { v: number }): Result {
  const next = BUILDINGS[b.btype].levels[b.level + 1];
  if (!next || b.upgrading || b.constructing) return 'none';
  if (next.reqLab && p.labLevel < next.reqLab) {
    needLab.v = Math.max(needLab.v, next.reqLab);
    return 'none';
  }
  if (p.amber < next.cost) return 'wait';
  issueCommand(world, p.id, { t: 'upgrade', buildingIds: [b.id] });
  return 'done';
}

function labAction(world: World, p: Player, u: Unit, m: WardenMemory, g: Grove, want: number): Result {
  if (p.labLevel >= want) return 'none';
  const lab = playerBuildings(world, p.id).find((b) => b.btype === 'lab');
  if (lab) {
    if (lab.constructing || lab.upgrading) return 'none';
    return upgradeOrWait(world, p, lab, { v: 0 });
  }
  if (checkBuild(world, p, 'lab') === '琥珀不足') return 'wait';
  const spot =
    findSpot(world, g, 'lab', m, (x, y) => -Math.hypot(x - g.cx, y - g.cy)) ?? findSpot(world, g, 'lab', m, (x, y) => -Math.hypot(x - g.cx, y - g.cy), 1);
  if (!spot) return 'none';
  orderBuild(world, p, u, m, 'lab', spot);
  return 'done';
}

function defense(world: World, p: Player, u: Unit, m: WardenMemory, g: Grove, strat: StrategyProfile): { r: Result; urgent: boolean } {
  const hs = hunterProjection(world);
  const siegeDps = (hs.dmg * hs.siege) / hs.cooldown;
  const wallRamp = Math.min(1, Math.max(0.35, world.time / 300));
  const targetEhp = siegeDps * strat.hold * wallRamp;
  const needLab = { v: 0 };
  const mine = playerBuildings(world, p.id);

  // walls on gaps
  let urgent = false;
  const gapB = g.gaps.map((t) => gapBuilding(world, t)).filter((b): b is Building => !!b && b.owner === p.id);
  gapB.sort((a, b) => a.level - b.level || a.hp - b.hp);
  for (const b of gapB) {
    const lv = BUILDINGS[b.btype].levels[b.level];
    const ehp = lv.hp / armorMultiplier(lv.armor);
    if (ehp >= targetEhp) continue;
    if (ehp < targetEhp * 0.6) urgent = true;
    const r = upgradeOrWait(world, p, b, needLab);
    if (r !== 'none') return { r, urgent };
  }

  // towers
  const ramp = Math.min(1, Math.max(0.25, world.time / 260));
  const hunterEhp = hs.maxHp / armorMultiplier(hs.armor);
  const wantDps = (hunterEhp / (strat.hold * 3)) * strat.towerFactor * ramp;
  const towers = mine.filter((b) => BUILDINGS[b.btype].category === 'tower');
  const have = towers.reduce((s, b) => s + towerDps(b, hs.armor), 0);
  if (have < wantDps) {
    // upgrade with best gain/cost
    let bestT: Building | null = null;
    let bestRatio = 0;
    for (const b of towers) {
      const next = BUILDINGS[b.btype].levels[b.level + 1];
      if (!next || b.upgrading || b.constructing) continue;
      if (next.reqLab && p.labLevel < next.reqLab) {
        needLab.v = Math.max(needLab.v, next.reqLab);
        continue;
      }
      const gain = ((next.dmg ?? 0) / (next.cooldown ?? 1) - BUILDINGS[b.btype].levels[b.level].dmg! / (BUILDINGS[b.btype].levels[b.level].cooldown ?? 1)) / next.cost;
      if (gain > bestRatio) {
        bestRatio = gain;
        bestT = b;
      }
    }
    let newType: BuildingType = 'bolt';
    if (p.labLevel >= 2 && countBuildings(world, p.id, 'lance') < 3) newType = 'lance';
    else if (p.labLevel >= 1 && countBuildings(world, p.id, 'frost') < 1 && towers.length >= 2) newType = 'frost';
    const nl = BUILDINGS[newType].levels[0];
    const newRatio = towers.length < 10 ? (nl.dmg! / nl.cooldown!) / nl.cost * 1.1 : 0;
    if (bestT && bestRatio >= newRatio) {
      const r = upgradeOrWait(world, p, bestT, needLab);
      if (r !== 'none') return { r, urgent };
    } else if (newRatio > 0) {
      if (p.amber < buildCost(world, p, newType)) return { r: 'wait', urgent };
      const cover = towers.map((t) => buildingCenter(t));
      const towerScore = (x: number, y: number) => {
        const dg = minGapDist(g, Math.floor(x), Math.floor(y));
        const crowd = cover.filter((c) => Math.hypot(c.x / TILE - x, c.y / TILE - y) < 3).length;
        return -Math.abs(dg - 3) * 2 - crowd * 1.5;
      };
      const spot = findSpot(world, g, newType, m, towerScore) ?? findSpot(world, g, newType, m, towerScore, 1);
      if (spot) {
        orderBuild(world, p, u, m, newType, spot);
        return { r: 'done', urgent };
      }
      if (bestT) {
        const r = upgradeOrWait(world, p, bestT, needLab);
        if (r !== 'none') return { r, urgent };
      }
    }
  }

  // second wall layer
  if (strat.doubleWall && world.time > 150) {
    const gate = gateTile(world, g);
    const inside = interiorSet(world, g);
    for (const t of g.gaps) {
      if (gate && Math.max(Math.abs(t.x - gate.x), Math.abs(t.y - gate.y)) <= 2) continue;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const x = t.x + dx;
        const y = t.y + dy;
        if (!inside.has(world.grid.idx(x, y)) || !canPlace(world, 'wall', x, y) || m.failed.has(`wall:${x},${y}`)) continue;
        if (p.amber < BUILDINGS.wall.levels[0].cost) return { r: 'wait', urgent };
        orderBuild(world, p, u, m, 'wall', { x, y });
        return { r: 'done', urgent };
      }
    }
  }

  // repair spring once towers exist
  if (world.time > 220 && towers.length >= 2 && countBuildings(world, p.id, 'repair') === 0) {
    if (p.amber < BUILDINGS.repair.levels[0].cost) return { r: 'wait', urgent };
    const spot = findSpot(world, g, 'repair', m, (x, y) => -Math.abs(minGapDist(g, Math.floor(x), Math.floor(y)) - 4));
    if (spot) {
      orderBuild(world, p, u, m, 'repair', spot);
      return { r: 'done', urgent };
    }
  }

  if (needLab.v) {
    const r = labAction(world, p, u, m, g, needLab.v);
    if (r !== 'none') return { r, urgent };
  }
  return { r: 'none', urgent };
}

function economy(world: World, p: Player, u: Unit, m: WardenMemory, g: Grove): Result {
  const harvesters = playerBuildings(world, p.id).filter((b) => b.btype === 'harvester');
  // reserve room for tech before the grove fills up
  if (harvesters.length >= 3 && countBuildings(world, p.id, 'lab') === 0) {
    const r = labAction(world, p, u, m, g, 1);
    if (r !== 'none') return r;
  }
  let bestRoi = 0;
  let action: (() => Result) | null = null;
  let needLab = 0;
  const def = BUILDINGS.harvester;
  const cap = Math.min(def.maxCount ?? 6, (STRATEGIES[p.strategy] ?? STRATEGIES.balanced).maxHarvesters);
  if (harvesters.length < cap) {
    const roi = def.levels[0].income! / def.levels[0].cost;
    const spot = findSpot(world, g, 'harvester', m, (x, y) => minGapDist(g, Math.floor(x), Math.floor(y)) * 2 - Math.hypot(x - g.cx, y - g.cy) * 0.5);
    if (spot) {
      bestRoi = roi;
      action = () => {
        if (p.amber < def.levels[0].cost) return 'wait';
        orderBuild(world, p, u, m, 'harvester', spot);
        return 'done';
      };
    }
  }
  for (const b of harvesters) {
    if (b.constructing || b.upgrading) continue;
    const next = def.levels[b.level + 1];
    if (!next) continue;
    if (next.reqLab && p.labLevel < next.reqLab) {
      needLab = needLab ? Math.min(needLab, next.reqLab) : next.reqLab;
      continue;
    }
    const roi = (next.income! - def.levels[b.level].income!) / next.cost;
    if (roi > bestRoi) {
      bestRoi = roi;
      action = () => upgradeOrWait(world, p, b, { v: 0 });
    }
  }
  if (action) return action();
  if (needLab) return labAction(world, p, u, m, g, needLab);
  return 'none';
}

function thinkWarden(world: World, p: Player, u: Unit, m: WardenMemory): void {
  currentWarden = u;
  if (u.orders.length === 0 && escapePocket(world, p, u)) return;
  const strat = STRATEGIES[p.strategy] ?? STRATEGIES.balanced;
  const h = nearestHunter(world, u.x, u.y);
  const hunterVisible = !!h && visibleToSurvivors(world, h.x, h.y);
  let g = m.groveId >= 0 ? world.groves[m.groveId] : null;

  // failed build detection
  if (m.pending && u.orders.length === 0) {
    const [btype, xy] = m.pending.key.split(':');
    const [x, y] = xy.split(',').map(Number);
    const id = world.grid.occ[world.grid.idx(x, y)];
    const b = id ? world.buildings.get(id) : undefined;
    if (!b || b.btype !== btype) m.failed.add(m.pending.key);
    m.pending = null;
  }

  if (!g) {
    g = claimGrove(world, p, u, m);
    if (!g) return;
  }

  if (h && hunterVisible) {
    const d = Math.hypot(h.x - u.x, h.y - u.y) / TILE;
    const safe = isSealed(world, g) && inGrove(g, u.x, u.y) && !inGrove(g, h.x, h.y, 0.8);
    if (d < 14 && inGrove(g, h.x, h.y, 6)) m.lastThreat = world.time;
    if (d < AI.fleeRadius && !safe) {
      if (world.time > m.fleeUntil - 2.5) flee(world, p, u, h, m, g);
      return;
    }
    if (safe && d < SURVIVOR.range + 0.5) {
      const cur = u.orders[0];
      if (!cur || cur.type !== 'attack')
        issueCommand(world, p.id, { t: 'order', unitIds: [u.id], order: { type: 'attack', targetId: h.id }, queue: false });
      return;
    }
  }
  if (u.orders.length) {
    upgradesOnly(world, p, u, m, g, strat);
    if (u.orders[0].type === 'attack' && (!h || Math.hypot(h.x - u.x, h.y - u.y) > (SURVIVOR.range + 1) * TILE))
      issueCommand(world, p.id, { t: 'stop', unitIds: [u.id] });
    return;
  }
  if (world.time < m.fleeUntil) return;

  const mine = playerBuildings(world, p.id);
  const shelter = mine.find((b) => b.btype === 'shelter');

  if (!shelter) {
    if (h && inGrove(g, h.x, h.y, 2) && mine.length < 3) {
      g.claimedBy = -1;
      m.groveId = -1;
      return;
    }
    if (checkBuild(world, p, 'shelter')) return;
    const spot = findSpot(world, g, 'shelter', m, (x, y) => -Math.hypot(x - g!.cx - 0.5, y - g!.cy - 0.5));
    if (spot) orderBuild(world, p, u, m, 'shelter', spot);
    else {
      g.claimedBy = -1;
      m.groveId = -1;
    }
    return;
  }

  if (!inGrove(g, u.x, u.y, -0.5)) {
    issueCommand(world, p.id, { t: 'order', unitIds: [u.id], order: { type: 'move', x: tileCenter(g.cx), y: tileCenter(g.cy) }, queue: false });
    return;
  }

  // finish interrupted sites, then repair
  const site = mine.find((b) => b.constructing);
  if (site) {
    issueCommand(world, p.id, { t: 'order', unitIds: [u.id], order: { type: 'repair', targetId: site.id }, queue: false });
    return;
  }
  const hurt = mine
    .filter((b) => b.hp < b.maxHp * 0.7 && (!h || Math.hypot(buildingCenter(b).x - h.x, buildingCenter(b).y - h.y) > AI.safeRepairDist * TILE))
    .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
  if (hurt && p.amber > 25) {
    issueCommand(world, p.id, { t: 'order', unitIds: [u.id], order: { type: 'repair', targetId: hurt.id }, queue: false });
    return;
  }

  // first income, then seal gaps
  if (!mine.some((b) => b.btype === 'harvester')) {
    const r = economy(world, p, u, m, g);
    if (r !== 'none') return;
  }
  const gate = gateTile(world, g);
  for (const t of g.gaps) {
    if (gapBuilding(world, t)) continue;
    if (m.failed.has(`wall:${t.x},${t.y}`) || m.failed.has(`gate:${t.x},${t.y}`)) continue;
    const bt: BuildingType = gate && t.x === gate.x && t.y === gate.y ? 'gate' : 'wall';
    if (p.amber < BUILDINGS[bt].levels[0].cost) return;
    if (!canPlace(world, bt, t.x, t.y)) continue;
    orderBuild(world, p, u, m, bt, t);
    return;
  }

  if (lateBuild(world, p, u, m, g, strat)) return;
  if (countBuildings(world, p.id, 'lab') === 0 && mine.filter((b) => b.btype === 'harvester' || BUILDINGS[b.btype].category === 'tower').length >= 4) {
    if (labAction(world, p, u, m, g, 1) !== 'none') return;
  }
  const threatened = world.time - m.lastThreat < 30;
  // keep towers from starving the economy
  let towerInv = 0;
  let ecoInv = 0;
  for (const b of mine) {
    const v = investedValue(b.btype, b.level);
    if (BUILDINGS[b.btype].category === 'tower') towerInv += v;
    else if (b.btype === 'harvester') ecoInv += v;
  }
  if (!threatened && towerInv > (ecoInv + 200) * AI.maxTowerToEcoRatio * strat.towerFactor && economy(world, p, u, m, g) !== 'none') return;
  if (strat.ecoFirst && !threatened) {
    const e = economy(world, p, u, m, g);
    if (e !== 'none') return;
    if (defense(world, p, u, m, g, strat).r === 'none') surplus(world, p, u, m, g, strat);
    return;
  }
  const d = defense(world, p, u, m, g, strat);
  if (d.r === 'done') return;
  if (d.r === 'wait' && (d.urgent || threatened)) return;
  if (economy(world, p, u, m, g) === 'none' && d.r === 'none') surplus(world, p, u, m, g, strat);
}

/** Economy maxed out: pour amber into a kill-zone to hunt the hunter (late-game counter attack). */
function surplus(world: World, p: Player, u: Unit, m: WardenMemory, g: Grove, strat: StrategyProfile): void {
  const boosted: StrategyProfile = { ...strat, hold: strat.hold * 2.2, towerFactor: Math.max(1, strat.towerFactor) * 4 };
  defense(world, p, u, m, g, boosted);
}

/** While the warden is busy walking/building, still spend on upgrades (they need no worker). */
function upgradesOnly(world: World, p: Player, u: Unit, m: WardenMemory, g: Grove, strat: StrategyProfile): void {
  if (!playerBuildings(world, p.id).some((b) => b.btype === 'shelter')) return;
  canBuild = false;
  try {
    const d = defense(world, p, u, m, g, strat);
    if (d.r === 'none' || (d.r === 'wait' && !d.urgent)) economy(world, p, u, m, g);
  } finally {
    canBuild = true;
  }
}

// ---------------- late-game routes ----------------

/** Desired army size per route (0 = no barracks). */
function armyGoal(world: World, p: Player, strat: StrategyProfile): number {
  return strat.route === 'legion' ? armyCap(world, p.id) : strat.route === 'balanced' ? 4 : 0;
}

/** Fallback placement just outside the clearing, near its gate (for big late-game buildings). */
function findSpotOutside(world: World, g: Grove, btype: BuildingType, m: WardenMemory): Point | null {
  const size = BUILDINGS[btype].size;
  const gate = gateTile(world, g) ?? { x: g.cx, y: g.cy };
  const R = Math.ceil(g.r + 12);
  const cands: { p: Point; s: number }[] = [];
  for (let y = g.cy - R; y <= g.cy + R; y++)
    for (let x = g.cx - R; x <= g.cx + R; x++) {
      const d = Math.hypot(x + size / 2 - g.cx, y + size / 2 - g.cy);
      if (d < g.r + 3 || d > g.r + 12) continue;
      if (m.failed.has(`${btype}:${x},${y}`) || !canPlace(world, btype, x, y) || !spotReachable(world, x, y, size)) continue;
      // stay clear of other clearings
      if (world.groves.some((o) => o !== g && Math.hypot(x - o.cx, y - o.cy) < o.r + 4)) continue;
      cands.push({ p: { x, y }, s: -Math.hypot(x - gate.x, y - gate.y) });
    }
  return bestConnected(world, cands, size);
}

/** Builds that need the warden: barracks for army routes, the Dawn Altar for the finish. */
function lateBuild(world: World, p: Player, u: Unit, m: WardenMemory, g: Grove, strat: StrategyProfile): boolean {
  const mine = playerBuildings(world, p.id);
  // tech targets each route needs for its late game
  if (strat.route === 'legion' && world.time >= PHASES.midAt && p.labLevel < 2 && labAction(world, p, u, m, g, 2) === 'done') return true;
  const hasBarracks = mine.some((b) => b.btype === 'barracks' && !b.constructing);
  const wantLab3 = world.time >= PHASES.altarUnlockAt - 180 || (strat.route === 'legion' && hasBarracks && world.time >= PHASES.lateAt);
  if (wantLab3 && p.labLevel < 3 && labAction(world, p, u, m, g, 3) === 'done') return true;
  // Dawn Altar: the eco route races for it; others build it once they can comfortably afford it
  if (world.time >= PHASES.altarUnlockAt && p.labLevel >= ALTAR.reqLab && !mine.some((b) => b.btype === 'altar')) {
    const reserve = strat.route === 'eco' ? 1 : world.bloodMoon ? 1.1 : 1.5;
    if (p.amber >= ALTAR.cost * reserve) {
      const spot =
        findSpot(world, g, 'altar', m, (x, y) => -Math.hypot(x - g.cx, y - g.cy)) ??
        findSpot(world, g, 'altar', m, (x, y) => -Math.hypot(x - g.cx, y - g.cy), 1) ??
        findSpotOutside(world, g, 'altar', m);
      if (spot) {
        orderBuild(world, p, u, m, 'altar', spot);
        return true;
      }
    }
    if (strat.route === 'eco' && p.amber >= ALTAR.cost * 0.6) return true; // save up for it
  }
  const goal = armyGoal(world, p, strat);
  const startAt = strat.route === 'legion' ? PHASES.midAt : PHASES.lateAt + 120;
  if (goal > 0 && world.time >= startAt && p.labLevel >= 2 && !mine.some((b) => b.btype === 'barracks')) {
    if (p.amber < BUILDINGS.barracks.levels[0].cost) return strat.route === 'legion';
    const spot =
      findSpot(world, g, 'barracks', m, (x, y) => -Math.abs(minGapDist(g, Math.floor(x), Math.floor(y)) - 4)) ??
      findSpot(world, g, 'barracks', m, (x, y) => -Math.hypot(x - g.cx, y - g.cy), 1) ??
      findSpotOutside(world, g, 'barracks', m);
    if (spot) {
      orderBuild(world, p, u, m, 'barracks', spot);
      return true;
    }
  }
  return false;
}

/** Command-only army management: training, barracks upgrade, rally and the legion's offensive. */
function manageArmy(world: World, p: Player, m: WardenMemory, strat: StrategyProfile): void {
  const goal = armyGoal(world, p, strat);
  const barracks = playerBuildings(world, p.id).find((b) => b.btype === 'barracks' && !b.constructing);
  if (barracks && goal > 0) {
    if (barracks.level === 0 && p.labLevel >= 3 && !barracks.upgrading && p.amber > BUILDINGS.barracks.levels[1].cost + 300)
      issueCommand(world, p.id, { t: 'upgrade', buildingIds: [barracks.id] });
    const army = [...world.units.values()].filter((x) => x.alive && x.owner === p.id && isArmy(x.utype));
    const queued = barracks.train?.queue.length ?? 0;
    if (army.length + queued < goal && queued < 2) {
      const rangers = army.filter((x) => x.utype === 'ranger').length;
      const kind = rangers < (army.length + 1) * 0.67 ? 'ranger' : 'guard';
      // keep a defence budget: legion spends freely, balanced only from surplus
      const floor = strat.route === 'legion' ? 0 : 400;
      if (p.amber - floor >= ARMY[kind].cost && !checkTrain(world, p, barracks, kind)) issueCommand(world, p.id, { t: 'train', buildingId: barracks.id, utype: kind });
    }
  }
  legionOffensive(world, p, m, strat);
}

function legionOffensive(world: World, p: Player, m: WardenMemory, strat: StrategyProfile): void {
  const army = [...world.units.values()].filter((x) => x.alive && x.owner === p.id && isArmy(x.utype));
  if (!army.length) return;
  const g = m.groveId >= 0 ? world.groves[m.groveId] : null;
  const home = g ? { x: tileCenter(g.cx), y: tileCenter(g.cy) } : { x: army[0].x, y: army[0].y };
  const h = nearestHunter(world, home.x, home.y, (c) => visibleToSurvivors(world, c.x, c.y)) ?? nearestHunter(world, home.x, home.y);
  const seen = h && visibleToSurvivors(world, h.x, h.y);
  const ready = strat.route === 'legion' && army.length >= ARMY_RULES.legionAttackSize;
  const attack = h && ((ready && (seen || world.bloodMoon)) || (seen && g && Math.hypot(h.x / TILE - g.cx, h.y / TILE - g.cy) < g.r + 8));
  for (const a of army) {
    const o = a.orders[0];
    if (attack && h) {
      if (!o || (o.type === 'attackMove' && Math.hypot(o.x - h.x, o.y - h.y) > TILE * 4) || o.type === 'move')
        issueCommand(world, p.id, { t: 'order', unitIds: [a.id], order: { type: 'attackMove', x: h.x, y: h.y }, queue: false });
    } else if (!o && g && Math.hypot(a.x / TILE - g.cx, a.y / TILE - g.cy) > g.r + 2) {
      // regroup at home
      issueCommand(world, p.id, { t: 'order', unitIds: [a.id], order: { type: 'attackMove', x: tileCenter(g.cx), y: tileCenter(g.cy) }, queue: false });
    }
  }
}

export function runSurvivorAI(world: World): void {
  for (const p of survivorPlayers(world)) {
    if (!p.isAI) continue;
    const m = mem(p);
    m.think -= DT;
    if (m.think > 0) continue;
    m.think = AI.survivorThink;
    const strat = STRATEGIES[p.strategy] ?? STRATEGIES.balanced;
    manageArmy(world, p, m, strat);
    const u = world.units.get(p.unitId);
    if (!u || !u.alive) continue;
    thinkWarden(world, p, u, m);
  }
}
