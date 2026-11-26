import { describe, expect, it } from 'vitest';
import { armorMultiplier, BUILDINGS, DT, MATCH } from '../src/config/balance';
import { applyCommands, issueCommand } from '../src/sim/commands';
import { Grid, T_GRASS, T_TREE } from '../src/sim/grid';
import { generateMap } from '../src/sim/mapgen';
import { findPath, passCost } from '../src/sim/pathfinding';
import { stepWorld } from '../src/sim/step';
import { canPlace, checkBuild, createWorld, killUnit, placeBuilding, playerIncome } from '../src/sim/world';

function openGrid(w = 20, h = 20): Grid {
  const g = new Grid(w, h);
  g.terrain.fill(T_GRASS);
  return g;
}

describe('pathfinding', () => {
  it('finds a straight path on open ground', () => {
    const g = openGrid();
    const r = findPath(g, 1, 1, { x0: 10, y0: 1, x1: 10, y1: 1 }, passCost(g, 'survivor'));
    expect(r.reached).toBe(true);
    expect(r.tiles.at(-1)).toEqual({ x: 10, y: 1 });
  });

  it('routes around a wall of trees', () => {
    const g = openGrid();
    for (let y = 0; y < 15; y++) g.terrain[g.idx(5, y)] = T_TREE;
    const r = findPath(g, 2, 2, { x0: 8, y0: 2, x1: 8, y1: 2 }, passCost(g, 'survivor'));
    expect(r.reached).toBe(true);
    expect(r.tiles.some((t) => t.y >= 15)).toBe(true);
    expect(r.tiles.every((t) => g.terrainPassable(t.x, t.y))).toBe(true);
  });

  it('does not cut corners diagonally between obstacles', () => {
    const g = openGrid(4, 4);
    g.terrain[g.idx(1, 0)] = T_TREE;
    g.terrain[g.idx(0, 1)] = T_TREE;
    const r = findPath(g, 0, 0, { x0: 1, y0: 1, x1: 1, y1: 1 }, passCost(g, 'survivor'));
    expect(r.reached).toBe(false);
  });

  it('returns closest node when target is unreachable', () => {
    const g = openGrid();
    for (let y = 0; y < 20; y++) g.terrain[g.idx(10, y)] = T_TREE;
    const r = findPath(g, 2, 5, { x0: 15, y0: 5, x1: 15, y1: 5 }, passCost(g, 'survivor'));
    expect(r.reached).toBe(false);
    expect(r.tiles.at(-1)!.x).toBe(9);
  });

  it('gates block the hunter but not wardens', () => {
    const g = openGrid(3, 1);
    g.setOcc(1, 0, 1, 99, true);
    expect(findPath(g, 0, 0, { x0: 2, y0: 0, x1: 2, y1: 0 }, passCost(g, 'survivor')).reached).toBe(true);
    expect(findPath(g, 0, 0, { x0: 2, y0: 0, x1: 2, y1: 0 }, passCost(g, 'hunter')).reached).toBe(false);
  });
});

describe('balance config', () => {
  it('armor reduces damage with diminishing returns', () => {
    expect(armorMultiplier(0)).toBe(1);
    expect(armorMultiplier(10)).toBeCloseTo(1 / 1.6);
    expect(armorMultiplier(20)).toBeGreaterThan(armorMultiplier(40));
  });

  it('harvester income grows exponentially with rising payback', () => {
    const lv = BUILDINGS.harvester.levels;
    let lastPayback = 0;
    for (let i = 1; i < lv.length; i++) {
      expect(lv[i].income! / lv[i - 1].income!).toBeGreaterThan(2);
      const payback = lv[i].cost / (lv[i].income! - lv[i - 1].income!);
      expect(payback).toBeGreaterThanOrEqual(lastPayback - 1);
      expect(payback).toBeLessThan(90);
      lastPayback = payback;
    }
  });
});

describe('map generation', () => {
  it('produces groves whose gaps seal them off from the plaza', () => {
    for (const seed of [1, 2, 3]) {
      const m = generateMap(seed);
      expect(m.groves.length).toBeGreaterThanOrEqual(5);
      for (const gr of m.groves) {
        const g = m.grid;
        for (const t of gr.gaps) g.setOcc(t.x, t.y, 1, 1, false);
        const r = findPath(g, gr.cx, gr.cy, { x0: m.plaza.x, y0: m.plaza.y, x1: m.plaza.x, y1: m.plaza.y }, passCost(g, 'hunter'));
        expect(r.reached).toBe(false);
        for (const t of gr.gaps) g.setOcc(t.x, t.y, 1, 0, false);
      }
    }
  });
});

