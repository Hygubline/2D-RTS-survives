import { BUILDINGS, TILE, type BuildingType, type ItemSlot } from '../config/balance';
import { WHEEL_ZOOM } from '../render/camera';
import type { Command } from '../sim/commands';
import { factionOf, isArmy, type Building, type Entity, type Unit, type World } from '../sim/types';
import type { ArmyType, HunterSkill } from '../config/lategame';
import { canPlace, checkBuild } from '../sim/world';
import type { Camera } from '../render/camera';
import type { ViewState } from '../render/renderer';
import { cardFor, GRID_KEYS } from './commands';

export interface GameHost {
  world: World;
  cam: Camera;
  view: ViewState;
  canvas: HTMLCanvasElement;
  issue(cmd: Command): void;
  toast(text: string, tone?: 'info' | 'warn' | 'bad' | 'good'): void;
  togglePause(): void;
  toggleMute(): void;
  isOver(): boolean;
}

type Mode = { kind: 'normal' } | { kind: 'place'; btype: BuildingType } | { kind: 'target'; what: 'repair' | 'attack' | 'attackMove' | 'pounce' };

/** Maps mouse/keyboard to selection + Commands. Pure client-side; sim only sees Commands. */
export class Input {
  mode: Mode = { kind: 'normal' };
  mouse = { x: 0, y: 0, inside: false };
  private dragStart: { x: number; y: number } | null = null;
  private panning: { x: number; y: number } | null = null;
  private keys = new Set<string>();
  /** Player's follow-camera preference (Y toggles, remembered between games). */
  private followPref = loadFollowPref();
  private groups = new Map<number, number[]>();
  private lastGroupKey = { k: -1, t: 0 };
  private lastClick = { t: 0, id: 0 };
  private demolishArm = 0;
  private paint: { x: number; y: number } | null = null;
  shift = false;

