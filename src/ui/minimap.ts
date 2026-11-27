import { TILE } from '../config/balance';
import { T_DIRT, T_MEADOW, T_ROCK, T_TREE, T_WATER } from '../sim/grid';
import type { World } from '../sim/types';
import type { Perspective } from '../render/perspective';
import type { Camera } from '../render/camera';
import type { Marker } from '../render/renderer';

const TCOL: Record<number, [number, number, number]> = {
  0: [74, 104, 52],
  [T_DIRT]: [128, 98, 64],
  [T_WATER]: [32, 72, 92],
  [T_ROCK]: [104, 100, 92],
  [T_TREE]: [34, 60, 34],
  [T_MEADOW]: [112, 134, 66],
};

export class Minimap {
  private base: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private size: number;
  private dragging = false;

  constructor(
    private canvas: HTMLCanvasElement,
    private getWorld: () => World,
    private cam: Camera,
    private onRightClick: (wx: number, wy: number, shift: boolean) => void,
  ) {
    this.size = canvas.width;
    this.ctx = canvas.getContext('2d')!;
    this.base = document.createElement('canvas');
    this.rebuild();
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      const p = this.toWorld(e);
      if (e.button === 2) this.onRightClick(p.x, p.y, e.shiftKey);
      else if (e.button === 0) {
        this.dragging = true;
        this.cam.follow = false;
        this.cam.centerOn(p.x, p.y);
      }
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.dragging) return;
      const p = this.toWorld(e);
      this.cam.centerOn(p.x, p.y);
    });
    window.addEventListener('mouseup', () => (this.dragging = false));
  }

  private toWorld(e: MouseEvent): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    const w = this.getWorld();
    const fx = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    const fy = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
    return { x: fx * w.grid.w * TILE, y: fy * w.grid.h * TILE };
  }

  rebuild(): void {
    const w = this.getWorld();
    const g = w.grid;
    this.base.width = g.w;
    this.base.height = g.h;
    const bctx = this.base.getContext('2d')!;
    const img = bctx.createImageData(g.w, g.h);
    for (let i = 0; i < g.w * g.h; i++) {
      const c = TCOL[g.terrain[i]] ?? TCOL[0];
      const n = ((i * 2654435761) >>> 24) / 255;
      img.data[i * 4] = c[0] * (0.92 + n * 0.12);
      img.data[i * 4 + 1] = c[1] * (0.92 + n * 0.12);
      img.data[i * 4 + 2] = c[2] * (0.92 + n * 0.12);
      img.data[i * 4 + 3] = 255;
    }
    bctx.putImageData(img, 0, 0);
  }

  draw(pings: Marker[], localPlayer: number, persp: Perspective): void {
    const w = this.getWorld();
    const vision = persp.grid(w);
    const ctx = this.ctx;
    const S = this.size;
    const k = S / w.grid.w;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.base, 0, 0, S, S);
    // grove hints (unclaimed clearings) for base scouting
    for (const gr of w.groves) {
      if (gr.claimedBy !== -1) continue;
      ctx.strokeStyle = 'rgba(255,230,150,0.55)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc((gr.cx + 0.5) * k, (gr.cy + 0.5) * k, gr.r * k, 0, Math.PI * 2);
      ctx.stroke();
    }
    // lair
    ctx.fillStyle = 'rgba(200,40,70,0.8)';
    ctx.beginPath();
    ctx.arc((w.lair.x + 0.5) * k, (w.lair.y + 0.5) * k, 4, 0, Math.PI * 2);
    ctx.fill();
    for (const b of w.buildings.values()) {
      if (!persp.seesBuilding(w, b)) continue;
      ctx.fillStyle = w.players[b.owner].color;
      ctx.fillRect(b.tx * k, b.ty * k, Math.max(2, b.size * k), Math.max(2, b.size * k));
    }
    // fog
    ctx.fillStyle = 'rgba(5,7,12,0.62)';
    for (let y = 0; y < w.grid.h; y++) {
      let run = -1;
      for (let x = 0; x <= w.grid.w; x++) {
        const v = x < w.grid.w ? vision[y * w.grid.w + x] : 2;
        const dark = v === 0;
        if (dark && run < 0) run = x;
        if (!dark && run >= 0) {
          ctx.fillRect(run * k, y * k, (x - run) * k, k + 0.5);
          run = -1;
        }
      }
    }
    for (const u of w.units.values()) {
      if (!u.alive || !persp.seesUnit(w, u)) continue;
      if (u.utype === 'hunter') {
        ctx.fillStyle = u.owner === localPlayer ? '#ffffff' : w.players[u.owner].color;
        ctx.strokeStyle = '#000';
        ctx.beginPath();
        ctx.arc((u.x / TILE) * k, (u.y / TILE) * k, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.fillStyle = u.owner === localPlayer ? '#ffffff' : w.players[u.owner].color;
        ctx.fillRect((u.x / TILE) * k - 2, (u.y / TILE) * k - 2, 4, 4);
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 0.8;
        ctx.strokeRect((u.x / TILE) * k - 2, (u.y / TILE) * k - 2, 4, 4);
      }
    }
    for (const p of pings) {
      const t = p.t % 1;
      ctx.strokeStyle = p.color;
      ctx.globalAlpha = Math.max(0, 1 - t) * Math.max(0, 1 - p.t / 4);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc((p.x / TILE) * k, (p.y / TILE) * k, 3 + t * 12, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // camera frame
    const cam = this.cam;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1;
    ctx.strokeRect((cam.x / TILE) * k, (cam.y / TILE) * k, (cam.viewW / cam.zoom / TILE) * k, (cam.viewH / cam.zoom / TILE) * k);
  }
}
