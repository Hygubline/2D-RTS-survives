// Legion-route timeline: lab, barracks, army size, amber.
import { createWorld, playerIncome } from '../../src/sim/world';
import { stepWorld } from '../../src/sim/step';
for (const seed of [1000, 8919, 16838]) {
  const w = createWorld({ seed, humanControlled: false });
  const p = w.players.find((x) => x.strategy === 'legion')!;
  let next = 240;
  const rows: string[] = [];
  while (!w.winner && w.time < 1200) {
    stepWorld(w);
    w.events.length = 0;
    if (w.time >= next) {
      next += 120;
      const bar = [...w.buildings.values()].find((b) => b.owner === p.id && b.btype === 'barracks');
      const army = [...w.units.values()].filter((u) => u.owner === p.id && (u.utype === 'guard' || u.utype === 'ranger')).length;
      const m = p.aiState as any;
      rows.push(`${(w.time / 60).toFixed(0)}m lab${p.labLevel} amber${p.amber | 0} inc${playerIncome(w, p.id).toFixed(0)} barracks:${bar ? (bar.constructing ? 'building' : 'L' + (bar.level + 1)) : '-'} army${army} lives${p.lives} failed${m?.failed?.size ?? 0}`);
    }
  }
  console.log(`seed ${seed} -> ${w.winner} ${w.endReason} @${(w.time / 60).toFixed(1)}m\n  ` + rows.join('\n  '));
}
