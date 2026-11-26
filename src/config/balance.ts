/**
 * Centralised balance configuration. Every gameplay number lives here.
 * Sim, AI and UI read from this file; nothing else hardcodes balance values.
 */

import { ALTAR, PHASES } from './lategame';

export const TILE = 32;
export const MAP_W = 96;
export const MAP_H = 96;
export const TICK_RATE = 20;
export const DT = 1 / TICK_RATE;

export const MATCH = {
  surviveSeconds: PHASES.dawnAt, // dawn: wardens win
  hunterGrace: 50, // seconds before the hunter awakens
  survivorLives: 3,
  survivorRespawn: 15,
  hunterLives: 2, // per hunter (the pack has HUNTER_PACK.count)
  hunterRespawn: 25,
  startAmber: 120,
  aiSurvivors: 3,
  scentInterval: 45, // hunter periodically senses all wardens
  scentDuration: 5,
};

/** WC3-style armor: each point = 6% more effective hp. */
export const ARMOR_FACTOR = 0.06;
export function armorMultiplier(armor: number): number {
  return armor >= 0 ? 1 / (1 + ARMOR_FACTOR * armor) : 2 - Math.pow(0.94, -armor);
}

export type BuildingType =
  | 'shelter'
  | 'harvester'
  | 'wall'
  | 'gate'
  | 'bolt'
  | 'frost'
  | 'lance'
  | 'repair'
  | 'lab'
  | 'barracks'
  | 'altar';

export interface LevelDef {
  cost: number; // cost to build (index 0) or upgrade into this level
  hp: number;
  armor: number;
  time: number; // build/upgrade seconds
  reqLab?: number; // tech lab level required
  income?: number; // amber per second
  dmg?: number;
  cooldown?: number;
  range?: number; // tiles
  slow?: number; // 0..1 movement slow
  slowTime?: number;
  splash?: number; // tiles
  heal?: number; // hp per second to each building
  healRadius?: number; // tiles
}

export interface BuildingDef {
  type: BuildingType;
  name: string;
  desc: string;
  size: number; // tiles (square)
  vision: number; // tiles
  maxCount?: number;
  category: 'core' | 'eco' | 'wall' | 'tower' | 'support' | 'army';
  levels: LevelDef[];
  levelNames?: string[];
  projectile?: 'bolt' | 'frost' | 'ember';
}

