import { createWorld } from '../../src/sim/world';
import { stepWorld } from '../../src/sim/step';
const w = createWorld({ seed: 1000, humanControlled: false });
const p = w.players.find((x) => x.strategy === 'legion')!;
const msgs = new Map<string, number>();
let firstOrders: string[] = [];
while (w.time < 800) {
  stepWorld(w);
  for (const e of w.events) if (e.e === 'msg' && e.player === p.id) msgs.set(e.text, (msgs.get(e.text) ?? 0) + 1);
  w.events.length = 0;
  const u = w.units.get(p.unitId);
  const o = u?.orders[0];
  if (o?.type === 'build' && o.btype === 'barracks' && firstOrders.length < 3) {
    const s = `${w.time.toFixed(0)} barracks@${o.tx},${o.ty} warden@${(u!.x / 32) | 0},${(u!.y / 32) | 0}`;
    if (!firstOrders.includes(s)) firstOrders.push(s);
  }
}
const m = p.aiState as any;
const g = w.groves[m.groveId];
console.log('grove', g.cx, g.cy, 'r', g.r, 'msgs', [...msgs]);
console.log(firstOrders);
console.log('failed sample', [...m.failed].filter((k: string) => k.startsWith('barracks')).slice(0, 6));
