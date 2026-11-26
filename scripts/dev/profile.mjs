// Profiles per-frame cost of render / HUD / minimap / sim in a busy mid-game.
import { chromium } from 'playwright';
const b = await chromium.launch({ headless: true, args: ['--enable-gpu-rasterization', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://localhost:5199/?seed=1000&dev=1&jump=15&route=turret', { waitUntil: 'networkidle' });
await page.waitForFunction(() => /已到/.test(document.getElementById('dev-status')?.textContent ?? ''), null, { timeout: 90000 });


// look at the busiest AI base
await page.evaluate(() => {
  const w = window.__debug.world();
  const counts = new Map();
  for (const b of w.buildings.values()) counts.set(b.owner, (counts.get(b.owner) ?? 0) + 1);
  const owner = [...counts].sort((a, b) => b[1] - a[1])[0][0];
  const b0 = [...w.buildings.values()].find((b) => b.owner === owner && b.btype === 'shelter') ?? [...w.buildings.values()][0];
  window.__debug.centerOn((b0.tx + 1.5) * 32, (b0.ty + 1.5) * 32);
  for (let i = 0; i < w.vision.length; i++) w.vision[i] = 2;
});
const res = await page.evaluate(async () => {
  const g = window.__game;
  const t = { render: 0, hud: 0, minimap: 0, frames: 0 };
  const wrap = (obj, name, key) => { const f = obj[name].bind(obj); obj[name] = (...a) => { const s = performance.now(); const r = f(...a); t[key] += performance.now() - s; return r; }; };
  wrap(g.renderer, 'render', 'render'); wrap(g.hud, 'update', 'hud'); wrap(g.minimap, 'draw', 'minimap');
  const f0 = performance.now();
  await new Promise((r) => { const tick = () => { t.frames++; if (performance.now() - f0 < 3000) requestAnimationFrame(tick); else r(); }; requestAnimationFrame(tick); });
  const s = performance.now(); window.__debug.fastForward(10); const sim = (performance.now() - s) / 200;
  const w = window.__debug.world();
  return { fps: t.frames / 3, renderMs: t.render / t.frames, hudMs: t.hud / t.frames, minimapMs: t.minimap / t.frames, simMsPerTick: sim, buildings: w.buildings.size, particles: g.renderer.fx.list.length };
});
console.log(JSON.stringify(res, null, 1));
await page.screenshot({ path: 'playtest-shots/p1-busy.png' });
await b.close();
