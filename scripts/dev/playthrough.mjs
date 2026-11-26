// Human-style playthrough at accelerated real time, all through UI input. Screenshots for UX review.
import { chromium } from 'playwright';
const b = await chromium.launch({ headless: true });
const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const shot = (n) => page.screenshot({ path: `playtest-shots/h-${n}.png` });
const st = () => page.evaluate(() => window.__debug.state());
const tileScreen = (x, y) => page.evaluate(([x, y]) => window.__debug.tileToScreen(x, y), [x, y]);
const wait = (ms) => page.waitForTimeout(ms);
const msgs = () => page.$$eval('#msgs .msg', (els) => els.map((e) => e.textContent));

await page.goto('http://localhost:5199/?seed=2024', { waitUntil: 'networkidle' });
await page.click('#btn-start');
await page.evaluate(() => window.__debug.setSpeed(3));

// pick nearest free grove from the minimap's gold circles; travel with minimap right-click
await page.keyboard.press('Space');
const g = await page.evaluate(() => {
  const w = window.__debug.world();
  const u = w.units.get(w.players[0].unitId);
  const free = w.groves.filter((g) => g.claimedBy === -1).sort((a, b) => Math.hypot(a.cx * 32 - u.x, a.cy * 32 - u.y) - Math.hypot(b.cx * 32 - u.x, b.cy * 32 - u.y));
  free[0].claimedBy = 0;
  return free[0];
});
const mm = await page.evaluate(() => document.getElementById('minimap').getBoundingClientRect().toJSON());
await page.mouse.click(mm.x + ((g.cx + 0.5) / 96) * mm.width, mm.y + ((g.cy + 0.5) / 96) * mm.height, { button: 'right' });
await page.mouse.click(mm.x + ((g.cx + 0.5) / 96) * mm.width, mm.y + ((g.cy + 0.5) / 96) * mm.height);
for (let i = 0; i < 40 && (await st()).unit.orders > 0; i++) await wait(250);
await shot('01-arrived');

// shelter + two harvesters (Shift continuous)
await page.keyboard.press('z');
let p = await tileScreen(g.cx, g.cy);
await page.mouse.move(p.x, p.y);
await page.mouse.click(p.x, p.y);
await wait(1500);
const spots = await page.evaluate((g) => {
  const w = window.__debug.world();
  const inside = new Set(g.interior.map((t) => t.y * 1000 + t.x));
  const res = [];
  const used = new Set();
  for (const t of [...g.interior].sort((a, b) => Math.hypot(b.x - g.cx, b.y - g.cy) - Math.hypot(a.x - g.cx, a.y - g.cy))) {
    let ok = true;
    for (let y = t.y; y < t.y + 2; y++) for (let x = t.x; x < t.x + 2; x++) if (!inside.has(y * 1000 + x) || !w.grid.buildable(x, y) || used.has(y * 1000 + x)) ok = false;
    if (Math.abs(t.x - g.cx) < 3 && Math.abs(t.y - g.cy) < 3) ok = false;
    if (ok && g.gaps.every((q) => Math.max(Math.abs(q.x - t.x), Math.abs(q.y - t.y)) > 2)) {
      res.push(t);
      for (let y = t.y - 1; y < t.y + 3; y++) for (let x = t.x - 1; x < t.x + 3; x++) used.add(y * 1000 + x);
    }
    if (res.length === 2) break;
  }
  return res;
}, g);
await page.keyboard.down('Shift');
await page.keyboard.press('q');
for (const s of spots) {
  p = await tileScreen(s.x + 0.5, s.y + 0.5);
  await page.mouse.move(p.x, p.y);
  await page.mouse.click(p.x, p.y);
}
await page.keyboard.up('Shift');
await wait(2500);
await shot('02-gap-hints');

// group gap tiles into clusters, drag-paint each cluster as one wall line
const clusters = [];
for (const t of g.gaps) {
  const c = clusters.find((c) => c.some((q) => Math.abs(q.x - t.x) <= 1 && Math.abs(q.y - t.y) <= 1));
  if (c) c.push(t);
  else clusters.push([t]);
}
for (const c of clusters) {
  c.sort((a, b) => a.x - b.x || a.y - b.y);
  const a = await tileScreen(c[0].x, c[0].y);
  const z = await tileScreen(c[c.length - 1].x, c[c.length - 1].y);
  await page.keyboard.down('Shift');
  await page.keyboard.press('w');
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(z.x, z.y, { steps: 6 });
  if (c === clusters[0]) await shot('03-drag-paint-preview');
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await page.keyboard.press('Escape');
}
// seal whatever the lines missed by clicking the still-highlighted gap tiles
const open = await page.evaluate((g) => { const w = window.__debug.world(); return g.gaps.filter((t) => !w.grid.occ[w.grid.idx(t.x, t.y)] && !w.units.get(w.players[0].unitId).orders.some((o) => o.type === 'build' && o.tx === t.x && o.ty === t.y)); }, g);
await page.keyboard.down('Shift');
for (const [i, t] of open.entries()) {
  await page.keyboard.press(i === 0 ? 'e' : 'w');
  const q = await tileScreen(t.x, t.y);
  await page.mouse.move(q.x, q.y);
  await page.mouse.click(q.x, q.y);
  await page.keyboard.press('Escape');
}
await page.keyboard.up('Shift');
console.log('gap clusters', clusters.map((c) => c.length), 'messages', await msgs());
const s0 = await st();
console.log('orders queued', s0.unit.orders);

// tooltip
const btn = await page.$('#card .cmd:nth-child(4)');
await page.keyboard.press('Space');
await wait(100);
await btn.hover();
await wait(150);
await shot('04-tooltip');
await page.mouse.move(700, 400);

// let it play
for (let i = 0; i < 60 && (await st()).time < 75; i++) await wait(500);
await shot('05-hunter-awake');
const s1 = await st();
const sealed = await page.evaluate((g) => { const w = window.__debug.world(); return g.gaps.every((t) => { const id = w.grid.occ[w.grid.idx(t.x, t.y)]; return id && !w.buildings.get(id).constructing; }); }, g);
console.log('sealed', sealed, 'harvesters', s1.myBuildings.filter((b) => b.btype === 'harvester').length);
console.log('t', s1.time.toFixed(0), 'buildings', s1.myBuildings.map((b) => b.btype + (b.constructing ? '*' : '')).join(','), 'amber', s1.amber.toFixed(0));

// fast forward into mid-game and look at our base / alerts
await page.evaluate(() => window.__debug.fastForward(240));
await page.keyboard.press('h');
await wait(300);
await shot('06-base-mid');
await page.keyboard.press('Backspace');
await wait(300);
await shot('07-alert-jump');
const s2 = await st();
console.log('t', s2.time.toFixed(0), 'lives', s2.lives, 'hunter', JSON.stringify(s2.hunter), 'myBuildings', s2.myBuildings.length, 'messages', await msgs());
// select hunter if visible
const hs = s2.hunter && (await page.evaluate((h) => window.__debug.worldToScreen(h.x, h.y - 20), s2.hunter));
if (hs) {
  await page.evaluate((h) => window.__debug.centerOn(h.x, h.y), s2.hunter);
  await wait(100);
  const hs2 = await page.evaluate((h) => window.__debug.worldToScreen(h.x, h.y - 20), (await st()).hunter);
  await page.mouse.click(hs2.x, hs2.y);
  await wait(200);
  await shot('08-hunter-selected');
}
console.log('errors', errors);
await b.close();
