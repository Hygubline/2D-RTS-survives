/**
 * Headless balance simulator. Runs full AI-vs-AI matches with no renderer and compares
 * late-game routes (eco / turret / legion / balanced). Reports match endings, per-route
 * results and the power curve at 5/10/15/20 minutes.
 *
 *   npm run simulate              # 24 matches
 *   npm run simulate -- 48        # more matches
 */
import { armorMultiplier, BUILDINGS, STRATEGIES } from '../src/config/balance';
import { ECON, PHASES, perkAt } from '../src/config/lategame';
import { stepWorld } from '../src/sim/step';
import { isArmy, type World } from '../src/sim/types';
import { createWorld, playerIncome, unitStats } from '../src/sim/world';

const N = Number(process.argv[2] ?? 24);
const ROUTES = Object.keys(STRATEGIES);
const SNAP_MIN = [5, 10, 15, 20];

interface RouteAgg {
  seats: number;
  alive: number; // warden still alive at match end
  wins: number; // team won with this player alive
  deaths: number;
  earned: number;
  income: number[]; // at snapshots
  hunterDmg: number;
  army: number;
  altars: number;
}

interface Snap {
  n: number;
  income: number; // avg per warden
  towerDps: number; // team
  armyDps: number; // team
  armyCount: number;
  hunterLv: number;
  hunterEhp: number;
  index: number; // counter-attack index
}

const routes = new Map<string, RouteAgg>(ROUTES.map((r) => [r, { seats: 0, alive: 0, wins: 0, deaths: 0, earned: 0, income: SNAP_MIN.map(() => 0), hunterDmg: 0, army: 0, altars: 0 }]));
const snaps: Snap[] = SNAP_MIN.map(() => ({ n: 0, income: 0, towerDps: 0, armyDps: 0, armyCount: 0, hunterLv: 0, hunterEhp: 0, index: 0 }));
const reasons = new Map<string, number>();
let hunterWins = 0;
let totalLen = 0;
let evolvedAt = 0;
let evolvedN = 0;
let altarBuilt = 0;
const t0 = Date.now();

function snapshot(w: World, i: number): void {
  // the strongest hunter of the pack
  const top = w.hunterPlayerIds.map((id) => w.players[id]).reduce((a, b) => (b.hunter!.level > a.hunter!.level ? b : a));
  const hs = top.hunter!;
  const hst = unitStats(w, { utype: 'hunter', elite: false, owner: top.id });
  const ehp = hst.maxHp / armorMultiplier(hst.armor);
  // the hunter fights one base at a time: use the strongest single base
  const perOwner = new Map<number, number>();
  for (const b of w.buildings.values()) {
    const lv = BUILDINGS[b.btype].levels[b.level];
    if (b.constructing || !lv.dmg) continue;
    const perk = perkAt(b.btype, b.level);
    const dps = (lv.dmg / (lv.cooldown ?? 1)) * (perk?.multishot ? perk.multishot * (perk.shotDmg ?? 1) : 1);
    perOwner.set(b.owner, (perOwner.get(b.owner) ?? 0) + dps);
  }
  const towerDps = Math.max(0, ...perOwner.values());
  let armyDps = 0;
  let armyCount = 0;
  for (const u of w.units.values()) {
    if (!u.alive || !isArmy(u.utype)) continue;
    const st = unitStats(w, u);
    armyDps += st.dmg / st.cooldown;
    armyCount++;
  }
  const wardens = w.players.filter((p) => p.faction === 'survivor');
  const s = snaps[i];
  s.n++;
  s.income += wardens.reduce((a, p) => a + playerIncome(w, p.id), 0) / wardens.length;
  s.towerDps += towerDps;
  s.armyDps += armyDps;
  s.armyCount += armyCount;
  s.hunterLv += hs.level;
  s.hunterEhp += ehp;
  // effective damage the hunter takes after armour, over a 30 s focused fight, vs its effective hp
  s.index += ((towerDps + armyDps) * armorMultiplier(hst.armor) * 30) / hst.maxHp;
  for (const p of wardens) routes.get(p.strategy)!.income[i] += playerIncome(w, p.id);
}

