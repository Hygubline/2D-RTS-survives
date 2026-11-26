import { BUILDINGS, DT, investedValue, SURVIVOR, TILE } from '../config/balance';
import { tileCenter, tileOf } from './grid';
import { findPath, nearestPassable, passCost, smoothPath, walkableLine, type TileRect } from './pathfinding';
import { ARMY_RULES } from '../config/lategame';
import { factionOf, isArmy, type Building, type Faction, type Order, type Unit, type World } from './types';
import { visibleToSurvivors } from './vision';
import {
  buildCost,
  canPlace,
  checkBuild,
  damageEntity,
  distToBuilding,
  distToEntity,
  finishConstruction,
  getEntity,
  hunterState,
  hunterStrike,
  nearestHunter,
  msg,
  placeBuilding,
  playerIncome,
  unitStats,
} from './world';

function faction(u: Unit): Faction {
  return factionOf(u.utype);
}

/** Ensure the unit has a path to the goal rect. Recomputes on goal change / stuck / timer. */
function ensurePath(world: World, u: Unit, goal: TileRect, key: string, force = false): void {
  u.repathTimer -= DT;
  if (!force && u.pathGoalKey === key && u.repathTimer > 0) return;
  u.pathGoalKey = key;
  u.repathTimer = 1.5;
  const sx = tileOf(u.x);
  const sy = tileOf(u.y);
  const res = findPath(world.grid, sx, sy, goal, passCost(world.grid, faction(u)));
  const pts = smoothPath(world.grid, { x: u.x, y: u.y }, res.tiles.slice(1), u.radius * 0.8, faction(u));
  u.path = pts;
  u.pathIdx = 0;
}

function clearPath(u: Unit): void {
  u.path = [];
  u.pathIdx = 0;
  u.moving = false;
}

function rectAround(b: Building, pad: number): TileRect {
  return { x0: b.tx - pad, y0: b.ty - pad, x1: b.tx + b.size - 1 + pad, y1: b.ty + b.size - 1 + pad };
}

function completeOrder(u: Unit): void {
  u.orders.shift();
  u.pathGoalKey = '';
  clearPath(u);
}

function doMove(world: World, u: Unit, o: Extract<Order, { type: 'move' }>): void {
  const tx = Math.max(0, Math.min(world.grid.w - 1, tileOf(o.x)));
  const ty = Math.max(0, Math.min(world.grid.h - 1, tileOf(o.y)));
  ensurePath(world, u, { x0: tx, y0: ty, x1: tx, y1: ty }, `m${o.x | 0},${o.y | 0}`);
  // replace final waypoint with the exact click point when it is walkable
  if (u.path.length && world.grid.passable(tx, ty, faction(u))) {
    const last = u.path[u.path.length - 1];
    if (tileOf(last.x) === tx && tileOf(last.y) === ty) {
      last.x = o.x;
      last.y = o.y;
    }
  }
  if (u.path.length === 0 && world.grid.passable(tx, ty, faction(u)) && Math.hypot(o.x - u.x, o.y - u.y) > 2 && walkableLine(world.grid, u.x, u.y, o.x, o.y, u.radius * 0.8, faction(u))) {
    u.path = [{ x: o.x, y: o.y }];
    u.pathIdx = 0;
  }
  if (u.pathIdx >= u.path.length) completeOrder(u);
}

/** Survivor-side units engage a visible hunter within aggro range. */
function acquireHunter(world: World, u: Unit): boolean {
  const h = nearestHunter(world, u.x, u.y, (c: Unit) => visibleToSurvivors(world, c.x, c.y));
  if (!h) return false;
  if (Math.hypot(h.x - u.x, h.y - u.y) > ARMY_RULES.aggroRange * TILE) return false;
  u.orders.unshift({ type: 'attack', targetId: h.id });
  u.pathGoalKey = '';
  return true;
}

function doAttackMove(world: World, u: Unit, o: Extract<Order, { type: 'attackMove' }>): void {
  if (acquireHunter(world, u)) return;
  doMove(world, u, { type: 'move', x: o.x, y: o.y });
}

