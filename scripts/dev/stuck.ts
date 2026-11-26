import { createWorld } from '../../src/sim/world';
import { findPath, passCost, smoothPath } from '../../src/sim/pathfinding';
const w = createWorld({ seed: 1000, humanControlled: true });
const g = w.grid;
const r = findPath(g, 8, 19, { x0: 33, y0: 19, x1: 33, y1: 19 }, passCost(g, 'hunter'));
console.log('reached', r.reached, 'len', r.tiles.length, 'end', JSON.stringify(r.tiles.at(-1)));
console.log('smoothed', JSON.stringify(smoothPath(g, { x: 8 * 32 + 16, y: 19 * 32 + 16 }, r.tiles.slice(1), 12, 'hunter').slice(0, 4)));
for (let y = 15; y <= 23; y++) { let row = ''; for (let x = 4; x <= 16; x++) row += x === 8 && y === 19 ? 'H' : g.terrainPassable(x, y) ? '.' : '#'; console.log(row); }
