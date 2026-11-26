/**
 * Amber Tap art, one distinct look per level so every upgrade reads as "richer":
 * L1 涓流 muddy pit + stick tripod → L2 细泉 plank rim + pulley derrick → L3 涌泉 stone basin + fountain
 * → L4 琥珀井 roofed well-house → L5 金脉 marble dais + golden dome → L6 永燃之心 floating amber heart.
 * `drawHarvesterArt` is the cached static sprite; `drawHarvesterLive` animates it every frame.
 */
import { blobPath, glow, poly, roundRect, shade, shadow, type Ctx } from './draw';

const INK = 'rgba(40,24,10,0.9)';

function pool(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, rich: number): void {
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  const g = ctx.createRadialGradient(cx - rx * 0.25, cy - ry * 0.3, 1, cx, cy, rx);
  g.addColorStop(0, rich >= 4 ? '#fff6c8' : '#ffe08a');
  g.addColorStop(0.5, rich >= 4 ? '#ffc23a' : '#f0a030');
  g.addColorStop(1, '#a35a12');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.beginPath();
  ctx.ellipse(cx - rx * 0.35, cy - ry * 0.35, rx * 0.25, ry * 0.18, -0.2, 0, Math.PI * 2);
  ctx.fill();
}

function crystal(ctx: Ctx, x: number, y: number, w: number, h: number, tip?: string): void {
  poly(ctx, [x - w, y, x - w * 0.6, y - h * 0.8, x, y - h, x + w * 0.7, y - h * 0.75, x + w, y], '#f5a83a', 'rgba(70,30,4,0.95)', 1.2);
  poly(ctx, [x - w * 0.6, y - h * 0.8, x, y - h, x, y], 'rgba(255,240,180,0.55)');
  if (tip) poly(ctx, [x - w * 0.35, y - h * 0.86, x, y - h, x + w * 0.4, y - h * 0.84], tip, 'rgba(70,40,4,0.9)', 0.8);
}

function crystalRing(ctx: Ctx, cx: number, cy: number, n: number, scale: number, r: () => number, tip?: string): void {
  for (let i = 0; i < n; i++) {
    const a = Math.PI * (0.15 + (0.7 * i) / Math.max(1, n - 1)) + Math.PI; // back half: behind the pool
    const x = cx + Math.cos(a) * 22;
    const y = cy + Math.sin(a) * 9;
    crystal(ctx, x, y, (3.5 + r() * 1.5) * scale, (11 + r() * 7) * scale, tip);
  }
}

function pennant(ctx: Ctx, x: number, y: number, h: number, color: string, gold = false): void {
  ctx.strokeStyle = gold ? '#c9a24a' : '#3a2614';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y - h);
  ctx.stroke();
  poly(ctx, [x, y - h, x + 10, y - h + 3, x, y - h + 7], color, INK, 1);
  if (gold) {
    ctx.fillStyle = '#ffe08a';
    ctx.beginPath();
    ctx.arc(x, y - h - 1.5, 1.8, 0, Math.PI * 2);
    ctx.fill();
  }
}

function lantern(ctx: Ctx, x: number, y: number): void {
  ctx.fillStyle = '#3a2614';
  ctx.fillRect(x - 0.8, y, 1.6, 12);
  ctx.fillStyle = '#ffe2a0';
  ctx.fillRect(x - 2.5, y - 5, 5, 6);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1;
  ctx.strokeRect(x - 2.5, y - 5, 5, 6);
  glow(ctx, x, y - 2, 9, '#ffcf6a', 0.6);
}

// ---- L1 涓流: a dug pit with a stick tripod ----
function trickle(ctx: Ctx, cx: number, cy: number, r: () => number): void {
  blobPath(ctx, cx, cy + 6, 20, r, 0.16, 9, 0.5);
  ctx.fillStyle = '#7a5a3a';
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.4;
  ctx.stroke();
  pool(ctx, cx, cy + 6, 12, 5.5, 0);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + r() * 0.4;
    blobPath(ctx, cx + Math.cos(a) * 19, cy + 6 + Math.sin(a) * 9, 2.6 + r() * 1.4, r, 0.25, 6);
    ctx.fillStyle = shade('#9a9488', (r() - 0.5) * 0.3);
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  crystal(ctx, cx - 6, cy + 4, 3, 10);
  // stick tripod + bucket
  ctx.strokeStyle = '#5a3d1e';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - 14, cy + 10);
  ctx.lineTo(cx + 2, cy - 18);
  ctx.moveTo(cx + 14, cy + 10);
  ctx.lineTo(cx - 2, cy - 18);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(40,25,10,0.9)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx, cy - 16);
  ctx.lineTo(cx, cy - 4);
  ctx.stroke();
  ctx.fillStyle = '#6a4526';
  ctx.fillRect(cx - 2.5, cy - 5, 5, 5);
}

