import { describe, expect, it } from 'vitest';
import { PHASES } from '../src/config/lategame';
import { createWorld, placeBuilding } from '../src/sim/world';
import { objectives } from '../src/ui/objectives';

function freshWorld() {
  return createWorld({ seed: 3, humanControlled: true });
}

describe('early-game objectives', () => {
  it('starts with the shelter step open and nothing done', () => {
    const o = objectives(freshWorld(), 0);
    expect(o.visible).toBe(true);
    expect(o.items[0].done).toBe(false);
    expect(o.items.every((i) => !i.done)).toBe(true);
    expect(o.current).toBe(0);
  });

  it('ticks off shelter and counts harvesters', () => {
    const w = freshWorld();
    const g = w.groves[0];
    placeBuilding(w, 0, 'shelter', g.cx - 1, g.cy - 1);
    placeBuilding(w, 0, 'harvester', g.cx + 2, g.cy - 1);
    const o = objectives(w, 0);
    expect(o.items[0].done).toBe(true);
    expect(o.items[1].done).toBe(false);
    expect(o.items[1].progress).toBe('1/2');
    expect(o.current).toBe(1);
  });

  it('counts sealed gaps of the grove that holds the shelter', () => {
    const w = freshWorld();
    const g = w.groves[0];
    placeBuilding(w, 0, 'shelter', g.cx - 1, g.cy - 1);
    const before = objectives(w, 0).items[2];
    expect(before.progress).toBe(`0/${g.gaps.length}`);
    for (const t of g.gaps) placeBuilding(w, 0, 'wall', t.x, t.y);
    expect(objectives(w, 0).items[2].done).toBe(true);
  });

  it('hides once the early phase is over', () => {
    const w = freshWorld();
    w.time = PHASES.midAt + 1;
    expect(objectives(w, 0).visible).toBe(false);
  });
});
