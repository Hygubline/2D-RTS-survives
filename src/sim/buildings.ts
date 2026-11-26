import { BUILDINGS, DT, TILE } from '../config/balance';
import { ALTAR, ARMY, effectiveIncome, perkAt } from '../config/lategame';
import { tileCenter } from './grid';
import { nearestPassable } from './pathfinding';
import { factionOf, type Building, type Projectile, type Unit, type World } from './types';
import {
  buildingCenter,
  damageEntity,
  distToBuilding,
  emit,
  getEntity,
  hunterUnits,
  msg,
  playerRawIncome,
  recomputeLab,
  spawnUnit,
  survivorPlayers,
} from './world';

function finishUpgrade(world: World, b: Building): void {
  const def = BUILDINGS[b.btype];
  const ratio = b.hp / b.maxHp;
  const before = perkAt(b.btype, b.level);
  const incBefore = def.levels[b.level].income ?? 0;
  b.level++;
  b.upgrading = null;
  b.maxHp = def.levels[b.level].hp;
  b.hp = Math.max(b.hp, b.maxHp * ratio);
  const c = buildingCenter(b);
  const after = perkAt(b.btype, b.level);
  const newPerk = after && after.id !== before?.id ? after.name : undefined;
  const income = def.levels[b.level].income ? (def.levels[b.level].income ?? 0) - incBefore : undefined;
  emit(world, { e: 'levelup', x: c.x, y: c.y, id: b.id, perk: newPerk, income });
  if (newPerk) msg(world, b.owner, `${def.name}质变：【${newPerk}】—— ${after!.desc}`, 'good');
  if (b.btype === 'lab') recomputeLab(world, b.owner);
}

export function updateBuildings(world: World): void {
  const hunters = hunterUnits(world);
  // snowball control: each player's income above the soft cap is only partly effective
  const efficiency = new Map<number, number>();
  for (const p of survivorPlayers(world)) {
    const raw = playerRawIncome(world, p.id);
    efficiency.set(p.id, raw > 0 ? effectiveIncome(raw) / raw : 1);
  }
  for (const b of world.buildings.values()) {
    if (!b.alive) continue;
    b.fireAnim = Math.max(0, b.fireAnim - DT);
    if (b.silenceT > 0) b.silenceT -= DT;
    if (b.constructing) continue;
    const def = BUILDINGS[b.btype];
    const lv = def.levels[b.level];

    if (b.upgrading) {
      b.upgrading.progress += DT / b.upgrading.time;
      if (b.upgrading.progress >= 1) finishUpgrade(world, b);
    }

    if (lv.income) {
      const p = world.players[b.owner];
      const inc = lv.income * DT * (efficiency.get(b.owner) ?? 1);
      p.amber += inc;
      p.totalEarned += inc;
      b.acc += inc;
      if (b.acc >= 4 * lv.income && b.btype === 'harvester') {
        const c = buildingCenter(b);
        emit(world, { e: 'income', x: c.x, y: c.y - 20, amount: Math.round(b.acc), owner: b.owner, level: b.level });
        b.acc = 0;
      }
    }

    if (lv.heal && lv.healRadius) heal(world, b, lv.heal, lv.healRadius);
    if (b.train) updateTraining(world, b);
    if (b.btype === 'altar') updateAltar(world, b);

    if (lv.dmg && hunters.length && b.silenceT <= 0) {
      b.attackCd -= DT;
      const c = buildingCenter(b);
      // towers shoot the closest hunter in range
      let hunter: Unit | undefined;
      let bd = Infinity;
      for (const hu of hunters) {
        const d = Math.hypot(hu.x - c.x, hu.y - c.y);
        if (d <= (lv.range ?? 6) * TILE + hu.radius && d < bd) {
          bd = d;
          hunter = hu;
        }
      }
      if (hunter) {
        b.aim = Math.atan2(hunter.y - c.y, hunter.x - c.x);
        if (b.attackCd <= 0) {
          b.attackCd = lv.cooldown ?? 1;
          b.fireAnim = 0.2;
          const shots = perkAt(b.btype, b.level)?.multishot ?? 1;
          for (let i = 0; i < shots; i++) fire(world, b, hunter, i, shots);
        }
      }
    }
  }
}

