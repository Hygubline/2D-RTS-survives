import { DT, HUNTER, HUNTER_PACK, MATCH, SURVIVOR, TILE } from '../config/balance';
import { BLOOD_MOON, EVOLUTION, PHASES, ALTAR } from '../config/lategame';
import { tickSkills } from './hunterSkills';
import { runHunterAI } from './ai/hunter';
import { runSurvivorAI } from './ai/survivor';
import { updateBuildings, updateProjectiles } from './buildings';
import { applyCommands } from './commands';
import { tileCenter } from './grid';
import { nearestPassable } from './pathfinding';
import type { EndReason, World } from './types';
import { updateUnits } from './units';
import { updateVision } from './vision';
import { addHunterXp, addSoulfire, buildingCenter, emit, evolveHunter, hunterPlayers, hunterState, hunterUnitOf, msg, nearestHunter, playerIncome, spawnUnit, survivorPlayers, tell, unitStats } from './world';
import type { Player } from './types';

function broadcast(world: World, text: string, tone: 'info' | 'warn' | 'bad' | 'good'): void {
  for (const p of survivorPlayers(world)) msg(world, p.id, text, tone);
}

function spawnHunter(world: World, hp: Player): void {
  // the pack spawns side by side at the lair
  const k = world.hunterPlayerIds.indexOf(hp.id);
  const off = (k - (HUNTER_PACK.count - 1) / 2) * HUNTER_PACK.spawnSpread;
  const t = nearestPassable(world.grid, Math.round(world.lair.x + off), world.lair.y, 'hunter', 12) ?? world.lair;
  const u = spawnUnit(world, 'hunter', hp.id, tileCenter(t.x), tileCenter(t.y));
  if (hp.hunter!.evolved) u.radius = EVOLUTION.radius;
  hp.unitId = u.id;
}

function once(world: World, key: string, fn: () => void): void {
  if (world.announced.has(key)) return;
  world.announced.add(key);
  fn();
}

/** Match arc: altar unlock, Blood Moon final showdown. */
function updatePhases(world: World): void {
  const t = world.time;
  if (t >= PHASES.midAt) once(world, 'mid', () => broadcast(world, '夜色渐深——噬林魔越来越强，升级经济与防线吧。', 'info'));
  if (t >= PHASES.lateAt) once(world, 'late', () => emit(world, { e: 'banner', text: '深夜', sub: '书阁2级解锁兵营：招募林卫与游侠，转守为攻', tone: 'good' }));
  if (t >= PHASES.altarWarnAt) once(world, 'altarWarn', () => broadcast(world, '30 秒后可建造破晓祭坛（书阁3级）。', 'warn'));
  if (t >= PHASES.altarUnlockAt) once(world, 'altar', () => emit(world, { e: 'banner', text: '破晓祭坛已可建造', sub: `建成并守住 ${ALTAR.charge} 秒，即可终结噬林魔`, tone: 'epic' }));
  if (t >= PHASES.bloodMoonWarnAt) once(world, 'moonWarn', () => broadcast(world, '血月将在 1 分钟后升起：届时任何一方都无法再复活！', 'bad'));
  if (t >= PHASES.bloodMoonAt && !world.bloodMoon)
    once(world, 'moon', () => {
      world.bloodMoon = true;
      for (const hp of hunterPlayers(world)) evolveHunter(world, hp.id);
      emit(world, { e: 'banner', text: '血月升起 · 最终决战', sub: '双方不再复活 · 噬林魔狂暴并看见所有守夜人', tone: 'bad' });
    });
}

function updateHunter(world: World, hp: Player, wardenIncome: number): void {
  const h = hp.hunter!;
  if (!h.awake) {
    if (world.time < MATCH.hunterGrace) return;
    h.awake = true;
    spawnHunter(world, hp);
    if (hp.id === world.hunterPlayerIds[0]) tell(world, 'survivor', '噬林魔群从西北巢穴苏醒了！', 'bad');
    msg(world, hp.id, '你苏醒了。撕开他们的墙，猎杀守夜人！', 'good');
    return;
  }
  const hu = hunterUnitOf(world, hp.id);
  if (!hu) {
    if (h.lives <= 0 || (world.bloodMoon && BLOOD_MOON.noRespawn)) return;
    hp.respawnTimer -= DT;
    if (hp.respawnTimer > 0) return;
    spawnHunter(world, hp);
    tell(world, 'survivor', `${hp.name}在巢穴重生了！`, 'warn');
    // a cornered beast: the final life returns in its evolved form
    if (h.lives === 1) evolveHunter(world, hp.id);
    return;
  }
  const share = HUNTER_PACK.incomeShare;
  const mult = 1 + HUNTER.soulfireGrowth * world.time;
  addSoulfire(world, hp.id, (HUNTER.passiveSoulfire * mult + wardenIncome * HUNTER.titheRatio) * share * DT);
  addHunterXp(world, hp.id, HUNTER.passiveXp * share * DT);
  const st = unitStats(world, hu);
  if (Math.hypot(hu.x - tileCenter(world.lair.x), hu.y - tileCenter(world.lair.y)) < HUNTER.lairRadius * TILE)
    hu.hp = Math.min(st.maxHp, hu.hp + HUNTER.lairRegen * HUNTER_PACK.hpMult * DT);
  h.scentTimer -= DT;
  if (h.scentActive > 0) h.scentActive -= DT;
  if (world.bloodMoon && BLOOD_MOON.revealAll) h.scentActive = 1;
  if (h.scentTimer <= 0) {
    h.scentTimer = MATCH.scentInterval;
    h.scentActive = MATCH.scentDuration;
    if (hp.id === world.hunterPlayerIds[0]) tell(world, 'survivor', '噬林魔嗅到了所有守夜人的气息！', 'warn');
    msg(world, hp.id, '你嗅到了所有守夜人的气息（' + MATCH.scentDuration + ' 秒）', 'good');
  }
}

