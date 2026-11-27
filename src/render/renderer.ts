import { BUILDINGS, MATCH, TILE, type BuildingType } from '../config/balance';
import { T_TREE } from '../sim/grid';
import type { Building, Unit, World } from '../sim/types';
import type { Perspective } from './perspective';
import { buildingCenter, canPlace, unitStats } from '../sim/world';
import { buildingSprite, drawScaffold, drawTurretHead, PAD, TOP } from './buildingSprites';
import { drawProjectileArt } from './projectileArt';
import { drawHarvesterLive } from './harvesterArt';
import type { Camera } from './camera';
import { glow, makeCanvas, type Ctx } from './draw';
import { Fx } from './fx';
import { CHUNK, TerrainCache, TREE_H, TREE_W, treeOffset, treeSprite, treeVariant } from './terrain';
import { drawGuard, drawHunter, drawRanger, drawSurvivor } from './unitSprites';

export interface Marker {
  x: number;
  y: number;
  t: number;
  color: string;
}

export interface ViewState {
  selection: Set<number>;
  hoverId: number;
  placement: { btype: BuildingType; tx: number; ty: number } | null;
  /** drag-painted wall/gate line preview */
  placementLine: { x: number; y: number }[] | null;
  lastAlert: { x: number; y: number; t: number } | null;
  box: { x0: number; y0: number; x1: number; y1: number } | null;
  markers: Marker[];
  pings: Marker[];
  localPlayer: number;
  /** what the local player may see (fog, enemy visibility) */
  persp: Perspective;
}

export class Renderer {
  readonly ctx: Ctx;
  readonly fx = new Fx();
  private terrain: TerrainCache;
  private fogCanvas: HTMLCanvasElement;
  private fogCtx: Ctx;
  private fogImg: ImageData;
  private fogStamp = -1;
  private dpr = 1;
  time = 0;