function doAttack(world: World, u: Unit, o: Extract<Order, { type: 'attack' }>): void {
  const t = getEntity(world, o.targetId);
  if (!t || !t.alive || t.owner === u.owner) return completeOrder(u);
  if (t.kind === 'unit' && factionOf(t.utype) === faction(u)) return completeOrder(u);
  if (t.kind === 'building' && faction(u) === 'survivor') return completeOrder(u);
  const st = unitStats(world, u);
  const d = distToEntity(u.x, u.y, t) - u.radius;
  if (d <= st.range) {
    clearPath(u);
    const tp = t.kind === 'unit' ? { x: t.x, y: t.y } : { x: (t.tx + t.size / 2) * TILE, y: (t.ty + t.size / 2) * TILE };
    u.facing = Math.atan2(tp.y - u.y, tp.x - u.x);
    if (u.attackCd <= 0) {
      u.attackCd = st.cooldown;
      u.attackAnim = 0.35;
      if (u.utype === 'hunter') {
        const evolved = hunterState(world, u.owner).evolved;
        world.events.push({ e: 'swing', x: u.x, y: u.y, angle: u.facing, big: evolved });
        hunterStrike(world, u, t);
      } else if (u.utype === 'guard') {
        world.events.push({ e: 'swing', x: u.x, y: u.y, angle: u.facing, big: false });
        damageEntity(world, t, st.dmg, u, 'melee');
      } else {
        const ptype = u.utype === 'ranger' ? 'arrow' : 'stone';
        world.projectiles.push({
          id: world.nextId++,
          ptype,
          variant: '',
          owner: u.owner,
          x: u.x,
          y: u.y - 6,
          px: u.x,
          py: u.y - 6,
          targetId: t.id,
          tx: tp.x,
          ty: tp.y,
          speed: ptype === 'arrow' ? 560 : 420,
          dmg: st.dmg,
          slow: 0,
          slowTime: 0,
          splash: 0,
          sourceId: u.id,
        });
        world.events.push({ e: 'shoot', x: u.x, y: u.y, ptype, variant: '' });
      }
    }
    return;
  }
  if (t.kind === 'unit') {
    const tx = tileOf(t.x);
    const ty = tileOf(t.y);
    ensurePath(world, u, { x0: tx, y0: ty, x1: tx, y1: ty }, `a${t.id}:${tx},${ty}`);
    if (u.pathIdx >= u.path.length) {
      // path exhausted but not in range: chase directly when close, else give up (unreachable)
      if (Math.hypot(t.x - u.x, t.y - u.y) > TILE * 2.5) return completeOrder(u);
      u.path = [{ x: t.x, y: t.y }];
      u.pathIdx = 0;
    }
  } else {
    ensurePath(world, u, rectAround(t, 1), `a${t.id}`);
    if (u.pathIdx >= u.path.length) completeOrder(u); // unreachable
  }
}

function doBuild(world: World, u: Unit, o: Extract<Order, { type: 'build' }>): void {
  const def = BUILDINGS[o.btype];
  const p = world.players[u.owner];
  if (o.siteId !== undefined) {
    const site = world.buildings.get(o.siteId);
    if (!site || !site.alive || !site.constructing) return completeOrder(u);
    return workOn(world, u, site);
  }
  const fake = { tx: o.tx, ty: o.ty, size: def.size } as Building;
  const d = distToBuilding(u.x, u.y, fake);
  if (d > SURVIVOR.buildRange * TILE) {
    ensurePath(world, u, rectAround(fake, 1), `b${o.tx},${o.ty}`);
    if (u.pathIdx >= u.path.length && distToBuilding(u.x, u.y, fake) > SURVIVOR.buildRange * TILE) {
      msg(world, u.owner, '无法到达建造位置', 'warn');
      completeOrder(u);
    }
    return;
  }
  clearPath(u);
  const err = checkBuild(world, p, o.btype);
  if (err === '琥珀不足' && playerIncome(world, p.id) > 0) {
    // queued-ahead builds wait on site for income instead of being dropped
    o.waitT = (o.waitT ?? 0) + DT;
    if (o.waitT <= DT) msg(world, u.owner, `等待琥珀以建造${BUILDINGS[o.btype].name}…`, 'info');
    if (o.waitT < SURVIVOR.buildWaitForAmber) return;
    msg(world, u.owner, '等待琥珀超时，已跳过该建造', 'warn');
    return completeOrder(u);
  }
  if (err) {
    msg(world, u.owner, err, 'warn');
    return completeOrder(u);
  }
  if (!canPlace(world, o.btype, o.tx, o.ty)) {
    msg(world, u.owner, '此处无法建造', 'warn');
    return completeOrder(u);
  }
  p.amber -= buildCost(world, p, o.btype);
  const site = placeBuilding(world, u.owner, o.btype, o.tx, o.ty);
  o.siteId = site.id;
}