  constructor(private g: GameHost) {
    g.cam.follow = this.followPref;
    const c = g.canvas;
    c.addEventListener('mousedown', (e) => this.onDown(e));
    window.addEventListener('mousemove', (e) => this.onMove(e));
    window.addEventListener('mouseup', (e) => this.onUp(e));
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    document.addEventListener('mouseleave', () => (this.mouse.inside = false));
    window.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.key);
      if (e.key === 'Shift') {
        this.shift = false;
        if (this.mode.kind === 'place' && this.placedWhileShift) this.setMode({ kind: 'normal' });
        this.placedWhileShift = false;
      }
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.shift = false;
    });
  }

  private placedWhileShift = false;

  get world(): World {
    return this.g.world;
  }

  get me(): number {
    return this.g.view.localPlayer;
  }

  selected(): Entity[] {
    const out: Entity[] = [];
    for (const id of this.g.view.selection) {
      const e = this.world.units.get(id) ?? this.world.buildings.get(id);
      if (e && e.alive) out.push(e);
    }
    return out;
  }

  myUnitsSelected(): Unit[] {
    // a hunter player has exactly one body and always commands it
    if (this.isHunter()) {
      const u = this.myWarden();
      return u ? [u] : [];
    }
    return this.selected().filter((e): e is Unit => e.kind === 'unit' && e.owner === this.me);
  }

  isHunter(): boolean {
    return this.world.players[this.me]?.faction === 'hunter';
  }

  /** Own warden (or own hunter for a hunter player). */
  myWarden(): Unit | undefined {
    const p = this.world.players[this.me];
    const u = this.world.units.get(p.unitId);
    return u && u.alive ? u : undefined;
  }

  setMode(m: Mode): void {
    this.mode = m;
    this.paint = null;
    this.g.view.placementLine = null;
    this.g.view.placement = null;
    if (m.kind === 'place') this.updatePlacement();
    this.g.canvas.style.cursor = m.kind === 'target' ? 'crosshair' : 'default';
  }

  private rect(e: MouseEvent): { x: number; y: number } {
    const r = this.g.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  pick(sx: number, sy: number): Entity | null {
    const wpt = this.g.cam.toWorld(sx, sy);
    let best: Entity | null = null;
    let bd = 1e9;
    for (const u of this.world.units.values()) {
      if (!u.alive) continue;
      if (!this.g.view.persp.seesUnit(this.world, u)) continue;
      const h = u.utype === 'hunter' ? 34 : 18;
      const dx = wpt.x - u.x;
      const dy = wpt.y - (u.y - h / 2);
      const d = Math.hypot(dx, dy * 0.8);
      if (d < u.radius + 10 && d < bd) {
        bd = d;
        best = u;
      }
    }
    if (best) return best;
    for (const b of this.world.buildings.values()) {
      const x0 = b.tx * TILE;
      const y0 = b.ty * TILE - (b.size === 1 ? 14 : 26);
      if (wpt.x >= x0 && wpt.x < x0 + b.size * TILE && wpt.y >= y0 && wpt.y < (b.ty + b.size) * TILE) return b;
    }
    return null;
  }

  private onDown(e: MouseEvent): void {
    if (this.g.isOver()) return;
    const p = this.rect(e);
    this.shift = e.shiftKey;
    if (e.button === 1) {
      this.panning = p;
      e.preventDefault();
      return;
    }
    if (e.button === 2) {
      if (this.mode.kind !== 'normal') {
        this.setMode({ kind: 'normal' });
        return;
      }
      this.contextOrder(p.x, p.y, e.shiftKey);
      return;
    }
    if (e.button !== 0) return;
    if (this.mode.kind === 'place') {
      const pl = this.g.view.placement;
      if (pl && (pl.btype === 'wall' || pl.btype === 'gate')) {
        // start a drag-painted wall line; committed on mouseup
        this.paint = { x: pl.tx, y: pl.ty };
        this.g.view.placementLine = [{ x: pl.tx, y: pl.ty }];
        return;
      }
      this.placeAt(e.shiftKey);
      return;
    }
    if (this.mode.kind === 'target') {
      this.resolveTarget(p.x, p.y, e.shiftKey);
      return;
    }
    this.dragStart = p;
  }

  private onMove(e: MouseEvent): void {
    const p = this.rect(e);
    this.mouse.x = p.x;
    this.mouse.y = p.y;
    this.mouse.inside = true;
    if (this.panning) {
      this.g.cam.pan(this.panning.x - p.x, this.panning.y - p.y);
      this.panning = p;
    }
    if (this.dragStart && Math.hypot(p.x - this.dragStart.x, p.y - this.dragStart.y) > 5)
      this.g.view.box = { x0: this.dragStart.x, y0: this.dragStart.y, x1: p.x, y1: p.y };
    if (this.mode.kind === 'place') {
      this.updatePlacement();
      const pl = this.g.view.placement;
      if (this.paint && pl) this.g.view.placementLine = lineTiles(this.paint.x, this.paint.y, pl.tx, pl.ty);
    }
    const h = this.pick(p.x, p.y);
    this.g.view.hoverId = h ? h.id : 0;
  }

  private onUp(e: MouseEvent): void {
    if (e.button === 1) {
      this.panning = null;
      return;
    }
    if (e.button === 0 && this.paint) {
      this.finishPaint(e.shiftKey);
      return;
    }
    if (e.button !== 0 || !this.dragStart) return;
    const p = this.rect(e);
    const box = this.g.view.box;
    this.dragStart = null;
    this.g.view.box = null;
    if (box) this.boxSelect(box, e.shiftKey);
    else this.clickSelect(p.x, p.y, e.shiftKey, e.ctrlKey);
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    const p = this.rect(e);
    // line-mode wheels report ~3 per notch; pixel-mode wheels and trackpads report pixels
    const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
    this.g.cam.zoomToward(p.x, p.y, Math.exp(-Math.max(-300, Math.min(300, dy)) * WHEEL_ZOOM));
    if (this.mode.kind === 'place') this.updatePlacement();
  }

  updatePlacement(): void {
    if (this.mode.kind !== 'place') return;
    const size = BUILDINGS[this.mode.btype].size;
    const w = this.g.cam.toWorld(this.mouse.x, this.mouse.y);
    const tx = Math.round(w.x / TILE - size / 2);
    const ty = Math.round(w.y / TILE - size / 2);
    this.g.view.placement = { btype: this.mode.btype, tx, ty };
  }

  private placeAt(shift: boolean): void {
    if (this.mode.kind !== 'place') return;
    const pl = this.g.view.placement;
    const u = this.myWarden();
    if (!pl || !u) return;
    const err = checkBuild(this.world, this.world.players[this.me], pl.btype);
    if (err && !(shift && err === '琥珀不足')) {
      this.g.toast(err, 'warn');
      if (!shift) this.setMode({ kind: 'normal' });
      return;
    }
    this.g.issue({ t: 'order', unitIds: [u.id], order: { type: 'build', btype: pl.btype, tx: pl.tx, ty: pl.ty }, queue: shift });
    this.marker((pl.tx + BUILDINGS[pl.btype].size / 2) * TILE, (pl.ty + BUILDINGS[pl.btype].size / 2) * TILE, '#9fffb0');
    if (shift) this.placedWhileShift = true;
    else this.setMode({ kind: 'normal' });
  }

  /** Commit a drag-painted line of walls/gates as one queued batch, nearest end first. */
  private finishPaint(shift: boolean): void {
    const line = this.g.view.placementLine ?? [];
    this.paint = null;
    this.g.view.placementLine = null;
    if (this.mode.kind !== 'place') return;
    const btype = this.mode.btype;
    if (line.length <= 1) {
      this.placeAt(shift);
      return;
    }
    const u = this.myWarden();
    if (!u) return;
    const p = this.world.players[this.me];
    const err = checkBuild(this.world, p, btype);
    if (err && err !== '琥珀不足') {
      this.g.toast(err, 'warn');
      return;
    }
    let tiles = line.filter((t) => canPlace(this.world, btype, t.x, t.y));
    if (!tiles.length) {
      this.g.toast('此处无法建造', 'warn');
      return;
    }
    const first = tiles[0];
    const last = tiles[tiles.length - 1];
    const ux = u.x / TILE;
    const uy = u.y / TILE;
    if (Math.hypot(last.x - ux, last.y - uy) < Math.hypot(first.x - ux, first.y - uy)) tiles = [...tiles].reverse();
    const cost = BUILDINGS[btype].levels[0].cost * tiles.length;
    tiles.forEach((t, i) => {
      this.g.issue({ t: 'order', unitIds: [u.id], order: { type: 'build', btype, tx: t.x, ty: t.y }, queue: shift || i > 0 });
      this.marker((t.x + 0.5) * TILE, (t.y + 0.5) * TILE, '#9fffb0');
    });
    this.g.toast(`已排队 ${tiles.length} 段${BUILDINGS[btype].name}（共 ${cost} 琥珀${p.amber < cost ? '，琥珀不足的部分将等待' : ''}）`, p.amber < cost ? 'warn' : 'info');
    if (shift) this.placedWhileShift = true;
    else this.setMode({ kind: 'normal' });
  }

  private marker(x: number, y: number, color: string): void {
    this.g.view.markers.push({ x, y, t: 0, color });
  }

  /** Right-click: context-sensitive order for selected own units. */
  contextOrder(sx: number, sy: number, queue: boolean): void {
    const units = this.myUnitsSelected();
    if (!units.length) {
      const barracks = this.selected().filter((e): e is Building => e.kind === 'building' && e.owner === this.me && e.btype === 'barracks');
      if (barracks.length) {
        const w = this.g.cam.toWorld(sx, sy);
        this.g.issue({ t: 'rally', buildingIds: barracks.map((b) => b.id), x: w.x, y: w.y });
        this.marker(w.x, w.y, '#9fffb0');
        this.g.toast('集结点已设置', 'info');
      }
      return;
    }
    const target = this.pick(sx, sy);
    const w = this.g.cam.toWorld(sx, sy);
    const ids = units.map((u) => u.id);
    if (this.isHunter()) {
      const enemy = target && target.owner !== this.me && (target.kind === 'building' || factionOf(target.utype) === 'survivor') ? target : null;
      if (enemy) {
        this.g.issue({ t: 'order', unitIds: ids, order: { type: 'attack', targetId: enemy.id }, queue });
        this.marker(w.x, w.y, '#ff6a6a');
      } else {
        this.g.issue({ t: 'order', unitIds: ids, order: { type: 'move', x: w.x, y: w.y }, queue });
        this.marker(w.x, w.y, '#ff9a6a');
      }
      return;
    }
    if (target && target.kind === 'unit' && target.utype === 'hunter') {
      this.g.issue({ t: 'order', unitIds: ids, order: { type: 'attack', targetId: target.id }, queue });
      this.marker(target.x, target.y, '#ff6a6a');
    } else if (target && target.kind === 'building' && (target.constructing || target.hp < target.maxHp) && units.some((u) => u.utype === 'survivor')) {
      const wardens = units.filter((u) => u.utype === 'survivor').map((u) => u.id);
      this.g.issue({ t: 'order', unitIds: wardens, order: { type: 'repair', targetId: target.id }, queue });
      this.marker(w.x, w.y, '#ffe08a');
    } else {
      this.g.issue({ t: 'order', unitIds: ids, order: { type: 'move', x: w.x, y: w.y }, queue });
      this.marker(w.x, w.y, '#8dff9e');
    }
  }

  moveTo(wx: number, wy: number, queue: boolean): void {
    const units = this.myUnitsSelected();
    if (!units.length) return;
    this.g.issue({ t: 'order', unitIds: units.map((u) => u.id), order: { type: 'move', x: wx, y: wy }, queue });
    this.marker(wx, wy, '#8dff9e');
  }

  private resolveTarget(sx: number, sy: number, queue: boolean): void {
    if (this.mode.kind !== 'target') return;
    const t = this.pick(sx, sy);
    const units = this.myUnitsSelected().map((u) => u.id);
    if (this.mode.what === 'pounce') {
      if (t && t.kind === 'unit' && factionOf(t.utype) === 'survivor') this.g.issue({ t: 'skill', skill: 'pounce', targetId: t.id });
      else this.g.toast('扑杀需要点击一个守夜人或军团单位', 'warn');
      this.setMode({ kind: 'normal' });
      return;
    }
    if (this.mode.what === 'repair') {
      if (t && t.kind === 'building' && t.owner === this.me) this.g.issue({ t: 'order', unitIds: units, order: { type: 'repair', targetId: t.id }, queue });
      else this.g.toast('请选择你的建筑', 'warn');
    } else if (this.mode.what === 'attackMove') {
      const w = this.g.cam.toWorld(sx, sy);
      this.g.issue({ t: 'order', unitIds: units, order: { type: 'attackMove', x: w.x, y: w.y }, queue });
      this.marker(w.x, w.y, '#ff9a6a');
    } else if (t && t.kind === 'unit' && t.utype === 'hunter') {
      this.g.issue({ t: 'order', unitIds: units, order: { type: 'attack', targetId: t.id }, queue });
    } else this.g.toast('只能攻击噬林魔', 'warn');
    if (!queue) this.setMode({ kind: 'normal' });
  }

  private setSelection(ids: number[], add: boolean): void {
    const sel = this.g.view.selection;
    if (!add) sel.clear();
    for (const id of ids) {
      if (add && sel.has(id) && ids.length === 1) sel.delete(id);
      else sel.add(id);
    }
  }

  private clickSelect(sx: number, sy: number, shift: boolean, ctrl: boolean): void {
    const t = this.pick(sx, sy);
    if (!t) {
      if (!shift) this.g.view.selection.clear();
      return;
    }
    const now = performance.now();
    const dbl = now - this.lastClick.t < 320 && this.lastClick.id === t.id;
    this.lastClick = { t: now, id: t.id };
    if ((dbl || ctrl) && t.kind === 'building' && t.owner === this.me) {
      this.selectSameOnScreen(t);
      return;
    }
    if ((dbl || ctrl) && t.kind === 'unit' && t.owner === this.me && isArmy(t.utype)) {
      const cam = this.g.cam;
      const ids: number[] = [];
      for (const u of this.world.units.values()) {
        if (!u.alive || u.owner !== this.me || u.utype !== t.utype) continue;
        const p = cam.toScreen(u.x, u.y);
        if (p.x >= 0 && p.y >= 0 && p.x <= cam.viewW && p.y <= cam.viewH) ids.push(u.id);
      }
      this.setSelection(ids, false);
      return;
    }
    this.setSelection([t.id], shift && t.owner === this.me);
  }

  private selectSameOnScreen(b: Building): void {
    const cam = this.g.cam;
    const ids: number[] = [];
    for (const o of this.world.buildings.values()) {
      if (o.owner !== this.me || o.btype !== b.btype) continue;
      const s = cam.toScreen((o.tx + o.size / 2) * TILE, (o.ty + o.size / 2) * TILE);
      if (s.x >= 0 && s.y >= 0 && s.x <= cam.viewW && s.y <= cam.viewH) ids.push(o.id);
    }
    this.setSelection(ids, false);
  }

  private boxSelect(b: { x0: number; y0: number; x1: number; y1: number }, add: boolean): void {
    const cam = this.g.cam;
    const a = cam.toWorld(Math.min(b.x0, b.x1), Math.min(b.y0, b.y1));
    const z = cam.toWorld(Math.max(b.x0, b.x1), Math.max(b.y0, b.y1));
    const units: number[] = [];
    for (const u of this.world.units.values())
      if (u.alive && u.owner === this.me && u.x >= a.x && u.x <= z.x && u.y >= a.y && u.y <= z.y + 10) units.push(u.id);
    if (units.length) return this.setSelection(units, add);
    const blds: number[] = [];
    for (const o of this.world.buildings.values()) {
      if (o.owner !== this.me) continue;
      const cx = (o.tx + o.size / 2) * TILE;
      const cy = (o.ty + o.size / 2) * TILE;
      if (cx >= a.x && cx <= z.x && cy >= a.y && cy <= z.y) blds.push(o.id);
    }
    if (blds.length) this.setSelection(blds.slice(0, 48), add);
    else if (!add) this.g.view.selection.clear();
  }

  /** Execute a command-card action id. */
  runAction(action: string): void {
    const sel = this.selected();
    if (action === 'escape') return this.setMode({ kind: 'normal' });
    if (action.startsWith('build:')) {
      const bt = action.slice(6) as BuildingType;
      const err = checkBuild(this.world, this.world.players[this.me], bt);
      if (err && err !== '琥珀不足') return this.g.toast(err, 'warn');
      if (err) this.g.toast('琥珀不足（按住 Shift 可排队等待）', 'warn');
      return this.setMode({ kind: 'place', btype: bt });
    }
    if (action === 'target:repair') return this.setMode({ kind: 'target', what: 'repair' });
    if (action === 'target:attack') return this.setMode({ kind: 'target', what: 'attack' });
    if (action === 'target:attackMove') return this.setMode({ kind: 'target', what: 'attackMove' });
    if (action === 'target:pounce') return this.setMode({ kind: 'target', what: 'pounce' });
    if (action.startsWith('skill:')) return this.g.issue({ t: 'skill', skill: action.slice(6) as HunterSkill });
    if (action.startsWith('buy:')) return this.g.issue({ t: 'buy', slot: action.slice(4) as ItemSlot });
    if (action.startsWith('train:')) {
      const b = sel.find((e): e is Building => e.kind === 'building' && e.owner === this.me && e.btype === 'barracks');
      if (b) this.g.issue({ t: 'train', buildingId: b.id, utype: action.slice(6) as ArmyType });
      return;
    }
    if (action === 'stop') return this.g.issue({ t: 'stop', unitIds: this.myUnitsSelected().map((u) => u.id) });
    const blds = sel.filter((e): e is Building => e.kind === 'building' && e.owner === this.me);
    if (!blds.length) return;
    const same = blds.filter((b) => b.btype === blds[0].btype);
    if (action === 'upgrade') {
      // upgrade the lowest-level ones first, as many as affordable
      const sorted = [...same].sort((a, b) => a.level - b.level);
      const lvl = sorted[0].level;
      this.g.issue({ t: 'upgrade', buildingIds: sorted.filter((b) => b.level === lvl).map((b) => b.id) });
    } else if (action === 'repairSel') {
      const u = this.myWarden();
      if (!u) return this.g.toast('你的守夜人尚未复活', 'warn');
      for (const [i, b] of same.entries()) this.g.issue({ t: 'order', unitIds: [u.id], order: { type: 'repair', targetId: b.id }, queue: this.shift || i > 0 });
    } else if (action === 'cancel') this.g.issue({ t: 'cancel', buildingIds: same.map((b) => b.id) });
    else if (action === 'demolish') {
      const now = performance.now();
      if (now - this.demolishArm > 1500) {
        this.demolishArm = now;
        this.g.toast('再按一次确认拆除', 'warn');
        return;
      }
      this.demolishArm = 0;
      this.g.issue({ t: 'demolish', buildingIds: same.map((b) => b.id) });
      this.g.view.selection.clear();
    }
  }

  private setFollow(on: boolean): void {
    this.followPref = on;
    this.g.cam.follow = on;
    saveFollowPref(on);
    this.g.toast(on ? '镜头跟随：开（Y 关闭）' : '镜头跟随：关（Y 开启）', 'info');
  }

  private onKey(e: KeyboardEvent): void {
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
    this.keys.add(e.key);
    if (e.key === 'Shift') this.shift = true;
    const k = e.key.toUpperCase();
    if (k === 'M' && !e.ctrlKey) {
      this.g.toggleMute();
      return;
    }
    if (this.g.isOver()) return;
    if (e.key === 'Escape') {
      this.setMode({ kind: 'normal' });
      return;
    }
    if (e.key === ' ' || e.key === 'F1') {
      e.preventDefault();
      const u = this.myWarden();
      if (u) {
        this.setSelection([u.id], false);
        this.g.cam.centerOn(u.x, u.y);
        this.g.cam.follow = this.followPref;
      }
      return;
    }
    if (k === 'Y' && !e.ctrlKey) {
      this.setFollow(!this.g.cam.follow);
      return;
    }
    if (k === 'P' || e.key === 'F10' || e.key === 'Pause') {
      e.preventDefault();
      this.g.togglePause();
      return;
    }
    if (/^[0-9]$/.test(e.key)) {
      const n = Number(e.key);
      if (e.ctrlKey) {
        e.preventDefault();
        this.groups.set(n, [...this.g.view.selection]);
        this.g.toast(`编队 ${n} 已设置`, 'info');
      } else {
        const ids = (this.groups.get(n) ?? []).filter((id) => this.world.units.get(id)?.alive || this.world.buildings.has(id));
        if (!ids.length) return;
        this.setSelection(ids, false);
        const now = performance.now();
        if (this.lastGroupKey.k === n && now - this.lastGroupKey.t < 400) {
          const e0 = this.world.units.get(ids[0]) ?? this.world.buildings.get(ids[0]);
          if (e0) this.g.cam.follow = false;
          if (e0) this.g.cam.centerOn(e0.kind === 'unit' ? e0.x : (e0.tx + 1) * TILE, e0.kind === 'unit' ? e0.y : (e0.ty + 1) * TILE);
        }
        this.lastGroupKey = { k: n, t: now };
      }
      return;
    }
    if (e.key === 'Backspace') {
      e.preventDefault();
      const a = this.g.view.lastAlert;
      if (a) {
        this.g.cam.follow = false;
        this.g.cam.centerOn(a.x, a.y);
      }
      else this.g.toast('最近没有遇袭警报', 'info');
      return;
    }
    if (k === 'H') {
      const sh = [...this.world.buildings.values()].find((b) => b.owner === this.me && b.btype === 'shelter');
      if (!sh) return this.g.toast('你还没有庇护所', 'warn');
      this.setSelection([sh.id], false);
      this.g.cam.follow = false;
      this.g.cam.centerOn((sh.tx + 1.5) * TILE, (sh.ty + 1.5) * TILE);
      return;
    }
    if (e.key === 'Delete') {
      this.runAction('demolish');
      return;
    }
    const idx = GRID_KEYS.indexOf(k);
    if (idx >= 0 && !e.ctrlKey && !e.altKey) {
      const card = cardFor(this.world, this.me, this.selected() as (Unit | Building)[], this.mode.kind);
      const btn = card[idx];
      if (btn) {
        e.preventDefault();
        if (btn.enabled || btn.action.startsWith('build:')) this.runAction(btn.action);
        else if (btn.reason) this.g.toast(btn.reason, 'warn');
      }
    }
  }

  /** Per-frame: keyboard + edge panning. */
  update(dt: number): void {
    const speed = 900 * dt;
    let dx = 0;
    let dy = 0;
    if (this.keys.has('ArrowLeft')) dx -= speed;
    if (this.keys.has('ArrowRight')) dx += speed;
    if (this.keys.has('ArrowUp')) dy -= speed;
    if (this.keys.has('ArrowDown')) dy += speed;
    const m = this.mouse;
    const edge = 6;
    // edge panning is off while following, so resting the cursor at the border never breaks the lock
    if (m.inside && !this.dragStart && !this.g.cam.follow) {
      if (m.x < edge) dx -= speed;
      if (m.x > this.g.cam.viewW - edge) dx += speed;
      if (m.y < edge) dy -= speed;
      if (m.y > this.g.cam.viewH - edge) dy += speed;
    }
    if (dx || dy) {
      const wasFollowing = this.g.cam.follow;
      this.g.cam.pan(dx, dy);
      if (wasFollowing) this.g.toast('镜头已解锁：按 Y 重新跟随，空格回到守夜人', 'info');
      if (this.mode.kind === 'place') this.updatePlacement();
    }
    if (this.mode.kind === 'place' && (this.g.cam.follow || this.g.cam.targetZoom !== this.g.cam.zoom)) this.updatePlacement();
    // prune dead selection
    for (const id of this.g.view.selection) {
      const e = this.world.units.get(id) ?? this.world.buildings.get(id);
      if (!e || !e.alive) this.g.view.selection.delete(id);
    }
  }
}

