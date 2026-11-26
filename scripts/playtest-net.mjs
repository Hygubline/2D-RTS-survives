// Online playtest: starts its own relay, opens two real browser pages, plays a lockstep match.
// Usage: npm run dev (port 5199) then: node scripts/playtest-net.mjs
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const URL = process.env.URL ?? 'http://localhost:5199/';
const PORT = 8799;
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const relay = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'server/main.ts'], { env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'] });
let relayLog = '';
relay.stdout.on('data', (d) => (relayLog += d));
relay.stderr.on('data', (d) => (relayLog += d));
for (let i = 0; i < 100 && !/listening/.test(relayLog); i++) await wait(100);
check('relay server starts', /listening/.test(relayLog), relayLog.trim().split('\n')[0]);

const browser = await chromium.launch({ headless: true });
const errors = [];
async function openPage(tag) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  page.on('console', (m) => m.type() === 'error' && errors.push(`${tag}: ${m.text()}`));
  page.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`));
  await page.goto(URL, { waitUntil: 'networkidle' });
  return page;
}
const host = await openPage('host');
const guest = await openPage('guest');
const server = `ws://localhost:${PORT}`;

async function enterLobby(page, name) {
  await page.click('#btn-online');
  await page.fill('#lb-name', name);
  await page.fill('#lb-server', server);
}

// host creates a room
await enterLobby(host, '甲');
await host.click('#lb-create');
await host.waitForSelector('.lobby .code', { timeout: 5000 });
const code = (await host.textContent('.lobby .code')).trim();
check('host creates a room with a 4-letter code', /^[A-Z0-9]{4}$/.test(code), code);
await host.screenshot({ path: 'playtest-shots/net-01-room.png' });

// guest joins and takes the first hunter seat
await enterLobby(guest, '乙');
await guest.fill('#lb-code', code);
await guest.click('#lb-join');
await guest.waitForSelector('.seat.mine', { timeout: 5000 });
await guest.click('.seat[data-seat="4"]');
await host.waitForFunction(() => document.querySelector('.seat[data-seat="4"] b')?.textContent === '乙', null, { timeout: 5000 });
check('guest joins and takes a hunter seat (host sees it)', true);
check('only the host has the start button', (await host.$('#lb-start')) !== null && (await guest.$('#lb-start')) === null);
await host.screenshot({ path: 'playtest-shots/net-02-seats.png' });

await host.click('#lb-start');
await host.waitForFunction(() => window.__game?.isOnline() && !document.getElementById('overlay')?.classList.contains('show'), null, { timeout: 5000 }).catch(() => {});
await guest.waitForFunction(() => window.__game?.isOnline(), null, { timeout: 5000 });
const roles = await Promise.all(
  [host, guest].map((p) =>
    p.evaluate(() => {
      const g = window.__game;
      const me = g.world.players[g.view.localPlayer];
      return { seat: g.view.localPlayer, faction: me.faction, human: me.isHuman, label: document.querySelector('.res.amber small')?.textContent, seed: g.world.rng ? g.world.players.length : 0 };
    }),
  ),
);
check('both clients enter the match in their seats', roles[0].seat === 0 && roles[1].seat === 4 && roles[0].human && roles[1].human, JSON.stringify(roles));
check('hunter player gets the hunter HUD (soulfire)', roles[1].label === '魂火' && roles[0].label === '琥珀', `${roles[0].label} / ${roles[1].label}`);

// host (warden) moves its warden by right-click
await wait(600);
const target = await host.evaluate(() => {
  const g = window.__game;
  const u = g.world.units.get(g.world.players[0].unitId);
  const p = g.cam.toScreen(u.x + 160, u.y + 60);
  return { x: p.x, y: p.y, wx: u.x + 160, id: u.id };
});
await host.mouse.click(target.x, target.y, { button: 'right' });
await wait(700);
const moved = await Promise.all(
  [host, guest].map((p) =>
    p.evaluate((id) => {
      const u = window.__game.world.units.get(id);
      const o = u?.orders[0];
      return o && o.type === 'move' ? Math.round(o.x) : null;
    }, target.id),
  ),
);
check('a warden order reaches both clients through the relay', moved[0] !== null && moved[0] === moved[1], JSON.stringify(moved));

// pause is disabled online
await host.keyboard.press('p');
check('pause is disabled online', !(await host.evaluate(() => window.__game.paused)));

// let it run past several hash checks (every 5 s) and compare
await wait(11000);
const hashes = await Promise.all(
  [host, guest].map((p) =>
    p.evaluate(() => {
      const t = window.__game.world.tick;
      return { tick: t, desync: /不同步/.test(document.getElementById('msgs')?.textContent ?? '') };
    }),
  ),
);
check('clients stay within a few ticks of each other', Math.abs(hashes[0].tick - hashes[1].tick) <= 8, JSON.stringify(hashes));
check('no desync reported by the relay', !hashes[0].desync && !hashes[1].desync && !/desync/.test(relayLog));
await host.screenshot({ path: 'playtest-shots/net-03-warden.png' });
await guest.screenshot({ path: 'playtest-shots/net-04-hunter.png' });

// guest (hunter) wakes at 0:50, then right-clicks the ground: both clients see the hunter's order
await guest.waitForFunction(
  () => {
    const g = window.__game;
    const u = g.world.units.get(g.world.players[4].unitId);
    return !!u && u.alive && u.utype === 'hunter';
  },
  null,
  { timeout: 60000 },
);
await guest.keyboard.press(' ');
await wait(300);
const hpt = await guest.evaluate(() => {
  const g = window.__game;
  const u = g.world.units.get(g.world.players[4].unitId);
  const p = g.cam.toScreen(u.x + 120, u.y + 40);
  return { x: p.x, y: p.y, id: u.id };
});
await guest.mouse.click(hpt.x, hpt.y, { button: 'right' });
await wait(700);
const hOrders = await Promise.all(
  [host, guest].map((p) =>
    p.evaluate((id) => {
      const o = window.__game.world.units.get(id)?.orders[0];
      return o && o.type === 'move' ? Math.round(o.x) : null;
    }, hpt.id),
  ),
);
check('a human hunter order reaches both clients', hOrders[0] !== null && hOrders[0] === hOrders[1], JSON.stringify(hOrders));
check('hunter card shows skills and the lair shop', (await guest.$$eval('#card .cmd:not(.empty)', (els) => els.length)) >= 9);
await guest.screenshot({ path: 'playtest-shots/net-05-hunter-awake.png' });
const late = await Promise.all([host, guest].map((p) => p.evaluate(() => /不同步/.test(document.getElementById('msgs')?.textContent ?? ''))));
check('still no desync after a minute of play', !late[0] && !late[1] && !/desync/.test(relayLog));

// guest disconnects: host sees seat 4 handed to the AI
await guest.close();
await host.waitForFunction(() => window.__game.world.players[4].isAI === true, null, { timeout: 5000 }).catch(() => {});
check('a disconnected seat is taken over by the AI', await host.evaluate(() => window.__game.world.players[4].isAI && !window.__game.world.players[4].isHuman));
check('host is told who left', /离开了/.test((await host.textContent('#msgs')) ?? ''));

check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
relay.kill();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} online checks passed`);
process.exit(failed ? 1 : 0);
