import { BUILDINGS, investedValue, ITEM_SLOTS, ITEMS, SURVIVOR, type BuildingType } from '../config/balance';
import { ARMY, HUNTER_SKILLS, PERKS, perkAt, type ArmyType, type HunterSkill } from '../config/lategame';
import { skillRank } from '../sim/hunterSkills';
import { checkTrain } from '../sim/commands';
import { isArmy, type Building, type Unit, type World } from '../sim/types';
import { armyCap, armyCount, buildCost, checkBuild, checkUpgrade } from '../sim/world';
import { ICONS } from './icons';

export const GRID_KEYS = ['Q', 'W', 'E', 'R', 'A', 'S', 'D', 'F', 'Z', 'X', 'C', 'V'];

export interface CardButton {
  key: string;
  icon: string;
  label: string;
  cost?: number;
  desc: string;
  enabled: boolean;
  reason?: string;
  action: string; // action id handled by Input
  active?: boolean;
}

const BUILD_SLOTS: BuildingType[] = ['harvester', 'wall', 'gate', 'bolt', 'frost', 'lance', 'repair', 'lab', 'shelter', 'barracks', 'altar'];

function buildingStatLine(btype: BuildingType, level: number): string {
  const lv = BUILDINGS[btype].levels[level];
  const parts = [`生命 ${lv.hp}`, `护甲 ${lv.armor}`];
  if (lv.income) parts.push(`收入 ${lv.income}/秒`);
  if (lv.dmg) parts.push(`伤害 ${lv.dmg}`, `射程 ${lv.range}`);
  if (lv.slow) parts.push(`减速 ${Math.round(lv.slow * 100)}%`);
  if (lv.heal) parts.push(`修复 ${lv.heal}/秒`);
  return parts.join(' · ');
}

/** Upcoming qualitative perks for a building type, as a tooltip line. */
function perkPreview(btype: BuildingType, fromLevel: number): string {
  const table = PERKS[btype];
  if (!table) return '';
  const lines = Object.entries(table)
    .filter(([lv]) => Number(lv) > fromLevel)
    .map(([lv, p]) => `<span class="perk">Lv${Number(lv) + 1}【${p!.name}】</span>${p!.desc}`);
  return lines.length ? `<br>${lines.join('<br>')}` : '';
}

function armyStatLine(t: ArmyType): string {
  const a = ARMY[t];
  return `生命 ${a.hp} · 护甲 ${a.armor} · 伤害 ${a.dmg} · 射程 ${a.range} · 训练 ${a.time}秒`;
}

export function cardFor(world: World, playerId: number, sel: (Unit | Building)[], mode: string): CardButton[] {
  const p = world.players[playerId];
  const out: CardButton[] = [];
  const own = sel.filter((e) => e.owner === playerId);
  const wardens = own.filter((e): e is Unit => e.kind === 'unit' && e.utype === 'survivor');
  const army = own.filter((e): e is Unit => e.kind === 'unit' && isArmy(e.utype));
  const blds = own.filter((e): e is Building => e.kind === 'building');
  if (mode !== 'normal') {
    out[11] = { key: 'V', icon: ICONS.cancel, label: '取消', desc: '取消当前指令 (Esc)', enabled: true, action: 'escape' };
    return out;
  }
  // a hunter player always sees its own beast card (skills + lair shop)
  if (p.faction === 'hunter') return hunterCard(world, playerId);
  if (wardens.length) {
    BUILD_SLOTS.forEach((bt, i) => {
      const def = BUILDINGS[bt];
      const err = checkBuild(world, p, bt);
      out[i] = {
        key: GRID_KEYS[i],
        icon: ICONS[bt],
        label: def.name,
        cost: buildCost(world, p, bt),
        desc: `${def.desc}<br><span class="stat">${buildingStatLine(bt, 0)}</span>${perkPreview(bt, -1)}`,
        enabled: !err,
        reason: err ?? undefined,
        action: `build:${bt}`,
      };
    });
    out[11] = { key: 'V', icon: ICONS.stop, label: '停止', desc: '清空指令队列。修理与攻击请直接右键目标。', enabled: true, action: 'stop' };
    return out;
  }
  if (army.length) {
    out[0] = { key: 'Q', icon: ICONS.attack, label: '攻击移动', desc: '前往目标点，途中自动攻击噬林魔（也可直接右键噬林魔）', enabled: true, action: 'target:attackMove' };
    out[1] = { key: 'W', icon: ICONS.stop, label: '停止', desc: '停止并原地待命（待命时会自动迎击靠近的噬林魔）', enabled: true, action: 'stop' };
    return out;
  }
  if (blds.length) {
    const b = blds[0];
    const same = blds.filter((x) => x.btype === b.btype);
    const def = BUILDINGS[b.btype];
    const next = def.levels[b.level + 1];
    const err = checkUpgrade(world, p, b);
    const nameNext = def.levelNames?.[b.level + 1] ?? `${b.level + 2} 级`;
    if (next || b.constructing || b.upgrading) {
      const totalCost = next ? next.cost * same.filter((x) => x.level === b.level && !x.upgrading && !x.constructing).length : 0;
      const nextPerk = perkAt(b.btype, b.level + 1);
      const curPerk = perkAt(b.btype, b.level);
      const perkUnlock = nextPerk && nextPerk.id !== curPerk?.id ? `<br><span class="perk">质变解锁【${nextPerk.name}】</span>${nextPerk.desc}` : '';
      out[0] = {
        key: 'Q',
        icon: ICONS.upgrade,
        label: next ? `升级为 ${nameNext}` : '升级',
        cost: next?.cost,
        desc: next
          ? `${same.length > 1 ? `同时升级所选 ${same.length} 座（共 ${totalCost}）<br>` : ''}<span class="stat">${buildingStatLine(b.btype, b.level + 1)}</span>${next.reqLab ? `<br>需要书阁 ${next.reqLab} 级` : ''}${next.income ? `<br>收入 +${(next.income - (def.levels[b.level].income ?? 0)).toFixed(1)}/秒，回本 ${Math.round(next.cost / (next.income - (def.levels[b.level].income ?? 0)))} 秒` : ''}${perkUnlock}`
          : '已达最高等级',
        enabled: !err,
        reason: err ?? undefined,
        action: 'upgrade',
      };
    }
    out[1] = { key: 'W', icon: ICONS.repairCmd, label: '修理', desc: '派你的守夜人修理此建筑', enabled: b.hp < b.maxHp || b.constructing, action: 'repairSel' };
    const queued = b.train?.queue.length ?? 0;
    if (b.constructing || b.upgrading || queued)
      out[2] = { key: 'E', icon: ICONS.cancel, label: '取消', desc: queued ? '取消最后一个训练中的单位，全额返还' : b.constructing ? '取消建造，全额返还' : '取消升级，全额返还', enabled: true, action: 'cancel' };
    if (b.btype === 'barracks') {
      (['ranger', 'guard'] as ArmyType[]).forEach((t, i) => {
        const terr = checkTrain(world, p, b, t);
        out[4 + i] = {
          key: GRID_KEYS[4 + i],
          icon: ICONS[t],
          label: `招募${ARMY[t].name}`,
          cost: ARMY[t].cost,
          desc: `${ARMY[t].desc}<br><span class="stat">${armyStatLine(t)}</span><br>军团 ${armyCount(world, playerId)}/${armyCap(world, playerId)}${b.level >= 1 ? '<br><span class="perk">精锐：生命与伤害 +35%</span>' : ''}<br>右键地面设置集结点`,
          enabled: !terr,
          reason: terr ?? undefined,
          action: `train:${t}`,
        };
      });
    }
    const refund = Math.round(investedValue(b.btype, b.level) * SURVIVOR.demolishRefund);
    out[11] = { key: 'V', icon: ICONS.demolish, label: '拆除', desc: `拆除并返还约 ${refund} 琥珀（再按一次确认）`, enabled: true, action: 'demolish' };
    return out;
  }
  return out;
}