describe('rules and commands', () => {
  it('validates placement and affordability', () => {
    const w = createWorld({ seed: 3, humanControlled: true });
    const p = w.players[0];
    expect(checkBuild(w, p, 'lance')).toMatch(/书阁/);
    p.amber = 0;
    expect(checkBuild(w, p, 'harvester')).toBe('琥珀不足');
    expect(checkBuild(w, p, 'shelter')).toBeNull(); // first shelter is free
    const gr = w.groves[0];
    expect(canPlace(w, 'harvester', gr.cx, gr.cy)).toBe(true);
    placeBuilding(w, 0, 'harvester', gr.cx, gr.cy);
    expect(canPlace(w, 'harvester', gr.cx + 1, gr.cy)).toBe(false);
  });

  it('upgrade command spends amber and completes over time', () => {
    const w = createWorld({ seed: 3, humanControlled: true });
    const gr = w.groves[0];
    const b = placeBuilding(w, 0, 'harvester', gr.cx, gr.cy);
    b.constructing = false;
    w.players[0].amber = 1000;
    issueCommand(w, 0, { t: 'upgrade', buildingIds: [b.id] });
    applyCommands(w);
    expect(w.players[0].amber).toBe(1000 - BUILDINGS.harvester.levels[1].cost);
    expect(b.upgrading).not.toBeNull();
    for (let i = 0; i < (BUILDINGS.harvester.levels[1].time + 1) / DT; i++) stepWorld(w, { ai: false });
    expect(b.level).toBe(1);
    expect(playerIncome(w, 0)).toBe(BUILDINGS.harvester.levels[1].income);
  });

  it('build order walks, places a site and finishes construction', () => {
    const w = createWorld({ seed: 5, humanControlled: true });
    const u = w.units.get(w.players[0].unitId)!;
    const tx = Math.floor(u.x / 32) + 2;
    const ty = Math.floor(u.y / 32) + 2;
    issueCommand(w, 0, { t: 'order', unitIds: [u.id], order: { type: 'build', btype: 'wall', tx, ty }, queue: false });
    for (let i = 0; i < 6 / DT; i++) stepWorld(w, { ai: false });
    const id = w.grid.occ[w.grid.idx(tx, ty)];
    expect(id).toBeGreaterThan(0);
    expect(w.buildings.get(id)!.constructing).toBe(false);
  });
});

describe('match flow', () => {
  it('hunter awakens after the grace period', () => {
    const w = createWorld({ seed: 4, humanControlled: false });
    for (let i = 0; i < (MATCH.hunterGrace + 1) / DT; i++) stepWorld(w);
    for (const id of w.hunterPlayerIds) {
      expect(w.players[id].hunter!.awake).toBe(true);
      expect(w.units.get(w.players[id].unitId)?.alive).toBe(true);
    }
    expect(w.hunterPlayerIds.length).toBe(2);
  });

  it('wardens win only when every hunter of the pack loses its last life', () => {
    const w = createWorld({ seed: 4, humanControlled: false });
    for (let i = 0; i < (MATCH.hunterGrace + 1) / DT; i++) stepWorld(w);
    const [a, b] = w.hunterPlayerIds.map((id) => w.players[id]);
    a.hunter!.lives = 1;
    killUnit(w, w.units.get(a.unitId)!);
    stepWorld(w);
    expect(w.winner).toBeNull();
    b.hunter!.lives = 1;
    killUnit(w, w.units.get(b.unitId)!);
    stepWorld(w);
    expect(w.winner).toBe('survivor');
  });

  it('credits a warden kill to the hunter that struck it', () => {
    const w = createWorld({ seed: 4, humanControlled: false });
    for (let i = 0; i < (MATCH.hunterGrace + 1) / DT; i++) stepWorld(w);
    const second = w.players[w.hunterPlayerIds[1]];
    const warden = w.units.get(w.players[0].unitId)!;
    warden.lastHitBy = second.unitId;
    killUnit(w, warden);
    expect(second.hunter!.kills).toBe(1);
    expect(w.players[w.hunterPlayerIds[0]].hunter!.kills).toBe(0);
  });

  it('hunter wins when every warden runs out of lives', () => {
    const w = createWorld({ seed: 4, humanControlled: false });
    for (const p of w.players) if (p.faction === 'survivor') {
      p.lives = 1;
      killUnit(w, w.units.get(p.unitId)!);
    }
    stepWorld(w);
    expect(w.winner).toBe('hunter');
  });

  it('a full AI match runs deterministically to a result', () => {
    const run = () => {
      const w = createWorld({ seed: 11, humanControlled: false });
      while (!w.winner) {
        stepWorld(w);
        w.events.length = 0;
      }
      return { winner: w.winner, time: w.time, kills: w.hunterPlayerIds.map((id) => w.players[id].hunter!.kills).join(',') };
    };
    const a = run();
    expect(a.winner).toMatch(/survivor|hunter/);
    expect(run()).toEqual(a);
  }, 60000);
});

describe('map generation safety', () => {
  it('the hunter lair is always walkable and connected to the plaza', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const m = generateMap(seed * 7919 + 1000);
      expect(m.grid.terrainPassable(m.lair.x, m.lair.y)).toBe(true);
      const r = findPath(m.grid, m.lair.x, m.lair.y, { x0: m.plaza.x, y0: m.plaza.y, x1: m.plaza.x, y1: m.plaza.y }, passCost(m.grid, 'hunter'), 20000);
      expect(r.reached).toBe(true);
    }
  });
});