// ---- L2 细泉: plank rim, A-frame derrick with a pulley, a barrel ----
function spring(ctx: Ctx, cx: number, cy: number, r: () => number): void {
  ctx.beginPath();
  ctx.ellipse(cx, cy + 8, 25, 13, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#6a4526';
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(cx, cy + 5, 23, 11, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#9a6a3a';
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = 'rgba(60,35,15,0.6)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * 17, cy + 5 + Math.sin(a) * 8);
    ctx.lineTo(cx + Math.cos(a) * 23, cy + 5 + Math.sin(a) * 11);
    ctx.stroke();
  }
  pool(ctx, cx, cy + 5, 17, 7.5, 1);
  crystalRing(ctx, cx, cy + 5, 3, 0.9, r);
  // A-frame with crossbar and pulley wheel
  ctx.strokeStyle = '#4a2f18';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx - 22, cy + 10);
  ctx.lineTo(cx - 4, cy - 30);
  ctx.moveTo(cx + 22, cy + 10);
  ctx.lineTo(cx + 4, cy - 30);
  ctx.moveTo(cx - 13, cy - 10);
  ctx.lineTo(cx + 13, cy - 10);
  ctx.stroke();
  ctx.fillStyle = '#3a2614';
  ctx.fillRect(cx - 8, cy - 33, 16, 5);
  ctx.beginPath();
  ctx.arc(cx, cy - 27, 4, 0, Math.PI * 2);
  ctx.fillStyle = '#8a6440';
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + 4, cy - 27);
  ctx.lineTo(cx + 4, cy - 12);
  ctx.stroke();
  ctx.fillStyle = '#6a4526';
  ctx.fillRect(cx + 1, cy - 12, 7, 6);
  ctx.fillStyle = '#c9a24a';
  ctx.fillRect(cx + 1, cy - 10, 7, 1);
  // barrel of amber
  roundRect(ctx, cx + 22, cy + 4, 9, 12, 3);
  ctx.fillStyle = '#7a5230';
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.fillStyle = '#3a3a40';
  ctx.fillRect(cx + 22, cy + 7, 9, 1.4);
  ctx.fillRect(cx + 22, cy + 12, 9, 1.4);
  ctx.fillStyle = '#ffc04a';
  ctx.beginPath();
  ctx.ellipse(cx + 26.5, cy + 4.5, 4, 1.6, 0, 0, Math.PI * 2);
  ctx.fill();
}

function stoneBasin(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, top: string, side: string): void {
  ctx.beginPath();
  ctx.ellipse(cx, cy + 4, rx + 1, ry + 2, 0, 0, Math.PI * 2);
  ctx.fillStyle = side;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = top;
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = 'rgba(40,30,20,0.35)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * (rx - 6), cy + Math.sin(a) * (ry - 3));
    ctx.lineTo(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry);
    ctx.stroke();
  }
}

// ---- L3 涌泉: cut-stone basin with a fountain spout and lanterns ----
function gusher(ctx: Ctx, cx: number, cy: number, r: () => number, color: string): void {
  stoneBasin(ctx, cx, cy + 4, 26, 13, '#a6a194', '#6e6a60');
  pool(ctx, cx, cy + 4, 19, 8.5, 2);
  crystalRing(ctx, cx, cy + 4, 4, 1, r);
  // spout pillar
  poly(ctx, [cx - 4, cy + 6, cx - 3, cy - 14, cx + 3, cy - 14, cx + 4, cy + 6], '#bdb8aa', INK, 1.2);
  ctx.fillStyle = '#8a8578';
  ctx.fillRect(cx - 6, cy - 17, 12, 4);
  ctx.strokeStyle = INK;
  ctx.strokeRect(cx - 6, cy - 17, 12, 4);
  poly(ctx, [cx - 3, cy - 17, cx, cy - 23, cx + 3, cy - 17], '#f5a83a', INK, 1);
  lantern(ctx, cx - 28, cy - 2);
  lantern(ctx, cx + 28, cy - 2);
  ctx.fillStyle = color;
  ctx.fillRect(cx - 3, cy + 14, 6, 3);
}