export const BUILDINGS: Record<BuildingType, BuildingDef> = {
  shelter: {
    type: 'shelter',
    name: '庇护所',
    desc: '复活点，提供少量琥珀收入。被摧毁后可在别处重建。',
    size: 3,
    vision: 7,
    maxCount: 1,
    category: 'core',
    levels: [{ cost: 0, hp: 1400, armor: 4, time: 4, income: 1 }],
  },
  harvester: {
    type: 'harvester',
    name: '琥珀泉',
    desc: '持续产出琥珀。等级越高收入越呈指数增长。',
    size: 2,
    vision: 4,
    maxCount: 6,
    category: 'eco',
    levelNames: ['涓流', '细泉', '涌泉', '琥珀井', '金脉', '永燃之心'],
    levels: [
      { cost: 70, hp: 320, armor: 1, time: 6, income: 1.5 },
      { cost: 160, hp: 480, armor: 2, time: 7, income: 3.6 },
      { cost: 380, hp: 720, armor: 3, time: 9, income: 8.4, reqLab: 1 },
      { cost: 900, hp: 1080, armor: 4, time: 11, income: 19.5, reqLab: 1 },
      { cost: 2100, hp: 1600, armor: 5, time: 13, income: 45, reqLab: 2 },
      { cost: 4900, hp: 2400, armor: 6, time: 15, income: 104, reqLab: 3 },
    ],
  },
  wall: {
    type: 'wall',
    name: '壁垒',
    desc: '阻挡噬林魔。墙的本质是用生命值换取时间。',
    size: 1,
    vision: 2,
    category: 'wall',
    levelNames: ['木栅', '石墙', '铁箍墙', '黑曜墙', '晶壁'],
    levels: [
      { cost: 12, hp: 350, armor: 3, time: 2 },
      { cost: 40, hp: 900, armor: 6, time: 3 },
      { cost: 140, hp: 2200, armor: 10, time: 4, reqLab: 1 },
      { cost: 420, hp: 5200, armor: 14, time: 5, reqLab: 2 },
      { cost: 1200, hp: 12000, armor: 18, time: 6, reqLab: 3 },
    ],
  },
  gate: {
    type: 'gate',
    name: '林门',
    desc: '守夜人可通行，噬林魔无法通过。生命低于同级壁垒。',
    size: 1,
    vision: 2,
    category: 'wall',
    levelNames: ['藤门', '石门', '铁门', '黑曜门', '晶门'],
    levels: [
      { cost: 20, hp: 260, armor: 3, time: 2 },
      { cost: 55, hp: 650, armor: 6, time: 3 },
      { cost: 170, hp: 1600, armor: 10, time: 4, reqLab: 1 },
      { cost: 480, hp: 3700, armor: 14, time: 5, reqLab: 2 },
      { cost: 1350, hp: 8500, armor: 18, time: 6, reqLab: 3 },
    ],
  },
  bolt: {
    type: 'bolt',
    name: '弩塔',
    desc: '基础防御塔，射速稳定。',
    size: 2,
    vision: 7,
    category: 'tower',
    projectile: 'bolt',
    levels: [
      { cost: 90, hp: 380, armor: 2, time: 6, dmg: 12, cooldown: 0.8, range: 6 },
      { cost: 170, hp: 600, armor: 3, time: 7, dmg: 24, cooldown: 0.8, range: 6.3 },
      { cost: 400, hp: 950, armor: 5, time: 8, dmg: 48, cooldown: 0.75, range: 6.6, reqLab: 1 },
      { cost: 950, hp: 1500, armor: 7, time: 9, dmg: 95, cooldown: 0.7, range: 7, reqLab: 2 },
      { cost: 2200, hp: 2300, armor: 9, time: 10, dmg: 190, cooldown: 0.65, range: 7.4, reqLab: 3 },
    ],
  },
  frost: {
    type: 'frost',
    name: '霜塔',
    desc: '寒霜弹使噬林魔减速，范围溅射。需要书阁1级。',
    size: 2,
    vision: 7,
    category: 'tower',
    projectile: 'frost',
    levels: [
      { cost: 220, hp: 450, armor: 3, time: 7, dmg: 10, cooldown: 1.4, range: 6, slow: 0.3, slowTime: 2, splash: 1.5, reqLab: 1 },
      { cost: 520, hp: 800, armor: 5, time: 8, dmg: 26, cooldown: 1.3, range: 6.5, slow: 0.4, slowTime: 2.4, splash: 1.8, reqLab: 2 },
      { cost: 1400, hp: 1400, armor: 7, time: 9, dmg: 60, cooldown: 1.2, range: 7, slow: 0.5, slowTime: 2.8, splash: 2, reqLab: 3 },
    ],
  },
  lance: {
    type: 'lance',
    name: '焰矛塔',
    desc: '高单发伤害的反杀之塔。需要书阁2级。',
    size: 2,
    vision: 8,
    category: 'tower',
    projectile: 'ember',
    levels: [
      { cost: 700, hp: 900, armor: 6, time: 9, dmg: 190, cooldown: 2.0, range: 7.5, reqLab: 2 },
      { cost: 1600, hp: 1500, armor: 8, time: 10, dmg: 420, cooldown: 1.9, range: 8, reqLab: 2 },
      { cost: 3800, hp: 2400, armor: 11, time: 12, dmg: 950, cooldown: 1.8, range: 8.5, reqLab: 3 },
    ],
  },
  repair: {
    type: 'repair',
    name: '愈泉',
    desc: '自动修复范围内的建筑。',
    size: 2,
    vision: 5,
    maxCount: 2,
    category: 'support',
    levels: [
      { cost: 150, hp: 400, armor: 2, time: 6, heal: 10, healRadius: 5 },
      { cost: 420, hp: 700, armor: 4, time: 8, heal: 28, healRadius: 5.5, reqLab: 1 },
      { cost: 1200, hp: 1200, armor: 6, time: 10, heal: 75, healRadius: 6, reqLab: 2 },
    ],
  },
  lab: {
    type: 'lab',
    name: '秘藏书阁',
    desc: '科技建筑。等级解锁高级壁垒、塔与琥珀泉。',
    size: 2,
    vision: 5,
    maxCount: 1,
    category: 'support',
    levels: [
      { cost: 260, hp: 600, armor: 3, time: 10 },
      { cost: 700, hp: 900, armor: 5, time: 14 },
      { cost: 1700, hp: 1400, armor: 7, time: 18 },
    ],
  },
  barracks: {
    type: 'barracks',
    name: '林卫兵营',
    desc: '招募林卫与游侠，从塔防转入主动反攻。需要书阁2级。',
    size: 3,
    vision: 6,
    maxCount: 1,
    category: 'army',
    levelNames: ['兵营', '精锐营地'],
    levels: [
      { cost: 650, hp: 1800, armor: 6, time: 14, reqLab: 2 },
      { cost: 1400, hp: 2600, armor: 8, time: 16, reqLab: 3 },
    ],
  },
  altar: {
    type: 'altar',
    name: '破晓祭坛',
    desc: '15:00 后可建（书阁3级）。建成后充能 90 秒，引来破晓之光直接终结噬林魔。噬林魔会全力摧毁它。',
    size: 3,
    vision: 8,
    maxCount: 1,
    category: 'core',
    levels: [{ cost: ALTAR.cost, hp: ALTAR.hp, armor: ALTAR.armor, time: ALTAR.buildTime, reqLab: ALTAR.reqLab }],
  },
};

