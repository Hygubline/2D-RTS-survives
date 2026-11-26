// Late-game browser play-test using the developer phase jump. Drives barracks/army through real input.
// Usage: npm run dev (port 5199) then: npm run playtest:late
import { chromium } from 'playwright';
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};
const b = await chromium.launch({ headless: true });
const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const wait = (ms) => page.waitForTimeout(ms);
const shot = (n) => page.screenshot({ path: `playtest-shots/late-${n}.png` });
const ev = (fn, arg) => page.evaluate(fn, arg);

async function jump(min, route) {
  await page.goto(`http://localhost:5199/?seed=1000&dev=1&jump=${min}&route=${route}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => /已到|失败/.test(document.getElementById('dev-status')?.textContent ?? ''), null, { timeout: 60000 });
  return ev(() => document.getElementById('dev-status').textContent);
}

/** Pause, reveal, centre on a world point, screenshot, resume. */
async function look(name, x, y) {
  await ev(([x, y]) => {
    window.__game.paused = true;
    const w = window.__debug.world();
    w.vision.fill(2);
    w.tick++;
    window.__debug.centerOn(x, y);
  }, [x, y]);
  await wait(250);
  await shot(name);
  await ev(() => (window.__game.paused = false));
}

const summary = () =>
  ev(() => {
    const w = window.__debug.world();
    const me = w.players[0];
    const h = w.players[w.hunterPlayerIds[0]].hunter;
    const mine = [...w.buildings.values()].filter((b) => b.owner === 0);
    return {
      time: Math.round(w.time),
      amber: Math.round(me.amber),
      income: me.totalEarned,
      lab: me.labLevel,
      buildings: mine.map((b) => `${b.btype}${b.level + 1}`).join(' '),
      army: [...w.units.values()].filter((u) => u.owner === 0 && (u.utype === 'guard' || u.utype === 'ranger')).length,
      hunter: { lv: h.level, evolved: h.evolved, lives: h.lives, alive: !!w.units.get(w.players[w.hunterPlayerIds[0]].unitId)?.alive },
      bloodMoon: w.bloodMoon,
      phaseChip: document.getElementById('v-phase').textContent,
    };
  });

// ---- 10 minutes, legion route
const j10 = await jump(10, 'legion');
const s10 = await summary();
check('dev jump reaches 10:00 with a living base', /已到 10:00/.test(j10) && s10.buildings.includes('shelter'), j10);
check('phase chip shows the late phase', s10.phaseChip.startsWith('后期'), s10.phaseChip);
await page.keyboard.press('h');
await wait(300);
await shot('10-base');

// give resources and build a barracks with the warden through the UI if the AI didn't
await ev(() => window.__debug.addAmber(4000));
const hasBarracks = await ev(() => [...window.__debug.world().buildings.values()].some((b) => b.owner === 0 && b.btype === 'barracks'));
if (!hasBarracks) {
  await ev(() => { const p = window.__debug.world().players[0]; p.labLevel = Math.max(2, p.labLevel); });
  const spot = await ev(() => {
    const w = window.__debug.world();
    const u = w.units.get(w.players[0].unitId);
    const tx0 = Math.floor(u.x / 32), ty0 = Math.floor(u.y / 32);
    for (let r = 2; r < 14; r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          const tx = tx0 + dx, ty = ty0 + dy;
          let ok = true;
          for (let y = ty; y < ty + 3; y++) for (let x = tx; x < tx + 3; x++) if (!w.grid.buildable(x, y)) ok = false;
          if (ok) return { tx, ty };
        }
    return null;
  });
  await page.keyboard.press('Space');
  await page.keyboard.press('x');
  const p = await ev(([x, y]) => window.__debug.tileToScreen(x + 1, y + 1), [spot.tx, spot.ty]);
  await page.mouse.move(p.x, p.y);
  await page.mouse.click(p.x, p.y);
  await ev(() => window.__debug.fastForward(22));
}
// select barracks by clicking it, train 2 rangers + 1 guard via hotkeys
const bar = await ev(() => { const b = [...window.__debug.world().buildings.values()].find((b) => b.owner === 0 && b.btype === 'barracks'); return b && { id: b.id, done: !b.constructing }; });
console.log('barracks', JSON.stringify(bar));
if (bar) {
  const bs = await ev((id) => { const b = window.__debug.world().buildings.get(id); window.__debug.centerOn((b.tx + 1.5) * 32, (b.ty + 1.5) * 32); return window.__debug.buildingScreen(id); }, bar.id);
  await wait(100);
  const bs2 = await ev((id) => window.__debug.buildingScreen(id), bar.id);
  await page.mouse.click(bs2.x, bs2.y + 10);
  await wait(100);
  const sel = await ev(() => window.__debug.state().selection);
  console.log('selected barracks', sel.includes(bar.id), bs !== null);
  // the AI-played jump may arrive at the army cap: clear it so the hotkeys can queue
  await ev(() => { const w = window.__debug.world(); for (const [id, u] of w.units) if (u.owner === 0 && (u.utype === 'guard' || u.utype === 'ranger')) w.units.delete(id); w.players[0].amber += 2000; });
  await page.keyboard.press('a');
  await page.keyboard.press('a');
  await page.keyboard.press('s');
  await wait(100);
  // rally point by right click
  await page.mouse.click(bs2.x + 120, bs2.y + 60, { button: 'right' });
  await shot('10-barracks-card');
  const q = await ev((id) => window.__debug.world().buildings.get(id).train.queue.length, bar.id);
  check('barracks trains via hotkeys A/A/S', q >= 3, `queue ${q}`);
  await ev(() => window.__debug.fastForward(35));
  const army = await ev(() => [...window.__debug.world().units.values()].filter((u) => u.owner === 0 && (u.utype === 'guard' || u.utype === 'ranger')).map((u) => ({ id: u.id, t: u.utype, x: u.x, y: u.y })));
  check('trained army units spawn', army.length >= 3, `army ${army.length}`);
  if (army.length) {
    // box select army, attack-move toward hunter with Q + click
    const pts = await ev((a) => a.map((u) => window.__debug.worldToScreen(u.x, u.y)), army);
    await ev((u) => window.__debug.centerOn(u.x, u.y), army[0]);
    await wait(80);
    const pts2 = await ev((a) => a.map((u) => window.__debug.worldToScreen(u.x, u.y)), army);
    const xs = pts2.map((p) => p.x), ys = pts2.map((p) => p.y);
    await page.mouse.move(Math.min(...xs) - 30, Math.min(...ys) - 40);
    await page.mouse.down();
    await page.mouse.move(Math.max(...xs) + 30, Math.max(...ys) + 30, { steps: 5 });
    await page.mouse.up();
    const sel2 = await ev(() => window.__debug.state().selection.length);
    check('box select grabs the whole army', sel2 === army.length, `${sel2}/${army.length}`);
    await shot('10-army-selected');
    await page.keyboard.press('q');
    const hpos = await ev(() => { const w = window.__debug.world(); const h = w.units.get(w.players[w.hunterPlayerIds[0]].unitId); return h ? { x: h.x, y: h.y } : { x: w.lair.x * 32, y: w.lair.y * 32 }; });
    const mm = await ev(() => document.getElementById('minimap').getBoundingClientRect().toJSON());
    // attack-move target chosen on the main view after centring there
    await ev((h) => window.__debug.centerOn(h.x, h.y), hpos);
    await wait(80);
    const ts = await ev((h) => window.__debug.worldToScreen(h.x, h.y), hpos);
    const hit = await ev((t) => { const el = document.elementFromPoint(t.x, t.y); return { tag: el?.id || el?.className || el?.tagName, mode: window.__debug.state().mode }; }, ts);
    await page.mouse.click(ts.x, ts.y);
    await wait(200); // commands are queued and applied on the next sim tick
    const orders = await ev(() => { const w = window.__debug.world(); return [...w.units.values()].filter((u) => u.owner === 0 && u.utype !== 'survivor').map((u) => u.orders[0]?.type ?? 'idle'); });
    check('Q + click issues attack-move to every unit', orders.length > 0 && orders.every((o) => o === 'attackMove' || o === 'attack'), `${orders.join(',')} click=${JSON.stringify(ts)} on=${JSON.stringify(hit)}`);
    void mm;
  }
}

// ---- 15 minutes, turret route: look at tier towers fighting
const j15 = await jump(15, 'turret');
const s15 = await summary();
check('dev jump reaches 15:00', /已到 15:00/.test(j15), j15);
check('turret route has tier-perk towers by 15:00', /bolt[3-5]|frost[2-3]|lance[2-3]/.test(s15.buildings), s15.buildings);
const towerSpot = await ev(() => {
  const w = window.__debug.world();
  const t = [...w.buildings.values()].filter((b) => ['bolt', 'frost', 'lance'].includes(b.btype)).sort((a, b) => b.level - a.level)[0];
  return t ? { x: (t.tx + 1) * 32, y: (t.ty + 1) * 32, desc: `${t.btype}${t.level + 1}` } : null;
});
console.log('best tower', towerSpot?.desc);
if (towerSpot) await look('15-towers', towerSpot.x, towerSpot.y);
// let combat happen, then look at the hunter
// put a hunter next to a tower whose perk applies a status, so perks are exercised regardless of AI routing
const statusTower = await ev(() => import('/src/config/lategame.ts').then((m) => {
  const w = window.__debug.world();
  const hasStatus = (b) => { const p = m.perkAt(b.btype, b.level); return !b.constructing && p && (p.mark || p.freezeEvery || p.burn); };
  let t = [...w.buildings.values()].find(hasStatus);
  // no perk tower yet in this AI-built base: raise a frost tower to its first perk (freeze)
  if (!t) { t = [...w.buildings.values()].find((b) => b.btype === 'frost' && !b.constructing); if (t) t.level = Math.max(t.level, 1); }
  return t ? { x: (t.tx + 1) * 32, y: (t.ty + 1) * 32, desc: `${t.btype}${t.level + 1}` } : null;
}));
console.log('status tower', statusTower?.desc);
if (statusTower) await ev((t) => { const w = window.__debug.world(); const h = [...w.units.values()].find((u) => u.alive && u.utype === 'hunter'); if (h) { h.x = h.px = t.x + 64; h.y = h.py = t.y + 40; h.orders = []; h.path = []; h.hp = 1e6; } }, statusTower);
let saw = false;
for (let i = 0; i < 120 && !saw; i++) {
  await ev(() => window.__debug.fastForward(1));
  saw = await ev(() => {
    const w = window.__debug.world();
    return w.hunterPlayerIds.some((id) => {
      const h = w.units.get(w.players[id].unitId);
      return !!h && h.alive && (h.status.burnT > 0 || h.status.rootT > 0 || h.status.markT > 0);
    });
  });
}
const hp = await ev(() => { const w = window.__debug.world(); const h = w.units.get(w.players[w.hunterPlayerIds[0]].unitId); return h && { x: h.x, y: h.y, s: h.status }; });
check('tower perks apply statuses to the hunter (freeze/burn/mark)', saw);
if (hp) await look('15-hunter-statuses', hp.x, hp.y - 40);

// ---- 20 minutes, eco route: blood moon, altar
// turret bases survive longest, so this route reliably reaches the Blood Moon
const j20 = await jump(20, 'turret');
const s20 = await summary();
check('dev jump to 20:00 lands in an undecided Blood Moon', s20.bloodMoon && s20.phaseChip.startsWith('血月'), `${j20} / ${s20.phaseChip}`);
check('hunter has evolved by the Blood Moon', s20.hunter.evolved, `lv${s20.hunter.lv}`);
await page.keyboard.press('h');
await wait(300);
await shot('20-bloodmoon-base');
const hp20 = await ev(() => { const w = window.__debug.world(); const h = w.units.get(w.players[w.hunterPlayerIds[0]].unitId); return h && { x: h.x, y: h.y }; });
if (hp20) {
  await look('20-evolved-hunter', hp20.x, hp20.y - 40);
  const hs = await ev((h) => window.__debug.worldToScreen(h.x, h.y - 30), hp20);
  await ev(() => (window.__game.paused = true));
  await page.mouse.click(hs.x, hs.y);
  await wait(150);
  await shot('20-hunter-info');
  await ev(() => (window.__game.paused = false));
}
check('no console errors', errors.length === 0, errors.slice(0, 2).join(' | '));
await b.close();
const failed = results.filter((r) => !r.ok);
console.log(`
${results.length - failed.length}/${results.length} late-game checks passed`);
process.exit(failed.length ? 1 : 0);
