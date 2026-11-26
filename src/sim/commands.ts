import { BUILDINGS, investedValue, ITEMS, SURVIVOR, type ItemSlot } from '../config/balance';
import { ARMY, ARMY_RULES, type ArmyType, type HunterSkill } from '../config/lategame';
import { tryPounce, tryRend, tryRoar } from './hunterSkills';
import { factionOf } from './types';
import type { Building, Order, Player, World } from './types';
import { armyCap, armyCount, checkBuild, checkUpgrade, hunterUnitOf, msg, removeBuilding, unitStats } from './world';

/**
 * Serializable player commands. Every action from humans, AI and (later) network
 * peers enters the simulation through this union — the basis for lockstep multiplayer.
 */
export type Command =
  | { t: 'order'; unitIds: number[]; order: Order; queue: boolean }
  | { t: 'stop'; unitIds: number[] }
  | { t: 'upgrade'; buildingIds: number[] }
  | { t: 'demolish'; buildingIds: number[] }
  | { t: 'cancel'; buildingIds: number[] }
  | { t: 'buy'; slot: ItemSlot }
  | { t: 'train'; buildingId: number; utype: ArmyType }
  | { t: 'rally'; buildingIds: number[]; x: number; y: number }
  /** hunter player: cast pounce (needs a target unit), roar or rend */
  | { t: 'skill'; skill: HunterSkill; targetId?: number }
  /** multiplayer: the seat was vacated, the AI takes over from this tick on */
  | { t: 'leave' };

/** Shared rule for UI pre-checks and sim validation. */
export function checkTrain(world: World, p: Player, b: Building | undefined, utype: ArmyType): string | null {
  if (!b || b.btype !== 'barracks' || !b.train) return '需要兵营';
  if (b.constructing) return '兵营建造中';
  if (b.level < ARMY[utype].reqBarracks) return '需要升级兵营';
  if (b.train.queue.length >= ARMY_RULES.queueMax) return '训练队列已满';
  const cap = armyCap(world, p.id);
  if (armyCount(world, p.id) >= cap) return `军团已达上限 (${cap})`;
  if (p.amber < ARMY[utype].cost) return '琥珀不足';
  return null;
}

export function issueCommand(world: World, playerId: number, cmd: Command): void {
  world.pending.push({ playerId, cmd });
}

export function applyCommands(world: World): void {
  const list = world.pending;
  world.pending = [];
  for (const { playerId, cmd } of list) applyCommand(world, playerId, cmd);
}

export function applyCommand(world: World, playerId: number, cmd: Command): void {
  const p = world.players[playerId];
  if (!p) return;
  switch (cmd.t) {
    case 'order': {
      if (cmd.order.type === 'build') {
        const err = checkBuild(world, p, cmd.order.btype);
        // queued builds are validated on arrival (cost may be earned meanwhile)
        if (err && !cmd.queue) {
          msg(world, playerId, err, 'warn');
          return;
        }
      }
      for (const id of cmd.unitIds) {
        const u = world.units.get(id);
        if (!u || !u.alive || u.owner !== playerId) continue;
        // only wardens build and repair
        if ((cmd.order.type === 'build' || cmd.order.type === 'repair') && u.utype !== 'survivor') continue;
        const o = { ...cmd.order } as Order;
        if (cmd.queue) u.orders.push(o);
        else {
          u.orders = [o];
          u.pathGoalKey = '';
          u.path = [];
        }
      }
      return;
    }
    case 'stop':
      for (const id of cmd.unitIds) {
        const u = world.units.get(id);
        if (u && u.owner === playerId) {
          u.orders = [];
          u.path = [];
        }
      }
      return;
    case 'upgrade': {
      let lastErr: string | null = null;
      let done = 0;
      for (const id of cmd.buildingIds) {
        const b = world.buildings.get(id);
        if (!b || b.owner !== playerId) continue;
        const err = checkUpgrade(world, p, b);
        if (err) {
          lastErr = err;
          continue;
        }
        const next = BUILDINGS[b.btype].levels[b.level + 1];
        p.amber -= next.cost;
        b.upgrading = { progress: 0, time: next.time };
        done++;
      }
      if (!done && lastErr) msg(world, playerId, lastErr, 'warn');
      return;
    }
    case 'demolish':
      for (const id of cmd.buildingIds) {
        const b = world.buildings.get(id);
        if (!b || b.owner !== playerId) continue;
        const value = b.constructing ? BUILDINGS[b.btype].levels[0].cost : investedValue(b.btype, b.level);
        p.amber += value * SURVIVOR.demolishRefund * (b.hp / b.maxHp > 0.5 ? 1 : 0.5);
        removeBuilding(world, b);
      }
      return;
    case 'cancel':
      for (const id of cmd.buildingIds) {
        const b = world.buildings.get(id);
        if (!b || b.owner !== playerId) continue;
        if (b.train && b.train.queue.length) {
          const last = b.train.queue.pop()!;
          p.amber += ARMY[last].cost;
          if (!b.train.queue.length) b.train.t = 0;
        } else if (b.upgrading) {
          p.amber += BUILDINGS[b.btype].levels[b.level + 1].cost;
          b.upgrading = null;
        } else if (b.constructing) {
          p.amber += BUILDINGS[b.btype].levels[0].cost;
          removeBuilding(world, b);
        }
      }
      return;
    case 'train': {
      const b = world.buildings.get(cmd.buildingId);
      if (!b || b.owner !== playerId) return;
      const err = checkTrain(world, p, b, cmd.utype);
      if (err) {
        msg(world, playerId, err, 'warn');
        return;
      }
      p.amber -= ARMY[cmd.utype].cost;
      b.train!.queue.push(cmd.utype);
      return;
    }
    case 'rally':
      for (const id of cmd.buildingIds) {
        const b = world.buildings.get(id);
        if (b && b.owner === playerId) b.rally = { x: cmd.x, y: cmd.y };
      }
      return;
    case 'leave':
      p.isHuman = false;
      p.isAI = true;
      return;
    case 'skill': {
      const h = hunterUnitOf(world, playerId);
      if (!h) return;
      if (cmd.skill === 'roar') tryRoar(world, h, true);
      else if (cmd.skill === 'rend') tryRend(world, h);
      else {
        const t = cmd.targetId ? world.units.get(cmd.targetId) : undefined;
        if (t && t.alive && factionOf(t.utype) === 'survivor') tryPounce(world, h, t);
      }
      return;
    }
    case 'buy': {
      const h = p.hunter;
      if (!h) return;
      const def = ITEMS[cmd.slot];
      const tier = def.tiers[h.items[cmd.slot]];
      if (!tier || h.soulfire < tier.cost) return;
      const u = hunterUnitOf(world, playerId);
      const before = u ? unitStats(world, u).maxHp : 0;
      h.soulfire -= tier.cost;
      h.items[cmd.slot]++;
      if (u) u.hp += unitStats(world, u).maxHp - before;
      return;
    }
  }
}
