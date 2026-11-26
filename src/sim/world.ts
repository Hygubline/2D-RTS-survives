import {
  armorMultiplier,
  BUILDINGS,
  HUNTER,
  HUNTER_COLOR,
  HUNTER_PACK,
  investedValue,
  ITEM_SLOTS,
  ITEMS,
  MATCH,
  SOULFIRE_HIT_MULT,
  SURVIVOR,
  TEAM_COLORS,
  TILE,
  type BuildingType,
} from '../config/balance';
import { ARMY, ARMY_RULES, BLOOD_MOON, EVOLUTION, effectiveIncome, PHASES, perkAt } from '../config/lategame';
import { tileCenter } from './grid';
import { generateMap } from './mapgen';
import { nearestPassable } from './pathfinding';
import { Rng } from './rng';
import { factionOf, freshStatus, isArmy } from './types';
import type { Building, DamageSource, Entity, GameEvent, HunterState, Player, Point, Unit, UnitType, World } from './types';

export interface WorldOptions {
  seed: number;
  /** true when a real person controls player 0 */
  humanControlled: boolean;
  strategies?: string[]; // one per survivor (player 0..3)
  /** multiplayer: ids of the players controlled by people (overrides humanControlled) */
  humans?: number[];
  /** multiplayer: display names by player id */
  names?: Record<number, string>;
}

const AI_NAMES = ['你', '雾语者', '灰羽', '青藤'];

export function createWorld(opts: WorldOptions): World {
  const map = generateMap(opts.seed);
  const world: World = {
    time: 0,
    tick: 0,
    rng: new Rng(opts.seed * 7 + 3),
    grid: map.grid,
    units: new Map(),
    buildings: new Map(),
    projectiles: [],
    players: [],
    groves: map.groves,
    plaza: map.plaza,
    lair: map.lair,
    nextId: 1,
    events: [],
    pending: [],
    winner: null,
    endReason: null,
    bloodMoon: false,
    announced: new Set(),
    vision: new Uint8Array(map.grid.w * map.grid.h),
    visionTimer: 0,
    hunterKnown: new Set(),
    hunterPlayerIds: [],
  };
  const strategies = opts.strategies ?? ['balanced', 'eco', 'turret', 'legion'];
  const survivorCount = 1 + MATCH.aiSurvivors;
  for (let i = 0; i < survivorCount; i++) {
    const p = makePlayer(i, 'survivor');
    p.name = opts.humanControlled ? AI_NAMES[i] : `守夜人${i + 1}`;
    p.isHuman = i === 0 && opts.humanControlled;
    p.isAI = !p.isHuman;
    p.strategy = strategies[i % strategies.length];
    p.color = TEAM_COLORS[i];
    world.players.push(p);
    const ang = (i / survivorCount) * Math.PI * 2;
    const u = spawnUnit(world, 'survivor', i, tileCenter(map.plaza.x) + Math.cos(ang) * 40, tileCenter(map.plaza.y) + Math.sin(ang) * 40);
    p.unitId = u.id;
  }
  for (let k = 0; k < HUNTER_PACK.count; k++) world.players.push(makeHunterPlayer(survivorCount + k, k));
  world.hunterPlayerIds = world.players.filter((p) => p.faction === 'hunter').map((p) => p.id);
  // multiplayer seats: exactly these players are people, everyone else is AI
  if (opts.humans) {
    for (const p of world.players) {
      p.isHuman = opts.humans.includes(p.id);
      p.isAI = !p.isHuman;
      if (p.faction === 'survivor' && opts.names?.[p.id]) p.name = opts.names[p.id];
      if (p.faction === 'hunter' && opts.names?.[p.id]) p.name = `${opts.names[p.id]}（${HUNTER_PACK.names[p.id - survivorCount]}）`;
    }
  }
  return world;
}

