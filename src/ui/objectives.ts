/**
 * Early-game objective tracker: the five things a new warden must do before the hunter
 * finds them. Pure function of world state so it can be unit-tested and stays lockstep-safe.
 */
import { PHASES } from '../config/lategame';
import type { Building, Grove, World } from '../sim/types';

export interface Objective {
  text: string;
  key: string;
  done: boolean;
  progress?: string;
}

export interface ObjectiveState {
  visible: boolean;
  items: Objective[];
  /** index of the first unfinished step, or -1 when all are done */
  current: number;
}

const HARVESTERS_WANTED = 2;

function myBuildings(world: World, me: number): Building[] {
  const out: Building[] = [];
  for (const b of world.buildings.values()) if (b.owner === me) out.push(b);
  return out;
}

/** The grove whose ring contains the player's (first) shelter, if any. */
function homeGrove(world: World, shelter: Building | undefined): Grove | null {
  if (!shelter) return null;
  const sx = shelter.tx + 1;
  const sy = shelter.ty + 1;
  let best: Grove | null = null;
  let bestD = Infinity;
  for (const g of world.groves) {
    const d = Math.hypot(g.cx - sx, g.cy - sy);
    if (d <= g.r + 1 && d < bestD) {
      best = g;
      bestD = d;
    }
  }
  return best;
}

function sealedGaps(world: World, g: Grove): number {
  let n = 0;
  for (const t of g.gaps) if (world.grid.occ[world.grid.idx(t.x, t.y)] > 0) n++;
  return n;
}

export function objectives(world: World, me: number): ObjectiveState {
  const mine = myBuildings(world, me);
  const shelter = mine.find((b) => b.btype === 'shelter');
  const harvesters = mine.filter((b) => b.btype === 'harvester');
  const grove = homeGrove(world, shelter);
  const sealed = grove ? sealedGaps(world, grove) : 0;
  const gapTotal = grove ? grove.gaps.length : 0;

  const items: Objective[] = [
    { text: '在林间空地建造庇护所', key: 'Z', done: !!shelter },
    {
      text: `建造 ${HARVESTERS_WANTED} 座琥珀泉`,
      key: 'Q',
      done: harvesters.length >= HARVESTERS_WANTED,
      progress: `${Math.min(harvesters.length, HARVESTERS_WANTED)}/${HARVESTERS_WANTED}`,
    },
    {
      text: '用壁垒 / 林门封住缺口',
      key: 'W E',
      done: !!grove && sealed >= gapTotal,
      progress: grove ? `${sealed}/${gapTotal}` : undefined,
    },
    { text: '在墙后建一座弩塔', key: 'R', done: mine.some((b) => b.btype === 'bolt') },
    { text: '升级琥珀泉（选中后按 Q）', key: 'Q', done: harvesters.some((b) => b.level >= 1) },
  ];
  const current = items.findIndex((i) => !i.done);
  const player = world.players[me];
  const visible = player.faction === 'survivor' && world.time < PHASES.midAt && current !== -1 && player.lives > 0 && !world.winner;
  return { visible, items, current };
}
