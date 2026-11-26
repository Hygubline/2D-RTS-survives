import type { BuildingType } from '../config/balance';
import { TILE } from '../config/balance';
import { artRng, blobPath, glow, makeCanvas, planks, poly, roundRect, shade, shadow, stoneBlock, storybook, type Ctx } from './draw';

export const PAD = 10;
export const TOP = 44;

const cache = new Map<string, HTMLCanvasElement>();

/** Wall material per level. */
export const WALL_MAT = [
  { base: '#86603a', top: '#a37a4c', kind: 'wood' },
  { base: '#8b877b', top: '#aaa598', kind: 'stone' },
  { base: '#6e6c69', top: '#8e8c88', kind: 'iron' },
  { base: '#3b3048', top: '#5a4a6e', kind: 'obsidian' },
  { base: '#3f8f9a', top: '#79d7df', kind: 'crystal' },
] as const;

export function buildingSprite(btype: BuildingType, level: number, color: string, mask = 0): HTMLCanvasElement {
  const key = `${btype}:${level}:${color}:${mask}`;
  let c = cache.get(key);
  if (c) return c;
  const size = btype === 'shelter' || btype === 'barracks' || btype === 'altar' ? 3 : btype === 'wall' || btype === 'gate' ? 1 : 2;
  const S = size * TILE;
  const [cv, ctx] = makeCanvas(S + PAD * 2, S + TOP + PAD);
  ctx.translate(PAD, TOP);
  const r = artRng(key.length * 977 + level * 31 + mask * 7 + btype.charCodeAt(0) * 13);
  switch (btype) {
    case 'wall':
      drawWall(ctx, level, mask, r);
      break;
    case 'gate':
      drawGate(ctx, level, mask, color, r);
      break;
    case 'shelter':
      drawShelter(ctx, S, color, r);
      break;
    case 'harvester':
      drawHarvester(ctx, S, level, color, r);
      break;
    case 'bolt':
      drawTowerBase(ctx, S, level, color, r, 'bolt');
      break;
    case 'frost':
      drawFrost(ctx, S, level, color, r);
      break;
    case 'lance':
      drawTowerBase(ctx, S, level, color, r, 'lance');
      break;
    case 'repair':
      drawRepair(ctx, S, level, color, r);
      break;
    case 'barracks':
      drawBarracks(ctx, S, level, color, r);
      break;
    case 'altar':
      drawAltar(ctx, S, color, r);
      break;
    case 'lab':
      drawLab(ctx, S, level, color, r);
      break;
  }
  const fin = storybook(cv, 1.8);
  cache.set(key, fin);
  return fin;
}

function levelPips(ctx: Ctx, x: number, y: number, level: number, color = '#f2c14e'): void {
  for (let i = 0; i <= level; i++) {
    const px = x + i * 6;
    poly(ctx, [px, y - 3, px + 3, y, px, y + 3, px - 3, y], color, 'rgba(20,14,6,0.9)', 1);
  }
}

function banner(ctx: Ctx, x: number, y: number, color: string, h = 22): void {
  ctx.strokeStyle = '#3a2614';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y - h);
  ctx.stroke();
  poly(ctx, [x, y - h, x + 11, y - h + 2, x + 9, y - h + 6, x + 11, y - h + 10, x, y - h + 10], color, 'rgba(20,14,6,0.9)', 1);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(x + 1, y - h + 1, 8, 2);
}

// ---------------- walls ----------------

