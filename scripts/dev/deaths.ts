// Diagnoses warden deaths: when, where, and whether a pounce was involved.
import { createWorld } from '../../src/sim/world';
import { stepWorld } from '../../src/sim/step';
const buckets = new Map<string, number>();
const add = (k: string) => buckets.set(k, (buckets.get(k) ?? 0) + 1);
for (let g = 0; g < 12; g++) {
  const w = createWorld({ seed: 1000 + g * 7919, humanControlled: false });
  let lastPounce = -99;
  while (!w.winner) {
    stepWorld(w);
    for (const e of w.events) {
      if (e.e === 'skill' && e.skill === 'pounce') lastPounce = w.time;
      if (e.e === 'death' && e.utype === 'survivor') {
        const p = w.players[e.owner];
        const m = p.aiState as any;
        const gr = m?.groveId >= 0 ? w.groves[m.groveId] : null;
        const inG = gr ? Math.hypot(e.x / 32 - gr.cx, e.y / 32 - gr.cy) <= gr.r + 0.6 : false;
        const sealed = gr ? gr.gaps.every((t) => { const id = w.grid.occ[w.grid.idx(t.x, t.y)]; const b = id && w.buildings.get(id); return b && !b.constructing; }) : false;
        add(`${inG ? 'inside' : 'outside'}/${sealed ? 'sealed' : 'open'}${w.time - lastPounce < 2 ? '/pounced' : ''}`);
        add(`min${Math.floor(w.time / 180) * 3}`);
      }
    }
    w.events.length = 0;
  }
}
console.log([...buckets].sort());
