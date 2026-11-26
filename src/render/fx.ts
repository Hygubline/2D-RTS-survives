import type { GameEvent } from '../sim/types';
import { glow, type Ctx } from './draw';

type Kind = 'spark' | 'smoke' | 'chip' | 'blood' | 'ring' | 'text' | 'slash' | 'mote' | 'ember' | 'wisp' | 'pillar' | 'coin' | 'shock' | 'claw';

interface Particle {
  kind: Kind;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
  size: number;
  color: string;
  text?: string;
  angle?: number;
}

let seed = 1;
function rnd(): number {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
}

const TEXT_FONT = '"Alegreya Sans SC", "Microsoft YaHei", sans-serif';

/** Render-only particle system driven by sim events. `shake` is read by the renderer for screen shake. */
export class Fx {
  list: Particle[] = [];
  shake = 0;
  /** small hits on the same unit merge into one rolling number (less clutter, still readable) */
  private pending = new Map<number, { x: number; y: number; dmg: number; t: number; color: string }>();

  add(p: Partial<Particle> & { kind: Kind; x: number; y: number }): void {
    if (this.list.length > 1600) this.list.shift();
    const life = p.life ?? 0.6;
    this.list.push({ z: 0, vx: 0, vy: 0, vz: 0, size: 3, color: '#fff', ...p, life, max: life } as Particle);
  }