function drawWall(ctx: Ctx, level: number, mask: number, r: () => number): void {
  const m = WALL_MAT[Math.min(level, 4)];
  const H = 14 + level * 2;
  const inset = 3;
  const x0 = mask & 8 ? 0 : inset;
  const x1 = mask & 2 ? TILE : TILE - inset;
  const y0 = mask & 1 ? 0 : inset + 4;
  const y1 = mask & 4 ? TILE : TILE - inset;
  shadow(ctx, (x0 + x1) / 2 + 4, y1 - 2, (x1 - x0) * 0.7, 8, 0.4);
  // front face
  const fy = y1 - H;
  if (m.kind === 'wood') {
    planks(ctx, x0, fy, x1 - x0, H, m.base, r, true);
    // pointed stake tops
    const n = Math.max(2, Math.round((x1 - x0) / 6));
    const w = (x1 - x0) / n;
    for (let i = 0; i < n; i++) {
      const sx = x0 + i * w;
      poly(ctx, [sx, y0 - H + 2, sx + w / 2, y0 - H - 5, sx + w, y0 - H + 2, sx + w, fy, sx, fy], shade(m.top, (r() - 0.5) * 0.2), 'rgba(30,18,8,0.8)', 1);
    }
    ctx.fillStyle = shade(m.top, -0.1);
    ctx.fillRect(x0, y0 - H + 2, x1 - x0, Math.max(0, fy - (y0 - H + 2)));
    ctx.strokeStyle = 'rgba(60,40,20,0.9)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x0, fy + H * 0.35);
    ctx.lineTo(x1, fy + H * 0.35);
    ctx.stroke();
  } else {
    stoneBlock(ctx, x0, fy, x1 - x0, H, m.base, r, 2);
    // top face
    ctx.fillStyle = m.top;
    roundRect(ctx, x0, y0 - H, x1 - x0, fy - (y0 - H) + 1, 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(20,16,12,0.75)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(x0 + 2, y0 - H + 2, x1 - x0 - 4, 2);
    if (m.kind === 'iron') {
      ctx.fillStyle = '#34363c';
      for (const bx of [x0 + 5, x1 - 8]) {
        ctx.fillRect(bx, fy, 3, H);
        ctx.fillStyle = '#9aa0a8';
        ctx.fillRect(bx + 1, fy + 2, 1, 1.5);
        ctx.fillRect(bx + 1, fy + H - 4, 1, 1.5);
        ctx.fillStyle = '#34363c';
      }
    } else if (m.kind === 'obsidian') {
      ctx.strokeStyle = 'rgba(190,150,255,0.55)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x0 + 4, fy + 3);
      ctx.lineTo(x0 + 10, fy + H - 3);
      ctx.moveTo(x1 - 6, fy + 2);
      ctx.lineTo(x1 - 11, fy + H - 4);
      ctx.stroke();
    } else if (m.kind === 'crystal') {
      glow(ctx, (x0 + x1) / 2, fy, 18, '#9ff3ff', 0.35);
      poly(ctx, [(x0 + x1) / 2 - 4, y0 - H, (x0 + x1) / 2, y0 - H - 10, (x0 + x1) / 2 + 4, y0 - H], '#c9fbff', 'rgba(20,60,70,0.9)', 1);
    }
  }
  if (level >= 2) {
    // thorns perk: spikes that visibly bristle on L3+ walls
    const n = Math.max(2, Math.round((x1 - x0) / 7));
    const col = level >= 4 ? '#bff6ff' : '#3a2a20';
    for (let i = 0; i < n; i++) {
      const sx = x0 + 3 + ((x1 - x0 - 6) * (i + 0.5)) / n;
      poly(ctx, [sx - 2.2, y0 - H + 1, sx, y0 - H - 6 - (level >= 4 ? 2 : 0), sx + 2.2, y0 - H + 1], col, 'rgba(10,8,6,0.9)', 0.9);
    }
  }
}

function drawGate(ctx: Ctx, level: number, mask: number, color: string, r: () => number): void {
  const m = WALL_MAT[Math.min(level, 4)];
  const H = 16 + level * 2;
  const horizontal = (mask & 2) !== 0 || (mask & 8) !== 0 || !(mask & 1 || mask & 4);
  shadow(ctx, 20, TILE - 2, 20, 7, 0.4);
  if (horizontal) {
    // posts on left/right
    for (const px of [0, TILE - 7]) {
      stoneBlock(ctx, px, TILE - H - 8, 7, H + 6, m.base, r, 3);
      ctx.fillStyle = m.top;
      ctx.fillRect(px, TILE - H - 11, 7, 4);
    }
    planks(ctx, 7, TILE - H - 2, TILE - 14, H, '#6a4526', r, true);
    ctx.strokeStyle = 'rgba(25,15,6,0.9)';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(7, TILE - H - 2, TILE - 14, H);
    ctx.fillStyle = color;
    ctx.fillRect(12, TILE - H + 2, TILE - 24, 4);
    ctx.fillStyle = '#c9a24a';
    ctx.beginPath();
    ctx.arc(TILE / 2 + 4, TILE - H / 2 - 1, 1.6, 0, Math.PI * 2);
    ctx.fill();
  } else {
    for (const py of [2, TILE - 8]) {
      stoneBlock(ctx, 9, py - H + 4, 14, H + 2, m.base, r, 3);
      ctx.fillStyle = m.top;
      ctx.fillRect(9, py - H + 1, 14, 4);
    }
    planks(ctx, 11, 6 - H / 2, 10, TILE - 10, '#6a4526', r, false);
    ctx.fillStyle = color;
    ctx.fillRect(14, 10 - H / 2, 4, TILE - 18);
  }
  levelPips(ctx, 4, TILE + 2, level, '#9fd0ff');
}

// ---------------- shelter ----------------

function drawShelter(ctx: Ctx, S: number, color: string, r: () => number): void {
  const cx = S / 2;
  const cy = S / 2 + 8;
  shadow(ctx, cx + 10, cy + 22, S * 0.55, 18, 0.45);
  // stone ring foundation
  ctx.fillStyle = '#5f5a50';
  ctx.beginPath();
  ctx.ellipse(cx, cy + 14, 40, 22, 0, 0, Math.PI * 2);
  ctx.fill();
  // log wall (front band)
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, cy + 6, 36, 22, 0, 0, Math.PI);
  ctx.lineTo(cx - 36, cy - 6);
  ctx.ellipse(cx, cy - 6, 36, 20, 0, Math.PI, 0, true);
  ctx.closePath();
  ctx.clip();
  planks(ctx, cx - 40, cy - 30, 80, 60, '#7a5230', r, true);
  ctx.restore();
  ctx.strokeStyle = 'rgba(25,15,6,0.9)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(cx, cy + 6, 36, 22, 0, 0, Math.PI);
  ctx.stroke();
  // door
  ctx.fillStyle = '#2a1a0e';
  ctx.beginPath();
  ctx.moveTo(cx - 8, cy + 27);
  ctx.lineTo(cx - 8, cy + 14);
  ctx.quadraticCurveTo(cx, cy + 4, cx + 8, cy + 14);
  ctx.lineTo(cx + 8, cy + 27);
  ctx.closePath();
  ctx.fill();
  glow(ctx, cx, cy + 20, 14, '#ffb34d', 0.35);
  // thatched cone roof
  const roofY = cy - 6;
  ctx.beginPath();
  ctx.moveTo(cx - 44, roofY + 4);
  ctx.quadraticCurveTo(cx - 20, roofY - 30, cx, roofY - 52);
  ctx.quadraticCurveTo(cx + 20, roofY - 30, cx + 44, roofY + 4);
  ctx.quadraticCurveTo(cx, roofY + 22, cx - 44, roofY + 4);
  ctx.closePath();
  const grd = ctx.createLinearGradient(cx - 40, roofY - 50, cx + 40, roofY + 10);
  grd.addColorStop(0, '#d7b56a');
  grd.addColorStop(0.55, '#a88342');
  grd.addColorStop(1, '#6e5228');
  ctx.fillStyle = grd;
  ctx.fill();
  ctx.strokeStyle = 'rgba(30,20,8,0.95)';
  ctx.lineWidth = 1.8;
  ctx.stroke();
  // thatch strokes
  ctx.save();
  ctx.clip();
  for (let i = 0; i < 70; i++) {
    const t = r();
    const a = -Math.PI / 2 + (r() - 0.5) * 2.4;
    const x = cx + Math.cos(a) * 46 * t;
    const y = roofY - 52 + (roofY + 12 - (roofY - 52)) * t * (0.6 + 0.4 * Math.abs(Math.sin(a)));
    ctx.strokeStyle = r() < 0.5 ? 'rgba(90,60,20,0.5)' : 'rgba(240,210,140,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (x - cx) * 0.08, y + 6);
    ctx.stroke();
  }
  // binding rings
  for (const k of [0.35, 0.7]) {
    ctx.strokeStyle = 'rgba(70,45,15,0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(cx, roofY - 52 + 58 * k, 44 * k, 10 * k, 0, 0.1, Math.PI - 0.1);
    ctx.stroke();
  }
  ctx.restore();
  // smoke hole cap
  poly(ctx, [cx - 5, roofY - 48, cx, roofY - 58, cx + 5, roofY - 48], '#5a3d1e', 'rgba(20,10,4,0.9)', 1);
  banner(ctx, cx + 34, cy + 16, color, 34);
  // lantern
  ctx.fillStyle = '#3a2a1a';
  ctx.fillRect(cx - 30, cy + 6, 2, 16);
  glow(ctx, cx - 29, cy + 6, 10, '#ffcf6a', 0.7);
  ctx.fillStyle = '#ffe2a0';
  ctx.fillRect(cx - 31, cy + 3, 4, 5);
}

