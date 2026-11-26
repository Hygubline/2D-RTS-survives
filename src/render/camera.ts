import { MAP_H, MAP_W, TILE } from '../config/balance';

export class Camera {
  x = 0;
  y = 0;
  zoom = 1;
  viewW = 1;
  viewH = 1;
  readonly minZoom = 0.5;
  readonly maxZoom = 1.8;

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

  pan(dx: number, dy: number): void {
    this.x += dx / this.zoom;
    this.y += dy / this.zoom;
    this.clamp();
  }

  zoomAt(sx: number, sy: number, factor: number): void {
    const before = this.toWorld(sx, sy);
    this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom * factor));
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
