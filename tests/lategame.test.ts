import { describe, expect, it } from 'vitest';
import { DT, MATCH } from '../src/config/balance';
import { ALTAR, ARMY, ARMY_RULES, ECON, effectiveIncome, EVOLUTION, PHASES, perkAt } from '../src/config/lategame';
import { applyCommands, issueCommand } from '../src/sim/commands';
import { tryPounce } from '../src/sim/hunterSkills';
import { stepWorld } from '../src/sim/step';
import type { World } from '../src/sim/types';
import { addHunterXp, createWorld, damageEntity, hunterUnitOf, killUnit, placeBuilding, spawnUnit } from '../src/sim/world';

/** first hunter of the pack */
const H = (w: World): number => w.hunterPlayerIds[0];
const hunterUnit = (w: World) => hunterUnitOf(w, H(w));

function awakeWorld(seed = 4): World {
  const w = createWorld({ seed, humanControlled: true });
  for (let i = 0; i < (MATCH.hunterGrace + 0.5) / DT; i++) stepWorld(w, { ai: false });
  return w;
}

function step(w: World, seconds: number): void {
  for (let i = 0; i < seconds / DT; i++) stepWorld(w, { ai: false });
}

describe('economy snowball control', () => {
  it('income above the soft cap is only partly effective', () => {
    expect(effectiveIncome(100)).toBe(100);
    expect(effectiveIncome(ECON.softCap)).toBe(ECON.softCap);
    expect(effectiveIncome(ECON.softCap + 100)).toBeCloseTo(ECON.softCap + 100 * ECON.overCapEfficiency);
  });
});

describe('tower tier perks', () => {
  it('unlock qualitatively different behaviour at specific levels', () => {
    expect(perkAt('bolt', 1)).toBeNull();
    expect(perkAt('bolt', 2)?.multishot).toBe(2);
    expect(perkAt('bolt', 4)?.mark).toBeDefined();
    expect(perkAt('frost', 1)?.freezeEvery).toBe(4);
    expect(perkAt('lance', 2)?.meteor).toBeDefined();
    expect(perkAt('wall', 4)?.thorns).toBeGreaterThan(perkAt('wall', 2)!.thorns!);
  });

  it('a frozen hunter cannot pounce (counterplay)', () => {
    const w = awakeWorld();
    const h = hunterUnit(w)!;
    for (let i = 0; i < 12; i++) addHunterXp(w, H(w), 400);
    const prey = spawnUnit(w, 'survivor', 0, h.x + 32 * 3.5, h.y);
    h.status.rootT = 2;
    expect(tryPounce(w, h, prey)).toBe(false);
    h.status.rootT = 0;
    expect(tryPounce(w, h, prey)).toBe(true);
  });

  it('hunter marks amplify all damage taken', () => {
    const w = awakeWorld();
    const h = hunterUnit(w)!;
    const before = h.hp;
    damageEntity(w, h, 100, null, 'bolt');
    const plain = before - h.hp;
    h.hp = before;
    h.status.markStacks = 8;
    h.status.markT = 5;
    h.status.markPer = 0.04;
    damageEntity(w, h, 100, null, 'bolt');
    expect(before - h.hp).toBeCloseTo(plain * 1.32, 1);
  });

  it('thorned walls reflect melee damage to the hunter', () => {
    const w = awakeWorld();
    const h = hunterUnit(w)!;
    const wall = placeBuilding(w, 0, 'wall', Math.floor(h.x / 32) + 2, Math.floor(h.y / 32));
    wall.constructing = false;
    wall.level = 4;
    wall.maxHp = wall.hp = 12000;
    const hp0 = h.hp;
    damageEntity(w, wall, 200, h, 'melee');
    expect(h.hp).toBeLessThan(hp0);
  });
});

describe('barracks and army', () => {
  it('trains units over time and enforces the population cap', () => {
    const w = createWorld({ seed: 6, humanControlled: true });
    const p = w.players[0];
    p.amber = 100000;
    const g = w.groves[0];
    const b = placeBuilding(w, 0, 'barracks', g.cx - 1, g.cy - 1);
    b.constructing = false;
    issueCommand(w, 0, { t: 'train', buildingId: b.id, utype: 'ranger' });
    applyCommands(w);
    expect(p.amber).toBe(100000 - ARMY.ranger.cost);
    step(w, ARMY.ranger.time + 0.5);
    expect([...w.units.values()].some((u) => u.owner === 0 && u.utype === 'ranger')).toBe(true);
    for (let i = 0; i < 20; i++) issueCommand(w, 0, { t: 'train', buildingId: b.id, utype: 'guard' });
    applyCommands(w);
    const armyNow = [...w.units.values()].filter((u) => u.owner === 0 && u.utype !== 'survivor').length + b.train!.queue.length;
    expect(armyNow).toBeLessThanOrEqual(ARMY_RULES.popCap);
  });
});

describe('hunter growth', () => {
  it('evolves into the Elder form at the evolution level', () => {
    const w = awakeWorld();
    const h = hunterUnit(w)!;
    while (w.players[H(w)].hunter!.level < EVOLUTION.level) addHunterXp(w, H(w), 500);
    expect(w.players[H(w)].hunter!.evolved).toBe(true);
    expect(h.radius).toBe(EVOLUTION.radius);
  });
});

describe('final showdown', () => {
  it('Blood Moon evolves the hunter and removes respawns', () => {
    const w = awakeWorld();
    w.time = PHASES.bloodMoonAt - 0.01;
    stepWorld(w, { ai: false });
    expect(w.bloodMoon).toBe(true);
    expect(w.players[H(w)].hunter!.evolved).toBe(true);
    const p = w.players[0];
    killUnit(w, w.units.get(p.unitId)!);
    expect(p.lives).toBe(0);
  });

  it('a fully charged Dawn Altar wins the match for the wardens', () => {
    const w = awakeWorld();
    w.time = PHASES.altarUnlockAt;
    const g = w.groves[1];
    const altar = placeBuilding(w, 0, 'altar', g.cx - 1, g.cy - 1);
    altar.constructing = false;
    step(w, ALTAR.charge + 1);
    expect(w.winner).toBe('survivor');
    expect(w.endReason).toBe('altar');
  });

  it('the altar cannot be built before it unlocks', () => {
    const w = createWorld({ seed: 2, humanControlled: true });
    const p = w.players[0];
    p.amber = 99999;
    p.labLevel = 3;
    issueCommand(w, 0, { t: 'order', unitIds: [p.unitId], order: { type: 'build', btype: 'altar', tx: w.groves[0].cx, ty: w.groves[0].cy }, queue: false });
    step(w, 1);
    expect([...w.buildings.values()].some((b) => b.btype === 'altar')).toBe(false);
  });
});

describe('hunter soulfire by target', () => {
  it('hitting an amber harvester pays more soulfire than hitting a wall', () => {
    const w = awakeWorld();
    const h = hunterUnit(w)!;
    const hs = w.players[H(w)].hunter!;
    const g = w.groves[0];
    const harv = placeBuilding(w, 0, 'harvester', g.cx, g.cy)!;
    const wall = placeBuilding(w, 0, 'wall', g.cx + 3, g.cy)!;
    const gain = (b: typeof harv) => {
      const before = hs.soulfire;
      damageEntity(w, b, 20, h, 'melee', { ignoreArmor: true });
      return hs.soulfire - before;
    };
    const fromWall = gain(wall);
    const fromHarvester = gain(harv);
    expect(fromWall).toBeGreaterThan(0);
    expect(fromHarvester).toBeGreaterThan(fromWall * 2);
  });
});