export const BUILD_ORDER: BuildingType[] = [
  'harvester',
  'wall',
  'gate',
  'bolt',
  'frost',
  'lance',
  'repair',
  'lab',
  'shelter',
  'barracks',
  'altar',
];

/** Total amber invested in a building up to (and including) a level index. */
export function investedValue(type: BuildingType, level: number): number {
  const lv = BUILDINGS[type].levels;
  let sum = 0;
  for (let i = 0; i <= level && i < lv.length; i++) sum += lv[i].cost;
  return sum;
}

export const SURVIVOR = {
  name: '守夜人',
  hp: 160,
  armor: 1,
  speed: 158, // px/s
  radius: 9,
  dmg: 7,
  cooldown: 1.1,
  range: 4.5, // tiles
  vision: 9,
  buildRange: 1.4, // tiles from footprint edge
  buildWaitForAmber: 45, // seconds a queued build waits on-site for income before giving up
  repairRate: 45, // hp/s
  repairCostRatio: 0.25,
  shelterRebuildCost: 120,
  safeRespawnDist: 12, // tiles: respawn elsewhere if the hunter is this close to the shelter
  demolishRefund: 0.5,
  regen: 1.5,
};

export const HUNTER = {
  name: '噬林魔',
  hp: 1100,
  armor: 2,
  speed: 128,
  radius: 15,
  dmg: 30,
  cooldown: 1.1,
  range: 1.35, // tiles (melee reach from edge)
  vision: 10,
  regen: 3,
  lairRegen: 45,
  lairRadius: 5,
  buildingDmgMult: 1.0,
  hpPerLevel: 85,
  dmgPerLevel: 4,
  maxLevel: 20,
  xpBase: 60,
  xpPerLevel: 45,
  passiveXp: 1.5,
  passiveSoulfire: 2.8,
  soulfireGrowth: 0.004, // per second, multiplicative on passive
  titheRatio: 0.075, // share of all warden income the hunter absorbs as soulfire
  soulfirePerDamage: 0.12,
  destroyBountyRatio: 0.3,
  killSoulfire: 150,
  killSoulfirePerLevel: 15,
  killXp: 120,
  destroyXpRatio: 0.08,
  retreatHp: 0.22,
  cautiousRetreatHp: 0.32, // used while the hunter still has spare lives before the Blood Moon
  resumeHp: 0.9,
};

/**
 * The hunter side is a pack of two. Each hunter is a weaker copy of the solo design so the pack
 * applies about the same total pressure; per-hunter passive income is shared out the same way.
 */
export const HUNTER_PACK = {
  count: 2,
  hpMult: 0.7,
  dmgMult: 0.67,
  incomeShare: 0.75, // passive soulfire, tithe and passive xp per hunter
  names: ['噬林魔·赤瞳', '噬林魔·灰鬃'],
  colors: ['#c23b2a', '#7a4ad0'],
  spawnSpread: 3, // tiles between the two lair spawn points
};

/**
 * Soulfire the hunter earns per point of damage depends on what it tears into: economy pays,
 * stone does not. Multiplies HUNTER.soulfirePerDamage; unlisted buildings use 1.
 */