function makeHunterPlayer(id: number, k: number): Player {
  const hp = makePlayer(id, 'hunter');
  hp.name = HUNTER_PACK.names[k] ?? HUNTER.name;
  hp.color = HUNTER_PACK.colors[k] ?? HUNTER_COLOR;
  hp.isAI = true;
  hp.lives = MATCH.hunterLives;
  hp.hunter = {
    level: 1,
    xp: 0,
    soulfire: 0,
    totalSoulfire: 0,
    items: { claws: 0, hide: 0, striders: 0, heart: 0, horn: 0 },
    lives: MATCH.hunterLives,
    awake: false,
    scentTimer: MATCH.scentInterval,
    scentActive: 0,
    towerDamageTaken: 0,
    siegeTime: 0,
    chaseFails: 0,
    kills: 0,
    buildingsDestroyed: 0,
    unitsSlain: 0,
    skillCd: { pounce: 0, roar: 0, rend: 0 },
    rendHits: 0,
    evolved: false,
  };
  return hp;
}

function makePlayer(id: number, faction: 'survivor' | 'hunter'): Player {
  return {
    id,
    name: '',
    faction,
    isHuman: false,
    isAI: true,
    color: '#fff',
    amber: faction === 'survivor' ? MATCH.startAmber : 0,
    totalEarned: 0,
    lives: MATCH.survivorLives,
    unitId: 0,
    respawnTimer: 0,
    labLevel: 0,
    strategy: 'balanced',
    deaths: 0,
    sheltersBuilt: 0,
    stats: { incomeSamples: [], hunterDamage: 0, armyTrained: 0 },
  };
}

export function emit(world: World, ev: GameEvent): void {
  world.events.push(ev);
}

export function msg(world: World, player: number, text: string, tone: 'info' | 'warn' | 'bad' | 'good' = 'info'): void {
  emit(world, { e: 'msg', text, player, tone });
}

export function spawnUnit(world: World, utype: UnitType, owner: number, x: number, y: number, elite = false): Unit {
  const u: Unit = {
    id: world.nextId++,
    kind: 'unit',
    utype,
    owner,
    x,
    y,
    px: x,
    py: y,
    hp: 1,
    radius: utype === 'hunter' ? HUNTER.radius : isArmy(utype) ? ARMY[utype].radius : SURVIVOR.radius,
    facing: Math.PI / 2,
    alive: true,
    orders: [],
    path: [],
    pathIdx: 0,
    pathGoalKey: '',
    repathTimer: 0,
    stuckTimer: 0,
    stuckRef: { x, y },
    stuckFails: 0,
    attackCd: 0,
    attackAnim: 0,
    workAnim: 0,
    moving: false,
    slowTimer: 0,
    slowAmount: 0,
    lastHitBy: -1,
    status: freshStatus(),
    elite,
  };
  world.units.set(u.id, u);
  u.hp = unitStats(world, u).maxHp;
  return u;
}

export interface UnitStats {
  maxHp: number;
  dmg: number;
  armor: number;
  speed: number;
  regen: number;
  cooldown: number;
  range: number; // px
  vision: number; // tiles
  siege: number;
}

export function hunterBonus(world: World, owner: number): { dmg: number; armor: number; speed: number; hp: number; regen: number; siege: number } {
  const h = hunterState(world, owner);
  const b = { dmg: 0, armor: 0, speed: 0, hp: 0, regen: 0, siege: HUNTER.buildingDmgMult };
  for (const slot of ITEM_SLOTS) {
    const tier = h.items[slot];
    if (!tier) continue;
    const t = ITEMS[slot].tiers[tier - 1];
    b.dmg += t.dmg ?? 0;
    b.armor += t.armor ?? 0;
    b.speed += t.speed ?? 0;
    b.hp += t.hp ?? 0;
    b.regen += t.regen ?? 0;
    if (t.siege) b.siege = t.siege;
  }
  return b;
}