// ---- L4 琥珀井: a roofed well-house with crystals and a pennant ----
function wellHouse(ctx: Ctx, cx: number, cy: number, r: () => number, color: string): void {
  stoneBasin(ctx, cx, cy + 6, 25, 12, '#b0aa9a', '#6e6a60');
  pool(ctx, cx, cy + 6, 18, 8, 3);
  crystal(ctx, cx - 30, cy + 14, 5, 22);
  crystal(ctx, cx - 24, cy + 18, 3.5, 13);
  crystal(ctx, cx + 30, cy + 14, 5, 20);
  crystal(ctx, cx + 25, cy + 19, 3.5, 12);
  // four posts
  for (const px of [-20, 20]) {
    ctx.fillStyle = '#5a3a1e';
    ctx.fillRect(cx + px - 1.8, cy - 24, 3.6, 34);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1;
    ctx.strokeRect(cx + px - 1.8, cy - 24, 3.6, 34);
  }
  // red tiled gable roof
  poly(ctx, [cx - 30, cy - 20, cx, cy - 42, cx + 30, cy - 20, cx + 26, cy - 16, cx - 26, cy - 16], '#b8432f', INK, 1.6);
  ctx.strokeStyle = 'rgba(80,20,10,0.55)';
  ctx.lineWidth = 1;
  for (let i = 1; i < 5; i++) {
    const k = i / 5;
    ctx.beginPath();
    ctx.moveTo(cx - 30 + 30 * k, cy - 20 - 22 * k);
    ctx.lineTo(cx - 26 + 26 * k, cy - 16 - 26 * k + 4);
    ctx.moveTo(cx + 30 - 30 * k, cy - 20 - 22 * k);
    ctx.lineTo(cx + 26 - 26 * k, cy - 16 - 26 * k + 4);
    ctx.stroke();
  }
  poly(ctx, [cx - 30, cy - 20, cx + 30, cy - 20, cx + 26, cy - 16, cx - 26, cy - 16], '#8a2f20', INK, 1.2);
  // windlass + rope
  ctx.fillStyle = '#6a4526';
  ctx.fillRect(cx - 18, cy - 13, 36, 3);
  ctx.strokeStyle = 'rgba(40,25,10,0.9)';
  ctx.beginPath();
  ctx.moveTo(cx + 2, cy - 11);
  ctx.lineTo(cx + 2, cy - 1);
  ctx.stroke();
  ctx.fillStyle = '#c9a24a';
  ctx.fillRect(cx - 1, cy - 2, 6, 5);
  pennant(ctx, cx, cy - 42, 12, color);
  lantern(ctx, cx - 22, cy - 15);
  void r;
}

// ---- L5 金脉: marble dais, gold veins, golden dome on slender pillars ----
function goldVein(ctx: Ctx, cx: number, cy: number, r: () => number, color: string): void {
  // gold veins in the ground
  ctx.strokeStyle = '#e8b830';
  ctx.lineWidth = 1.6;
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + r() * 0.3;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * 24, cy + 8 + Math.sin(a) * 12);
    ctx.lineTo(cx + Math.cos(a + 0.15) * 34, cy + 8 + Math.sin(a + 0.15) * 17);
    ctx.lineTo(cx + Math.cos(a - 0.1) * 40, cy + 8 + Math.sin(a - 0.1) * 20);
    ctx.stroke();
  }
  // octagonal marble dais with gold rim
  const oct = (rx: number, ry: number, y: number): number[] => {
    const pts: number[] = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      pts.push(cx + Math.cos(a) * rx, y + Math.sin(a) * ry);
    }
    return pts;
  };
  poly(ctx, oct(29, 15, cy + 10), '#cfc4ae', INK, 1.5);
  poly(ctx, oct(28, 14, cy + 6), '#f2ead8', INK, 1.5);
  poly(ctx, oct(24, 11.5, cy + 6), undefined, '#d8a830', 1.6);
  pool(ctx, cx, cy + 6, 17, 7.5, 4);
  crystalRing(ctx, cx, cy + 6, 4, 1.15, r, '#ffe7a0');
  // slender gold pillars + dome
  for (const px of [-22, 22]) {
    ctx.fillStyle = '#e0b440';
    ctx.fillRect(cx + px - 1.6, cy - 22, 3.2, 30);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1;
    ctx.strokeRect(cx + px - 1.6, cy - 22, 3.2, 30);
    ctx.fillStyle = '#fff0b0';
    ctx.fillRect(cx + px - 0.6, cy - 20, 1, 26);
  }
  ctx.beginPath();
  ctx.moveTo(cx - 27, cy - 20);
  ctx.quadraticCurveTo(cx - 24, cy - 46, cx, cy - 48);
  ctx.quadraticCurveTo(cx + 24, cy - 46, cx + 27, cy - 20);
  ctx.closePath();
  const g = ctx.createLinearGradient(cx - 26, cy - 48, cx + 26, cy - 20);
  g.addColorStop(0, '#fff2b0');
  g.addColorStop(0.5, '#e8b830');
  g.addColorStop(1, '#a87a1a');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(120,80,10,0.6)';
  ctx.lineWidth = 1;
  for (const k of [-0.5, 0, 0.5]) {
    ctx.beginPath();
    ctx.moveTo(cx + k * 26, cy - 20);
    ctx.quadraticCurveTo(cx + k * 18, cy - 42, cx, cy - 48);
    ctx.stroke();
  }
  poly(ctx, [cx - 28, cy - 22, cx + 28, cy - 22, cx + 28, cy - 18, cx - 28, cy - 18], '#c9962a', INK, 1.2);
  pennant(ctx, cx, cy - 48, 12, color, true);
  pennant(ctx, cx - 33, cy + 12, 22, color, true);
  pennant(ctx, cx + 33, cy + 12, 22, color, true);
}

