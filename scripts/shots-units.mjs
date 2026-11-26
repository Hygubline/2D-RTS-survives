// Character sheet: every unit sprite drawn large on one canvas, for art review.
// Usage: npm run dev (port 5199) then: node scripts/shots-units.mjs
import { chromium } from 'playwright';
const URL = process.env.URL ?? 'http://localhost:5199/';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 820 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(URL, { waitUntil: 'networkidle' });
await page.evaluate(async () => {
  const S = await import('/src/render/unitSprites.ts');
  const c = document.createElement('canvas');
  c.width = 1400;
  c.height = 820;
  Object.assign(c.style, { position: 'fixed', inset: '0', zIndex: '999' });
  document.body.appendChild(c);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#86b35a';
  ctx.fillRect(0, 0, c.width, c.height);
  const colors = ['#3f7fd8', '#d8a23f', '#4fae5a', '#c05ab0'];
  const unit = (o) => ({ id: 1, owner: 0, facing: 0.2, moving: false, attackAnim: 0, workAnim: 0, elite: false, slowTimer: 0, ...o });
  const hs = (o) => ({ evolved: false, items: { hide: 0, horn: 0, claws: 0 }, ...o });
  const at = (x, y, s, fn) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    fn();
    ctx.restore();
  };
  for (let p = 0; p < 4; p++) {
    const y = 120 + p * 175;
    at(110, y, 3.2, () => S.drawSurvivor(ctx, unit({ owner: p }), colors[p], 0.5));
    at(260, y, 3.2, () => S.drawSurvivor(ctx, unit({ owner: p, workAnim: 0.2, id: 3 }), colors[p], 0.6));
    at(410, y, 3.2, () => S.drawSurvivor(ctx, unit({ owner: p, facing: Math.PI, moving: true }), colors[p], 0.55));
    at(560, y, 3.2, () => S.drawGuard(ctx, unit({ owner: p, elite: p === 1 }), colors[p], 0.5));
    at(710, y, 3.2, () => S.drawRanger(ctx, unit({ owner: p, attackAnim: 0.15 }), colors[p], 0.5));
  }
  at(940, 260, 3.4, () => S.drawHunter(ctx, unit({ owner: 4 }), hs(), 0.5, '#c23b2a'));
  at(1200, 260, 3.4, () => S.drawHunter(ctx, unit({ owner: 5, attackAnim: 0.17, facing: Math.PI }), hs({ items: { hide: 2, horn: 2, claws: 2 } }), 0.5, '#7a4ad0'));
  at(1060, 700, 2.6, () => S.drawHunter(ctx, unit({ owner: 4 }), hs({ evolved: true, items: { hide: 4, horn: 3, claws: 4 } }), 0.5, '#c23b2a'));
});
await page.waitForTimeout(200);
await page.screenshot({ path: 'playtest-shots/units-sheet.png' });
console.log(errors.length ? 'ERRORS: ' + errors.join(' | ') : 'no page errors');
await browser.close();