function workOn(world: World, u: Unit, site: Building): void {
  if (distToBuilding(u.x, u.y, site) > SURVIVOR.buildRange * TILE) {
    ensurePath(world, u, rectAround(site, 1), `w${site.id}`);
    if (u.pathIdx >= u.path.length) completeOrder(u);
    return;
  }
  clearPath(u);
  const lv = BUILDINGS[site.btype].levels[0];
  const step = DT / lv.time;
  site.progress = Math.min(1, site.progress + step);
  site.hp = Math.min(site.maxHp, site.hp + site.maxHp * 0.9 * step);
  u.workAnim = 0.3;
  u.facing = Math.atan2((site.ty + site.size / 2) * TILE - u.y, (site.tx + site.size / 2) * TILE - u.x);
  if (site.progress >= 1) {
    finishConstruction(world, site);
    completeOrder(u);
  }
}

function doRepair(world: World, u: Unit, o: Extract<Order, { type: 'repair' }>): void {
  const b = world.buildings.get(o.targetId);
  if (!b || !b.alive) return completeOrder(u);
  if (b.constructing) return workOn(world, u, b);
  if (b.hp >= b.maxHp) return completeOrder(u);
  if (distToBuilding(u.x, u.y, b) > SURVIVOR.buildRange * TILE) {
    ensurePath(world, u, rectAround(b, 1), `r${b.id}`);
    if (u.pathIdx >= u.path.length) completeOrder(u);
    return;
  }
  clearPath(u);
  const p = world.players[u.owner];
  const heal = Math.min(SURVIVOR.repairRate * DT, b.maxHp - b.hp);
  const costPerHp = (investedValue(b.btype, b.level) * SURVIVOR.repairCostRatio) / b.maxHp;
  const cost = heal * costPerHp;
  if (p.amber < cost) {
    msg(world, u.owner, '琥珀不足，无法继续修理', 'warn');
    return completeOrder(u);
  }
  p.amber -= cost;
  b.hp += heal;
  u.workAnim = 0.3;
  u.facing = Math.atan2((b.ty + b.size / 2) * TILE - u.y, (b.tx + b.size / 2) * TILE - u.x);
}

function follow(world: World, u: Unit, speed: number): void {
  if (u.pathIdx >= u.path.length) {
    u.moving = false;
    return;
  }
  u.moving = true;
  let budget = speed * DT;
  while (budget > 0 && u.pathIdx < u.path.length) {
    const wp = u.path[u.pathIdx];
    const dx = wp.x - u.x;
    const dy = wp.y - u.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.001) {
      u.pathIdx++;
      continue;
    }
    u.facing = Math.atan2(dy, dx);
    if (d <= budget) {
      u.x = wp.x;
      u.y = wp.y;
      budget -= d;
      u.pathIdx++;
    } else {
      u.x += (dx / d) * budget;
      u.y += (dy / d) * budget;
      budget = 0;
    }
  }
}

/** Push circle out of blocked tiles. */
function resolveTerrain(world: World, u: Unit): void {
  const g = world.grid;
  const f = faction(u);
  const r = u.radius;
  for (let pass = 0; pass < 2; pass++) {
    const tx0 = tileOf(u.x - r);
    const tx1 = tileOf(u.x + r);
    const ty0 = tileOf(u.y - r);
    const ty1 = tileOf(u.y + r);
    for (let ty = ty0; ty <= ty1; ty++)
      for (let tx = tx0; tx <= tx1; tx++) {
        if (g.passable(tx, ty, f)) continue;
        const x0 = tx * TILE;
        const y0 = ty * TILE;
        const cx = Math.max(x0, Math.min(u.x, x0 + TILE));
        const cy = Math.max(y0, Math.min(u.y, y0 + TILE));
        let dx = u.x - cx;
        let dy = u.y - cy;
        let d = Math.hypot(dx, dy);
        if (d >= r) continue;
        if (d < 0.01) {
          // centre inside tile: push toward the nearest edge
          const l = u.x - x0;
          const rr = x0 + TILE - u.x;
          const t = u.y - y0;
          const b = y0 + TILE - u.y;
          const m = Math.min(l, rr, t, b);
          if (m === l) u.x = x0 - r;
          else if (m === rr) u.x = x0 + TILE + r;
          else if (m === t) u.y = y0 - r;
          else u.y = y0 + TILE + r;
          continue;
        }
        dx /= d;
        dy /= d;
        const push = r - d;
        u.x += dx * push;
        u.y += dy * push;
        d = r;
      }
  }
  u.x = Math.max(r, Math.min(g.w * TILE - r, u.x));
  u.y = Math.max(r, Math.min(g.h * TILE - r, u.y));
}