function heal(world: World, b: Building, rate: number, radius: number): void {
  const c = buildingCenter(b);
  const r = radius * TILE;
  for (const o of world.buildings.values()) {
    if (o.constructing || o.hp >= o.maxHp) continue;
    if (distToBuilding(c.x, c.y, o) > r) continue;
    o.hp = Math.min(o.maxHp, o.hp + rate * DT);
  }
  if (!perkAt(b.btype, b.level)?.healUnits) return;
  for (const u of world.units.values()) {
    if (!u.alive || factionOf(u.utype) !== 'survivor') continue;
    if (Math.hypot(u.x - c.x, u.y - c.y) > r) continue;
    u.hp += rate * 0.5 * DT; // capped by unit regen clamp in updateUnits
  }
}

function updateTraining(world: World, b: Building): void {
  const q = b.train!;
  if (!q.queue.length) {
    q.t = 0;
    return;
  }
  const kind = q.queue[0];
  q.t += DT / ARMY[kind].time;
  if (q.t < 1) return;
  q.t = 0;
  q.queue.shift();
  const c = buildingCenter(b);
  const spawnTile = nearestPassable(world.grid, b.tx + 1, b.ty + b.size, 'survivor', 6) ?? { x: b.tx + 1, y: b.ty + b.size };
  const u = spawnUnit(world, kind, b.owner, tileCenter(spawnTile.x), tileCenter(spawnTile.y), b.level >= 1);
  world.players[b.owner].stats.armyTrained++;
  const rally = b.rally ?? { x: c.x, y: (b.ty + b.size + 1.5) * TILE };
  u.orders = [{ type: 'move', x: rally.x + (world.rng.next() - 0.5) * 40, y: rally.y + (world.rng.next() - 0.5) * 40 }];
  emit(world, { e: 'trained', x: u.x, y: u.y, utype: kind, owner: b.owner });
}

function updateAltar(world: World, b: Building): void {
  const before = b.charge;
  b.charge = Math.min(1, b.charge + DT / ALTAR.charge);
  for (const mark of [0.5, 0.8]) {
    if (before < mark && b.charge >= mark)
      emit(world, { e: 'banner', text: `破晓祭坛充能 ${Math.round(mark * 100)}%`, sub: mark >= 0.8 ? '守住它！黎明之光即将降临' : '噬林魔正赶来摧毁祭坛', tone: 'epic' });
  }
  if (b.charge >= 1 && !world.winner) {
    world.winner = 'survivor';
    world.endReason = 'altar';
    emit(world, { e: 'banner', text: '破晓之光降临', sub: '噬林魔在圣光中化为灰烬', tone: 'epic' });
    emit(world, { e: 'gameover', winner: 'survivor', reason: 'altar' });
  }
}

function fire(world: World, b: Building, target: Unit, index: number, shots: number): void {
  const def = BUILDINGS[b.btype];
  const lv = def.levels[b.level];
  const perk = perkAt(b.btype, b.level);
  const c = buildingCenter(b);
  const ptype = def.projectile ?? 'bolt';
  const variant: Projectile['variant'] = perk?.meteor ? 'meteor' : perk?.mark ? 'mark' : perk?.armorPierce ? 'pierce' : '';
  const spread = shots > 1 ? (index - (shots - 1) / 2) * 10 : 0;
  // meteors fall from the sky above the target instead of flying from the tower
  const sx = variant === 'meteor' ? target.x - 60 : c.x + spread;
  const sy = variant === 'meteor' ? target.y - 260 : c.y - 22;
  world.projectiles.push({
    id: world.nextId++,
    ptype,
    variant,
    owner: b.owner,
    x: sx,
    y: sy,
    px: sx,
    py: sy,
    targetId: target.id,
    tx: target.x,
    ty: target.y,
    speed: variant === 'meteor' ? 520 : ptype === 'ember' ? 380 : ptype === 'frost' ? 360 : 620,
    dmg: (lv.dmg ?? 0) * (perk?.multishot ? (perk.shotDmg ?? 1) : 1),
    slow: lv.slow ?? 0,
    slowTime: lv.slowTime ?? 0,
    splash: ((perk?.meteor?.splash ?? lv.splash) ?? 0) * TILE,
    sourceId: b.id,
  });
  if (index === 0) emit(world, { e: 'shoot', x: c.x, y: c.y - 22, ptype, variant });
}