export function unitStats(world: World, u: Pick<Unit, 'utype' | 'elite' | 'owner'>): UnitStats {
  if (isArmy(u.utype)) {
    const a = ARMY[u.utype];
    const m = u.elite ? ARMY_RULES.eliteMult : 1;
    return { maxHp: a.hp * m, dmg: a.dmg * m, armor: a.armor + (u.elite ? 2 : 0), speed: a.speed, regen: 1, cooldown: a.cooldown, range: a.range * TILE, vision: 8, siege: 1 };
  }
  if (u.utype === 'survivor') {
    return {
      maxHp: SURVIVOR.hp,
      dmg: SURVIVOR.dmg,
      armor: SURVIVOR.armor,
      speed: SURVIVOR.speed,
      regen: SURVIVOR.regen,
      cooldown: SURVIVOR.cooldown,
      range: SURVIVOR.range * TILE,
      vision: SURVIVOR.vision,
      siege: 1,
    };
  }
  const h = hunterState(world, u.owner);
  const b = hunterBonus(world, u.owner);
  const lv = h.level - 1;
  const evo = h.evolved;
  const rage = world.bloodMoon ? BLOOD_MOON.dmgMult : 1;
  return {
    maxHp: (HUNTER.hp + HUNTER.hpPerLevel * lv + b.hp) * (evo ? EVOLUTION.hpMult : 1) * HUNTER_PACK.hpMult,
    dmg: (HUNTER.dmg + HUNTER.dmgPerLevel * lv + b.dmg) * rage * HUNTER_PACK.dmgMult,
    armor: HUNTER.armor + Math.floor(lv / 3) + b.armor,
    speed: HUNTER.speed + b.speed + (evo ? EVOLUTION.speed : 0),
    regen: HUNTER.regen + b.regen + lv * 0.3,
    cooldown: HUNTER.cooldown,
    range: HUNTER.range * TILE,
    vision: HUNTER.vision,
    siege: b.siege + (evo ? EVOLUTION.siegeBonus : 0),
  };
}

export function getEntity(world: World, id: number): Entity | undefined {
  return world.units.get(id) ?? world.buildings.get(id);
}

export function buildingCenter(b: Building): Point {
  return { x: (b.tx + b.size / 2) * TILE, y: (b.ty + b.size / 2) * TILE };
}

export function entityPos(e: Entity): Point {
  return e.kind === 'unit' ? { x: e.x, y: e.y } : buildingCenter(e);
}

/** Distance from point to the edge of a building footprint (px). */
export function distToBuilding(x: number, y: number, b: Building): number {
  const x0 = b.tx * TILE;
  const y0 = b.ty * TILE;
  const x1 = x0 + b.size * TILE;
  const y1 = y0 + b.size * TILE;
  const dx = x < x0 ? x0 - x : x > x1 ? x - x1 : 0;
  const dy = y < y0 ? y0 - y : y > y1 ? y - y1 : 0;
  return Math.hypot(dx, dy);
}

export function distToEntity(x: number, y: number, e: Entity): number {
  return e.kind === 'unit' ? Math.max(0, Math.hypot(e.x - x, e.y - y) - e.radius) : distToBuilding(x, y, e);
}

export function hunterState(world: World, owner: number): HunterState {
  const h = world.players[owner]?.hunter;
  if (!h) throw new Error(`player ${owner} is not a hunter`);
  return h;
}

export function hunterPlayers(world: World): Player[] {
  return world.hunterPlayerIds.map((id) => world.players[id]);
}

/** The living body of one hunter player, if it is on the map. */
export function hunterUnitOf(world: World, owner: number): Unit | undefined {
  const u = world.units.get(world.players[owner].unitId);
  return u && u.alive && u.utype === 'hunter' ? u : undefined;
}

/** All hunters currently on the map. */
export function hunterUnits(world: World): Unit[] {
  const out: Unit[] = [];
  for (const id of world.hunterPlayerIds) {
    const u = hunterUnitOf(world, id);
    if (u) out.push(u);
  }
  return out;
}

/** Closest living hunter to a point, optionally filtered (e.g. only visible ones). */
export function nearestHunter(world: World, x: number, y: number, ok: (u: Unit) => boolean = () => true): Unit | undefined {
  let best: Unit | undefined;
  let bd = Infinity;
  for (const u of hunterUnits(world)) {
    if (!ok(u)) continue;
    const d = Math.hypot(u.x - x, u.y - y);
    if (d < bd) {
      bd = d;
      best = u;
    }
  }
  return best;
}