function updateLifecycle(world: World): void {
  let wardenIncome = 0;
  for (const sp of survivorPlayers(world)) wardenIncome += playerIncome(world, sp.id);
  for (const hp of hunterPlayers(world)) updateHunter(world, hp, wardenIncome);

  for (const p of survivorPlayers(world)) {
    const u = world.units.get(p.unitId);
    if (u && u.alive) continue;
    if (p.lives <= 0) continue;
    if (world.bloodMoon && BLOOD_MOON.noRespawn) {
      p.lives = 0;
      continue;
    }
    p.respawnTimer -= DT;
    if (p.respawnTimer > 0) continue;
    let sx = world.plaza.x;
    let sy = world.plaza.y;
    for (const b of world.buildings.values())
      if (b.owner === p.id && b.btype === 'shelter' && !b.constructing) {
        const c = buildingCenter(b);
        sx = Math.floor(c.x / TILE);
        sy = Math.floor(c.y / TILE);
      }
    const hu = nearestHunter(world, tileCenter(sx), tileCenter(sy));
    if (hu && Math.hypot(hu.x / TILE - sx, hu.y / TILE - sy) < SURVIVOR.safeRespawnDist) {
      // shelter under attack: respawn at the safest known spot (farthest from the hunter)
      const options = [world.plaza, ...world.groves.map((g) => ({ x: g.cx, y: g.cy }))];
      let best = options[0];
      for (const o of options) if (Math.hypot(hu.x / TILE - o.x, hu.y / TILE - o.y) > Math.hypot(hu.x / TILE - best.x, hu.y / TILE - best.y)) best = o;
      sx = best.x;
      sy = best.y;
    }
    const t = nearestPassable(world.grid, sx, sy, 'survivor', 10) ?? world.plaza;
    const nu = spawnUnit(world, 'survivor', p.id, tileCenter(t.x), tileCenter(t.y));
    p.unitId = nu.id;
    msg(world, p.id, '你已复活。', 'good');
  }
}

function checkWin(world: World): void {
  if (world.winner) return;
  let winner: 'survivor' | 'hunter' | null = null;
  let reason: EndReason = 'dawn';
  // the wardens win once every hunter of the pack is out for good
  const hunterGone = hunterPlayers(world).every((hp) => hp.hunter!.lives <= 0 || (world.bloodMoon && hp.hunter!.awake && !hunterUnitOf(world, hp.id)));
  if (hunterGone) {
    winner = 'survivor';
    reason = 'hunterSlain';
  } else if (world.time >= MATCH.surviveSeconds) winner = 'survivor';
  else {
    const anyAlive = survivorPlayers(world).some((p) => p.lives > 0 || world.units.get(p.unitId)?.alive);
    if (!anyAlive) {
      winner = 'hunter';
      reason = 'wardensFell';
    }
  }
  if (winner) {
    world.winner = winner;
    world.endReason = reason;
    emit(world, { e: 'gameover', winner, reason });
  }
}

export interface StepOptions {
  ai: boolean;
}

export function stepWorld(world: World, opts: StepOptions = { ai: true }): void {
  if (world.winner) return;
  applyCommands(world);
  world.time += DT;
  world.tick++;
  updatePhases(world);
  updateLifecycle(world);
  tickSkills(world);
  if (opts.ai) {
    runHunterAI(world);
    runSurvivorAI(world);
  }
  updateUnits(world);
  updateBuildings(world);
  updateProjectiles(world);
  world.visionTimer -= DT;
  if (world.visionTimer <= 0) {
    world.visionTimer = 0.25;
    updateVision(world);
  }
  for (const [id, u] of world.units) if (!u.alive) world.units.delete(id);
  if (world.tick % (5 * 20) === 0)
    for (const p of survivorPlayers(world)) p.stats.incomeSamples.push(Math.round(p.totalEarned));
  checkWin(world);
}
