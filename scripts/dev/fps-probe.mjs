// Measures in-game rAF fps with candidate CSS effects disabled one at a time.
import { chromium } from 'playwright';
const b = await chromium.launch({ headless: true });
const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://localhost:5199/?seed=1', { waitUntil: 'networkidle' });
await page.click('#btn-start');
await page.waitForTimeout(2500);
const fps = () => page.evaluate(() => new Promise((r) => { let n = 0; const t0 = performance.now(); const f = () => { n++; performance.now() - t0 < 2000 ? requestAnimationFrame(f) : r(+(n / 2).toFixed(1)); }; requestAnimationFrame(f); }));
const css = (txt) => page.evaluate((t) => { let s = document.getElementById('probe'); if (!s) { s = document.createElement('style'); s.id = 'probe'; document.head.appendChild(s); } s.textContent = t; }, txt);
const trials = {
  baseline: '',
  noTbFilter: '.tb-center{filter:none!important}',
  noShadowsTop: '#topbar,#topbar *{box-shadow:none!important;filter:none!important}',
  noShadowsBottom: '#bottom,#bottom *{box-shadow:none!important;filter:none!important}',
  noAnim: '*{animation:none!important;transition:none!important}',
  noMsgs: '#msgs{display:none!important}',
  noHud: '#topbar,#bottom{display:none!important}',
};
for (const [k, v] of Object.entries(trials)) { await css(v); await page.waitForTimeout(300); console.log(k.padEnd(16), await fps()); }
await css('');
console.log('baseline again   ', await fps());
await b.close();