// ---------------- harvester ----------------

function drawHarvester(ctx: Ctx, S: number, level: number, color: string, r: () => number): void {
  const cx = S / 2;
  const cy = S / 2 + 6;
  shadow(ctx, cx + 6, cy + 18, 32, 11, 0.45);
  // basin
  const rim = level >= 4 ? '#c9a24a' : level >= 2 ? '#8a8578' : '#6f5a40';
  ctx.beginPath();
  ctx.ellipse(cx, cy + 8, 26, 14, 0, 0, Math.PI * 2);
  ctx.fillStyle = shade(rim, -0.25);
  ctx.fill();
  ctx.strokeStyle = 'rgba(20,14,6,0.9)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(cx, cy + 4, 24, 12, 0, 0, Math.PI * 2);
  ctx.fillStyle = rim;
  ctx.fill();
  ctx.stroke();
  // amber pool
  ctx.beginPath();
  ctx.ellipse(cx, cy + 4, 18, 8, 0, 0, Math.PI * 2);
  const pg = ctx.createRadialGradient(cx - 4, cy + 2, 1, cx, cy + 4, 18);
  pg.addColorStop(0, '#ffe08a');
  pg.addColorStop(0.5, '#f0a030');
  pg.addColorStop(1, '#a35a12');
  ctx.fillStyle = pg;
  ctx.fill();
  // crystals
  const n = 2 + level;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * 0.5;
    const d = i === 0 ? 0 : 6 + r() * 6;
    const x = cx + Math.cos(a) * d * 1.3;
    const y = cy + 2 + Math.sin(a) * d * 0.6;
    const h = (i === 0 ? 20 : 10 + r() * 8) + level * 2.5;
    const w = (i === 0 ? 6 : 3.5) + level * 0.5;
    poly(ctx, [x - w, y, x - w * 0.6, y - h * 0.8, x, y - h, x + w * 0.7, y - h * 0.75, x + w, y], '#f5a83a', 'rgba(70,30,4,0.95)', 1.2);
    poly(ctx, [x - w * 0.6, y - h * 0.8, x, y - h, x, y], 'rgba(255,240,180,0.55)');
  }
  // wooden derrick frame
  ctx.strokeStyle = '#4a2f18';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx - 24, cy + 10);
  ctx.lineTo(cx - 4, cy - 30 - level * 2);
  ctx.moveTo(cx + 24, cy + 10);
  ctx.lineTo(cx + 4, cy - 30 - level * 2);
  ctx.stroke();
  ctx.strokeStyle = '#7a5230';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx - 24, cy + 10);
  ctx.lineTo(cx - 4, cy - 30 - level * 2);
  ctx.moveTo(cx + 24, cy + 10);
  ctx.lineTo(cx + 4, cy - 30 - level * 2);
  ctx.stroke();
  ctx.fillStyle = '#3a2614';
  ctx.fillRect(cx - 7, cy - 33 - level * 2, 14, 5);
  // bucket on rope
  ctx.strokeStyle = 'rgba(40,25,10,0.9)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx + 2, cy - 28 - level * 2);
  ctx.lineTo(cx + 2, cy - 16);
  ctx.stroke();
  ctx.fillStyle = '#6a4526';
  ctx.fillRect(cx - 1, cy - 16, 6, 5);
  // owner tag
  ctx.fillStyle = color;
  ctx.fillRect(cx - 24, cy + 14, 5, 5);
  ctx.strokeStyle = 'rgba(20,14,6,0.9)';
  ctx.strokeRect(cx - 24, cy + 14, 5, 5);
  levelPips(ctx, cx - level * 3, S + 4, level);
}