function separate(world: World): void {
  const list = [...world.units.values()].filter((u) => u.alive);
  for (let i = 0; i < list.length; i++)
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const min = a.radius + b.radius - 2;
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min) continue;
      const d = Math.sqrt(d2) || 0.01;
      const push = (min - d) / 2;
      const nx = d2 ? dx / d : 1;
      const ny = d2 ? dy / d : 0;
      // heavier hunter barely moves; idle units yield to moving ones
      const wa = a.utype === 'hunter' ? 0.2 : a.moving ? 0.6 : 1.4;
      const wb = b.utype === 'hunter' ? 0.2 : b.moving ? 0.6 : 1.4;
      a.x -= nx * push * wa;
      a.y -= ny * push * wa;
      b.x += nx * push * wb;
      b.y += ny * push * wb;
    }
}

export function updateUnits(world: World): void {
  for (const u of world.units.values()) {
    if (!u.alive) continue;
    u.px = u.x;
    u.py = u.y;
    const st = unitStats(world, u);
    u.attackCd -= DT;
    u.attackAnim = Math.max(0, u.attackAnim - DT);
    u.workAnim = Math.max(0, u.workAnim - DT);
    if (u.slowTimer > 0) u.slowTimer -= DT;
    const s = u.status;
    s.markT -= DT;
    s.rootT -= DT;
    s.stunT -= DT;
    if (s.burnT > 0) {
      s.burnT -= DT;
      damageEntity(world, u, s.burnDps * DT, null, 'burn', { ignoreArmor: true });
      if (!u.alive) continue;
    }
    const regen = st.regen * (s.burnT > 0 ? 1 - s.antiRegen : 1);
    u.hp = Math.min(st.maxHp, u.hp + regen * DT);
    if (u.hp > st.maxHp) u.hp = st.maxHp;

    const disabled = s.stunT > 0;
    const rooted = disabled || s.rootT > 0;
    // idle army defends itself
    if (!u.orders.length && isArmy(u.utype)) acquireHunter(world, u);

    const o = disabled ? undefined : u.orders[0];
    if (o) {
      switch (o.type) {
        case 'move':
          doMove(world, u, o);
          break;
        case 'attackMove':
          doAttackMove(world, u, o);
          break;
        case 'attack':
          doAttack(world, u, o);
          break;
        case 'build':
          doBuild(world, u, o);
          break;
        case 'repair':
          doRepair(world, u, o);
          break;
      }
    } else if (!disabled) clearPath(u);

    const speed = st.speed * (u.slowTimer > 0 ? 1 - u.slowAmount : 1);
    if (rooted) u.moving = false;
    else follow(world, u, speed);

    // stuck detection
    if (u.moving) {
      u.stuckTimer += DT;
      if (u.stuckTimer >= 0.6) {
        const moved = Math.hypot(u.x - u.stuckRef.x, u.y - u.stuckRef.y);
        if (moved < 4) {
          u.stuckFails++;
          u.pathGoalKey = '';
          if (u.stuckFails >= 4 && u.orders[0]?.type === 'move') completeOrder(u);
        } else u.stuckFails = 0;
        u.stuckTimer = 0;
        u.stuckRef = { x: u.x, y: u.y };
      }
    } else {
      u.stuckTimer = 0;
      u.stuckFails = 0;
      u.stuckRef = { x: u.x, y: u.y };
    }
  }
  separate(world);
  for (const u of world.units.values()) {
    if (!u.alive) continue;
    resolveTerrain(world, u);
    // last-resort unstick: a unit whose centre sits in solid terrain is moved to the nearest walkable tile
    const tx = tileOf(u.x);
    const ty = tileOf(u.y);
    if (!world.grid.passable(tx, ty, faction(u))) {
      const t = nearestPassable(world.grid, tx, ty, faction(u), 8);
      if (t) {
        u.x = u.px = tileCenter(t.x);
        u.y = u.py = tileCenter(t.y);
        u.pathGoalKey = '';
      }
    }
  }
}
