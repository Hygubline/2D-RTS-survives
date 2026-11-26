// Playwright playtest: drives the real UI with mouse + keyboard and asserts game state.
// Usage: npm run dev (port 5199) then: node scripts/playtest.mjs
import { chromium } from 'playwright';

const URL = process.env.URL ?? 'http://localhost:5199/?seed=1';
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(e.message));

const state = () => page.evaluate(() => window.__debug.state());
const ff = (s) => page.evaluate((s) => window.__debug.fastForward(s), s);
const shot = (n) => page.screenshot({ path: `playtest-shots/${n}.png` });
const tileScreen = (tx, ty) => page.evaluate(([x, y]) => window.__debug.tileToScreen(x, y), [tx, ty]);
const centerTile = (tx, ty) => page.evaluate(([x, y]) => window.__debug.centerOn((x + 0.5) * 32, (y + 0.5) * 32), [tx, ty]);

await page.goto(URL, { waitUntil: 'networkidle' });
check('start screen shows', await page.isVisible('#btn-start'));
await page.click('#btn-start');
await page.waitForTimeout(500);

// --- HUD layout
const layout = await page.evaluate(() => {
  const r = (id) => document.getElementById(id).getBoundingClientRect();
  const card = r('card');
  return { top: r('topbar').height, bottom: r('bottom').top, mm: r('minimap-frame'), cardBottom: card.bottom, h: innerHeight, cmds: document.querySelectorAll('.cmd').length };
});
check('top bar + bottom console + minimap', layout.top > 30 && layout.bottom > 600 && layout.mm.left < 40 && layout.mm.top > 600, JSON.stringify(layout.mm));
check('command card fully on screen (12 slots)', layout.cardBottom <= layout.h && layout.cmds === 12, `cardBottom=${layout.cardBottom}`);

// --- select warden with Space, then pick a free grove
await page.keyboard.press('Space');
let s = await state();
check('Space selects own warden', s.selection.includes(s.unit.id));
const g = await page.evaluate(() => {
  const w = window.__debug.world();
  const u = w.units.get(w.players[0].unitId);
  const free = w.groves.filter((g) => g.claimedBy === -1);
  free.sort((a, b) => Math.hypot(a.cx * 32 - u.x, a.cy * 32 - u.y) - Math.hypot(b.cx * 32 - u.x, b.cy * 32 - u.y));
  const gr = free[0];
  gr.claimedBy = 0; // reserve for the human in this test
  return { cx: gr.cx, cy: gr.cy, r: gr.r, gaps: gr.gaps, interior: gr.interior };
});

// --- right click move (via minimap right-click then precise right-click)
await centerTile(g.cx, g.cy);
let p = await tileScreen(g.cx, g.cy);
await page.mouse.click(p.x, p.y, { button: 'right' });
await page.waitForTimeout(100);
s = await state();
check('right-click issues move order instantly', s.unit.orders === 1);
for (let i = 0; i < 30 && (await state()).unit.orders > 0; i++) await ff(1);
s = await state();
const dist = Math.hypot(s.unit.x - (g.cx + 0.5) * 32, s.unit.y - (g.cy + 0.5) * 32);
check('A* path reaches grove centre (around trees)', dist < 24, `dist=${dist.toFixed(1)} t=${s.time.toFixed(1)}`);

// --- build shelter with Z hotkey + click
await page.keyboard.press('z');
p = await tileScreen(g.cx, g.cy);
await page.mouse.move(p.x, p.y);
await page.waitForTimeout(50);
await shot('03-placement-preview');
await page.mouse.click(p.x, p.y);
await ff(8);
s = await state();
const shelter = s.myBuildings.find((b) => b.btype === 'shelter');
check('shelter placed and built', !!shelter && !shelter.constructing, JSON.stringify(shelter));

// --- harvester: find a free 2x2 spot inside the grove
const spot = await page.evaluate((g) => {
  const w = window.__debug.world();
  const inside = new Set(g.interior.map((t) => t.y * 1000 + t.x));
  for (const t of g.interior) {
    let ok = true;
    for (let y = t.y; y < t.y + 2; y++) for (let x = t.x; x < t.x + 2; x++) if (!inside.has(y * 1000 + x) || !w.grid.buildable(x, y)) ok = false;
    if (ok && g.gaps.every((q) => Math.max(Math.abs(q.x - t.x), Math.abs(q.y - t.y)) > 2)) return t;
  }
  return null;
}, g);
const amberBefore = (await state()).amber;
await page.keyboard.press('Space');
await page.keyboard.press('q');
p = await tileScreen(spot.x + 0.5, spot.y + 0.5);
await page.mouse.move(p.x, p.y);
await page.mouse.click(p.x, p.y);
await ff(10);
s = await state();
const harv = s.myBuildings.find((b) => b.btype === 'harvester');
check('harvester built via hotkey Q', !!harv && !harv.constructing);
check('amber was spent on harvester', s.amber < amberBefore + 25, `before=${amberBefore.toFixed(0)} now=${s.amber.toFixed(0)}`);
const a0 = s.amber;
await ff(10);
s = await state();
check('economy: harvester+shelter produce income', s.amber - a0 > 20, `+${(s.amber - a0).toFixed(1)} in 10s`);
const played0 = await page.evaluate(() => window.__game.sfx.played);
await page.waitForTimeout(2500);
const audio = await page.evaluate(() => ({ state: window.__game.sfx.state(), played: window.__game.sfx.played }));
check('synth audio runs and voices live events', audio.state === 'running' && audio.played > played0, JSON.stringify(audio));