// ---------------- towers ----------------

function drawTowerBase(ctx: Ctx, S: number, level: number, color: string, r: () => number, kind: 'bolt' | 'lance'): void {
  const cx = S / 2;
  shadow(ctx, cx + 8, S - 4, 30, 10, 0.45);
  const body = kind === 'lance' ? '#3a3638' : level >= 1 ? '#8b877b' : '#7a5a3a';
  const H = 30 + level * 3;
  const bw = 40;
  const bx = cx - bw / 2;
  const by = S - 8;
  // front face
  if (kind === 'bolt' && level === 0) planks(ctx, bx, by - H, bw, H, body, r, true);
  else stoneBlock(ctx, bx, by - H, bw, H, body, r, 4);
  ctx.strokeStyle = 'rgba(20,16,12,0.85)';
  ctx.lineWidth = 1.3;
  ctx.strokeRect(bx, by - H, bw, H);
  // arrow slit
  ctx.fillStyle = '#1a120a';
  ctx.fillRect(cx - 1.5, by - H + 10, 3, 9);
  // top deck
  const deckY = by - H - 12;
  ctx.fillStyle = kind === 'lance' ? '#2a2628' : '#6a4526';
  roundRect(ctx, bx - 4, deckY, bw + 8, 14, 3);
  ctx.fill();
  ctx.strokeStyle = 'rgba(20,14,6,0.9)';
  ctx.stroke();
  // crenellations
  for (let i = 0; i < 5; i++) {
    const x = bx - 4 + i * ((bw + 8 - 6) / 4);
    ctx.fillStyle = kind === 'lance' ? '#4a4448' : level >= 1 ? '#a6a194' : '#8a6440';
    ctx.fillRect(x, deckY - 5, 6, 7);
    ctx.strokeStyle = 'rgba(20,14,6,0.85)';
    ctx.strokeRect(x, deckY - 5, 6, 7);
  }
  if (kind === 'lance') {
    // ember core visible through grille
    glow(ctx, cx, by - H / 2, 16, '#ff6a2a', 0.6);
    ctx.strokeStyle = '#1c1a1b';
    ctx.lineWidth = 2;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(cx + i * 6, by - H + 6);
      ctx.lineTo(cx + i * 6, by - 8);
      ctx.stroke();
    }
  }
  if (level >= 2) {
    ctx.fillStyle = color;
    ctx.fillRect(bx + 3, by - H + 3, 6, 14);
    ctx.fillRect(bx + bw - 9, by - H + 3, 6, 14);
  }
  if (level >= 3) {
    ctx.strokeStyle = '#c9a24a';
    ctx.lineWidth = 2;
    ctx.strokeRect(bx + 1, by - H + 1, bw - 2, H - 2);
  }
  banner(ctx, bx + bw + 2, deckY + 4, color, 18);
  levelPips(ctx, cx - level * 3, S + 4, level);
}