/** Hunter player credited for a kill: the attacker when it is a hunter, else the nearest hunter. */
export function creditedHunter(world: World, attackerId: number, x: number, y: number): number {
  const a = world.units.get(attackerId);
  if (a && a.utype === 'hunter') return a.owner;
  const n = nearestHunter(world, x, y);
  return n ? n.owner : world.hunterPlayerIds[0];
}

export function survivorPlayers(world: World): Player[] {
  return world.players.filter((p) => p.faction === 'survivor');
}

export function countBuildings(world: World, owner: number, btype: BuildingType): number {
  let n = 0;
  for (const b of world.buildings.values()) if (b.owner === owner && b.btype === btype) n++;
  return n;
}

export function playerBuildings(world: World, owner: number): Building[] {
  const out: Building[] = [];
  for (const b of world.buildings.values()) if (b.owner === owner) out.push(b);
  return out;
}

/** Raw income before the snowball soft cap. */
export function playerRawIncome(world: World, owner: number): number {
  let inc = 0;
  for (const b of world.buildings.values()) {
    if (b.owner !== owner || b.constructing) continue;
    inc += BUILDINGS[b.btype].levels[b.level].income ?? 0;
  }
  return inc;
}

/** Effective income after the soft cap (what the player actually receives). */
export function playerIncome(world: World, owner: number): number {
  return effectiveIncome(playerRawIncome(world, owner));
}

export function armyCap(world: World, owner: number): number {
  for (const b of world.buildings.values()) if (b.owner === owner && b.btype === 'barracks' && !b.constructing && b.level >= 1) return ARMY_RULES.popCapElite;
  return ARMY_RULES.popCap;
}

export function armyCount(world: World, owner: number): number {
  let n = 0;
  for (const u of world.units.values()) if (u.alive && u.owner === owner && isArmy(u.utype)) n++;
  for (const b of world.buildings.values()) if (b.owner === owner && b.train) n += b.train.queue.length;
  return n;
}

// ---------- rules (shared by sim validation and UI pre-checks) ----------

export function buildCost(world: World, player: Player, btype: BuildingType): number {
  if (btype === 'shelter') return player.sheltersBuilt === 0 ? 0 : SURVIVOR.shelterRebuildCost;
  return BUILDINGS[btype].levels[0].cost;
}

export function checkBuild(world: World, player: Player, btype: BuildingType): string | null {
  const def = BUILDINGS[btype];
  const lv0 = def.levels[0];
  if (btype === 'altar' && world.time < PHASES.altarUnlockAt) return `破晓祭坛 ${PHASES.altarUnlockAt / 60}:00 后才能建造`;
  if (lv0.reqLab && player.labLevel < lv0.reqLab) return `需要秘藏书阁 ${lv0.reqLab} 级`;
  if (def.maxCount !== undefined && countBuildings(world, player.id, btype) >= def.maxCount) return `${def.name}已达上限 (${def.maxCount})`;
  if (player.amber < buildCost(world, player, btype)) return '琥珀不足';
  return null;
}

export function canPlace(world: World, btype: BuildingType, tx: number, ty: number): boolean {
  const size = BUILDINGS[btype].size;
  const g = world.grid;
  for (let y = ty; y < ty + size; y++) for (let x = tx; x < tx + size; x++) if (!g.buildable(x, y)) return false;
  for (const h of hunterUnits(world)) {
    const x0 = tx * TILE - h.radius;
    const y0 = ty * TILE - h.radius;
    if (h.x > x0 && h.x < x0 + size * TILE + h.radius * 2 && h.y > y0 && h.y < y0 + size * TILE + h.radius * 2) return false;
  }
  return true;
}

export function checkUpgrade(world: World, player: Player, b: Building): string | null {
  const def = BUILDINGS[b.btype];
  if (b.constructing) return '建造中';
  if (b.upgrading) return '升级中';
  const next = def.levels[b.level + 1];
  if (!next) return '已达最高等级';
  if (next.reqLab && player.labLevel < next.reqLab) return `需要秘藏书阁 ${next.reqLab} 级`;
  if (player.amber < next.cost) return '琥珀不足';
  return null;
}

export function recomputeLab(world: World, owner: number): void {
  const p = world.players[owner];
  let lv = 0;
  for (const b of world.buildings.values())
    if (b.owner === owner && b.btype === 'lab' && !b.constructing) lv = Math.max(lv, b.level + 1);
  p.labLevel = lv;
}