// --- shift-queue walls on gaps (continuous placement)
await page.evaluate(() => window.__debug.addAmber(500));
const gaps = g.gaps.slice(0, 3);
await page.keyboard.down('Shift');
await page.keyboard.press('w');
for (const t of gaps) {
  const q = await tileScreen(t.x, t.y);
  await page.mouse.move(q.x, q.y);
  await page.mouse.click(q.x, q.y);
}
await page.waitForTimeout(80);
s = await state();
const queued = s.unit.orders;
await page.keyboard.up('Shift');
check('Shift continuous placement queues multiple walls', queued >= gaps.length, `queued=${queued}`);
await shot('04-queued-walls');
await ff(20);
s = await state();
const walls = s.myBuildings.filter((b) => b.btype === 'wall' && !b.constructing);
check('queued walls constructed', walls.length >= gaps.length, `walls=${walls.length}`);

// --- drag-paint a wall line (4 tiles) in one gesture
const run = await page.evaluate((g) => {
  const w = window.__debug.world();
  const inside = new Set(g.interior.map((t) => t.y * 1000 + t.x));
  for (const t of g.interior) {
    let ok = true;
    for (let k = 0; k < 4; k++) if (!inside.has(t.y * 1000 + t.x + k) || !w.grid.buildable(t.x + k, t.y)) ok = false;
    if (ok) return t;
  }
  return null;
}, g);
if (run) {
  await page.keyboard.press('Space');
  const before = (await state()).unit.orders;
  await page.keyboard.press('w');
  const a = await tileScreen(run.x, run.y);
  const z = await tileScreen(run.x + 3, run.y);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(z.x, z.y, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(80);
  const after = (await state()).unit.orders;
  check('drag-paint queues a whole wall line', after - before === 4, `queued ${after - before}`);
  await ff(15);
  await page.keyboard.press('Space');
  await page.keyboard.press('v'); // stop leftovers
} else check('drag-paint queues a whole wall line', false, 'no free run of 4 tiles');

// --- select a wall by clicking, upgrade with Q
const wall = walls[0];
let wp = await tileScreen(wall.tx, wall.ty);
await page.mouse.click(wp.x, wp.y + 6);
await page.waitForTimeout(50);
s = await state();
check('left-click selects building', s.selection.includes(wall.id));
await page.keyboard.press('q');
await page.waitForTimeout(100);
const up = await page.evaluate((id) => !!window.__debug.world().buildings.get(id).upgrading, wall.id);
check('Q upgrades selected wall', up);
await ff(5);
s = await state();
check('upgrade completes to level 2', s.myBuildings.find((b) => b.id === wall.id).level === 1);

// --- damage + right-click repair
await page.evaluate((id) => { const b = window.__debug.world().buildings.get(id); b.hp = b.maxHp * 0.4; }, harv.id);
await page.keyboard.press('Space');
const hp0 = (await state()).myBuildings.find((b) => b.id === harv.id).hp;
const hs = await page.evaluate((id) => window.__debug.buildingScreen(id), harv.id);
await page.mouse.click(hs.x, hs.y, { button: 'right' });
await ff(3);
const hp1 = (await state()).myBuildings.find((b) => b.id === harv.id).hp;
check('right-click repair restores hp', hp1 > hp0 + 50, `${hp0.toFixed(0)} -> ${hp1.toFixed(0)}`);

// --- box select
await page.keyboard.press('Escape');
await page.mouse.click(720, 120); // clear selection on empty ground
s = await state();
const us = await page.evaluate(() => { const w = window.__debug.world(); const u = w.units.get(w.players[0].unitId); return window.__debug.worldToScreen(u.x, u.y); });
await page.mouse.move(us.x - 40, us.y - 40);
await page.mouse.down();
await page.mouse.move(us.x + 40, us.y + 40, { steps: 5 });
await page.mouse.up();
s = await state();
check('box select picks own unit', s.selection.length === 1 && s.selection[0] === s.unit.id);

// --- zoom + minimap click
const z0 = s.camera.zoom;
await page.mouse.move(720, 400);
await page.mouse.wheel(0, -400);
await page.waitForTimeout(50);
s = await state();
check('mouse wheel zooms', s.camera.zoom > z0, `${z0} -> ${s.camera.zoom.toFixed(2)}`);
const mm = await page.evaluate(() => document.getElementById('minimap').getBoundingClientRect().toJSON());
await page.mouse.click(mm.x + mm.width * 0.1, mm.y + mm.height * 0.1);
s = await state();
check('minimap click jumps camera', s.camera.x < 600 && s.camera.y < 600, JSON.stringify(s.camera));

// --- hunter awakens and fights
await ff(70);
s = await state();
check('hunter awakens after grace', !!s.hunter, JSON.stringify(s.hunter));
let combat = false;
for (let i = 0; i < 40 && !combat; i++) {
  await ff(5);
  combat = await page.evaluate(() => {
    const w = window.__debug.world();
    const h = w.units.get(w.players[w.hunterPlayerIds[0]].unitId);
    return !!h && h.alive && h.orders[0]?.type === 'attack';
  });
}
check('hunter AI attacks a target', combat);
const hpos = (await state()).hunter;
if (hpos) await page.evaluate((h) => window.__debug.centerOn(h.x, h.y - 60), hpos);
await page.evaluate(() => { window.__game.paused = true; const w = window.__debug.world(); for (let i = 0; i < w.vision.length; i++) w.vision[i] = 2; w.tick++; });
await page.waitForTimeout(300);
await shot('05-hunter-combat');
await page.evaluate(() => { window.__game.paused = false; });

// --- victory screen (fast forward to dawn) — skip if game already ended
s = await state();
if (!s.winner) await ff(1330 - s.time);
s = await state();
await page.waitForTimeout(300);
const overlayText = await page.textContent('#overlay');
check('game reaches a result + end screen', !!s.winner && /守夜成功|烬林陷落/.test(overlayText ?? ''), `winner=${s.winner}`);
await shot('06-end-screen');
// --- towers damaged the hunter during the match
const towerHit = await page.evaluate(() => {
  const w = window.__debug.world();
  return w.hunterPlayerIds.reduce((a, id) => a + w.players[id].hunter.towerDamageTaken, 0);
});
check('towers have damaged the hunter at some point', towerHit > 0, `towerDamage=${towerHit.toFixed(0)}`);



// --- forced defeat on a fresh match
await page.goto(URL.replace('seed=1', 'seed=7'), { waitUntil: 'networkidle' });
await page.click('#btn-start');
await page.evaluate(() => {
  const w = window.__debug.world();
  for (const p of w.players) if (p.faction === 'survivor') p.lives = 1;
});
await ff(1);
await page.evaluate(() => {
  // kill via the real death path
  const w = window.__debug.world();
  return import('/src/sim/world.ts').then((m) => { for (const u of [...w.units.values()]) if (u.utype === 'survivor' && u.alive) m.killUnit(w, u); });
});
await ff(1);
s = await state();
await page.waitForTimeout(200);
check('defeat when all wardens lose their lives', s.winner === 'hunter' && /烬林陷落/.test((await page.textContent('#overlay')) ?? ''), `winner=${s.winner}`);
await shot('07-defeat');

// --- forced victory via hunter lives
await page.goto(URL.replace('seed=1', 'seed=9'), { waitUntil: 'networkidle' });
await page.click('#btn-start');
await ff(55);
await page.evaluate(() => {
  const w = window.__debug.world();
  return import('/src/sim/world.ts').then((m) => {
      for (const id of w.hunterPlayerIds) {
        w.players[id].hunter.lives = 1;
        const u = w.units.get(w.players[id].unitId);
        if (u?.alive) m.killUnit(w, u);
      }
  });
});
await ff(1);
s = await state();
check('victory when every hunter of the pack loses its last life', s.winner === 'survivor');

check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
// measure in live gameplay (a busy 10-minute base), not on an overlay or across blocking fast-forwards
await page.goto(URL.replace('seed=1', 'seed=1000&dev=1&jump=10&route=turret'), { waitUntil: 'networkidle' });
await page.waitForFunction(() => /已到/.test(document.getElementById('dev-status')?.textContent ?? ''), null, { timeout: 90000 });
await page.waitForTimeout(1500);
// headless fps swings with whatever else the machine is running, so gate on the game's own
// per-frame cost (render + HUD + minimap JS) and only report fps for information
const cost = await page.evaluate(async () => {
  const g = window.__game;
  const t = { ms: 0, frames: 0 };
  const wrap = (obj, name) => { const f = obj[name].bind(obj); obj[name] = (...a) => { const s = performance.now(); const r = f(...a); t.ms += performance.now() - s; return r; }; };
  wrap(g.renderer, 'render'); wrap(g.hud, 'update'); wrap(g.minimap, 'draw');
  const t0 = performance.now();
  await new Promise((r) => { const tick = () => { t.frames++; performance.now() - t0 < 2000 ? requestAnimationFrame(tick) : r(); }; requestAnimationFrame(tick); });
  return { msPerFrame: t.ms / t.frames, fps: t.frames / ((performance.now() - t0) / 1000) };
});
check('frame cost fits a 60 fps budget', cost.msPerFrame < 8, `${cost.msPerFrame.toFixed(2)} ms/frame (headless fps ${cost.fps.toFixed(1)}, machine-dependent)`);
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