function drawFrost(ctx: Ctx, S: number, level: number, color: string, r: () => number): void {
  const cx = S / 2;
  shadow(ctx, cx + 6, S - 4, 28, 10, 0.45);
  // hex plinth
  const py = S - 14;
  poly(ctx, [cx - 26, py, cx - 14, py + 10, cx + 14, py + 10, cx + 26, py, cx + 14, py - 10, cx - 14, py - 10], '#7f8b91', 'rgba(20,24,28,0.9)', 1.4);
  poly(ctx, [cx - 26, py, cx - 14, py + 10, cx + 14, py + 10, cx + 26, py, cx + 26, py + 6, cx + 14, py + 16, cx - 14, py + 16, cx - 26, py + 6], '#56626a', 'rgba(20,24,28,0.9)', 1.2);
  glow(ctx, cx, py - 24, 34, '#8fe6ff', 0.35);
  const spires = 3 + level;
  for (let i = 0; i < spires; i++) {
    const t = i / (spires - 1) - 0.5;
    const x = cx + t * 26;
    const h = 44 - Math.abs(t) * 34 + level * 6 + r() * 6;
    const w = 5 + (1 - Math.abs(t)) * 3;
    poly(ctx, [x - w, py, x - w * 0.4, py - h * 0.85, x, py - h, x + w * 0.5, py - h * 0.8, x + w, py], '#9fe8ff', 'rgba(20,60,90,0.95)', 1.2);
    poly(ctx, [x - w * 0.4, py - h * 0.85, x, py - h, x, py], 'rgba(255,255,255,0.55)');
  }
  ctx.fillStyle = color;
  ctx.fillRect(cx - 4, py + 8, 8, 4);
  levelPips(ctx, cx - level * 3, S + 4, level, '#9fe8ff');
}

// ---------------- support ----------------

