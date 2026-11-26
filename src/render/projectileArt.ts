/**
 * Projectile art. Every tower tier fires something visibly stronger:
 * bolt   L1 wooden arrow → L2 iron bolt → L3 gold piercing bolts → L4 blazing gold → L5 runic hunter's mark
 * frost  L1 ice shard → L2 snowflake comet → L3 spinning glacier crystal
 * lance  L1 ember → L2 flame comet → L3 meteor
 * Drawn in the projectile's local frame (x forward). Uses cached glow sprites only.
 */
import type { Projectile } from '../sim/types';
import { glow, poly, type Ctx } from './draw';

export type TrailFn = (color: string, size: number, life: number) => void;

/** Fading streak behind the projectile: stacked strokes instead of a per-frame gradient. */
function streak(ctx: Ctx, len: number, width: number, color: string, alpha: number): void {
  const steps = 4;
  ctx.lineCap = 'round';
  for (let i = 0; i < steps; i++) {
    const k = i / steps;
    ctx.globalAlpha = alpha * (1 - k);
    ctx.strokeStyle = color;
    ctx.lineWidth = width * (1 - k * 0.6);
    ctx.beginPath();
    ctx.moveTo(-len * k, 0);
    ctx.lineTo(-len * (k + 1 / steps), 0);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.lineCap = 'butt';
}

function arrowHead(ctx: Ctx, tip: number, len: number, half: number, fill: string): void {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(tip, 0);
  ctx.lineTo(tip - len, -half);
  ctx.lineTo(tip - len, half);
  ctx.closePath();
  ctx.fill();
}

function drawBolt(ctx: Ctx, p: Projectile, t: number, trail: TrailFn): void {
  const lv = p.level;
  if (p.variant === 'mark') {
    // L5 猎魔印记: a violet rune-bolt with a spinning sigil
    streak(ctx, 46, 7, '#b070ff', 0.55);
    glow(ctx, -4, 0, 22, '#c890ff', 0.75);
    ctx.strokeStyle = '#f0e0ff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-18, 0);
    ctx.lineTo(6, 0);
    ctx.stroke();
    arrowHead(ctx, 13, 8, 4.5, '#ffffff');
    ctx.save();
    ctx.translate(-2, 0);
    ctx.rotate(t * 9);
    ctx.strokeStyle = 'rgba(230,200,255,0.9)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      ctx.moveTo(Math.cos(a) * 7, Math.sin(a) * 7);
      ctx.lineTo(Math.cos(a + 2.1) * 7, Math.sin(a + 2.1) * 7);
    }
    ctx.stroke();
    ctx.restore();
    if (Math.random() < 0.7) trail('#d8b0ff', 2.4, 0.45);
    return;
  }
  if (lv >= 2) {
    // L3–L4 穿甲连弩: gold piercing bolts; L4 burns brighter with a longer tail
    const hot = lv >= 3;
    streak(ctx, hot ? 38 : 26, hot ? 5 : 3.5, '#ffd870', hot ? 0.6 : 0.45);
    glow(ctx, -6, 0, hot ? 16 : 11, '#ffd870', hot ? 0.7 : 0.55);
    ctx.strokeStyle = hot ? '#fff2c0' : '#ffd870';
    ctx.lineWidth = hot ? 3 : 2.4;
    ctx.beginPath();
    ctx.moveTo(-16, 0);
    ctx.lineTo(5, 0);
    ctx.stroke();
    arrowHead(ctx, hot ? 12 : 10, hot ? 8 : 6, hot ? 4 : 3, '#ffffff');
    if (hot && Math.random() < 0.5) trail('#ffe08a', 2, 0.35);
    return;
  }
  if (lv === 1) {
    // L2 iron bolt: heavier shaft, steel head, faint air streak
    streak(ctx, 18, 2, 'rgba(255,255,255,0.8)', 0.35);
    ctx.strokeStyle = '#3a3a40';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(-12, 0);
    ctx.lineTo(5, 0);
    ctx.stroke();
    arrowHead(ctx, 10, 6, 3, '#e6ebf0');
    ctx.fillStyle = '#c23b2a';
    ctx.fillRect(-13, -2.5, 4, 5);
    return;
  }
  // L1 wooden arrow
  ctx.strokeStyle = '#5a3d1e';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-10, 0);
  ctx.lineTo(4, 0);
  ctx.stroke();
  arrowHead(ctx, 8, 5, 2.5, '#d8d8d8');
  ctx.fillStyle = '#e8e0d0';
  ctx.fillRect(-11, -2, 3, 4);
}