export function updateProjectiles(world: World): void {
  const keep = [];
  for (const p of world.projectiles) {
    p.px = p.x;
    p.py = p.y;
    const t = getEntity(world, p.targetId);
    if (t && t.alive && t.kind === 'unit') {
      p.tx = t.x;
      p.ty = t.y;
    }
    const dx = p.tx - p.x;
    const dy = p.ty - p.y;
    const d = Math.hypot(dx, dy);
    const step = p.speed * DT;
    if (d <= step + 6) {
      p.x = p.tx;
      p.y = p.ty;
      impact(world, p);
      continue;
    }
    p.x += (dx / d) * step;
    p.y += (dy / d) * step;
    keep.push(p);
  }
  world.projectiles = keep;
}

function impact(world: World, p: Projectile): void {
  const src = getEntity(world, p.sourceId) ?? null;
  const t = getEntity(world, p.targetId);
  if (p.splash > 0) {
    for (const hunter of hunterUnits(world)) if (Math.hypot(hunter.x - p.x, hunter.y - p.y) <= p.splash + hunter.radius) applyHit(world, hunter, p, src);
    return;
  }
  if (t && t.alive && t.kind === 'unit') applyHit(world, t, p, src);
}

function applyHit(world: World, t: Unit, p: Projectile, src: ReturnType<typeof getEntity> | null): void {
  if (!t.alive) return;
  const b = src?.kind === 'building' ? src : null;
  const perk = b ? perkAt(b.btype, b.level) : null;
  const s = t.status;
  if (p.slow > 0) {
    t.slowAmount = Math.max(p.slow, t.slowTimer > 0 ? t.slowAmount : 0);
    t.slowTimer = p.slowTime;
  }
  if (b && perk) {
    b.hits++;
    if (perk.mark) {
      s.markStacks = Math.min(perk.mark.max, (s.markT > 0 ? s.markStacks : 0) + 1);
      s.markT = perk.mark.time;
      s.markPer = perk.mark.perStack;
      if (s.markStacks === perk.mark.max) emit(world, { e: 'status', id: t.id, x: t.x, y: t.y, kind: 'mark' });
    }
    if (perk.freezeEvery && b.hits % perk.freezeEvery === 0) {
      s.rootT = Math.max(s.rootT, perk.freezeTime ?? 1);
      s.shatter = perk.shatter ?? 0;
      emit(world, { e: 'status', id: t.id, x: t.x, y: t.y, kind: 'freeze' });
    }
    if (perk.burn) {
      if (s.burnT <= 0) emit(world, { e: 'status', id: t.id, x: t.x, y: t.y, kind: 'burn' });
      s.burnDps = Math.max(s.burnT > 0 ? s.burnDps : 0, perk.burn.dps);
      s.burnT = perk.burn.time;
      s.antiRegen = perk.burn.antiRegen;
    }
    if (perk.meteor) {
      s.stunT = Math.max(s.stunT, perk.meteor.stun);
      emit(world, { e: 'status', id: t.id, x: t.x, y: t.y, kind: 'stun' });
    }
  }
  damageEntity(world, t, p.dmg, src ?? null, p.ptype, { armorPierce: perk?.armorPierce });
}