function drawRepair(ctx: Ctx, S: number, level: number, color: string, r: () => number): void {
  const cx = S / 2;
  const cy = S / 2 + 8;
  shadow(ctx, cx + 6, cy + 18, 30, 10, 0.45);
  ctx.beginPath();
  ctx.ellipse(cx, cy + 6, 25, 14, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#5f5a50';
  ctx.fill();
  ctx.save();
  ctx.clip();
  stoneBlock(ctx, cx - 26, cy - 8, 52, 30, '#7d786c', r, 3);
  ctx.restore();
  ctx.beginPath();
  ctx.ellipse(cx, cy + 2, 21, 10, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#8f8a7e';
  ctx.fill();
  ctx.strokeStyle = 'rgba(20,16,12,0.9)';
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(cx, cy + 2, 16, 7, 0, 0, Math.PI * 2);
  const wg = ctx.createRadialGradient(cx - 3, cy, 1, cx, cy + 2, 16);
  wg.addColorStop(0, '#c8ffd0');
  wg.addColorStop(0.5, '#4ecf7a');
  wg.addColorStop(1, '#1b6a3c');
  ctx.fillStyle = wg;
  ctx.fill();
  glow(ctx, cx, cy - 4, 26 + level * 4, '#7dff9e', 0.3);
  // arch with crank
  ctx.strokeStyle = '#4a2f18';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx - 20, cy + 2);
  ctx.lineTo(cx - 20, cy - 26);
  ctx.moveTo(cx + 20, cy + 2);
  ctx.lineTo(cx + 20, cy - 26);
  ctx.stroke();
  poly(ctx, [cx - 26, cy - 24, cx, cy - 38 - level * 3, cx + 26, cy - 24, cx + 22, cy - 22, cx, cy - 33 - level * 3, cx - 22, cy - 22], '#7a3e2a', 'rgba(25,10,6,0.9)', 1.2);
  ctx.strokeStyle = '#9a9aa0';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx - 20, cy - 20);
  ctx.lineTo(cx + 20, cy - 20);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.fillRect(cx + 22, cy - 12, 4, 8);
  levelPips(ctx, cx - level * 3, S + 4, level, '#7dff9e');
}

function drawLab(ctx: Ctx, S: number, level: number, color: string, r: () => number): void {
  const cx = S / 2;
  shadow(ctx, cx + 8, S - 4, 30, 10, 0.45);
  const base = S - 6;
  const H = 34 + level * 6;
  // octagonal tower body
  const w = 36;
  ctx.save();
  poly(ctx, [cx - w / 2, base, cx - w / 2, base - H, cx + w / 2, base - H, cx + w / 2, base]);
  ctx.clip();
  stoneBlock(ctx, cx - w / 2, base - H, w, H, '#6e6676', r, 5);
  ctx.restore();
  ctx.strokeStyle = 'rgba(20,16,24,0.9)';
  ctx.lineWidth = 1.4;
  ctx.strokeRect(cx - w / 2, base - H, w, H);
  // side wings
  stoneBlock(ctx, cx - w / 2 - 10, base - 18, 10, 18, '#5e5766', r, 2);
  stoneBlock(ctx, cx + w / 2, base - 18, 10, 18, '#5e5766', r, 2);
  // windows
  for (let i = 0; i < 1 + level; i++) {
    const wy = base - 12 - i * 12;
    ctx.fillStyle = '#2a1a3a';
    ctx.beginPath();
    ctx.moveTo(cx - 4, wy);
    ctx.lineTo(cx - 4, wy - 6);
    ctx.arc(cx, wy - 6, 4, Math.PI, 0);
    ctx.lineTo(cx + 4, wy);
    ctx.closePath();
    ctx.fill();
    glow(ctx, cx, wy - 4, 8, '#c49bff', 0.6);
  }
  // dome
  const dy = base - H;
  ctx.beginPath();
  ctx.ellipse(cx, dy, w / 2 + 3, 5, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#3c3444';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, dy, w / 2 - 1, Math.PI, 0);
  const dg = ctx.createLinearGradient(cx - w / 2, dy - w / 2, cx + w / 2, dy);
  dg.addColorStop(0, '#7fb0c8');
  dg.addColorStop(1, '#2f5068');
  ctx.fillStyle = dg;
  ctx.fill();
  ctx.strokeStyle = 'rgba(15,20,30,0.95)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(200,170,90,0.9)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx, dy - w / 2 + 1);
  ctx.lineTo(cx, dy);
  ctx.moveTo(cx - w / 2 + 6, dy - 8);
  ctx.quadraticCurveTo(cx, dy - 14, cx + w / 2 - 6, dy - 8);
  ctx.stroke();
  // telescope
  ctx.strokeStyle = '#c9a24a';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx + 2, dy - 10);
  ctx.lineTo(cx + 16, dy - 24);
  ctx.stroke();
  banner(ctx, cx - w / 2 - 6, base - 16, color, 20);
  // book stack
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = ['#8a2f2f', '#2f5a8a', '#6a8a2f'][i];
    ctx.fillRect(cx + w / 2 + 1, base - 22 - i * 3, 9, 3);
  }
  levelPips(ctx, cx - level * 3, S + 4, level, '#c49bff');
}

