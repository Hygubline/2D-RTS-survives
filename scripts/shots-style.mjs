// Style review screenshots: title, lobby, early game, 10-minute base, hunter view, end screen.
// Usage: npm run dev (port 5199) then: node scripts/shots-style.mjs [prefix]
import { chromium } from 'playwright';
const URL = process.env.URL ?? 'http://localhost:5199/?seed=1000';
const P = `playtest-shots/${process.argv[2] ?? 'style'}`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(URL, { waitUntil: 'networkidle' });
await wait(800);
await page.screenshot({ path: `${P}-01-title.png` });
await page.click('#btn-online');
await wait(300);
await page.screenshot({ path: `${P}-02-lobby.png` });
await page.click('#lb-back');
await wait(200);
await page.click('#btn-start');
await wait(1500);
await page.screenshot({ path: `${P}-03-early.png` });
await page.evaluate(() => window.__debug.jumpTo(10, 'legion', 1000));
await wait(1500);
await page.screenshot({ path: `${P}-04-base10.png` });
// pan to the warden's base and zoom in for a close look at sprites
await page.evaluate(() => {
  const g = window.__game;
  const sh = [...g.world.buildings.values()].find((b) => b.btype === 'shelter' && b.owner === g.view.localPlayer);
  if (sh) window.__debug.centerOn((sh.tx + 1.5) * 32, (sh.ty + 1.5) * 32);
  g.cam.zoom = 1.6;
});
await wait(600);
await page.screenshot({ path: `${P}-05-zoom.png` });
console.log(errors.length ? 'ERRORS: ' + errors.slice(0, 3).join(' | ') : 'no page errors');
await browser.close();