/** 4-connected tile line (no diagonal-only steps, so a painted wall seals). */
export function lineTiles(x0: number, y0: number, x1: number, y1: number): { x: number; y: number }[] {
  const out = [{ x: x0, y: y0 }];
  let x = x0;
  let y = y0;
  const sx = Math.sign(x1 - x0);
  const sy = Math.sign(y1 - y0);
  // perpendicular distance (unnormalised) of a tile from the ideal segment
  const off = (px: number, py: number) => Math.abs((px - x0) * (y1 - y0) - (py - y0) * (x1 - x0));
  while (x !== x1 || y !== y1) {
    const ex = x !== x1 ? off(x + sx, y) : Infinity;
    const ey = y !== y1 ? off(x, y + sy) : Infinity;
    if (ex <= ey) x += sx;
    else y += sy;
    out.push({ x, y });
  }
  return out;
}

const FOLLOW_KEY = 'ashwood.followCam';

function loadFollowPref(): boolean {
  try {
    return localStorage.getItem(FOLLOW_KEY) !== '0';
  } catch {
    return true;
  }
}

function saveFollowPref(on: boolean): void {
  try {
    localStorage.setItem(FOLLOW_KEY, on ? '1' : '0');
  } catch {
    // storage blocked (private mode): the toggle still works for this session
  }
}
