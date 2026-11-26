import type { BuildingType, ItemSlot } from '../config/balance';
import type { ArmyType, HunterSkill } from '../config/lategame';
import type { Grid } from './grid';
import type { Rng } from './rng';

export type Faction = 'survivor' | 'hunter';
/** survivor = the Warden (builder); guard/ranger = army; hunter = the Gloomhide */
export type UnitType = 'survivor' | 'hunter' | ArmyType;

export function factionOf(utype: UnitType): Faction {
  return utype === 'hunter' ? 'hunter' : 'survivor';
}

export function isArmy(utype: UnitType): utype is ArmyType {
  return utype === 'guard' || utype === 'ranger';
}

export interface Point {
  x: number;
  y: number;
}

export type Order =
  | { type: 'move'; x: number; y: number }
  | { type: 'attackMove'; x: number; y: number }
  | { type: 'attack'; targetId: number }
  | { type: 'build'; btype: BuildingType; tx: number; ty: number; siteId?: number; waitT?: number }
  | { type: 'repair'; targetId: number };

/** Combat statuses (mostly applied to the hunter by tower perks). */
export interface UnitStatus {
  markStacks: number;
  markT: number;
  markPer: number;
  rootT: number; // frozen: cannot move or cast
  shatter: number; // bonus damage taken while rooted
  stunT: number; // cannot move, attack or cast
  burnDps: number;
  burnT: number;
  antiRegen: number;
}

export function freshStatus(): UnitStatus {
  return { markStacks: 0, markT: 0, markPer: 0, rootT: 0, shatter: 0, stunT: 0, burnDps: 0, burnT: 0, antiRegen: 0 };
}

export interface Unit {
  id: number;
  kind: 'unit';
  utype: UnitType;
  owner: number;
  x: number;
  y: number;
  px: number; // previous tick position (render interpolation)
  py: number;
  hp: number;
  radius: number;
  facing: number;
  alive: boolean;
  orders: Order[];
  path: Point[];
  pathIdx: number;
  pathGoalKey: string;
  repathTimer: number;
  stuckTimer: number;
  stuckRef: Point;
  stuckFails: number;
  attackCd: number;
  attackAnim: number; // seconds remaining of swing animation
  workAnim: number;
  moving: boolean;
  slowTimer: number;
  slowAmount: number;
  lastHitBy: number;
  status: UnitStatus;
  elite: boolean; // army trained at an elite barracks
}

export interface Building {
  id: number;
  kind: 'building';
  btype: BuildingType;
  owner: number;
  tx: number;
  ty: number;
  size: number;
  level: number;
  hp: number;
  maxHp: number;
  constructing: boolean;
  progress: number; // 0..1 for construction
  upgrading: { progress: number; time: number } | null;
  attackCd: number;
  aim: number; // turret head angle
  alive: boolean;
  lastDamaged: number; // world time
  fireAnim: number;
  acc: number; // accumulated income for floating text
  lastAlert: number;
  hits: number; // projectile hits landed (freeze cadence)
  silenceT: number; // silenced by the hunter's roar
  train: { queue: ArmyType[]; t: number } | null;
  rally: Point | null;
  charge: number; // altar charge 0..1
}

export type Entity = Unit | Building;

export interface Projectile {
  id: number;
  ptype: 'bolt' | 'frost' | 'ember' | 'stone' | 'arrow';
  variant: '' | 'pierce' | 'mark' | 'meteor';
  owner: number;
  x: number;
  y: number;
  px: number;
  py: number;
  targetId: number;
  tx: number;
  ty: number;
  speed: number;
  dmg: number;
  slow: number;
  slowTime: number;
  splash: number;
  sourceId: number;
}

export interface HunterState {
  level: number;
  xp: number;
  soulfire: number;
  totalSoulfire: number;
  items: Record<ItemSlot, number>; // tier count bought (0 = none)
  lives: number;
  awake: boolean;
  scentTimer: number;
  scentActive: number;
  /** stats for AI shopping heuristics */
  towerDamageTaken: number;
  siegeTime: number;
  chaseFails: number;
  kills: number;
  buildingsDestroyed: number;
  unitsSlain: number;
  skillCd: Record<HunterSkill, number>;
  rendHits: number;
  evolved: boolean;
}

export interface Player {
  id: number;
  name: string;
  faction: Faction;
  isHuman: boolean;
  isAI: boolean;
  color: string;
  amber: number;
  totalEarned: number;
  lives: number;
  unitId: number;
  respawnTimer: number;
  labLevel: number;
  strategy: string;
  deaths: number;
  sheltersBuilt: number;
  aiState?: Record<string, unknown>;
  hunter?: HunterState;
  stats: { incomeSamples: number[]; hunterDamage: number; armyTrained: number };
}

export interface Grove {
  id: number;
  cx: number;
  cy: number;
  r: number;
  gaps: Point[]; // gap tiles (to be walled)
  interior: Point[];
  claimedBy: number; // player id, -1 if free
}

export type DamageSource = 'melee' | 'bolt' | 'frost' | 'ember' | 'stone' | 'arrow' | 'burn' | 'thorns' | 'skill' | 'cleave';

export type EndReason = 'dawn' | 'altar' | 'hunterSlain' | 'wardensFell';

export type GameEvent =
  | { e: 'hit'; id: number; x: number; y: number; dmg: number; onBuilding: boolean; source: DamageSource }
  | { e: 'shoot'; x: number; y: number; ptype: Projectile['ptype']; variant: Projectile['variant'] }
  | { e: 'death'; x: number; y: number; utype: UnitType; owner: number }
  | { e: 'destroyed'; x: number; y: number; btype: BuildingType; size: number; owner: number }
  | { e: 'built'; x: number; y: number; btype: BuildingType; owner: number }
  | { e: 'levelup'; x: number; y: number; id: number; perk?: string; income?: number }
  | { e: 'msg'; text: string; player: number; tone: 'info' | 'warn' | 'bad' | 'good' }
  | { e: 'banner'; text: string; sub: string; tone: 'good' | 'bad' | 'epic' }
  | { e: 'alert'; x: number; y: number; player: number }
  | { e: 'income'; x: number; y: number; amount: number; owner: number; level: number }
  | { e: 'swing'; x: number; y: number; angle: number; big: boolean }
  | { e: 'skill'; skill: HunterSkill; x: number; y: number; x2: number; y2: number; radius: number }
  | { e: 'status'; id: number; x: number; y: number; kind: 'freeze' | 'burn' | 'mark' | 'stun' }
  | { e: 'evolve'; x: number; y: number }
  | { e: 'trained'; x: number; y: number; utype: UnitType; owner: number }
  | { e: 'gameover'; winner: Faction; reason: EndReason };

export interface World {
  time: number;
  tick: number;
  rng: Rng;
  grid: Grid;
  units: Map<number, Unit>;
  buildings: Map<number, Building>;
  projectiles: Projectile[];
  players: Player[];
  groves: Grove[];
  plaza: Point;
  lair: Point;
  nextId: number;
  events: GameEvent[];
  pending: { playerId: number; cmd: import('./commands').Command }[];
  winner: Faction | null;
  endReason: EndReason | null;
  bloodMoon: boolean;
  /** one-shot phase announcements already made */
  announced: Set<string>;
  /** survivor team vision, tile resolution: 0 never, 1 explored, 2 visible */
  vision: Uint8Array;
  visionTimer: number;
  /** tiles the hunter AI has seen buildings on (memory) */
  hunterKnown: Set<number>;
  /** player ids of the hunter pack (always HUNTER_PACK.count of them) */
  hunterPlayerIds: number[];
}