export function placeBuilding(world: World, owner: number, btype: BuildingType, tx: number, ty: number): Building {
  const def = BUILDINGS[btype];
  const lv = def.levels[0];
  const b: Building = {
    id: world.nextId++,
    kind: 'building',
    btype,
    owner,
    tx,
    ty,
    size: def.size,
    level: 0,
    hp: Math.max(1, lv.hp * 0.1),
    maxHp: lv.hp,
    constructing: true,
    progress: 0,
    upgrading: null,
    attackCd: 0,
    aim: -Math.PI / 2,
    alive: true,
    lastDamaged: -99,
    fireAnim: 0,
    acc: 0,
    lastAlert: -99,
    hits: 0,
    silenceT: 0,
    train: btype === 'barracks' ? { queue: [], t: 0 } : null,
    rally: null,
    charge: 0,
  };
  world.buildings.set(b.id, b);
  if (btype === 'altar') world.hunterKnown.add(b.id); // the altar's light can be seen from afar
  world.grid.setOcc(tx, ty, def.size, b.id, btype === 'gate');
  if (btype === 'shelter') world.players[owner].sheltersBuilt++;
  // push friendly units out of the footprint
  for (const u of world.units.values()) {
    if (!u.alive) continue;
    if (distToBuilding(u.x, u.y, b) > 0) continue;
    const faction = factionOf(u.utype);
    const t = nearestPassable(world.grid, Math.floor(u.x / TILE), Math.floor(u.y / TILE), faction, 6);
    if (t) {
      u.x = tileCenter(t.x);
      u.y = tileCenter(t.y);
      u.px = u.x;
      u.py = u.y;
      u.pathGoalKey = '';
    }
  }
  return b;
}

export function finishConstruction(world: World, b: Building): void {
  b.constructing = false;
  b.progress = 1;
  b.hp = Math.min(b.maxHp, Math.max(b.hp, b.maxHp * 0.999));
  b.hp = b.maxHp;
  const c = buildingCenter(b);
  emit(world, { e: 'built', x: c.x, y: c.y, btype: b.btype, owner: b.owner });
  if (b.btype === 'lab') recomputeLab(world, b.owner);
}

export function removeBuilding(world: World, b: Building): void {
  b.alive = false;
  world.buildings.delete(b.id);
  world.grid.setOcc(b.tx, b.ty, b.size, 0, false);
  world.hunterKnown.delete(b.id);
  if (b.btype === 'lab') recomputeLab(world, b.owner);
}

// ---------- hunter progression (per hunter of the pack) ----------

export function addHunterXp(world: World, owner: number, amount: number): void {
  const h = hunterState(world, owner);
  if (h.level >= HUNTER.maxLevel) return;
  h.xp += amount;
  for (;;) {
    const need = HUNTER.xpBase + HUNTER.xpPerLevel * h.level;
    if (h.xp < need || h.level >= HUNTER.maxLevel) break;
    h.xp -= need;
    const u = hunterUnitOf(world, owner);
    const before = u ? unitStats(world, u).maxHp : 0;
    h.level++;
    if (u) {
      const after = unitStats(world, u).maxHp;
      u.hp += after - before;
      emit(world, { e: 'levelup', x: u.x, y: u.y, id: u.id });
    }
    if (h.level >= EVOLUTION.level && !h.evolved) evolveHunter(world, owner);
  }
}

/** Ultimate evolution into the Elder form: bigger, tougher, cleaving melee. */
export function evolveHunter(world: World, owner: number): void {
  const h = hunterState(world, owner);
  if (h.evolved) return;
  const u = hunterUnitOf(world, owner);
  const before = u ? unitStats(world, u).maxHp : 0;
  h.evolved = true;
  if (u) {
    u.radius = EVOLUTION.radius;
    u.hp += unitStats(world, u).maxHp - before;
    emit(world, { e: 'evolve', x: u.x, y: u.y });
  }
  emit(world, { e: 'banner', text: `${world.players[owner].name}进化为【${EVOLUTION.name}】`, sub: '体型暴涨 · 横扫攻击 · 攻城强化 —— 散开阵型，冻结它！', tone: 'bad' });
}