// ---- L6 永燃之心: tiered gold dais, rune circle and crystal pylons (heart floats in the live layer) ----
function eternalHeart(ctx: Ctx, cx: number, cy: number, r: () => number, color: string): void {
  // rune circle
  ctx.strokeStyle = 'rgba(255,200,80,0.85)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(cx, cy + 10, 38, 19, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([3, 4]);
  ctx.beginPath();
  ctx.ellipse(cx, cy + 10, 34, 17, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const x = cx + Math.cos(a) * 36;
    const y = cy + 10 + Math.sin(a) * 18;
    poly(ctx, [x, y - 2.5, x + 2, y, x, y + 2.5, x - 2, y], '#ffe08a');
  }
  // two-tier golden dais
  ctx.beginPath();
  ctx.ellipse(cx, cy + 10, 29, 14, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#a87a1a';
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(cx, cy + 6, 28, 13, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#f2ead8';
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(cx, cy + 4, 21, 9.5, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#e8b830';
  ctx.fill();
  ctx.stroke();
  pool(ctx, cx, cy + 3, 16, 7, 5);
  // four crystal pylons
  for (const [px, py] of [[-30, 2], [30, 2], [-18, 18], [18, 18]] as const) {
    poly(ctx, [cx + px - 4, cy + py + 4, cx + px + 4, cy + py + 4, cx + px + 3, cy + py, cx + px - 3, cy + py], '#c9962a', INK, 1);
    crystal(ctx, cx + px, cy + py, 3.6, 20 + (py < 10 ? 6 : 0), '#fff2c0');
  }
  pennant(ctx, cx - 38, cy + 4, 26, color, true);
  pennant(ctx, cx + 38, cy + 4, 26, color, true);
  void r;
}

export function drawHarvesterArt(ctx: Ctx, S: number, level: number, color: string, r: () => number): void {
  const cx = S / 2;
  const cy = S / 2 + 6;
  shadow(ctx, cx + 6, cy + 18, 30 + level * 3, 11 + level, 0.45);
  switch (Math.min(level, 5)) {
    case 0:
      trickle(ctx, cx, cy, r);
      break;
    case 1:
      spring(ctx, cx, cy, r);
      break;
    case 2:
      gusher(ctx, cx, cy, r, color);
      break;
    case 3:
      wellHouse(ctx, cx, cy, r, color);
      break;
    case 4:
      goldVein(ctx, cx, cy, r, color);
      break;
    default:
      eternalHeart(ctx, cx, cy, r, color);
  }
  if (level < 2) {
    ctx.fillStyle = color;
    ctx.fillRect(cx - 24, cy + 14, 5, 5);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1;
    ctx.strokeRect(cx - 24, cy + 14, 5, 5);
  }
}

/** Animated layer drawn every frame on top of the cached sprite. (cx, cy) is the building centre. */
export function drawHarvesterLive(ctx: Ctx, cx: number, cy: number, level: number, t: number, id: number): void {
  const pulse = 0.5 + Math.sin(t * 3 + id) * 0.25;
  glow(ctx, cx, cy - 4, 18 + level * 6, '#ffb03a', 0.22 * pulse + 0.06 * level);
  // rising amber motes: more and brighter with each level
  const n = 2 + level * 2;
  for (let i = 0; i < n; i++) {
    const k = (t * (0.5 + level * 0.06) + i / n + id * 0.13) % 1;
    const mx = cx + Math.sin(i * 2.1 + t) * (10 + level * 2);
    const my = cy - 6 - k * (30 + level * 6);
    ctx.globalAlpha = 1 - k;
    glow(ctx, mx, my, 3 + level * 0.5, level >= 4 ? '#fff0a0' : '#ffd27a', 0.9);
  }
  ctx.globalAlpha = 1;
  if (level === 2) fountain(ctx, cx, cy - 13, t, id, 4, 14);
  if (level === 3) fountain(ctx, cx, cy - 2, t, id, 3, 8);
  if (level >= 4) sparkles(ctx, cx, cy, t, id, level);
  if (level >= 5) heart(ctx, cx, cy, t, id);
}

function fountain(ctx: Ctx, x: number, y: number, t: number, id: number, jets: number, h: number): void {
  for (let j = 0; j < jets; j++) {
    const dir = (j / (jets - 1 || 1) - 0.5) * 2;
    for (let i = 0; i < 6; i++) {
      const k = (t * 1.6 + i / 6 + j * 0.17 + id * 0.1) % 1;
      const px = x + dir * 14 * k;
      const py = y - h * 4 * k * (1 - k) + 12 * k;
      ctx.fillStyle = k < 0.5 ? '#ffe9a8' : '#ffb84a';
      ctx.globalAlpha = 1 - k * 0.7;
      ctx.beginPath();
      ctx.arc(px, py, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

function sparkles(ctx: Ctx, cx: number, cy: number, t: number, id: number, level: number): void {
  for (let i = 0; i < 3 + level; i++) {
    const ph = (t * 1.3 + i * 0.37 + id * 0.21) % 1;
    const a = i * 2.4 + id;
    const x = cx + Math.cos(a) * (14 + (i % 3) * 9);
    const y = cy + 6 + Math.sin(a) * (7 + (i % 3) * 4) - 10;
    const s = Math.sin(ph * Math.PI) * 3.5;
    if (s <= 0.2) continue;
    ctx.strokeStyle = '#fff6c8';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x - s, y);
    ctx.lineTo(x + s, y);
    ctx.moveTo(x, y - s);
    ctx.lineTo(x, y + s);
    ctx.stroke();
  }
}

/** 永燃之心: a giant amber heart bobbing above the dais, orbited by shards, casting a light beam. */
function heart(ctx: Ctx, cx: number, cy: number, t: number, id: number): void {
  const bob = Math.sin(t * 1.8 + id) * 3;
  const hy = cy - 30 + bob;
  // light column
  ctx.fillStyle = 'rgba(255,220,120,0.16)';
  ctx.fillRect(cx - 7, hy - 40, 14, 66);
  glow(ctx, cx, hy, 34, '#ffb03a', 0.55 + Math.sin(t * 3) * 0.1);
  // orbit shards: back half first
  const shards = (front: boolean): void => {
    for (let i = 0; i < 4; i++) {
      const a = t * 1.4 + (i / 4) * Math.PI * 2 + id;
      if (Math.sin(a) > 0 !== front) continue;
      const x = cx + Math.cos(a) * 22;
      const y = hy + 4 + Math.sin(a) * 7;
      poly(ctx, [x, y - 5, x + 2.5, y, x, y + 5, x - 2.5, y], '#ffc04a', INK, 0.9);
    }
  };
  shards(false);
  // faceted heart crystal
  poly(ctx, [cx, hy - 16, cx + 11, hy - 4, cx + 6, hy + 12, cx - 6, hy + 12, cx - 11, hy - 4], '#ffa82a', INK, 1.6);
  poly(ctx, [cx, hy - 16, cx + 11, hy - 4, cx, hy - 2], '#ffd46a');
  poly(ctx, [cx, hy - 16, cx - 11, hy - 4, cx, hy - 2], '#fff0b8');
  poly(ctx, [cx - 6, hy + 12, cx, hy - 2, cx + 6, hy + 12], '#e0861a');
  glow(ctx, cx - 2, hy - 6, 8, '#ffffff', 0.7);
  shards(true);
}