/** Rotating turret head, drawn each frame. */
/** Rotating turret head, drawn each frame. Its shape changes at perk tiers. */
export function drawTurretHead(ctx: Ctx, kind: 'bolt' | 'lance', level: number, angle: number, recoil: number, t = 0): void {
  ctx.save();
  ctx.rotate(angle);
  ctx.translate(-recoil * 4, 0);
  if (kind === 'bolt') {
    const twin = level >= 2; // 穿甲连弩
    const rune = level >= 4; // 猎魔印记
    if (rune) glow(ctx, 6, 0, 18, '#b070ff', 0.35 + Math.sin(t * 5) * 0.1);
    for (const oy of twin ? [-5, 5] : [0]) {
      ctx.save();
      ctx.translate(0, oy);
      ctx.fillStyle = rune ? '#3a2448' : '#4a2f18';
      ctx.fillRect(-6, -2.5, 18, 5);
      ctx.strokeStyle = 'rgba(20,10,4,0.95)';
      ctx.lineWidth = 1;
      ctx.strokeRect(-6, -2.5, 18, 5);
      ctx.strokeStyle = rune ? '#d8b0ff' : level >= 3 ? '#c9a24a' : '#7a5230';
      ctx.lineWidth = twin ? 2 : 2.5;
      const arm = twin ? 8 : 12;
      ctx.beginPath();
      ctx.moveTo(8, -arm);
      ctx.quadraticCurveTo(14, 0, 8, arm);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(230,220,200,0.9)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(8, -arm);
      ctx.lineTo(-2 + recoil * 4, 0);
      ctx.lineTo(8, arm);
      ctx.stroke();
      ctx.fillStyle = rune ? '#e8c8ff' : '#ddd';
      ctx.fillRect(4, -0.8, 12, 1.6);
      ctx.restore();
    }
  } else if (level >= 2) {
    // 陨火: a blazing brazier orb that calls down meteors
    ctx.fillStyle = '#2a2628';
    roundRect(ctx, -9, -6, 18, 12, 3);
    ctx.fill();
    const p = 0.6 + Math.sin(t * 6) * 0.2;
    glow(ctx, 0, 0, 26, '#ff5a1a', 0.5 * p + 0.2);
    ctx.fillStyle = '#ffb060';
    ctx.beginPath();
    ctx.arc(0, 0, 6 + p * 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff0c0';
    ctx.beginPath();
    ctx.arc(-1, -1, 3, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = '#2a2628';
    roundRect(ctx, -8, -5, 16, 10, 3);
    ctx.fill();
    ctx.strokeStyle = 'rgba(10,8,8,0.95)';
    ctx.stroke();
    ctx.fillStyle = '#5a5458';
    ctx.fillRect(4, -2, 22 + level * 3, 4);
    poly(ctx, [26 + level * 3, -4, 34 + level * 3, 0, 26 + level * 3, 4], '#ff8a3a', 'rgba(60,20,4,0.9)', 1);
    glow(ctx, 30 + level * 3, 0, 8, '#ff7a2a', 0.6);
    if (level >= 1) {
      // 灼魂烈焰: flames licking along the lance
      for (let i = 0; i < 4; i++) {
        const fx = 8 + i * 6;
        const fh = 4 + Math.sin(t * 12 + i * 2) * 2;
        poly(ctx, [fx - 2, -2, fx, -2 - fh, fx + 2, -2], '#ffb040');
      }
    }
  }
  ctx.restore();
}

/** Barracks longhouse: weapon racks and shields; the elite camp gains gold trim and a second banner. */
function drawBarracks(ctx: Ctx, S: number, level: number, color: string, r: () => number): void {
  shadow(ctx, S / 2 + 10, S - 8, S * 0.55, 14, 0.45);
  const x0 = 8;
  const x1 = S - 8;
  const wallTop = S - 44;
  planks(ctx, x0, wallTop, x1 - x0, 36, '#6e4a2a', r, true);
  ctx.strokeStyle = 'rgba(25,15,6,0.9)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x0, wallTop, x1 - x0, 36);
  poly(ctx, [x0 - 6, wallTop + 2, S / 2, wallTop - 34, x1 + 6, wallTop + 2], level >= 1 ? '#6b3a2a' : '#5a4630', 'rgba(20,10,4,0.95)', 1.8);
  ctx.save();
  poly(ctx, [x0 - 6, wallTop + 2, S / 2, wallTop - 34, x1 + 6, wallTop + 2]);
  ctx.clip();
  for (let i = 0; i < 9; i++) {
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.moveTo(x0 - 6 + i * 11, wallTop + 2);
    ctx.lineTo(S / 2, wallTop - 34);
    ctx.stroke();
  }
  ctx.restore();
  if (level >= 1) {
    ctx.strokeStyle = '#e0b84a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x0 - 6, wallTop + 2);
    ctx.lineTo(S / 2, wallTop - 34);
    ctx.lineTo(x1 + 6, wallTop + 2);
    ctx.stroke();
  }
  ctx.fillStyle = '#24160c';
  ctx.fillRect(S / 2 - 9, S - 28, 18, 20);
  for (const sx of [x0 + 12, x1 - 12]) {
    poly(ctx, [sx - 6, S - 32, sx + 6, S - 32, sx + 6, S - 22, sx, S - 17, sx - 6, S - 22], color, 'rgba(15,10,6,0.9)', 1.2);
    ctx.fillStyle = '#e8d27a';
    ctx.beginPath();
    ctx.arc(sx, S - 26, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = '#9aa0a8';
  ctx.lineWidth = 1.6;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(x1 - 2 + i * 3, S - 6);
    ctx.lineTo(x1 + 2 + i * 3, S - 26);
    ctx.stroke();
  }
  banner(ctx, x0 + 2, wallTop + 4, color, 28);
  if (level >= 1) banner(ctx, x1 - 4, wallTop + 4, '#e0b84a', 28);
}

/** Dawn Altar: runic stone platform with an obelisk crystal (charge glow drawn dynamically). */
function drawAltar(ctx: Ctx, S: number, color: string, r: () => number): void {
  const cx = S / 2;
  const cy = S / 2 + 10;
  shadow(ctx, cx + 8, cy + 22, 46, 14, 0.45);
  ctx.beginPath();
  ctx.ellipse(cx, cy + 10, 44, 22, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#5c5850';
  ctx.fill();
  ctx.save();
  ctx.clip();
  stoneBlock(ctx, cx - 46, cy - 12, 92, 46, '#8a857a', r, 3);
  ctx.restore();
  ctx.beginPath();
  ctx.ellipse(cx, cy + 4, 38, 18, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#a9a396';
  ctx.fill();
  ctx.strokeStyle = 'rgba(20,16,12,0.9)';
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.strokeStyle = '#f2c86a';
  ctx.lineWidth = 1.4;
  ctx.setLineDash([4, 5]);
  ctx.beginPath();
  ctx.ellipse(cx, cy + 4, 30, 13, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  poly(ctx, [cx - 9, cy + 4, cx - 6, cy - 46, cx, cy - 56, cx + 6, cy - 46, cx + 9, cy + 4], '#d8d2c2', 'rgba(25,20,14,0.95)', 1.5);
  poly(ctx, [cx - 6, cy - 46, cx, cy - 56, cx, cy + 4, cx - 9, cy + 4], 'rgba(255,255,255,0.25)');
  poly(ctx, [cx - 5, cy - 50, cx, cy - 66, cx + 5, cy - 50, cx, cy - 44], '#ffe6a0', 'rgba(80,50,10,0.9)', 1.2);
  ctx.fillStyle = color;
  ctx.fillRect(cx - 3, cy - 10, 6, 6);
}

/** Construction scaffold overlay. */
export function drawScaffold(ctx: Ctx, w: number, h: number, progress: number): void {
  ctx.strokeStyle = 'rgba(120,80,40,0.95)';
  ctx.lineWidth = 2;
  const top = h - h * Math.max(0.25, progress);
  ctx.beginPath();
  ctx.moveTo(2, h);
  ctx.lineTo(2, top);
  ctx.moveTo(w - 2, h);
  ctx.lineTo(w - 2, top);
  ctx.moveTo(2, top + 4);
  ctx.lineTo(w - 2, top + 4);
  ctx.moveTo(2, h - 2);
  ctx.lineTo(w - 2, top + 6);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(200,160,100,0.7)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(2, (h + top) / 2);
  ctx.lineTo(w - 2, (h + top) / 2);
  ctx.stroke();
}

export { blobPath };