  constructor(readonly canvas: HTMLCanvasElement, private world: World) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.terrain = new TerrainCache(world.grid);
    const [fc, fctx] = makeCanvas(world.grid.w, world.grid.h);
    this.fogCanvas = fc;
    this.fogCtx = fctx;
    this.fogImg = fctx.createImageData(world.grid.w, world.grid.h);
  }

  setWorld(world: World): void {
    this.world = world;
    this.terrain = new TerrainCache(world.grid);
    this.fx.list = [];
    this.fogStamp = -1;
  }

  resize(w: number, h: number): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    this.canvas.width = Math.floor(w * this.dpr);
    this.canvas.height = Math.floor(h * this.dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
  }

  /** Pre-render all terrain chunks (avoids hitches on first pan). */
  warmup(): void {
    const n = Math.ceil(this.world.grid.w / CHUNK);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) this.terrain.get(x, y);
  }

  private updateFog(view: ViewState): void {
    const w = this.world;
    if (this.fogStamp === w.tick) return;
    this.fogStamp = w.tick;
    const d = this.fogImg.data;
    const vision = view.persp.grid(w);
    for (let i = 0; i < vision.length; i++) {
      const v = vision[i];
      // dusk-blue storybook fog: unexplored is a deep twilight wash, explored a light one
      d[i * 4] = 38;
      d[i * 4 + 1] = 42;
      d[i * 4 + 2] = 82;
      d[i * 4 + 3] = v === 2 ? 0 : v === 1 ? 110 : 225;
    }
    this.fogCtx.putImageData(this.fogImg, 0, 0);
  }

  render(cam: Camera, alpha: number, view: ViewState, dt: number): void {
    this.time += dt;
    const ctx = this.ctx;
    const w = this.world;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#262a52';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    const s = this.dpr * cam.zoom;
    const sh = this.fx.shake;
    const shx = sh > 0 ? (Math.random() - 0.5) * sh * 2 : 0;
    const shy = sh > 0 ? (Math.random() - 0.5) * sh * 2 : 0;
    ctx.setTransform(s, 0, 0, s, -cam.x * s + shx * this.dpr, -cam.y * s + shy * this.dpr);
    ctx.imageSmoothingEnabled = true;

    const vx0 = cam.x;
    const vy0 = cam.y;
    const vx1 = cam.x + cam.viewW / cam.zoom;
    const vy1 = cam.y + cam.viewH / cam.zoom;
    const chunkPx = CHUNK * TILE;
    const nChunks = Math.ceil(w.grid.w / CHUNK);
    for (let cy = Math.max(0, Math.floor(vy0 / chunkPx)); cy <= Math.min(nChunks - 1, Math.floor(vy1 / chunkPx)); cy++)
      for (let cx = Math.max(0, Math.floor(vx0 / chunkPx)); cx <= Math.min(nChunks - 1, Math.floor(vx1 / chunkPx)); cx++)
        ctx.drawImage(this.terrain.get(cx, cy), cx * chunkPx, cy * chunkPx);

    this.drawLair(ctx);
    this.drawGroundMarks(ctx, view, alpha);
    this.drawGapHints(ctx, view, vx0, vy0, vx1, vy1);

    // y-sorted world objects
    type Item = { y: number; draw: () => void };
    const items: Item[] = [];
    const tx0 = Math.max(0, Math.floor(vx0 / TILE) - 2);
    const tx1 = Math.min(w.grid.w - 1, Math.ceil(vx1 / TILE) + 2);
    const ty0 = Math.max(0, Math.floor(vy0 / TILE) - 1);
    const ty1 = Math.min(w.grid.h - 1, Math.ceil(vy1 / TILE) + 3);
    const units = [...w.units.values()].filter((u) => u.alive);
    for (let ty = ty0; ty <= ty1; ty++)
      for (let tx = tx0; tx <= tx1; tx++) {
        if (w.grid.terrain[w.grid.idx(tx, ty)] !== T_TREE) continue;
        const [ox, oy] = treeOffset(tx, ty);
        const bx = tx * TILE + 16 + ox;
        const by = ty * TILE + 24 + oy;
        items.push({
          y: by,
          draw: () => {
            const spr = treeSprite(treeVariant(tx, ty));
            const behind = units.some((u) => u.y < by - 4 && u.y > by - 70 && Math.abs(u.x - bx) < 26 && (u.owner === view.localPlayer || view.selection.has(u.id)));
            if (behind) ctx.globalAlpha = 0.5;
            ctx.drawImage(spr, bx - TREE_W / 2, by - (TREE_H - 14));
            ctx.globalAlpha = 1;
          },
        });
      }
    for (const b of w.buildings.values()) {
      const x = b.tx * TILE;
      const y = b.ty * TILE;
      if (x > vx1 + 40 || y > vy1 + 80 || x + b.size * TILE < vx0 - 40 || y + b.size * TILE < vy0 - 40) continue;
      if (!view.persp.seesBuilding(w, b)) continue;
      items.push({ y: y + b.size * TILE - 2, draw: () => this.drawBuilding(ctx, b, view) });
    }
    for (const u of units) {
      const x = u.px + (u.x - u.px) * alpha;
      const y = u.py + (u.y - u.py) * alpha;
      if (x < vx0 - 60 || x > vx1 + 60 || y < vy0 - 60 || y > vy1 + 80) continue;
      if (!view.persp.seesUnit(w, u)) continue;
      items.push({ y, draw: () => this.drawUnit(ctx, u, x, y, view) });
    }
    items.sort((a, b) => a.y - b.y);
    for (const it of items) it.draw();

    this.drawProjectiles(ctx, alpha);
    this.fx.draw(ctx);

    // fog of war
    this.updateFog(view);
    ctx.imageSmoothingEnabled = true;
    // only the visible window of the fog (plus 1 tile margin for smooth edges)
    const fx0 = Math.max(0, Math.floor(vx0 / TILE) - 1);
    const fy0 = Math.max(0, Math.floor(vy0 / TILE) - 1);
    const fx1 = Math.min(w.grid.w, Math.ceil(vx1 / TILE) + 1);
    const fy1 = Math.min(w.grid.h, Math.ceil(vy1 / TILE) + 1);
    if (fx1 > fx0 && fy1 > fy0)
      ctx.drawImage(this.fogCanvas, fx0, fy0, fx1 - fx0, fy1 - fy0, fx0 * TILE, fy0 * TILE, (fx1 - fx0) * TILE, (fy1 - fy0) * TILE);

    this.drawBars(ctx, view, alpha);
    this.drawPlacement(ctx, view);
    this.drawPings(ctx, view);

    // screen-space atmosphere
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawAtmosphere(ctx, cam);
    if (view.box) {
      const b = view.box;
      ctx.fillStyle = 'rgba(120,230,140,0.08)';
      ctx.strokeStyle = 'rgba(140,255,160,0.9)';
      ctx.lineWidth = 1;
      const x = Math.min(b.x0, b.x1);
      const y = Math.min(b.y0, b.y1);
      ctx.fillRect(x, y, Math.abs(b.x1 - b.x0), Math.abs(b.y1 - b.y0));
      ctx.strokeRect(x + 0.5, y + 0.5, Math.abs(b.x1 - b.x0), Math.abs(b.y1 - b.y0));
    }
  }

  private drawAtmosphere(ctx: Ctx, cam: Camera): void {
    const W = cam.viewW;
    const H = cam.viewH;
    const t = this.world.time / MATCH.surviveSeconds;
    // night deepens then dawn warms in the final two minutes
    const dawn = Math.max(0, (t - 0.86) / 0.14);
    const night = Math.min(1, t * 2.2) * (1 - dawn);
    ctx.fillStyle = `rgba(60,70,140,${0.1 * night})`;
    ctx.fillRect(0, 0, W, H);
    if (this.world.bloodMoon) {
      const p = 0.16 + Math.sin(this.time * 1.2) * 0.03;
      ctx.fillStyle = `rgba(120,10,20,${p})`;
      ctx.fillRect(0, 0, W, H);
      glow(ctx, W - 120, 110, 70, '#ff3a2a', 0.5);
      ctx.fillStyle = '#d8382a';
      ctx.beginPath();
      ctx.arc(W - 120, 110, 26, 0, Math.PI * 2);
      ctx.fill();
    }
    if (dawn > 0) {
      ctx.fillStyle = `rgba(255,170,90,${0.12 * dawn})`;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.drawImage(this.vignetteFor(W, H), 0, 0, W, H);
  }

  private vignette: { w: number; h: number; c: HTMLCanvasElement } | null = null;

  /** Quarter-resolution cached vignette (a smooth gradient upscales without visible loss). */
  private vignetteFor(W: number, H: number): HTMLCanvasElement {
    if (this.vignette && this.vignette.w === W && this.vignette.h === H) return this.vignette.c;
    const w = Math.max(1, Math.round(W / 4));
    const h = Math.max(1, Math.round(H / 4));
    const [c, vctx] = makeCanvas(w, h);
    const g = vctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(70,45,25,0.38)');
    vctx.fillStyle = g;
    vctx.fillRect(0, 0, w, h);
    this.vignette = { w: W, h: H, c };
    return c;
  }

  private drawLair(ctx: Ctx): void {
    const w = this.world;
    const x = w.lair.x * TILE + 16;
    const y = w.lair.y * TILE + 16;
    const pulse = 0.5 + Math.sin(this.time * 1.5) * 0.15;
    glow(ctx, x, y, 140, '#5a1030', 0.35 * pulse + 0.15);
    ctx.strokeStyle = 'rgba(160,40,80,0.45)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.ellipse(x, y, 60 + i * 26, 34 + i * 15, 0, 0, Math.PI * 2);
      ctx.setLineDash([6, 10]);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    // bone spikes
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + 0.3;
      const bx = x + Math.cos(a) * 120;
      const by = y + Math.sin(a) * 70;
      ctx.fillStyle = '#d8cbb0';
      ctx.strokeStyle = 'rgba(20,12,8,0.9)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(bx - 4, by);
      ctx.quadraticCurveTo(bx - 2, by - 14, bx + 3, by - 22);
      ctx.quadraticCurveTo(bx + 1, by - 10, bx + 4, by);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }

/**
   * Highlights the open gap tiles of forest clearings — the tiles that must be walled to seal a base.
   * Always shown for the clearing holding the local player's shelter; for every clearing while placing walls/gates.
   */
  private drawGapHints(ctx: Ctx, view: ViewState, vx0: number, vy0: number, vx1: number, vy1: number): void {
    const w = this.world;
    const placingWall = view.placement && (view.placement.btype === 'wall' || view.placement.btype === 'gate');
    const shelters = [...w.buildings.values()].filter((b) => b.owner === view.localPlayer && b.btype === 'shelter');
    const pulse = 0.55 + Math.sin(this.time * 4) * 0.25;
    for (const g of w.groves) {
      const mine = shelters.some((s) => Math.hypot(s.tx + 1.5 - (g.cx + 0.5), s.ty + 1.5 - (g.cy + 0.5)) <= g.r + 1);
      if (!placingWall && !mine) continue;
      const cx = (g.cx + 0.5) * TILE;
      const cy = (g.cy + 0.5) * TILE;
      const R = (g.r + 3) * TILE;
      if (cx + R < vx0 || cx - R > vx1 || cy + R < vy0 || cy - R > vy1) continue;
      for (const t of g.gaps) {
        if (w.grid.occ[w.grid.idx(t.x, t.y)]) continue;
        const x = t.x * TILE;
        const y = t.y * TILE;
        ctx.globalAlpha = pulse;
        ctx.fillStyle = 'rgba(255,190,80,0.22)';
        ctx.fillRect(x + 2, y + 2, TILE - 4, TILE - 4);
        ctx.strokeStyle = '#ffc35a';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 4]);
        ctx.strokeRect(x + 3.5, y + 3.5, TILE - 7, TILE - 7);
        ctx.setLineDash([]);
        // small wall glyph
        ctx.fillStyle = '#ffd27a';
        ctx.fillRect(x + 10, y + 13, 12, 3);
        ctx.fillRect(x + 10, y + 18, 12, 3);
        ctx.globalAlpha = 1;
      }
    }
  }

  private drawGroundMarks(ctx: Ctx, view: ViewState, alpha: number): void {
    const w = this.world;
    for (const id of view.selection) {
      const u = w.units.get(id);
      if (u && u.alive) {
        const x = u.px + (u.x - u.px) * alpha;
        const y = u.py + (u.y - u.py) * alpha;
        const own = u.owner === view.localPlayer;
        ctx.strokeStyle = own ? 'rgba(120,255,140,0.95)' : u.utype === 'hunter' ? 'rgba(255,80,80,0.95)' : 'rgba(255,220,120,0.9)';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.ellipse(x, y, u.radius + 5, (u.radius + 5) * 0.5, 0, 0, Math.PI * 2);
        ctx.stroke();
        // queued waypoints
        if (own && u.orders.length) {
          ctx.strokeStyle = 'rgba(140,255,160,0.5)';
          ctx.setLineDash([4, 6]);
          ctx.beginPath();
          ctx.moveTo(x, y);
          for (const o of u.orders) {
            if (o.type === 'move') ctx.lineTo(o.x, o.y);
            else if (o.type === 'build') ctx.lineTo((o.tx + BUILDINGS[o.btype].size / 2) * TILE, (o.ty + BUILDINGS[o.btype].size / 2) * TILE);
          }
          ctx.stroke();
          ctx.setLineDash([]);
          for (const o of u.orders) {
            if (o.type !== 'build' || o.siteId) continue;
            const def = BUILDINGS[o.btype];
            ctx.fillStyle = 'rgba(140,255,160,0.18)';
            ctx.strokeStyle = 'rgba(140,255,160,0.6)';
            ctx.fillRect(o.tx * TILE, o.ty * TILE, def.size * TILE, def.size * TILE);
            ctx.strokeRect(o.tx * TILE + 0.5, o.ty * TILE + 0.5, def.size * TILE - 1, def.size * TILE - 1);
          }
        }
      }
      const b = w.buildings.get(id);
      if (b) {
        const x = b.tx * TILE;
        const y = b.ty * TILE;
        const S = b.size * TILE;
        ctx.strokeStyle = b.owner === view.localPlayer ? 'rgba(120,255,140,0.95)' : 'rgba(255,220,120,0.9)';
        ctx.lineWidth = 2;
        const k = 8;
        ctx.beginPath();
        for (const [cx, cy, dx, dy] of [
          [x, y, 1, 1],
          [x + S, y, -1, 1],
          [x, y + S, 1, -1],
          [x + S, y + S, -1, -1],
        ]) {
          ctx.moveTo(cx + dx * k, cy);
          ctx.lineTo(cx, cy);
          ctx.lineTo(cx, cy + dy * k);
        }
        ctx.stroke();
        const lv = BUILDINGS[b.btype].levels[b.level];
        const c = buildingCenter(b);
        const range = lv.range ?? lv.healRadius;
        if (range) {
          ctx.strokeStyle = lv.heal ? 'rgba(120,255,160,0.35)' : 'rgba(255,230,150,0.35)';
          ctx.setLineDash([8, 8]);
          ctx.beginPath();
          ctx.arc(c.x, c.y, range * TILE, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
    }
    for (const m of view.markers) {
      const k = 1 - m.t / 0.6;
      if (k <= 0) continue;
      ctx.strokeStyle = m.color;
      ctx.globalAlpha = k;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(m.x, m.y, 14 * (1.2 - k * 0.6), 7 * (1.2 - k * 0.6), 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(m.x - 5, m.y - 18 * k);
      ctx.lineTo(m.x, m.y - 10 * k);
      ctx.lineTo(m.x + 5, m.y - 18 * k);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  private wallMask(b: Building): number {
    const g = this.world.grid;
    let m = 0;
    const dirs: [number, number, number][] = [
      [0, -1, 1],
      [1, 0, 2],
      [0, 1, 4],
      [-1, 0, 8],
    ];
    for (const [dx, dy, bit] of dirs) {
      const x = b.tx + dx;
      const y = b.ty + dy;
      if (!g.inBounds(x, y)) continue;
      const id = g.occ[g.idx(x, y)];
      const o = id ? this.world.buildings.get(id) : undefined;
      if (o && (o.btype === 'wall' || o.btype === 'gate')) m |= bit;
    }
    return m;
  }

  private drawBuilding(ctx: Ctx, b: Building, view: ViewState): void {
    const p = this.world.players[b.owner];
    const mask = b.btype === 'wall' || b.btype === 'gate' ? this.wallMask(b) : 0;
    const spr = buildingSprite(b.btype, b.level, p.color, mask);
    const x = b.tx * TILE - PAD;
    const y = b.ty * TILE - TOP;
    const S = b.size * TILE;
    const flash = this.world.time - b.lastDamaged < 0.12;
    if (b.constructing) {
      const h = spr.height;
      const shown = h * (0.25 + 0.75 * b.progress);
      ctx.globalAlpha = 0.85;
      ctx.drawImage(spr, 0, h - shown, spr.width, shown, x, y + h - shown, spr.width, shown);
      ctx.globalAlpha = 1;
      ctx.save();
      ctx.translate(b.tx * TILE, b.ty * TILE);
      drawScaffold(ctx, S, S, b.progress);
      ctx.restore();
    } else {
      ctx.drawImage(spr, x, y);
      if (flash) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.35;
        ctx.drawImage(spr, x, y);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }
      this.drawBuildingDynamic(ctx, b);
    }
    if (view.hoverId === b.id && !view.selection.has(b.id)) {
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1;
      ctx.strokeRect(b.tx * TILE + 0.5, b.ty * TILE + 0.5, S - 1, S - 1);
    }
  }

  private drawBuildingDynamic(ctx: Ctx, b: Building): void {
    const t = this.time;
    const c = buildingCenter(b);
    const S = b.size * TILE;
    if (b.btype === 'bolt' || b.btype === 'lance') {
      const H = 30 + b.level * 3;
      const deckY = b.ty * TILE + S - 8 - H - 5;
      ctx.save();
      ctx.translate(c.x, deckY);
      drawTurretHead(ctx, b.btype, b.level, b.aim, b.fireAnim / 0.2, t);
      if (b.btype === 'bolt' && b.level >= 4) {
        // 猎魔印记: a slowly turning rune ring hovering over the crossbow
        ctx.save();
        ctx.translate(0, -14);
        ctx.scale(1, 0.4);
        ctx.rotate(t * 0.8 + b.id);
        ctx.strokeStyle = 'rgba(216,176,255,0.85)';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.arc(0, 0, 20, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }
      ctx.restore();
    } else if (b.btype === 'harvester') {
      drawHarvesterLive(ctx, c.x, c.y, b.level, t, b.id);
    } else if (b.btype === 'frost') {
      glow(ctx, c.x, c.y - 26, 26 + b.level * 6, '#bff2ff', 0.2 + b.level * 0.06 + Math.sin(t * 2 + b.id) * 0.08);
      // drifting snowflakes; more with each tier
      for (let i = 0; i < b.level * 4; i++) {
        const k = (t * 0.35 + i / (b.level * 4) + b.id * 0.17) % 1;
        const fx = c.x + Math.sin(i * 1.9 + t * 0.8) * 22;
        const fy = c.y - 60 + k * 54;
        ctx.globalAlpha = Math.sin(k * Math.PI);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(fx - 1, fy - 1, 2, 2);
      }
      ctx.globalAlpha = 1;
      if (b.level >= 2) {
        // 碎冰领域: a visible frost field around the tower
        ctx.strokeStyle = `rgba(190,240,255,${0.25 + Math.sin(t * 2) * 0.08})`;
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 7]);
        ctx.beginPath();
        ctx.ellipse(c.x, c.y + 8, 52, 26, t * 0.2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    } else if (b.btype === 'altar') {
      const ch = b.charge;
      glow(ctx, c.x, c.y - 30, 30 + ch * 60, '#fff0b0', 0.35 + ch * 0.4);
      const g = ctx.createLinearGradient(c.x, c.y - 420, c.x, c.y - 30);
      g.addColorStop(0, 'rgba(255,250,220,0)');
      g.addColorStop(1, `rgba(255,240,180,${0.15 + ch * 0.55})`);
      ctx.fillStyle = g;
      const w = 6 + ch * 26 + Math.sin(t * 8) * 2;
      ctx.fillRect(c.x - w / 2, c.y - 420, w, 390);
      ctx.strokeStyle = '#ffe08a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(c.x, c.y + 4, 40, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ch);
      ctx.stroke();
    } else if (b.btype === 'barracks' && b.train && b.train.queue.length) {
      this.bar(ctx, c.x, b.ty * TILE + S + 4, 60, b.train.t, '#9fffb0', 3);
      ctx.font = '700 11px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#d8ffd8';
      ctx.fillText(`训练中 ×${b.train.queue.length}`, c.x, b.ty * TILE + S + 18);
    } else if (b.btype === 'repair') {
      for (let i = 0; i < 3; i++) {
        const k = (t * 0.5 + i / 3 + b.id * 0.1) % 1;
        ctx.globalAlpha = 1 - k;
        glow(ctx, c.x + Math.sin(i * 2 + t * 2) * 10, c.y - k * 30, 5, '#8dffb0', 0.9);
      }
      ctx.globalAlpha = 1;
    } else if (b.btype === 'shelter') {
      // chimney smoke
      for (let i = 0; i < 3; i++) {
        const k = (t * 0.25 + i / 3) % 1;
        ctx.globalAlpha = (1 - k) * 0.35;
        ctx.fillStyle = '#c8c0b0';
        ctx.beginPath();
        ctx.arc(c.x + k * 10 + Math.sin(t + i) * 3, b.ty * TILE - 6 - k * 40, 3 + k * 7, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    if (b.silenceT > 0) {
      // silenced by the hunter's roar
      ctx.font = '700 13px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(10,6,6,0.9)';
      ctx.strokeText('沉默', c.x, b.ty * TILE - 30);
      ctx.fillStyle = '#ff8a8a';
      ctx.fillText('沉默', c.x, b.ty * TILE - 30);
    }
  }

  /** Map of unit id -> time of last hit, for the white hit flash. */
  private hitAt = new Map<number, number>();
  noteHit(id: number): void {
    this.hitAt.set(id, this.time);
  }

  private drawStatus(ctx: Ctx, u: Unit): void {
    const s = u.status;
    const t = this.time;
    const top = -(u.utype === 'hunter' ? (this.world.players[u.owner].hunter!.evolved ? 66 : 50) : 30);
    if (s.rootT > 0) {
      // ice block encasing the frozen target
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = '#bff2ff';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      const r = u.radius + 6;
      ctx.beginPath();
      ctx.moveTo(-r, -4);
      ctx.lineTo(-r * 0.7, top + 4);
      ctx.lineTo(r * 0.4, top);
      ctx.lineTo(r, top * 0.4);
      ctx.lineTo(r * 0.8, 2);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 0.9;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (s.burnT > 0) {
      for (let i = 0; i < 5; i++) {
        const fx = (i - 2) * (u.radius / 2.2);
        const fh = 10 + Math.sin(t * 14 + i * 1.7) * 5;
        glow(ctx, fx, top * 0.5, 10, '#ff6a1a', 0.5);
        ctx.fillStyle = i % 2 ? '#ffb040' : '#ff6a1a';
        ctx.beginPath();
        ctx.moveTo(fx - 4, top * 0.3);
        ctx.quadraticCurveTo(fx - 2, top * 0.3 - fh, fx, top * 0.3 - fh - 4);
        ctx.quadraticCurveTo(fx + 2, top * 0.3 - fh, fx + 4, top * 0.3);
        ctx.fill();
      }
    }
    if (s.markT > 0 && s.markStacks > 0) {
      glow(ctx, 0, top - 14, 14, '#b070ff', 0.6);
      ctx.strokeStyle = '#e0c0ff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, top - 14, 7, t * 3, t * 3 + Math.PI * 1.6);
      ctx.stroke();
      ctx.font = '800 11px "Alegreya Sans SC", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(String(s.markStacks), 0, top - 10);
    }
    if (s.stunT > 0) {
      for (let i = 0; i < 3; i++) {
        const a = t * 6 + (i * Math.PI * 2) / 3;
        ctx.fillStyle = '#ffe08a';
        ctx.font = '700 11px sans-serif';
        ctx.fillText('★', Math.cos(a) * 12, top - 4 + Math.sin(a) * 4);
      }
    }
  }

  private drawUnit(ctx: Ctx, u: Unit, x: number, y: number, view: ViewState): void {
    ctx.save();
    ctx.translate(x, y);
    const color = this.world.players[u.owner].color;
    if (u.utype === 'hunter') drawHunter(ctx, u, this.world.players[u.owner].hunter!, this.time, color);
    else if (u.utype === 'guard') drawGuard(ctx, u, color, this.time);
    else if (u.utype === 'ranger') drawRanger(ctx, u, color, this.time);
    else drawSurvivor(ctx, u, color, this.time);
    const hitAge = this.time - (this.hitAt.get(u.id) ?? -9);
    if (hitAge < 0.09) {
      // white hit flash
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, 0, -u.radius - 6, u.radius * 2.2, '#ffffff', 0.55);
      ctx.globalCompositeOperation = 'source-over';
    }
    this.drawStatus(ctx, u);
    ctx.restore();
    if (view.hoverId === u.id && !view.selection.has(u.id)) {
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(x, y, u.radius + 5, (u.radius + 5) * 0.5, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  private drawProjectiles(ctx: Ctx, alpha: number): void {
    for (const p of this.world.projectiles) {
      const x = p.px + (p.x - p.px) * alpha;
      const y = p.py + (p.y - p.py) * alpha;
      const a = Math.atan2(p.ty - p.y, p.tx - p.x);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a);
      drawProjectileArt(ctx, p, this.time, (color, size, life) =>
        this.fx.add({ kind: 'ember', x: p.x, y: p.y, z: 0, vx: (Math.random() - 0.5) * 40, vy: (Math.random() - 0.5) * 40, vz: 10, life, size, color }),
      );
      ctx.restore();
    }
  }

  private bar(ctx: Ctx, x: number, y: number, w: number, frac: number, color: string, h = 4): void {
    ctx.fillStyle = 'rgba(10,8,6,0.85)';
    ctx.fillRect(x - w / 2 - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = color;
    ctx.fillRect(x - w / 2, y, w * Math.max(0, Math.min(1, frac)), h);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(x - w / 2, y, w * Math.max(0, Math.min(1, frac)), 1);
  }

  private drawBars(ctx: Ctx, view: ViewState, alpha: number): void {
    const w = this.world;
    for (const u of w.units.values()) {
      if (!u.alive) continue;
      if (!view.persp.seesUnit(w, u)) continue;
      const x = u.px + (u.x - u.px) * alpha;
      const y = u.py + (u.y - u.py) * alpha;
      const st = unitStats(w, u);
      const frac = u.hp / st.maxHp;
      if (u.utype === 'hunter') {
        this.bar(ctx, x, y - 58, 46, frac, frac > 0.5 ? '#d83a3a' : '#ff6a3a', 5);
        ctx.font = '700 11px "Alegreya Sans SC", "Microsoft YaHei", sans-serif';
        ctx.textAlign = 'center';
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(10,6,6,0.9)';
        const hs = w.players[u.owner].hunter!;
        const lvl = `${w.players[u.owner].name}${hs.evolved ? '·巨兽' : ''} Lv${hs.level}`;
        ctx.strokeText(lvl, x, y - 62);
        ctx.fillStyle = '#ffb0b0';
        ctx.fillText(lvl, x, y - 62);
      } else if (frac < 1 || view.selection.has(u.id)) {
        this.bar(ctx, x, y - 30, 22, frac, frac > 0.5 ? '#5fd35f' : frac > 0.25 ? '#e0c03a' : '#e04a3a', 3);
      }
      if (u.utype === 'survivor' && u.owner !== view.localPlayer && view.persp.seesUnit(w, u)) {
        ctx.font = '600 10px "Microsoft YaHei", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(230,230,210,0.75)';
        ctx.fillText(w.players[u.owner].name, x, y - 34);
      }
    }
    for (const b of w.buildings.values()) {
      if (!view.persp.seesBuildingDetail(w, b)) continue;
      const c = buildingCenter(b);
      const top = b.ty * TILE - (b.size === 1 ? 20 : 30);
      const sel = view.selection.has(b.id);
      if (b.constructing) this.bar(ctx, c.x, top, b.size * 22, b.progress, '#e8c050', 3);
      else if (b.btype === 'altar') this.bar(ctx, c.x, top - 6, 90, b.charge, '#fff0a0', 5);
      else if (b.upgrading) this.bar(ctx, c.x, top, b.size * 22, b.upgrading.progress, '#7ad0ff', 3);
      if (b.hp < b.maxHp * 0.999 || sel) this.bar(ctx, c.x, top + 5, b.size * 22, b.hp / b.maxHp, b.hp / b.maxHp > 0.5 ? '#5fd35f' : '#e07a3a', 3);
    }
  }

  private drawPlacement(ctx: Ctx, view: ViewState): void {
    const pl = view.placement;
    if (!pl) return;
    if (view.placementLine && view.placementLine.length > 1) {
      for (const t of view.placementLine) this.drawPlacementAt(ctx, view, { btype: pl.btype, tx: t.x, ty: t.y });
      return;
    }
    this.drawPlacementAt(ctx, view, pl);
  }

  private drawPlacementAt(ctx: Ctx, view: ViewState, pl: { btype: BuildingType; tx: number; ty: number }): void {
    const w = this.world;
    const def = BUILDINGS[pl.btype];
    const ok = canPlace(w, pl.btype, pl.tx, pl.ty);
    const spr = buildingSprite(pl.btype, 0, w.players[view.localPlayer].color, 0);
    ctx.globalAlpha = 0.6;
    ctx.drawImage(spr, pl.tx * TILE - PAD, pl.ty * TILE - TOP);
    ctx.globalAlpha = 1;
    for (let y = pl.ty; y < pl.ty + def.size; y++)
      for (let x = pl.tx; x < pl.tx + def.size; x++) {
        const good = w.grid.buildable(x, y);
        ctx.fillStyle = good && ok ? 'rgba(90,255,120,0.28)' : 'rgba(255,60,60,0.38)';
        ctx.fillRect(x * TILE + 1, y * TILE + 1, TILE - 2, TILE - 2);
        ctx.strokeStyle = good && ok ? 'rgba(140,255,160,0.8)' : 'rgba(255,90,90,0.9)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x * TILE + 1.5, y * TILE + 1.5, TILE - 3, TILE - 3);
      }
    const range = def.levels[0].range ?? def.levels[0].healRadius;
    if (range) {
      ctx.strokeStyle = 'rgba(255,240,170,0.55)';
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.arc((pl.tx + def.size / 2) * TILE, (pl.ty + def.size / 2) * TILE, range * TILE, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  private drawPings(ctx: Ctx, view: ViewState): void {
    for (const p of view.pings) {
      const k = (p.t % 1) / 1;
      ctx.strokeStyle = p.color;
      ctx.globalAlpha = Math.max(0, 1 - k) * Math.max(0, 1 - p.t / 4);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 20 + k * 60, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}
