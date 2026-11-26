import { createWorld } from '../../src/sim/world';
import { stepWorld } from '../../src/sim/step';
for (let a = 0; a < 8; a++) {
  const seed = 1000 + a * 101;
  const w = createWorld({ seed, humanControlled: true });
  w.players[0].isAI = true;
  w.players[0].strategy = process.argv[2] ?? 'legion';
  while (!w.winner && w.time < 1300) { stepWorld(w); w.events.length = 0; }
  const hs = w.hunterPlayerIds.map((id) => w.players[id].hunter!);
  console.log(seed, w.winner, w.endReason, (w.time / 60).toFixed(2), hs.map((h) => h.lives + '/' + h.level).join(' '));
}