  burst(kind: Kind, x: number, y: number, n: number, color: string, speed: number, life: number, size: number, up = 60): void {
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2;
      const s = speed * (0.4 + rnd() * 0.6);
      this.add({ kind, x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.6, vz: up * (0.5 + rnd()), z: 6 + rnd() * 10, life: life * (0.6 + rnd() * 0.6), size: size * (0.6 + rnd() * 0.8), color });
    }
  }

  text(x: number, y: number, text: string, color: string, size = 12, life = 1, vz = 30): void {
    this.add({ kind: 'text', x, y, vz, life, color, text, size });
  }

  addShake(amount: number): void {
    this.shake = Math.min(14, this.shake + amount);
  }

  onEvent(e: GameEvent, visible: (x: number, y: number) => boolean, onScreen: (x: number, y: number) => boolean): void {
    switch (e.e) {
      case 'hit': {
        if (!visible(e.x, e.y)) return;
        if (e.source === 'burn') {
          if (rnd() < 0.25) this.burst('ember', e.x, e.y - 16, 1, '#ff9a3a', 30, 0.5, 2.5, 60);
          return;
        }
        if (e.onBuilding) {
          this.burst('chip', e.x, e.y, 5, rnd() < 0.5 ? '#8a6440' : '#9a968a', 90, 0.7, 2.5, 80);
          this.burst('smoke', e.x, e.y, 2, 'rgba(160,150,130,0.5)', 20, 0.9, 7, 10);
        } else {
          const towerHit = e.source !== 'melee' && e.source !== 'skill' && e.source !== 'cleave';
          this.burst('blood', e.x, e.y - 14, towerHit ? 4 : 7, towerHit ? '#6a2a7a' : '#b8242a', 70, 0.6, 2.2, 70);
        }
        if (e.source === 'frost') this.burst('spark', e.x, e.y - 12, 8, '#bff2ff', 80, 0.5, 2, 40);
        if (e.source === 'thorns') this.burst('spark', e.x, e.y - 14, 6, '#c8ff9a', 70, 0.4, 2, 40);
        if (e.source === 'ember') {
          this.burst('ember', e.x, e.y - 12, 12, '#ff8a3a', 120, 0.7, 3, 90);
          this.add({ kind: 'ring', x: e.x, y: e.y, life: 0.35, size: 26, color: '#ffb36a' });
        }
        if (e.dmg >= 8 && e.dmg < 120 && !e.onBuilding) {
          const p = this.pending.get(e.id);
          if (p) {
            p.dmg += e.dmg;
            p.x = e.x;
            p.y = e.y;
          } else this.pending.set(e.id, { x: e.x, y: e.y, dmg: e.dmg, t: 0.35, color: e.source === 'thorns' ? '#c8ff9a' : '#ff8a7a' });
        } else if (e.dmg >= 8) {
          const big = e.dmg >= 300;
          const color = e.source === 'thorns' ? '#c8ff9a' : e.onBuilding ? '#e8d0b0' : big ? '#ffe07a' : '#ff7a7a';
          this.text(e.x + (rnd() - 0.5) * 14, e.y - 32, String(Math.round(e.dmg)) + (big ? '!' : ''), color, big ? 20 : e.dmg > 100 ? 15 : 12, big ? 1.1 : 0.9, big ? 46 : 34);
          if (big && onScreen(e.x, e.y)) this.addShake(2.5);
        }
        return;
      }
      case 'shoot':
        if (!visible(e.x, e.y)) return;
        this.burst('spark', e.x, e.y, e.variant ? 5 : 3, e.variant === 'mark' ? '#d0a0ff' : e.ptype === 'frost' ? '#c8f4ff' : e.ptype === 'ember' ? '#ffb060' : '#fff2c0', 50, 0.25, 1.8, 20);
        return;
      case 'swing':
        this.add({ kind: 'slash', x: e.x, y: e.y - (e.big ? 26 : 18), life: e.big ? 0.32 : 0.25, size: e.big ? 44 : 26, color: e.big ? '#ffb0a0' : '#ffe8e8', angle: e.angle });
        return;
      case 'death':
        this.burst('blood', e.x, e.y - 10, 22, e.utype === 'hunter' ? '#5a1f6a' : '#a01e24', 120, 1.0, 3, 120);
        this.add({ kind: 'ring', x: e.x, y: e.y, life: 0.6, size: 40, color: e.utype === 'hunter' ? '#c070ff' : '#ff5a5a' });
        for (let i = 0; i < 6; i++) this.add({ kind: 'wisp', x: e.x + (rnd() - 0.5) * 14, y: e.y - 10, vz: 30 + rnd() * 30, life: 1.6, size: 5, color: e.utype === 'hunter' ? '#c890ff' : '#cfe8ff' });
        if (e.utype === 'hunter' && onScreen(e.x, e.y)) this.addShake(10);
        return;
      case 'destroyed':
        this.burst('chip', e.x, e.y, 18 + e.size * 6, '#7a5a3a', 140, 1.2, 3.5, 140);
        this.burst('chip', e.x, e.y, 10, '#8f8b80', 120, 1.1, 3, 120);
        this.burst('smoke', e.x, e.y, 10 + e.size * 4, 'rgba(90,84,76,0.6)', 40, 1.8, 14, 20);
        this.add({ kind: 'ring', x: e.x, y: e.y, life: 0.5, size: 20 + e.size * 18, color: '#ffd8a0' });
        if (e.size >= 2 && onScreen(e.x, e.y)) this.addShake(e.size * 2);
        return;
      case 'built':
        this.add({ kind: 'ring', x: e.x, y: e.y, life: 0.6, size: 40, color: '#ffe08a' });
        this.burst('mote', e.x, e.y, 10, '#ffe7a0', 40, 1.0, 2.2, 50);
        if (e.btype === 'altar') this.add({ kind: 'pillar', x: e.x, y: e.y, life: 2, size: 40, color: '#fff2b0' });
        return;
      case 'levelup':
        this.add({ kind: 'ring', x: e.x, y: e.y, life: 0.8, size: 44, color: '#9fe8ff' });
        this.burst('mote', e.x, e.y, 16, '#fff0a0', 50, 1.2, 2.4, 80);
        if (e.perk) {
          // qualitative upgrade: a column of light and the perk's name
          this.add({ kind: 'pillar', x: e.x, y: e.y, life: 1.6, size: 30, color: '#ffe8a0' });
          this.burst('mote', e.x, e.y, 30, '#ffd870', 90, 1.6, 3, 160);
          this.text(e.x, e.y - 58, `【${e.perk}】`, '#ffe08a', 17, 2, 22);
        } else this.text(e.x, e.y - 40, '升级!', '#ffe08a', 14, 1.2, 26);
        if (e.income) {
          this.text(e.x, e.y - 22, `收入 +${e.income.toFixed(1)}/秒`, '#ffc44d', 13, 1.8, 18);
          this.burst('coin', e.x, e.y - 10, 12, '#ffcc4a', 80, 1.2, 3, 140);
        }
        return;
      case 'income': {
        if (!visible(e.x, e.y)) return;
        // bigger, brighter numbers as the economy grows
        const size = Math.min(26, 12 + Math.log2(Math.max(1, e.amount)) * 1.6);
        const color = e.level >= 4 ? '#fff0a0' : e.level >= 2 ? '#ffd45a' : '#ffc44d';
        this.text(e.x, e.y, `+${e.amount}`, color, size, 1.3, 22 + e.level * 3);
        if (e.amount >= 40) this.burst('coin', e.x, e.y + 6, Math.min(8, 2 + Math.floor(e.amount / 60)), '#ffcc4a', 50, 1, 2.6, 110);
        return;
      }
      case 'status':
        if (!visible(e.x, e.y)) return;
        if (e.kind === 'freeze') {
          this.burst('spark', e.x, e.y - 18, 16, '#d8f8ff', 110, 0.6, 2.6, 60);
          this.text(e.x, e.y - 52, '冻结!', '#bff2ff', 14, 0.9, 30);
        } else if (e.kind === 'burn') {
          this.burst('ember', e.x, e.y - 18, 10, '#ff7a2a', 70, 0.8, 3, 90);
        } else if (e.kind === 'mark') {
          this.add({ kind: 'ring', x: e.x, y: e.y - 24, life: 0.7, size: 30, color: '#c890ff' });
          this.text(e.x, e.y - 56, '印记满层', '#d8b0ff', 13, 1, 26);
        } else if (e.kind === 'stun') {
          this.text(e.x, e.y - 52, '眩晕!', '#ffe08a', 14, 0.8, 30);
          if (onScreen(e.x, e.y)) this.addShake(4);
        }
        return;
      case 'skill':
        if (e.skill === 'pounce') {
          const n = 12;
          for (let i = 0; i < n; i++) {
            const t = i / n;
            this.add({ kind: 'wisp', x: e.x + (e.x2 - e.x) * t, y: e.y + (e.y2 - e.y) * t - 18, life: 0.5 + t * 0.3, size: 6, color: '#a050d0' });
          }
          this.add({ kind: 'ring', x: e.x2, y: e.y2, life: 0.5, size: 36, color: '#ff6a6a' });
          this.text(e.x2, e.y2 - 70, '扑杀!', '#ff8a8a', 15, 0.9, 30);
          if (onScreen(e.x2, e.y2)) this.addShake(5);
        } else if (e.skill === 'roar') {
          this.add({ kind: 'shock', x: e.x, y: e.y, life: 0.7, size: e.radius, color: '#ff4a3a' });
          this.add({ kind: 'shock', x: e.x, y: e.y, life: 0.9, size: e.radius * 0.7, color: '#ffb08a' });
          this.text(e.x, e.y - 80, '震地咆哮!', '#ff8a6a', 17, 1.2, 28);
          if (onScreen(e.x, e.y)) this.addShake(8);
        } else {
          this.add({ kind: 'claw', x: e.x, y: e.y - 28, life: 0.8, size: 22, color: '#7aff5a' });
          this.text(e.x, e.y - 70, '腐蚀撕裂', '#a8ff7a', 14, 1, 28);
        }
        return;
      case 'evolve':
        this.add({ kind: 'pillar', x: e.x, y: e.y, life: 2.2, size: 60, color: '#ff4a2a' });
        this.add({ kind: 'shock', x: e.x, y: e.y, life: 1.2, size: 220, color: '#ff3a2a' });
        this.burst('ember', e.x, e.y - 20, 60, '#ff6a2a', 220, 1.6, 4, 200);
        this.addShake(14);
        return;
      case 'trained':
        this.add({ kind: 'ring', x: e.x, y: e.y, life: 0.6, size: 24, color: '#9fffb0' });
        this.burst('mote', e.x, e.y, 8, '#c8ffd0', 40, 0.8, 2, 50);
        return;
    }
  }

  update(dt: number): void {
    this.shake = Math.max(0, this.shake - dt * 30);
    for (const [id, p] of this.pending) {
      p.t -= dt;
      if (p.t > 0) continue;
      this.pending.delete(id);
      const n = Math.round(p.dmg);
      this.text(p.x + (rnd() - 0.5) * 10, p.y - 34, String(n), p.color, n > 200 ? 16 : 13, 0.9, 34);
    }
    const out: Particle[] = [];
    for (const p of this.list) {
      p.life -= dt;
      if (p.life <= 0) continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.kind === 'chip' || p.kind === 'blood' || p.kind === 'ember' || p.kind === 'coin') {
        p.vz -= 320 * dt;
        if (p.z < 0) {
          p.z = 0;
          p.vz *= -0.3;
          p.vx *= 0.6;
          p.vy *= 0.6;
        }
      } else if (p.kind === 'smoke') {
        p.vx *= 0.97;
        p.vy *= 0.97;
        p.vz = 18;
      } else if (p.kind === 'text' || p.kind === 'wisp' || p.kind === 'mote') {
        p.vz *= 0.97;
      }
      out.push(p);
    }
    this.list = out;
  }

  draw(ctx: Ctx): void {
    for (const p of this.list) {
      const k = p.life / p.max;
      const x = p.x;
      const y = p.y - p.z;
      switch (p.kind) {
        case 'spark':
        case 'mote':
          ctx.globalAlpha = k;
          glow(ctx, x, y, p.size * 3, p.color, 0.8);
          ctx.fillStyle = p.color;
          ctx.fillRect(x - p.size / 2, y - p.size / 2, p.size, p.size);
          break;
        case 'ember':
          ctx.globalAlpha = k;
          glow(ctx, x, y, p.size * 2.5, p.color, 0.7);
          break;
        case 'coin':
          ctx.globalAlpha = Math.min(1, k * 2);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.ellipse(x, y, p.size, p.size * Math.abs(Math.sin(p.life * 12)) + 0.6, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#8a5a10';
          ctx.lineWidth = 0.8;
          ctx.stroke();
          break;
        case 'chip':
        case 'blood':
          ctx.globalAlpha = Math.min(1, k * 2);
          ctx.fillStyle = p.color;
          ctx.fillRect(x - p.size / 2, y - p.size / 2, p.size, p.size * (p.kind === 'blood' ? 1 : 0.7));
          break;
        case 'smoke':
          ctx.globalAlpha = k * 0.7;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(x, y, p.size * (1.6 - k * 0.6), 0, Math.PI * 2);
          ctx.fill();
          break;
        case 'ring':
          ctx.globalAlpha = k;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 3 * k;
          ctx.beginPath();
          ctx.ellipse(x, y, p.size * (1.2 - k), p.size * (1.2 - k) * 0.55, 0, 0, Math.PI * 2);
          ctx.stroke();
          break;
        case 'shock': {
          // expanding ground shockwave reaching the full radius
          const r = p.size * (1 - k * k);
          ctx.globalAlpha = k;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 6 * k + 1;
          ctx.beginPath();
          ctx.ellipse(x, y, r, r * 0.55, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = k * 0.25;
          ctx.fillStyle = p.color;
          ctx.fill();
          break;
        }
        case 'pillar': {
          const a = Math.min(1, k * 2) * (0.6 + Math.sin(p.life * 20) * 0.1);
          ctx.globalAlpha = a;
          const g = ctx.createLinearGradient(x, y - 220, x, y);
          g.addColorStop(0, 'rgba(255,255,255,0)');
          g.addColorStop(0.7, p.color);
          g.addColorStop(1, 'rgba(255,255,255,0.9)');
          ctx.fillStyle = g;
          const w = p.size * (0.4 + (1 - k) * 0.6);
          ctx.fillRect(x - w / 2, y - 220, w, 220);
          glow(ctx, x, y, p.size * 1.6, p.color, 0.6);
          break;
        }
        case 'wisp':
          ctx.globalAlpha = k * 0.8;
          glow(ctx, x + Math.sin(p.life * 6) * 4, y, p.size * 2.4, p.color, 0.7);
          break;
        case 'claw':
          ctx.globalAlpha = k;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 3;
          for (let i = -1; i <= 1; i++) {
            ctx.beginPath();
            ctx.moveTo(x - 12 + i * 7, y - 14);
            ctx.lineTo(x + 8 + i * 7, y + 14);
            ctx.stroke();
          }
          break;
        case 'slash': {
          ctx.globalAlpha = k;
          const a = p.angle ?? 0;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 4 * k + 1;
          ctx.beginPath();
          ctx.arc(x, y, p.size, a - 1.1 + (1 - k) * 0.8, a + 0.6 + (1 - k) * 0.8);
          ctx.stroke();
          ctx.strokeStyle = 'rgba(255,90,90,0.6)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(x, y, p.size - 5, a - 0.9, a + 0.5);
          ctx.stroke();
          break;
        }
        case 'text':
          ctx.globalAlpha = Math.min(1, k * 1.6);
          ctx.font = `700 ${p.size}px ${TEXT_FONT}`;
          ctx.textAlign = 'center';
          ctx.lineWidth = 3;
          ctx.strokeStyle = 'rgba(15,10,5,0.9)';
          ctx.strokeText(p.text ?? '', x, y);
          ctx.fillStyle = p.color;
          ctx.fillText(p.text ?? '', x, y);
          break;
      }
    }
    ctx.globalAlpha = 1;
  }
}