export function addSoulfire(world: World, owner: number, amount: number): void {
  const h = hunterState(world, owner);
  h.soulfire += amount;
  h.totalSoulfire += amount;
}

// ---------- damage ----------

export interface DamageOpts {
  armorPierce?: number; // fraction of target armor ignored
  ignoreArmor?: boolean;
  noReflect?: boolean;
}

/** Damage-taken multiplier from statuses (hunter marks, frozen shatter). */
export function statusAmp(u: Unit): number {
  const s = u.status;
  let m = 1;
  if (s.markT > 0) m *= 1 + s.markStacks * s.markPer;
  if (s.rootT > 0) m *= 1 + s.shatter;
  return m;
}

export function damageEntity(world: World, target: Entity, raw: number, attacker: Entity | null, source: DamageSource, opts: DamageOpts = {}): number {
  if (!target.alive) return 0;
  const hunterAttacker = attacker?.kind === 'unit' && attacker.utype === 'hunter' ? attacker : null;
  if (target.kind === 'unit') {
    const st = unitStats(world, target);
    const armor = opts.ignoreArmor ? 0 : st.armor * (1 - (opts.armorPierce ?? 0));
    const dmg = raw * armorMultiplier(armor) * statusAmp(target);
    target.hp -= dmg;
    if (attacker) target.lastHitBy = attacker.id;
    if (target.utype === 'hunter') {
      const hs = hunterState(world, target.owner);
      if (attacker?.kind === 'building') hs.towerDamageTaken += dmg;
      if (attacker) world.players[attacker.owner].stats.hunterDamage += dmg;
    }
    emit(world, { e: 'hit', id: target.id, x: target.x, y: target.y, dmg, onBuilding: false, source });
    if (target.hp <= 0) killUnit(world, target);
    return dmg;
  }
  const lv = BUILDINGS[target.btype].levels[target.level];
  const st = attacker?.kind === 'unit' ? unitStats(world, attacker) : null;
  let mult = hunterAttacker && st ? st.siege : 1;
  let armor = lv.armor;
  if (hunterAttacker && source === 'melee') {
    const hs = hunterState(world, hunterAttacker.owner);
    if (hs.rendHits > 0) {
      hs.rendHits--;
      mult *= 2;
      armor = 0;
    }
  }
  if (opts.ignoreArmor) armor = 0;
  const dmg = raw * mult * armorMultiplier(armor);
  const applied = Math.min(dmg, target.hp);
  target.hp -= dmg;
  target.lastDamaged = world.time;
  const c = buildingCenter(target);
  emit(world, { e: 'hit', id: target.id, x: c.x, y: c.y, dmg, onBuilding: true, source });
  if (hunterAttacker) addSoulfire(world, hunterAttacker.owner, applied * HUNTER.soulfirePerDamage * (SOULFIRE_HIT_MULT[target.btype] ?? 1));
  // thorns: walls reflect part of melee damage back to the hunter
  const perk = perkAt(target.btype, target.level);
  if (perk?.thorns && hunterAttacker && source === 'melee' && !opts.noReflect)
    damageEntity(world, hunterAttacker, dmg * perk.thorns, target, 'thorns', { ignoreArmor: true, noReflect: true });
  if (world.time - target.lastAlert > 6) {
    target.lastAlert = world.time;
    emit(world, { e: 'alert', x: c.x, y: c.y, player: target.owner });
  }
  if (target.hp <= 0) destroyBuilding(world, target, hunterAttacker ? hunterAttacker.owner : -1);
  return dmg;
}

/** Hunter melee swing, including the evolved form's cleave. */
export function hunterStrike(world: World, h: Unit, target: Entity): void {
  const st = unitStats(world, h);
  const hs = hunterState(world, h.owner);
  damageEntity(world, target, st.dmg, h, 'melee');
  if (!hs.evolved) return;
  const p = target.kind === 'unit' ? { x: target.x, y: target.y } : buildingCenter(target);
  const r = EVOLUTION.cleaveRadius * TILE;
  for (const u of [...world.units.values()]) {
    if (!u.alive || u.id === target.id || factionOf(u.utype) !== 'survivor') continue;
    if (Math.hypot(u.x - p.x, u.y - p.y) <= r + u.radius) damageEntity(world, u, st.dmg * EVOLUTION.cleaveRatio, h, 'cleave');
  }
}

