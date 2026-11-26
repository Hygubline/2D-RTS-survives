/**
 * Storybook characters. The four warden households are round little animals (rabbit, bear,
 * fox, cat — one species per player, so a glance tells whose unit it is); their guards and
 * rangers are the same animal in a helmet or a leaf hood. The hunters are round, fluffy,
 * rather adorable monsters tinted in their pack colour. Everything is drawn at (0,0) = feet.
 */
import type { HunterState, Unit } from '../sim/types';
import { glow, poly, shade, shadow, type Ctx } from './draw';

const INK = 'rgba(61,40,23,0.95)';
const LW = 1.3;

export type Species = 'rabbit' | 'bear' | 'fox' | 'cat';
const SPECIES: readonly Species[] = ['rabbit', 'bear', 'fox', 'cat'];

interface Fur {
  fur: string;
  belly: string;
  inner: string;
}
const FUR: Record<Species, Fur> = {
  rabbit: { fur: '#f6f1e7', belly: '#ffffff', inner: '#f4b3bd' },
  bear: { fur: '#b07a4f', belly: '#e6c49a', inner: '#8a5a38' },
  fox: { fur: '#e9873f', belly: '#fff5e6', inner: '#5a3a28' },
  cat: { fur: '#9a9aab', belly: '#e8e8ef', inner: '#f4b3bd' },
};

/** Which animal a player's units are; survivors are players 0-3. */
export function speciesOf(owner: number): Species {
  return SPECIES[((owner % 4) + 4) % 4];
}

function mirrorAngle(facing: number): { flip: number; local: number } {
  const c = Math.cos(facing);
  const s = Math.sin(facing);
  const flip = c < -0.05 ? -1 : 1;
  return { flip, local: Math.atan2(s, Math.abs(c)) };
}

function stroke(ctx: Ctx, lw = LW): void {
  ctx.strokeStyle = INK;
  ctx.lineWidth = lw;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();
}

function oval(ctx: Ctx, x: number, y: number, rx: number, ry: number, fill: string, lw = LW, rot = 0): void {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  if (lw > 0) stroke(ctx, lw);
}

const HEAD_X = 0.6;
const HEAD_Y = -16.5;
const HEAD_R = 6.4;

