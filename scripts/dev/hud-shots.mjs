// HUD screenshots at key states. Usage: npm run dev, then node scripts/dev/hud-shots.mjs
import { chromium } from 'playwright';
const B = 'http://localhost:5199/';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const shot = (n) => page.screenshot({ path: `playtest-shots/hud-${n}.png` });

await page.goto(B + '?seed=1', { waitUntil: 'networkidle' });
await page.click('#btn-start');
await page.waitForTimeout(600);
await shot('01-start');
await page.keyboard.press('Space');
await page.waitForTimeout(300);
await shot('02-warden');
await page.hover('.cmd >> nth=3');
await page.waitForTimeout(200);
await shot('03-tooltip');

await page.goto(B + '?dev=1&jump=7&route=legion', { waitUntil: 'networkidle' });
await page.waitForFunction(() => /已到/.test(document.getElementById('dev-status')?.textContent ?? ''), null, { timeout: 60000 });
await page.evaluate(() => {
  const d = window.__debug;
  const w = d.world();
  const b = [...w.buildings.values()].find((x) => x.owner === 0 && x.btype === 'barracks') ?? [...w.buildings.values()].find((x) => x.owner === 0 && x.btype === 'bolt');
  if (b) d.select([b.id]);
});
await page.waitForTimeout(400);
await shot('04-building');

await page.goto(B + '?dev=1&jump=13&route=eco', { waitUntil: 'networkidle' });
await page.waitForFunction(() => /已到/.test(document.getElementById('dev-status')?.textContent ?? ''), null, { timeout: 90000 });
await page.evaluate(() => {
  const d = window.__debug;
  d.select([d.world().players[d.world().hunterPlayerIds[0]].unitId]);
});
await page.waitForTimeout(400);
await shot('05-hunter');
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
