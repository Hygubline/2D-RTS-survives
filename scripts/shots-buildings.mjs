// Upgrade sheet: every level of the Amber Tap, walls, gates and towers side by side, plus each
// tower tier's projectile, for art review. Usage: npm run dev (port 5199) then: node scripts/shots-buildings.mjs
import { chromium } from 'playwright';
const URL = process.env.URL ?? 'http://localhost:5199/';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(URL, { waitUntil: 'networkidle' });
await page.evaluate(async () => {
  const B = await import('/src/render/buildingSprites.ts');
  const H = await import('/src/render/harvesterArt.ts');
  const P = await import('/src/render/projectileArt.ts');
  const c = document.createElement('canvas');
  c.width = 1400;
  c.height = 900;
  Object.assign(c.style, { position: 'fixed', inset: '0', zIndex: '999' });
  document.body.appendChild(c);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#86b35a';
  ctx.fillRect(0, 0, c.width, c.height);
  const color = '#3f7fd8';
  const T = 1.3;
  const label = (x, y, s) => {
    ctx.font = '600 13px Fredoka, sans-serif';
    ctx.fillStyle = '#2b1d10';
    ctx.textAlign = 'center';
    ctx.fillText(s, x, y);
  };
  const sprite = (btype, lv, x, y, scale, mask = 0) => {
    const s = B.buildingSprite(btype, lv, color, mask);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.drawImage(s, -B.PAD, -B.TOP);
    ctx.restore();
  };
  // row 1: Amber Tap L1–L6 with the live layer
  for (let lv = 0; lv < 6; lv++) {
    const x = 40 + lv * 220, y = 70, sc = 2;
    sprite('harvester', lv, x, y, sc);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(sc, sc);
    H.drawHarvesterLive(ctx, 32, 32, lv, T + lv, 7);
    ctx.restore();
    label(x + 64, y + 170, `琥珀泉 L${lv + 1}`);
  }
  // row 2: wall runs (3 tiles, horizontal) and a gate, per level
  for (let lv = 0; lv < 5; lv++) {
    const x = 40 + lv * 270, y = 330, sc = 2;
    sprite('wall', lv, x, y, sc, 2);
    sprite('wall', lv, x + 64, y, sc, 10);
    sprite('wall', lv, x + 128, y, sc, 8);
    sprite('gate', lv, x + 192, y, sc, 10);
    label(x + 120, y + 100, `墙 / 门 L${lv + 1}`);
  }
  // row 3: towers with heads and their projectiles
  const tower = (btype, lv, x, y, sc) => {
    sprite(btype, lv, x, y, sc);
    if (btype === 'bolt' || btype === 'lance') {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(sc, sc);
      ctx.translate(32, 64 - 8 - (30 + lv * 3) - 5);
      B.drawTurretHead(ctx, btype, lv, -0.4, 0, T);
      ctx.restore();
    }
    const ptype = btype === 'lance' ? 'ember' : btype;
    const variant = btype === 'bolt' && lv === 4 ? 'mark' : btype === 'bolt' && lv >= 2 ? 'pierce' : btype === 'lance' && lv === 2 ? 'meteor' : '';
    ctx.save();
    ctx.translate(x + 64, y - 40);
    ctx.scale(1.6, 1.6);
    P.drawProjectileArt(ctx, { id: 1, ptype, variant, level: lv }, T, () => {});
    ctx.restore();
  };
  for (let lv = 0; lv < 5; lv++) {
    tower('bolt', lv, 30 + lv * 125, 600, 1.6);
    label(30 + lv * 125 + 52, 760, `弩塔 L${lv + 1}`);
  }
  for (let lv = 0; lv < 3; lv++) {
    tower('frost', lv, 680 + lv * 115, 600, 1.6);
    label(680 + lv * 115 + 52, 760, `霜塔 L${lv + 1}`);
  }
  for (let lv = 0; lv < 3; lv++) {
    tower('lance', lv, 1040 + lv * 120, 600, 1.6);
    label(1040 + lv * 120 + 52, 760, `焰矛 L${lv + 1}`);
  }
});
await page.waitForTimeout(300);
await page.screenshot({ path: 'playtest-shots/buildings-sheet.png' });
console.log(errors.length ? 'ERRORS: ' + errors.join(' | ') : 'no page errors');
await browser.close();
