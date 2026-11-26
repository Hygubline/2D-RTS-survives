// Traces the hunter AI on one seed: position, mode, target, order.
import { createWorld, unitStats } from '../../src/sim/world';
import { stepWorld } from '../../src/sim/step';
const seed = Number(process.argv[2] ?? 1000);
const w = createWorld({ seed, humanControlled: true });
w.players[0].isAI = true;
w.players[0].strategy = 'legion';
let next = 60;
while (!w.winner && w.time < 600) {
  stepWorld(w);
  w.events.length = 0;
  if (w.time >= next) {
    next += 30;
    const hp0 = w.players[w.hunterPlayerIds[0]];
    const h = w.units.get(hp0.unitId);
    const m = hp0.aiState as any;
    const hs = hp0.hunter!;
    if (!h) { console.log(w.time.toFixed(0), 'no hunter unit', hs.lives); continue; }
    const t = m?.targetId && (w.units.get(m.targetId) ?? w.buildings.get(m.targetId));
    console.log(w.time.toFixed(0), 'lv', hs.level, 'pos', (h.x / 32) | 0, (h.y / 32) | 0, 'hp', h.hp | 0, '/', unitStats(w, h).maxHp | 0, m?.mode, 'tgt', t ? (t.kind === 'unit' ? t.utype : t.btype) : '-', 'order', JSON.stringify(h.orders[0]), 'known', w.hunterKnown.size, 'path', h.path.length - h.pathIdx);
  }
}
