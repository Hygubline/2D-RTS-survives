/**
 * Late-game configuration: match phases, economy snowball control, tower tier perks,
 * army units, hunter skills/evolution and the final showdown.
 * Part of the centralised config (see balance.ts). No gameplay numbers live elsewhere.
 */

/** Match arc. Times in seconds. */
export const PHASES = {
  midAt: 210, // 3:30 — HUD label only
  lateAt: 420, // 7:00
  altarWarnAt: 570, // 9:30 broadcast
  altarUnlockAt: 600, // 10:00 Dawn Altar can be built
  bloodMoonWarnAt: 690, // 11:30
  bloodMoonAt: 720, // 12:00 final showdown: no respawns, hunter evolves + enrages
  dawnAt: 900, // 15:00 wardens win if any remain
};

/** Economy snowball control: per-player income above the soft cap is only partly effective. */
export const ECON = {
  softCap: 310, // amber/s per player
  overCapEfficiency: 0.4,
};

export function effectiveIncome(raw: number): number {
  return raw <= ECON.softCap ? raw : ECON.softCap + (raw - ECON.softCap) * ECON.overCapEfficiency;
}

/**
 * Qualitative tower/wall perks unlocked at a level index (0-based).
 * Each perk changes HOW a building fights, not just how hard.
 */
export interface Perk {
  id: string;
  name: string;
  desc: string;
  multishot?: number; // projectiles per volley
  shotDmg?: number; // damage multiplier per projectile when multishot
  armorPierce?: number; // fraction of target armor ignored
  mark?: { perStack: number; max: number; time: number }; // stacking damage-taken amp
  freezeEvery?: number; // every Nth hit roots the target
  freezeTime?: number;
  shatter?: number; // bonus damage taken by frozen targets (all sources)
  burn?: { dps: number; time: number; antiRegen: number };
  meteor?: { splash: number; stun: number };
  thorns?: number; // fraction of melee damage reflected
  healUnits?: boolean;
}

export const PERKS: Partial<Record<string, Record<number, Perk>>> = {
  bolt: {
    2: { id: 'pierce', name: '穿甲连弩', desc: '每轮齐射 2 支弩箭（各 60% 伤害），无视 50% 护甲', multishot: 2, shotDmg: 0.6, armorPierce: 0.5 },
    4: { id: 'mark', name: '猎魔印记', desc: '命中叠加印记：目标受到所有伤害 +4%/层（最多 8 层）', multishot: 2, shotDmg: 0.6, armorPierce: 0.5, mark: { perStack: 0.04, max: 8, time: 5 } },
  },
  frost: {
    1: { id: 'freeze', name: '冰封', desc: '每第 4 次命中将目标冻结 1.2 秒（打断技能）', freezeEvery: 4, freezeTime: 1.2 },
    2: { id: 'shatter', name: '碎冰领域', desc: '每第 3 次命中冻结；被冻结的目标受到所有伤害 +50%', freezeEvery: 3, freezeTime: 1.4, shatter: 0.5 },
  },
  lance: {
    1: { id: 'burn', name: '灼魂烈焰', desc: '点燃 4 秒（每秒 70 伤害），燃烧期间生命回复 -80%', burn: { dps: 70, time: 4, antiRegen: 0.8 } },
    2: { id: 'meteor', name: '陨火', desc: '化作陨星坠落：2 格溅射并眩晕 0.6 秒，附带灼魂', burn: { dps: 160, time: 4, antiRegen: 0.8 }, meteor: { splash: 2, stun: 0.6 } },
  },
  wall: {
    2: { id: 'thorns', name: '荆棘', desc: '反弹 15% 近战伤害', thorns: 0.15 },
    4: { id: 'crystal', name: '晶刺', desc: '反弹 35% 近战伤害', thorns: 0.35 },
  },
  gate: {
    2: { id: 'thorns', name: '荆棘', desc: '反弹 15% 近战伤害', thorns: 0.15 },
    4: { id: 'crystal', name: '晶刺', desc: '反弹 35% 近战伤害', thorns: 0.35 },
  },
  repair: {
    1: { id: 'mend', name: '生命之泉', desc: '同时治疗范围内的守夜人与军团', healUnits: true },
  },
};

/** The perk active at a level = highest perk at or below that level index. */
export function perkAt(btype: string, level: number): Perk | null {
  const table = PERKS[btype];
  if (!table) return null;
  let best: Perk | null = null;
  for (let i = 0; i <= level; i++) if (table[i]) best = table[i];
  return best;
}

export type ArmyType = 'guard' | 'ranger';

export interface ArmyDef {
  type: ArmyType;
  name: string;
  desc: string;
  cost: number;
  time: number;
  hp: number;
  armor: number;
  dmg: number;
  cooldown: number;
  range: number; // tiles
  speed: number;
  radius: number;
  reqBarracks: number; // barracks level index required
}

export const ARMY: Record<ArmyType, ArmyDef> = {
  guard: { type: 'guard', name: '林卫', desc: '重甲近战，吸收噬林魔的火力', cost: 160, time: 9, hp: 700, armor: 7, dmg: 30, cooldown: 1.0, range: 1.2, speed: 140, radius: 11, reqBarracks: 0 },
  ranger: { type: 'ranger', name: '游侠', desc: '远程输出，射程 6 格', cost: 200, time: 10, hp: 320, armor: 2, dmg: 44, cooldown: 1.2, range: 6, speed: 148, radius: 9, reqBarracks: 0 },
};

export const ARMY_RULES = {
  popCap: 10, // per player
  popCapElite: 16, // with an elite (level 2) barracks
  queueMax: 5,
  aggroRange: 7, // tiles: idle units auto-engage the hunter
  eliteMult: 1.35, // barracks level 2: hp & dmg multiplier
  killSoulfire: 45, // hunter reward for slaying a unit
  killXp: 30,
  legionAttackSize: 6, // AI legion marches when this many units are ready
};

/** Hunter active skills. Rank n unlocks at unlock[n]; arrays are per rank. */
export const HUNTER_SKILLS = {
  pounce: { name: '扑杀', desc: '跃向 5 格内可直达的守夜人/军团，造成重击并眩晕', unlock: [5, 10, 15], cd: [18, 14, 10], range: 5, dmgMult: [1.5, 2, 2.6], stun: [0.5, 0.7, 0.9] },
  roar: { name: '震地咆哮', desc: '沉默周围的塔并震伤建筑', unlock: [6, 11, 16], cd: [24, 20, 16], radius: [5, 5.5, 6], silence: [3, 4, 5], bldDmg: [60, 120, 200] },
  rend: { name: '腐蚀撕裂', desc: '接下来数次攻击对建筑伤害 +100% 且无视护甲', unlock: [9, 14, 19], cd: [20, 16, 12], hits: [4, 5, 6], bonus: 1.0 },
};
export type HunterSkill = keyof typeof HUNTER_SKILLS;

export const EVOLUTION = {
  level: 12, // or Blood Moon, or the hunter's last life — whichever comes first
  name: '噬林巨兽',
  hpMult: 1.25,
  radius: 20,
  speed: 10,
  siegeBonus: 0.3,
  cleaveRadius: 1.8, // tiles
  cleaveRatio: 0.6,
};

export const BLOOD_MOON = {
  dmgMult: 1.25,
  revealAll: true,
  noRespawn: true,
};

export const ALTAR = {
  cost: 5000,
  hp: 6000,
  armor: 10,
  buildTime: 20,
  reqLab: 3,
  charge: 60, // seconds after construction to win
  hunterPriority: 12, // target value multiplier for the hunter AI
};