function drawTail(ctx: Ctx, sp: Species, f: Fur, wag: number): void {
  if (sp === 'rabbit') oval(ctx, -6, -5, 2.6, 2.4, f.belly);
  else if (sp === 'bear') oval(ctx, -6, -5, 1.8, 1.6, f.fur);
  else if (sp === 'fox') {
    ctx.save();
    // bushy tail sweeping up behind the body, with a white tip
    ctx.translate(-4.5, -4.5);
    ctx.rotate(0.75 + wag * 0.12);
    ctx.beginPath();
    ctx.moveTo(0, 1.5);
    ctx.quadraticCurveTo(-4, 4.5, -9.5, 2.2);
    ctx.quadraticCurveTo(-12.5, 0, -10, -2.6);
    ctx.quadraticCurveTo(-5, -4.6, 0, -1.8);
    ctx.closePath();
    ctx.fillStyle = f.fur;
    ctx.fill();
    stroke(ctx);
    ctx.beginPath();
    ctx.moveTo(-8.2, 2.6);
    ctx.quadraticCurveTo(-12.5, 0, -10, -2.6);
    ctx.quadraticCurveTo(-7.4, -1.4, -8.2, 2.6);
    ctx.fillStyle = f.belly;
    ctx.fill();
    ctx.restore();
  } else {
    ctx.beginPath();
    ctx.moveTo(-5, -4);
    ctx.bezierCurveTo(-11, -4, -9, -13 + wag, -6, -14 + wag);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3.6;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.strokeStyle = f.fur;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

function drawEars(ctx: Ctx, sp: Species, f: Fur, t: number, hidden: boolean): void {
  const hx = HEAD_X;
  const hy = HEAD_Y;
  if (sp === 'rabbit') {
    const tw = Math.sin(t * 1.7) * 0.08;
    for (const [dx, rot] of [
      [-2.6, -0.18 + tw],
      [2.4, 0.22 - tw],
    ] as const) {
      ctx.save();
      ctx.translate(hx + dx, hy - 4.5);
      ctx.rotate(rot);
      oval(ctx, 0, -6, 2.4, 6.5, f.fur);
      oval(ctx, 0, -6, 1.1, 4.6, f.inner, 0);
      ctx.restore();
    }
    return;
  }
  if (hidden) return;
  if (sp === 'bear') {
    for (const dx of [-4.2, 4.6]) {
      oval(ctx, hx + dx, hy - 4.6, 2.5, 2.4, f.fur);
      oval(ctx, hx + dx, hy - 4.4, 1.2, 1.1, f.inner, 0);
    }
    return;
  }
  // fox & cat: pointed ears
  const tall = sp === 'fox' ? 6.5 : 5;
  for (const dx of [-3.6, 3.8]) {
    ctx.beginPath();
    ctx.moveTo(hx + dx - 2.8, hy - 3.6);
    ctx.lineTo(hx + dx + 0.2, hy - 3.6 - tall);
    ctx.lineTo(hx + dx + 2.8, hy - 3.2);
    ctx.closePath();
    ctx.fillStyle = f.fur;
    ctx.fill();
    stroke(ctx);
    ctx.beginPath();
    ctx.moveTo(hx + dx - 1.3, hy - 4);
    ctx.lineTo(hx + dx + 0.2, hy - 2.8 - tall);
    ctx.lineTo(hx + dx + 1.4, hy - 3.8);
    ctx.closePath();
    ctx.fillStyle = f.inner;
    ctx.fill();
  }
}

function drawFace(ctx: Ctx, sp: Species, f: Fur, t: number, id: number): void {
  const hx = HEAD_X;
  const hy = HEAD_Y;
  // muzzle
  if (sp === 'bear' || sp === 'fox') oval(ctx, hx + 2.6, hy + 2.4, 3, 2.2, f.belly, 0);
  // eyes (three-quarter view: both eyes shifted toward the facing side), with a slow blink
  const blink = (t + id * 0.37) % 4 < 0.12;
  for (const ex of [hx + 0.2, hx + 4]) {
    if (blink) {
      ctx.beginPath();
      ctx.moveTo(ex - 1.1, hy + 0.2);
      ctx.lineTo(ex + 1.1, hy + 0.2);
      stroke(ctx, 1);
    } else {
      oval(ctx, ex, hy, 1.15, 1.45, '#2a1a10', 0);
      oval(ctx, ex + 0.4, hy - 0.5, 0.45, 0.45, '#ffffff', 0);
    }
  }
  // nose + blush
  oval(ctx, hx + 3, hy + 2, 0.95, 0.7, sp === 'rabbit' || sp === 'cat' ? '#e58a9a' : '#3a2418', 0);
  ctx.fillStyle = 'rgba(240,120,120,0.35)';
  ctx.beginPath();
  ctx.ellipse(hx - 1.8, hy + 2.2, 1.6, 0.9, 0, 0, Math.PI * 2);
  ctx.ellipse(hx + 5.6, hy + 2.2, 1.2, 0.9, 0, 0, Math.PI * 2);
  ctx.fill();
  if (sp === 'cat') {
    ctx.strokeStyle = 'rgba(61,40,23,0.55)';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(hx + 4.5, hy + 2.3);
    ctx.lineTo(hx + 8, hy + 1.6);
    ctx.moveTo(hx + 4.5, hy + 2.8);
    ctx.lineTo(hx + 8, hy + 3.2);
    ctx.stroke();
  }
}

interface AnimalOpts {
  walk: number;
  scarf: string;
  hood?: string;
  helmet?: boolean;
}

/** The shared round body: feet, tail, bean body with team scarf, big head, ears and face. */
function drawAnimal(ctx: Ctx, u: Unit, sp: Species, t: number, o: AnimalOpts): void {
  const f = FUR[sp];
  // feet
  oval(ctx, -3 + o.walk * 2, -1.2, 2.6, 1.8, shade(f.fur, -0.15));
  oval(ctx, 3 - o.walk * 2, -1.2, 2.6, 1.8, shade(f.fur, -0.15));
  drawTail(ctx, sp, f, Math.sin(t * 5 + u.id));
  // bean body
  oval(ctx, 0, -7, 6.2, 6.4, f.fur);
  oval(ctx, 1, -6, 3.6, 4.2, f.belly, 0);
  // team scarf
  ctx.beginPath();
  ctx.moveTo(-5.2, -11.6);
  ctx.quadraticCurveTo(0.5, -9.2, 6, -11.8);
  ctx.lineTo(6, -9.6);
  ctx.quadraticCurveTo(0.5, -7, -5.2, -9.4);
  ctx.closePath();
  ctx.fillStyle = o.scarf;
  ctx.fill();
  stroke(ctx, 1);
  poly(ctx, [-4.2, -10.4, -6.4, -5.6, -3.6, -6.2], shade(o.scarf, -0.15), INK, 1);
  // head
  if (!o.hood) drawEars(ctx, sp, f, t, !!o.helmet);
  oval(ctx, HEAD_X, HEAD_Y, HEAD_R, HEAD_R * 0.92, f.fur);
  if (o.hood) {
    // leaf hood in team colour, ears tucked inside little bumps
    ctx.beginPath();
    ctx.moveTo(HEAD_X - 6.6, HEAD_Y + 2);
    ctx.quadraticCurveTo(HEAD_X - 8, HEAD_Y - 9, HEAD_X + 0.5, HEAD_Y - 9.5);
    ctx.quadraticCurveTo(HEAD_X + 6.5, HEAD_Y - 9, HEAD_X + 6.8, HEAD_Y - 3);
    ctx.quadraticCurveTo(HEAD_X + 2, HEAD_Y - 6, HEAD_X - 2.5, HEAD_Y - 2);
    ctx.quadraticCurveTo(HEAD_X - 4.5, HEAD_Y + 1, HEAD_X - 6.6, HEAD_Y + 2);
    ctx.closePath();
    ctx.fillStyle = o.hood;
    ctx.fill();
    stroke(ctx);
    // leaf tip
    poly(ctx, [HEAD_X - 1, HEAD_Y - 9.3, HEAD_X - 3.5, HEAD_Y - 13, HEAD_X + 1.5, HEAD_Y - 10.5], shade(o.hood, 0.2), INK, 1);
  }
  drawFace(ctx, sp, f, t, u.id);
}

/** Warden / companion: a round animal with a team scarf, carrying a lantern (hammer when building). */
export function drawSurvivor(ctx: Ctx, u: Unit, color: string, t: number): void {
  const { flip, local } = mirrorAngle(u.facing);
  const walk = u.moving ? Math.sin(t * 14 + u.id) : 0;
  const bob = u.moving ? Math.abs(walk) * 1.6 : Math.sin(t * 2 + u.id) * 0.4;
  const squash = u.moving ? 1 + Math.abs(walk) * 0.04 : 1;
  shadow(ctx, 0, 1, 10, 4, 0.4);
  ctx.save();
  ctx.scale(flip * 1.2, 1.2 / squash);
  ctx.translate(0, -bob);
  drawAnimal(ctx, u, speciesOf(u.owner), t, { walk, scarf: color });
  // paw + tool
  ctx.save();
  ctx.translate(4.2, -8.5);
  let armA = local * 0.6 + 0.5;
  let tool: 'hammer' | 'sling' | 'lantern' = 'lantern';
  if (u.workAnim > 0) {
    tool = 'hammer';
    armA = -1.6 + Math.abs(Math.sin(t * 12 + u.id)) * 2.4;
  } else if (u.attackAnim > 0) {
    tool = 'sling';
    armA = local - 1.2 + (0.35 - u.attackAnim) * 8;
  }
  ctx.rotate(armA);
  const f = FUR[speciesOf(u.owner)];
  if (tool === 'hammer') {
    ctx.beginPath();
    ctx.moveTo(3, 0);
    ctx.lineTo(10, 0);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.8;
    ctx.stroke();
    ctx.strokeStyle = '#b07a4a';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.beginPath();
    ctx.roundRect(8.6, -3.2, 4.2, 6.4, 1.4);
    ctx.fillStyle = '#c9ccd2';
    ctx.fill();
    stroke(ctx, 1);
  } else if (tool === 'sling') {
    ctx.strokeStyle = '#c8a46a';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(3, 0);
    ctx.lineTo(10, 3);
    ctx.stroke();
    oval(ctx, 10, 3, 1.6, 1.6, '#a7a39a', 0.8);
  } else {
    ctx.strokeStyle = INK;
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(4, 0);
    ctx.lineTo(4, 2.4);
    ctx.stroke();
    ctx.beginPath();
    ctx.roundRect(2.4, 2.4, 3.4, 4, 1.2);
    ctx.fillStyle = '#ffd96a';
    ctx.fill();
    stroke(ctx, 0.9);
  }
  oval(ctx, 2.4, 0, 2.3, 2, f.fur, 1);
  ctx.restore();
  ctx.restore();
  if (u.workAnim <= 0 && u.attackAnim <= 0) glow(ctx, 6 * flip, -4 - bob, 10, '#ffd56a', 0.28);
}

/** 林卫 Guard: the household animal in a round helmet, with a team-coloured shield and wooden sword. */
export function drawGuard(ctx: Ctx, u: Unit, color: string, t: number): void {
  const { flip, local } = mirrorAngle(u.facing);
  const walk = u.moving ? Math.sin(t * 12 + u.id) : 0;
  const bob = u.moving ? Math.abs(walk) * 1.4 : 0;
  const swing = u.attackAnim > 0 ? Math.sin(((0.35 - u.attackAnim) / 0.35) * Math.PI) : 0;
  const sp = speciesOf(u.owner);
  shadow(ctx, 0, 1, 12, 4.6, 0.45);
  if (u.elite) glow(ctx, 0, -14, 18, '#ffe08a', 0.35);
  ctx.save();
  ctx.scale(flip * 1.18, 1.18);
  ctx.translate(0, -bob);
  // sword arm behind the body
  ctx.save();
  ctx.translate(4, -9);
  ctx.rotate(local * 0.5 - 0.5 - swing * 1.8);
  ctx.beginPath();
  ctx.roundRect(2.5, -1.4, 11, 2.8, 1.4);
  ctx.fillStyle = '#e9eef2';
  ctx.fill();
  stroke(ctx, 1);
  ctx.beginPath();
  ctx.roundRect(1, -2.8, 2, 5.6, 0.8);
  ctx.fillStyle = '#c99a52';
  ctx.fill();
  stroke(ctx, 0.9);
  oval(ctx, 0.6, 0, 2.2, 2, FUR[sp].fur, 1);
  ctx.restore();
  drawAnimal(ctx, u, sp, t, { walk, scarf: color, helmet: true });
  // round helmet with a plume
  ctx.beginPath();
  ctx.arc(HEAD_X, HEAD_Y - 0.8, HEAD_R + 0.7, Math.PI * 1.02, Math.PI * 1.98);
  ctx.quadraticCurveTo(HEAD_X, HEAD_Y - 3, HEAD_X - HEAD_R - 0.6, HEAD_Y - 1.6);
  ctx.closePath();
  ctx.fillStyle = '#c3c9d1';
  ctx.fill();
  stroke(ctx);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  ctx.ellipse(HEAD_X - 2.4, HEAD_Y - 4.6, 1.6, 0.9, -0.4, 0, Math.PI * 2);
  ctx.fill();
  oval(ctx, HEAD_X + 0.4, HEAD_Y - 8.6, 1.8, 2.6, color, 1, 0.3);
  // round shield in front
  oval(ctx, -4.2, -7.5, 4.6, 5.2, color, 1.4);
  oval(ctx, -4.2, -7.5, 2.8, 3.3, shade(color, 0.3), 0);
  ctx.fillStyle = '#ffe48a';
  ctx.beginPath();
  ctx.arc(-4.2, -7.5, 1.4, 0, Math.PI * 2);
  ctx.fill();
  stroke(ctx, 0.8);
  if (u.elite) {
    ctx.fillStyle = '#ffd34a';
    ctx.font = 'bold 7px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('★', HEAD_X, HEAD_Y - 11);
  }
  ctx.restore();
}

/** 游侠 Ranger: the household animal in a leaf hood, with a little longbow and quiver. */
export function drawRanger(ctx: Ctx, u: Unit, color: string, t: number): void {
  const { flip, local } = mirrorAngle(u.facing);
  const walk = u.moving ? Math.sin(t * 13 + u.id) : 0;
  const bob = u.moving ? Math.abs(walk) * 1.4 : 0;
  const draw = u.attackAnim > 0 ? 1 - u.attackAnim / 0.35 : 0;
  const sp = speciesOf(u.owner);
  shadow(ctx, 0, 1, 10, 4, 0.4);
  if (u.elite) glow(ctx, 0, -14, 16, '#ffe08a', 0.35);
  ctx.save();
  ctx.scale(flip * 1.15, 1.15);
  ctx.translate(0, -bob);
  // quiver on the back
  ctx.save();
  ctx.translate(-4.5, -9);
  ctx.rotate(-0.35);
  ctx.beginPath();
  ctx.roundRect(-1.8, -5, 3.6, 9, 1.4);
  ctx.fillStyle = '#b8743e';
  ctx.fill();
  stroke(ctx, 1);
  for (const dx of [-0.8, 0.9]) poly(ctx, [dx - 1, -5, dx, -8.5, dx + 1, -5], '#fff4e0', INK, 0.8);
  ctx.restore();
  drawAnimal(ctx, u, sp, t, { walk, scarf: color, hood: color });
  // bow
  ctx.save();
  ctx.translate(4.5, -9);
  ctx.rotate(local * 0.8);
  ctx.beginPath();
  ctx.arc(2.5, 0, 8, -1.2, 1.2);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3.2;
  ctx.stroke();
  ctx.strokeStyle = '#c98a4a';
  ctx.lineWidth = 1.8;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,250,235,0.95)';
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(2.5 + Math.cos(-1.2) * 8, Math.sin(-1.2) * 8);
  ctx.lineTo(2.5 - draw * 4.5, 0);
  ctx.lineTo(2.5 + Math.cos(1.2) * 8, Math.sin(1.2) * 8);
  ctx.stroke();
  if (draw > 0) {
    ctx.fillStyle = '#fff4e0';
    ctx.fillRect(2.5 - draw * 4.5, -0.5, 11, 1);
    poly(ctx, [13 - draw * 4.5, -1.6, 15.5 - draw * 4.5, 0, 13 - draw * 4.5, 1.6], '#c3c9d1', INK, 0.6);
  }
  oval(ctx, 1, 0, 2.1, 1.9, FUR[sp].fur, 1);
  ctx.restore();
  if (u.elite) {
    ctx.fillStyle = '#ffd34a';
    ctx.font = 'bold 7px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('★', HEAD_X, HEAD_Y - 11);
  }
  ctx.restore();
}

// ---------------- hunters: round fluffy monsters ----------------

const CLAW_COLORS = ['#fff4e0', '#ff9a7a', '#c48af0', '#8af0ff', '#fff2a8'];
const HIDE_COLORS = ['#c9b79a', '#b9c2cc', '#9a86c0', '#9fe0e6'];

/** Fuzzy blob outline: a circle with small bumps all round, like a fluffy pompom. */
function fluffPath(ctx: Ctx, x: number, y: number, r: number, bumps: number, t: number): void {
  ctx.beginPath();
  for (let i = 0; i <= bumps; i++) {
    const a = (i / bumps) * Math.PI * 2;
    const am = ((i - 0.5) / bumps) * Math.PI * 2;
    const rr = r * (1 + Math.sin(t * 3 + i * 1.7) * 0.015);
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr * 0.95;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.quadraticCurveTo(x + Math.cos(am) * rr * 1.12, y + Math.sin(am) * rr * 1.07, px, py);
  }
  ctx.closePath();
}

/** A hunter; the evolved form is bigger, wears a little crown and has glowing star marks. */
export function drawHunter(ctx: Ctx, u: Unit, h: HunterState, t: number, color = '#7a4ad0'): void {
  if (!h.evolved) {
    // a touch larger than the animals so the monster reads as the threat
    ctx.save();
    ctx.scale(1.15, 1.15);
    drawHunterBody(ctx, u, h, t, color);
    ctx.restore();
    return;
  }
  const pulse = 0.5 + Math.sin(t * 3) * 0.2;
  glow(ctx, 0, -24, 44, color, 0.25 + pulse * 0.15);
  ctx.save();
  ctx.scale(1.5, 1.5);
  drawHunterBody(ctx, u, h, t, color);
  const flip = Math.cos(u.facing) < -0.05 ? -1 : 1;
  ctx.scale(flip, 1);
  // glowing star marks on the fur
  ctx.fillStyle = `rgba(255,236,150,${0.6 + pulse * 0.4})`;
  for (const [sx, sy] of [
    [-8, -22],
    [-4, -12],
    [-10, -14],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(sx, sy - 2.4);
    ctx.quadraticCurveTo(sx, sy, sx + 2.4, sy);
    ctx.quadraticCurveTo(sx, sy, sx, sy + 2.4);
    ctx.quadraticCurveTo(sx, sy, sx - 2.4, sy);
    ctx.quadraticCurveTo(sx, sy, sx, sy - 2.4);
    ctx.fill();
  }
  // tiny crown
  poly(ctx, [-4, -32, -4.5, -38, -1.5, -35, 1, -40, 3.5, -35, 6.5, -38, 6, -32], '#ffd34a', INK, 1.1);
  oval(ctx, 1, -34, 1, 1, '#ff7a8a', 0.6);
  ctx.restore();
}

function drawHunterBody(ctx: Ctx, u: Unit, h: HunterState, t: number, color: string): void {
  const { flip, local } = mirrorAngle(u.facing);
  const walk = u.moving ? Math.sin(t * 9 + u.id) : 0;
  const hop = u.moving ? Math.abs(walk) * 2.6 : 0;
  const breathe = Math.sin(t * 2.2 + u.id) * 0.6;
  const swing = u.attackAnim > 0 ? Math.sin(((0.35 - u.attackAnim) / 0.35) * Math.PI) : 0;
  const fur = shade(color, 0.05);
  const furDark = shade(color, -0.28);
  const furLight = shade(color, 0.35);
  const bx = 0;
  const by = -16 - hop;
  const r = 13.5;
  shadow(ctx, 0, 2, 19, 6, 0.5);
  ctx.save();
  ctx.scale(flip, 1);
  // stubby feet
  oval(ctx, -6 - walk * 2.5, -2, 4.6, 3, furDark);
  oval(ctx, 6 + walk * 2.5, -2, 4.6, 3, furDark);
  // back paw
  ctx.save();
  ctx.translate(-10, by + 2);
  ctx.rotate(0.5 - walk * 0.3 + swing * 0.5);
  oval(ctx, 0, 5, 3.4, 5.2, furDark);
  ctx.restore();
  // horns (grow with horn items)
  const hs = 1 + h.items.horn * 0.22;
  for (const [hx, dir] of [
    [-6, -1],
    [6, 1],
  ] as const) {
    // stubby curved horn: wide base inside the fluff, rounded tip curling outward
    const base = by - r + 4;
    const tipX = hx + dir * 3.4 * hs;
    const tipY = base - 8.5 * hs;
    ctx.beginPath();
    ctx.moveTo(hx - 3, base);
    ctx.quadraticCurveTo(hx - 2.6 + dir * 0.6, base - 6 * hs, tipX, tipY);
    ctx.quadraticCurveTo(hx + 3 + dir * 0.8, base - 4 * hs, hx + 3, base);
    ctx.closePath();
    ctx.fillStyle = '#fff1d6';
    ctx.fill();
    stroke(ctx, 1.2);
  }
  // fluffy body
  fluffPath(ctx, bx, by - breathe * 0.5, r + breathe * 0.3, 14, t + u.id);
  const g = ctx.createRadialGradient(bx - 4, by - 7, 2, bx, by, r * 1.2);
  g.addColorStop(0, furLight);
  g.addColorStop(0.55, fur);
  g.addColorStop(1, furDark);
  ctx.fillStyle = g;
  ctx.fill();
  stroke(ctx, 1.7);
  // belly patch / hide armour
  if (h.items.hide > 0) {
    const pc = HIDE_COLORS[Math.min(h.items.hide, 4) - 1];
    ctx.beginPath();
    ctx.roundRect(bx - 6.5, by + 1, 11, 8, 3);
    ctx.fillStyle = pc;
    ctx.fill();
    stroke(ctx, 1.1);
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillRect(bx - 5, by + 2.4, 4, 1.4);
    if (h.items.hide >= 2) {
      oval(ctx, bx - 4.6, by + 5, 0.9, 0.9, '#fff', 0.6);
      oval(ctx, bx + 2.4, by + 5, 0.9, 0.9, '#fff', 0.6);
    }
  } else oval(ctx, bx - 1, by + 4.5, 6.5, 4.6, shade(color, 0.5), 0);
  // big googly eyes
  const look = local * 1.2;
  const angry = u.attackAnim > 0;
  for (const ex of [bx + 0.5, bx + 7.5]) {
    oval(ctx, ex, by - 5, 3.6, 4.2, '#ffffff', 1.2);
    oval(ctx, ex + 1 + look * 0.4, by - 4.6 + look, 1.9, 2.3, '#3a1020', 0);
    oval(ctx, ex + 1.6 + look * 0.4, by - 5.6 + look, 0.7, 0.7, '#ffffff', 0);
    if (angry) {
      ctx.beginPath();
      ctx.moveTo(ex - 3.4, by - 10.2 + (ex > bx + 3 ? 1.6 : 0));
      ctx.lineTo(ex + 3.4, by - 10.2 + (ex > bx + 3 ? 0 : 1.6));
      stroke(ctx, 1.6);
    }
  }
  // mouth: a wide smile with two little fangs, opening wide when attacking
  const open = 1.6 + swing * 4;
  ctx.beginPath();
  ctx.moveTo(bx - 1, by + 0.5);
  ctx.quadraticCurveTo(bx + 4.5, by + 2 + open * 1.4, bx + 10, by + 0.2);
  ctx.quadraticCurveTo(bx + 4.5, by + 1.6, bx - 1, by + 0.5);
  ctx.closePath();
  ctx.fillStyle = '#7a2038';
  ctx.fill();
  stroke(ctx, 1.1);
  poly(ctx, [bx + 1.2, by + 0.9, bx + 2.2, by + 3.4, bx + 3.2, by + 1.1], '#ffffff', INK, 0.7);
  poly(ctx, [bx + 6.4, by + 1.1, bx + 7.4, by + 3.4, bx + 8.4, by + 0.9], '#ffffff', INK, 0.7);
  // blush
  ctx.fillStyle = 'rgba(255,150,170,0.45)';
  ctx.beginPath();
  ctx.ellipse(bx - 4, by - 0.5, 2.2, 1.2, 0, 0, Math.PI * 2);
  ctx.ellipse(bx + 11.5, by - 1, 1.5, 1.1, 0, 0, Math.PI * 2);
  ctx.fill();
  // front paw with claws
  ctx.save();
  ctx.translate(10, by + 3);
  ctx.rotate(0.2 + local * 0.4 - swing * 2 + walk * 0.25);
  oval(ctx, 0, 4.5, 3.8, 5.4, fur);
  const cc = CLAW_COLORS[Math.min(h.items.claws, 4)];
  for (let i = -1; i <= 1; i++) poly(ctx, [i * 2.2 - 1, 9.2, i * 2.6, 12.6 - Math.abs(i) * 0.8, i * 2.2 + 1, 9.2], cc, INK, 0.8);
  if (h.items.claws >= 2) glow(ctx, 0, 11, 8, cc, 0.5);
  ctx.restore();
  ctx.restore();
  if (u.slowTimer > 0) {
    ctx.fillStyle = 'rgba(150,220,255,0.3)';
    ctx.beginPath();
    ctx.ellipse(0, -17, 18, 19, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}