const SKILL_SLOTS: HunterSkill[] = ['pounce', 'roar', 'rend'];
const ITEM_ICON_KEY: Record<string, string> = { claws: 'claws', hide: 'hide', striders: 'striders', heart: 'heartItem', horn: 'horn' };

/** Command card for a human hunter: Q W E skills, A S D F Z items from the lair shop. */
export function hunterCard(world: World, playerId: number): CardButton[] {
  const hs = world.players[playerId].hunter!;
  const out: CardButton[] = [];
  SKILL_SLOTS.forEach((sk, i) => {
    const def = HUNTER_SKILLS[sk];
    const rank = skillRank(hs.level, sk);
    const cd = hs.skillCd[sk];
    const next = def.unlock.find((lv) => lv > hs.level);
    const reason = !rank ? `${def.unlock[0]} 级解锁` : cd > 0 ? `冷却 ${Math.ceil(cd)} 秒` : sk === 'rend' && hs.rendHits > 0 ? '撕裂生效中' : undefined;
    out[i] = {
      key: GRID_KEYS[i],
      icon: ICONS[sk],
      label: rank ? `${def.name} ${'Ⅰ Ⅱ Ⅲ'.split(' ')[rank - 1]}` : def.name,
      desc: `${def.desc}${sk === 'pounce' ? '<br>按键后点击一个守夜人/军团' : ''}<br><span class="stat">冷却 ${def.cd.join(' / ')} 秒</span>${next ? `<br>${next} 级提升` : ''}`,
      enabled: !reason,
      reason,
      action: sk === 'pounce' ? 'target:pounce' : `skill:${sk}`,
    };
  });
  ITEM_SLOTS.forEach((slot, i) => {
    const def = ITEMS[slot];
    const tier = hs.items[slot];
    const next = def.tiers[tier];
    const k = 4 + i;
    out[k] = {
      key: GRID_KEYS[k],
      icon: ICONS[ITEM_ICON_KEY[slot]],
      label: next ? `${def.name} ${tier + 1}` : `${def.name} 满级`,
      cost: next?.cost,
      desc: `${def.desc}（${tier}/${def.tiers.length}）${next ? `<br><span class="stat">${describeTier(next)}</span><br>花费 ${next.cost} 魂火` : ''}`,
      enabled: !!next && hs.soulfire >= next.cost,
      reason: !next ? '已满级' : hs.soulfire < next.cost ? '魂火不足' : undefined,
      action: `buy:${slot}`,
    };
  });
  out[11] = { key: 'V', icon: ICONS.stop, label: '停止', desc: '原地停下。右键地面移动，右键建筑或守夜人攻击。', enabled: true, action: 'stop' };
  return out;
}

function describeTier(t: (typeof ITEMS)[keyof typeof ITEMS]['tiers'][number]): string {
  const parts: string[] = [];
  if (t.dmg) parts.push(`攻击 +${t.dmg}`);
  if (t.armor) parts.push(`护甲 +${t.armor}`);
  if (t.speed) parts.push(`速度 +${t.speed}`);
  if (t.hp) parts.push(`生命 +${t.hp}`);
  if (t.regen) parts.push(`回复 +${t.regen}`);
  if (t.siege) parts.push(`攻城 ×${t.siege}`);
  return parts.join(' · ');
}