function drawFrost(ctx: Ctx, p: Projectile, t: number, trail: TrailFn): void {
  const lv = p.level;
  const s = 1 + lv * 0.45;
  streak(ctx, 14 + lv * 14, 3 + lv * 2, '#bff2ff', 0.35 + lv * 0.12);
  glow(ctx, 0, 0, 12 + lv * 7, '#bff2ff', 0.7);
  if (lv >= 2) {
    // L3 glacier crystal: spinning six-point star
    ctx.save();
    ctx.rotate(t * 6);
    for (let i = 0; i < 6; i++) {
      ctx.rotate(Math.PI / 3);
      poly(ctx, [0, -2.2, 10, 0, 0, 2.2], i % 2 ? '#e8fbff' : '#9fe8ff');
    }
    ctx.restore();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 0, 3.4, 0, Math.PI * 2);
    ctx.fill();
  } else {
    poly(ctx, [7 * s, 0, 0, -3.5 * s, -6 * s, 0, 0, 3.5 * s], '#e8fbff', 'rgba(40,110,150,0.8)', 1);
    if (lv >= 1) poly(ctx, [7 * s, 0, 0, -3.5 * s, 0, 0], 'rgba(255,255,255,0.9)');
  }
  if (lv >= 1 && Math.random() < 0.4 + lv * 0.2) trail(lv >= 2 ? '#ffffff' : '#d8f8ff', 1.8 + lv * 0.4, 0.5);
}

function drawEmber(ctx: Ctx, p: Projectile, t: number, trail: TrailFn): void {
  if (p.variant === 'meteor') {
    // L3 陨火: a falling star with a long burning tail
    streak(ctx, 80, 16, '#ff6a1a', 0.55);
    streak(ctx, 50, 8, '#ffd27a', 0.6);
    glow(ctx, 0, 0, 36, '#ff5a1a', 0.9);
    glow(ctx, -20, 0, 24, '#ff9a3a', 0.55);
    ctx.fillStyle = '#fff0c0';
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, Math.PI * 2);
    ctx.fill();
    if (Math.random() < 0.9) trail('#ff7a2a', 4, 0.55);
    return;
  }
  const lv = p.level;
  const flick = 1 + Math.sin(t * 30 + p.id) * 0.12;
  streak(ctx, 18 + lv * 22, 5 + lv * 4, '#ff6a1a', 0.45 + lv * 0.15);
  glow(ctx, 0, 0, (18 + lv * 8) * flick, '#ff7a2a', 0.8);
  glow(ctx, -10, 0, 12 + lv * 6, '#ff4a1a', 0.4 + lv * 0.15);
  ctx.fillStyle = lv >= 1 ? '#fffbe0' : '#fff0b0';
  ctx.beginPath();
  ctx.arc(0, 0, 3.5 + lv * 1.5, 0, Math.PI * 2);
  ctx.fill();
  if (Math.random() < 0.6 + lv * 0.3) trail(lv >= 1 ? '#ffb040' : '#ff9a4a', 2.5 + lv, 0.35 + lv * 0.15);
}

/** Draw a projectile in its local frame. `trail` spawns a world-space ember/spark behind it. */
export function drawProjectileArt(ctx: Ctx, p: Projectile, t: number, trail: TrailFn): void {
  if (p.ptype === 'bolt') drawBolt(ctx, p, t, trail);
  else if (p.ptype === 'frost') drawFrost(ctx, p, t, trail);
  else if (p.ptype === 'ember') drawEmber(ctx, p, t, trail);
  else if (p.ptype === 'arrow') {
    ctx.strokeStyle = '#6a4526';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-9, 0);
    ctx.lineTo(5, 0);
    ctx.stroke();
    arrowHead(ctx, 8, 4, 2, '#cfd4da');
  } else {
    ctx.fillStyle = '#8a8680';
    ctx.beginPath();
    ctx.arc(0, 0, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
}