export const SOULFIRE_HIT_MULT: Partial<Record<BuildingType, number>> = {
  harvester: 3,
  shelter: 1.5,
  lab: 1.5,
  barracks: 1.5,
  altar: 1.5,
  wall: 0.5,
  gate: 0.5,
};

export type ItemSlot = 'claws' | 'hide' | 'striders' | 'heart' | 'horn';

export interface ItemTier {
  cost: number;
  dmg?: number;
  armor?: number;
  speed?: number;
  hp?: number;
  regen?: number;
  siege?: number; // building damage multiplier (absolute)
}

export interface ItemDef {
  slot: ItemSlot;
  name: string;
  desc: string;
  tiers: ItemTier[];
}

export const ITEMS: Record<ItemSlot, ItemDef> = {
  claws: {
    slot: 'claws',
    name: '裂骨之爪',
    desc: '攻击力',
    tiers: [
      { cost: 200, dmg: 14 },
      { cost: 600, dmg: 34 },
      { cost: 1500, dmg: 70 },
      { cost: 3400, dmg: 125 },
    ],
  },
  hide: {
    slot: 'hide',
    name: '岩鳞兽皮',
    desc: '护甲',
    tiers: [
      { cost: 180, armor: 3 },
      { cost: 520, armor: 7 },
      { cost: 1300, armor: 12 },
      { cost: 3000, armor: 18 },
    ],
  },
  striders: {
    slot: 'striders',
    name: '影行足',
    desc: '移动速度',
    tiers: [
      { cost: 260, speed: 10 },
      { cost: 720, speed: 22 },
      { cost: 1800, speed: 38 },
    ],
  },
  heart: {
    slot: 'heart',
    name: '腐木之心',
    desc: '生命与回复',
    tiers: [
      { cost: 220, hp: 300, regen: 3 },
      { cost: 650, hp: 800, regen: 8 },
      { cost: 1700, hp: 1800, regen: 18 },
      { cost: 3800, hp: 3600, regen: 35 },
    ],
  },
  horn: {
    slot: 'horn',
    name: '攻城号角',
    desc: '对建筑伤害倍率',
    tiers: [
      { cost: 300, siege: 1.35 },
      { cost: 900, siege: 1.75 },
      { cost: 2200, siege: 2.3 },
    ],
  },
};

export const ITEM_SLOTS: ItemSlot[] = ['claws', 'hide', 'striders', 'heart', 'horn'];

/** AI tuning knobs (kept here so the simulator can sweep them). */
export const AI = {
  hunterThink: 0.4,
  hunterRetarget: 3,
  survivorThink: 0.5,
  fleeRadius: 8, // tiles
  safeRepairDist: 4, // tiles from hunter
  turretAvoidFactor: 1.0,
  hunterRiskTolerance: 1.0, // job time multiplier the hunter accepts under tower fire
  maxTowerToEcoRatio: 1.3, // AI wardens: tower investment cap relative to economy investment
};

/**
 * Warden AI strategy profiles.
 * hold: seconds a gap wall should hold against current hunter siege dps.
 * towerFactor: multiplier on desired tower dps. ecoFirst: prefers economy while not threatened.
 */
export interface StrategyProfile {
  label: string;
  hold: number;
  towerFactor: number;
  ecoFirst: boolean;
  doubleWall: boolean;
  /** late-route behaviour */
  route: 'eco' | 'turret' | 'legion' | 'balanced';
  /** harvesters the AI builds: leaves room in the clearing for towers / barracks */
  maxHarvesters: number;
}
export const STRATEGIES: Record<string, StrategyProfile> = {
  balanced: { label: '均衡流', hold: 15, towerFactor: 1.0, ecoFirst: false, doubleWall: false, route: 'balanced', maxHarvesters: 5 },
  eco: { label: '经济流', hold: 12, towerFactor: 0.7, ecoFirst: true, doubleWall: false, route: 'eco', maxHarvesters: 6 },
  turret: { label: '炮塔流', hold: 11, towerFactor: 1.7, ecoFirst: false, doubleWall: false, route: 'turret', maxHarvesters: 4 },
  legion: { label: '军团流', hold: 13, towerFactor: 0.7, ecoFirst: false, doubleWall: false, route: 'legion', maxHarvesters: 4 },
};

export const TEAM_COLORS = ['#3f8fd8', '#d8a23f', '#5fbf6a', '#c75fc0', '#59c9c4', '#e07a4a'];
export const HUNTER_COLOR = '#c0283a';