/** @param byHunter player id of the hunter that broke it, or -1 */
export function destroyBuilding(world: World, b: Building, byHunter: number): void {
  const c = buildingCenter(b);
  const value = b.constructing ? BUILDINGS[b.btype].levels[0].cost * b.progress : investedValue(b.btype, b.level);
  removeBuilding(world, b);
  emit(world, { e: 'destroyed', x: c.x, y: c.y, btype: b.btype, size: b.size, owner: b.owner });
  if (byHunter >= 0) {
    const h = hunterState(world, byHunter);
    h.buildingsDestroyed++;
    addSoulfire(world, byHunter, value * HUNTER.destroyBountyRatio);
    addHunterXp(world, byHunter, 10 + value * HUNTER.destroyXpRatio);
  }
  if (b.btype === 'shelter') msg(world, b.owner, '你的庇护所被摧毁了！可在别处重建。', 'bad');
  if (b.btype === 'altar') emit(world, { e: 'banner', text: '破晓祭坛崩塌', sub: '黎明之光熄灭了……', tone: 'bad' });
}

/** Message every player of the given faction. */
export function tell(world: World, faction: 'survivor' | 'hunter', text: string, tone: 'info' | 'warn' | 'bad' | 'good'): void {
  for (const p of world.players) if (p.faction === faction) msg(world, p.id, text, tone);
}

export function killUnit(world: World, u: Unit): void {
  u.alive = false;
  u.hp = 0;
  u.orders = [];
  u.path = [];
  emit(world, { e: 'death', x: u.x, y: u.y, utype: u.utype, owner: u.owner });
  const p = world.players[u.owner];
  if (u.utype === 'hunter') {
    const h = hunterState(world, u.owner);
    h.lives = world.bloodMoon ? 0 : h.lives - 1;
    p.lives = h.lives;
    p.respawnTimer = MATCH.hunterRespawn;
    const left = hunterPlayers(world).filter((hp) => hp.lives > 0).length;
    if (h.lives > 0) tell(world, 'survivor', `${p.name}被击倒！它将在巢穴重生 (剩余 ${h.lives} 次)`, 'good');
    tell(world, 'hunter', h.lives > 0 ? `${p.name}倒下了，${MATCH.hunterRespawn} 秒后在巢穴重生` : `${p.name}彻底消散了`, 'bad');
    emit(world, {
      e: 'banner',
      text: h.lives > 0 ? `${p.name}倒下了！` : `${p.name}彻底消散`,
      sub: h.lives > 0 ? `它将在巢穴重生（剩余 ${h.lives} 次）` : left > 0 ? `还剩 ${left} 只噬林魔` : '烬林迎来解放',
      tone: 'good',
    });
    return;
  }
  const killer = creditedHunter(world, u.lastHitBy, u.x, u.y);
  const h = hunterState(world, killer);
  if (isArmy(u.utype)) {
    h.unitsSlain++;
    addSoulfire(world, killer, ARMY_RULES.killSoulfire);
    addHunterXp(world, killer, ARMY_RULES.killXp);
    return;
  }
  // a warden fell
  p.lives = world.bloodMoon ? 0 : p.lives - 1;
  p.deaths++;
  p.respawnTimer = MATCH.survivorRespawn;
  h.kills++;
  addSoulfire(world, killer, HUNTER.killSoulfire + HUNTER.killSoulfirePerLevel * h.level);
  addHunterXp(world, killer, HUNTER.killXp);
  tell(world, 'survivor', p.lives > 0 ? `${p.name} 被${world.players[killer].name}撕碎了！(${MATCH.survivorRespawn}秒后复活，剩余生命 ${p.lives})` : `${p.name} 永远倒下了……`, 'bad');
  tell(world, 'hunter', `${world.players[killer].name}猎杀了 ${p.name}`, 'good');
}
