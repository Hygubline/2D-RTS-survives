// Title / manual / victory / defeat screenshots. Usage: npm run dev, then node scripts/dev/screen-shots.mjs
import { chromium } from 'playwright';
const B = 'http://localhost:5199/';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const shot = (n) => page.screenshot({ path: `playtest-shots/screen-${n}.png` });
const ff = (s) => page.evaluate((s) => window.__debug.fastForward(s), s);
const killAll = (who) =>
  page.evaluate((who) => {
    const w = window.__debug.world();
    return import('/src/sim/world.ts').then((m) => {
      if (who === 'hunter') {
for (const id of w.hunterPlayerIds) {
        w.players[id].hunter.lives = 1;
        const u = w.units.get(w.players[id].unitId);
        if (u?.alive) m.killUnit(w, u);
      }
      } else {
        for (const p of w.players) if (p.faction === 'survivor') p.lives = w.units.get(p.unitId)?.alive ? 1 : 0;
        for (const u of [...w.units.values()]) if (u.utype === 'survivor' && u.alive) m.killUnit(w, u);
      }
    });
  }, who);

await page.goto(B + '?seed=1', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
await shot('01-title');
await page.click('#btn-manual');
await page.waitForTimeout(500);
await shot('02-manual');
await page.click('#btn-back');
await page.click('#btn-start');
await ff(330);
await killAll('hunter');
await ff(1);
await page.waitForTimeout(900);
await shot('03-victory');
await page.click('#btn-retry');
await page.waitForTimeout(300);
const sameSeed = await page.evaluate(() => window.__debug.state().time < 1);
await ff(400);
await killAll('wardens');
await ff(1);
await page.waitForTimeout(900);
await shot('04-defeat');
console.log('retry starts fresh:', sameSeed, '| errors:', errors.length ? errors : 'none');
await browser.close();
