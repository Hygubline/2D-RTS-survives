import { createWorld } from '../../src/sim/world';
import { stepWorld } from '../../src/sim/step';
const w = createWorld({ seed: 1000, humanControlled: true });
w.players[0].isAI = true;
let last = '';
while (w.time < 62) {
  stepWorld(w);
  w.events.length = 0;
  const h = w.units.get(w.players[w.hunterPlayerIds[0]].unitId);
  if (!h) continue;
  const tx = (h.x / 32) | 0, ty = (h.y / 32) | 0;
  const key = `${tx},${ty}`;
  if (key !== last) {
    console.log(w.time.toFixed(2), 'tile', key, 'passable', w.grid.terrainPassable(tx, ty), 'order', JSON.stringify(h.orders[0]), 'next wp', JSON.stringify(h.path[h.pathIdx]));
    last = key;
  }
}