for (let g = 0; g < N; g++) {
  const strategies = ROUTES.map((_, i) => ROUTES[(i + g) % ROUTES.length]);
  const w = createWorld({ seed: 1000 + g * 7919, humanControlled: false, strategies });
  let snapIdx = 0;
  let altarSeen = false;
  while (!w.winner) {
    stepWorld(w);
    w.events.length = 0;
    if (snapIdx < SNAP_MIN.length && w.time >= SNAP_MIN[snapIdx] * 60) snapshot(w, snapIdx++);
    if (!altarSeen && [...w.buildings.values()].some((b) => b.btype === 'altar')) {
      altarSeen = true;
      altarBuilt++;
    }
  }
  const h = w.hunterPlayerIds.map((id) => w.players[id].hunter!).reduce((a, b) => (b.level > a.level ? b : a));
  if (w.winner === 'hunter') hunterWins++;
  totalLen += w.time;
  reasons.set(w.endReason ?? '?', (reasons.get(w.endReason ?? '?') ?? 0) + 1);
  if (h.evolved) {
    evolvedN++;
    evolvedAt += Math.min(w.time, PHASES.bloodMoonAt);
  }
  for (const p of w.players) {
    if (p.faction !== 'survivor') continue;
    const a = routes.get(p.strategy)!;
    const alive = !!w.units.get(p.unitId)?.alive;
    a.seats++;
    if (alive) a.alive++;
    if (alive && w.winner === 'survivor') a.wins++;
    a.deaths += p.deaths;
    a.earned += p.totalEarned;
    a.hunterDmg += p.stats.hunterDamage;
    a.army += p.stats.armyTrained;
  }
  process.stdout.write(`match ${g + 1}/${N}: ${w.winner} by ${w.endReason} @ ${(w.time / 60).toFixed(1)}min, hunter lv${h.level}${h.evolved ? ' (evolved)' : ''}, kills ${h.kills}, army slain ${h.unitsSlain}\n`);
}

const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
console.log('\n=== Economy model ===');
const lv = BUILDINGS.harvester.levels;
console.log(`Amber Tap income per level: ${lv.map((l) => l.income).join(' → ')}   soft cap ${ECON.softCap}/s per warden (${pct(ECON.overCapEfficiency)} above)`);

console.log('\n=== Match outcomes ===');
console.log(`matches ${N}   hunter win-rate ${pct(hunterWins / N)}   avg length ${(totalLen / N / 60).toFixed(1)} min   altar built in ${pct(altarBuilt / N)}   hunter evolved in ${pct(evolvedN / N)} (avg @ ${(evolvedAt / Math.max(1, evolvedN) / 60).toFixed(1)} min)`);
console.log('end reasons: ' + [...reasons].map(([k, v]) => `${k} ${pct(v / N)}`).join('   '));

console.log('\n=== Power curve (team averages) ===');
console.log('minute  income/warden  bestBaseTowerDPS  armyDPS  army  hunterLv  counter-attack index');
snaps.forEach((s, i) => {
  const n = Math.max(1, s.n);
  console.log(
    `${String(SNAP_MIN[i]).padStart(6)}  ${(s.income / n).toFixed(1).padStart(13)}  ${(s.towerDps / n).toFixed(0).padStart(8)}  ${(s.armyDps / n).toFixed(0).padStart(7)}  ${(s.armyCount / n).toFixed(1).padStart(4)}  ${(s.hunterLv / n).toFixed(1).padStart(8)}  ${(s.index / n).toFixed(2).padStart(10)}   (${s.n} matches reached)`,
  );
});

console.log('\n=== Late routes ===');
console.log('route            alive@end  won-alive  deaths  earned   income@5/10/15/20        hunterDmg  army');
for (const [r, a] of routes) {
  const n = Math.max(1, a.seats);
  console.log(
    `${(STRATEGIES[r].label + ' ' + r).padEnd(16)} ${pct(a.alive / n).padStart(8)}  ${pct(a.wins / n).padStart(8)}  ${(a.deaths / n).toFixed(2).padStart(6)}  ${(a.earned / n).toFixed(0).padStart(6)}   ${a.income.map((x) => (x / n).toFixed(0).padStart(4)).join(' ')}   ${(a.hunterDmg / n).toFixed(0).padStart(9)}  ${(a.army / n).toFixed(1).padStart(4)}`,
  );
}
const winRates = [...routes.values()].map((a) => a.wins / Math.max(1, a.seats));
const spread = (Math.max(...winRates) - Math.min(...winRates)) * 100;
console.log(`\nroute spread ${spread.toFixed(0)} pts (guardrail < 25)   hunter win-rate guardrail 30–55%: ${hunterWins / N >= 0.3 && hunterWins / N <= 0.55 ? 'OK' : 'OUT OF RANGE'}   dawn endings guardrail < 40%: ${(reasons.get('dawn') ?? 0) / N < 0.4 ? 'OK' : 'TOO MANY'}`);
console.log(`elapsed ${((Date.now() - t0) / 1000).toFixed(1)}s`);
