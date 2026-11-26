import { canPlace, createWorld } from '../../src/sim/world';
import { stepWorld } from '../../src/sim/step';
const w = createWorld({ seed: 1000, humanControlled: false });
const p = w.players.find((x) => x.strategy === 'legion')!;
while (w.time < 700) { stepWorld(w); w.events.length = 0; }
const m = p.aiState as any;
const g = w.groves[m.groveId];
const u = w.units.get(p.unitId)!;
// reachable flood from warden
const map = new Uint8Array(w.grid.w * w.grid.h);
const st = [w.grid.idx((u.x / 32) | 0, (u.y / 32) | 0)]; map[st[0]] = 1;
while (st.length) { const i = st.pop()!; const x = i % w.grid.w, y = (i - x) / w.grid.w; for (const [a, b] of [[x+1,y],[x-1,y],[x,y+1],[x,y-1]]) { if (!w.grid.passable(a, b, 'survivor')) continue; const j = w.grid.idx(a, b); if (!map[j]) { map[j] = 1; st.push(j); } } }
let reach = 0; for (const v of map) reach += v;
const spots: string[] = [];
for (let y = g.cy - 20; y <= g.cy + 20; y++) for (let x = g.cx - 20; x <= g.cx + 20; x++) if (canPlace(w, 'barracks', x, y)) { let ok = false; for (let ty = y - 1; ty <= y + 3; ty++) for (let tx = x - 1; tx <= x + 3; tx++) if (w.grid.inBounds(tx, ty) && map[w.grid.idx(tx, ty)] && !(tx >= x && tx < x + 3 && ty >= y && ty < y + 3)) ok = true; if (ok) spots.push(`${x},${y}@${Math.hypot(x + 1.5 - g.cx, y + 1.5 - g.cy).toFixed(1)}`); }
console.log('grove', g.cx, g.cy, 'r', g.r, 'warden', (u.x / 32) | 0, (u.y / 32) | 0, 'reachable tiles', reach, 'lab', p.labLevel, 'amber', p.amber | 0);
console.log('reachable 3x3 spots within 20 tiles:', spots.length, spots.slice(0, 12));
console.log('orders', JSON.stringify(u.orders), 'pending', JSON.stringify(m.pending));
