import { MAP_H, MAP_W, TILE } from '../config/balance';

/** Seconds for the follow camera to close ~63% of the gap to its target (smooth, frame-rate independent). */
export const FOLLOW_LAG = 0.12;
/** Seconds for smooth zoom to close ~63% of the gap to its target zoom. */
export const ZOOM_LAG = 0.07;
/** Wheel sensitivity: zoom factor = exp(-deltaY * this). One mouse notch (100) ≈ ×1.16. */
export const WHEEL_ZOOM = 0.0015;

export class Camera {
  x = 0;
  y = 0;
  zoom = 1;
  viewW = 1;
  viewH = 1;
  readonly minZoom = 0.5;
  readonly maxZoom = 1.8;
  /** Follow mode: keep the tracked unit centred. Manual panning switches it off. */
  follow = false;
  /** Smooth zoom: the zoom eases toward targetZoom around a fixed screen anchor. */
  targetZoom = 1;
  private anchor = { sx: 0, sy: 0 };
  /** Zoom this camera last set; a different value means someone assigned `zoom` directly. */
  private settled = 1;

  resize(w: number, h: number): void {
    this.viewW = w;
    this.viewH = h;
    this.clamp();
  }

  centerOn(wx: number, wy: number): void {
    this.x = wx - this.viewW / this.zoom / 2;
    this.y = wy - this.viewH / this.zoom / 2;
    this.clamp();
  }

  /** Ease the view centre toward (wx, wy). Snaps when far away (respawn, teleport). */
  track(wx: number, wy: number, dt: number): void {
    const cx = this.x + this.viewW / this.zoom / 2;
    const cy = this.y + this.viewH / this.zoom / 2;
    const far = Math.hypot(wx - cx, wy - cy) > Math.max(this.viewW, this.viewH) / this.zoom;
    const k = far ? 1 : 1 - Math.exp(-dt / FOLLOW_LAG);
    this.centerOn(cx + (wx - cx) * k, cy + (wy - cy) * k);
  }

  /** Manual pan (drag, arrow keys, edges): leaves follow mode. */
  pan(dx: number, dy: number): void {
    this.follow = false;
    this.x += dx / this.zoom;
    this.y += dy / this.zoom;
    this.clamp();
  }

  /** Instant zoom keeping the world point under (sx, sy) fixed. */
  zoomAt(sx: number, sy: number, factor: number): void {
    this.setZoom(sx, sy, this.zoom * factor);
    this.targetZoom = this.zoom;
  }

  /** Request a smooth zoom toward zoom × factor around screen point (sx, sy). */
  zoomToward(sx: number, sy: number, factor: number): void {
    this.adoptDirectZoom();
    this.targetZoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.targetZoom * factor));
    this.anchor = { sx, sy };
  }

  /** Per frame: ease the zoom toward its target. While following, zoom around the screen centre. */
  updateZoom(dt: number): void {
    this.adoptDirectZoom();
    if (Math.abs(this.targetZoom - this.zoom) < 1e-4) return;
    const k = 1 - Math.exp(-dt / ZOOM_LAG);
    const z = Math.abs(this.targetZoom - this.zoom) < 0.002 ? this.targetZoom : this.zoom + (this.targetZoom - this.zoom) * k;
    const a = this.follow ? { sx: this.viewW / 2, sy: this.viewH / 2 } : this.anchor;
    this.setZoom(a.sx, a.sy, z);
  }

  /** A direct `zoom = …` (focus on spawn, debug tools) becomes the new resting zoom. */
  private adoptDirectZoom(): void {
    if (this.zoom !== this.settled) this.targetZoom = this.settled = this.zoom;
  }

  private setZoom(sx: number, sy: number, z: number): void {
    const before = this.toWorld(sx, sy);
    this.zoom = this.settled = Math.max(this.minZoom, Math.min(this.maxZoom, z));
    this.x = before.x - sx / this.zoom;
    this.y = before.y - sy / this.zoom;
    this.clamp();
  }

  toWorld(sx: number, sy: number): { x: number; y: number } {
    return { x: this.x + sx / this.zoom, y: this.y + sy / this.zoom };
  }

  toScreen(wx: number, wy: number): { x: number; y: number } {
    return { x: (wx - this.x) * this.zoom, y: (wy - this.y) * this.zoom };
  }

  clamp(): void {
    const mw = MAP_W * TILE;
    const mh = MAP_H * TILE;
    const vw = this.viewW / this.zoom;
    const vh = this.viewH / this.zoom;
    const margin = 160;
    this.x = Math.max(-margin, Math.min(mw - vw + margin, this.x));
    this.y = Math.max(-margin - 40, Math.min(mh - vh + margin + 160, this.y));
  }
}
