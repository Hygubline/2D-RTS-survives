import { TILE } from '../config/balance';
import type { Faction } from './types';

export const T_GRASS = 0;
export const T_DIRT = 1;
export const T_WATER = 2;
export const T_ROCK = 3;
export const T_TREE = 4;
export const T_MEADOW = 5;

export class Grid {
  readonly w: number;
  readonly h: number;
  readonly terrain: Uint8Array;
  /** building id occupying tile, 0 = free */
  readonly occ: Int32Array;
  /** 1 if occupant is a gate (passable for survivors) */
  readonly gate: Uint8Array;

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.terrain = new Uint8Array(w * h);
    this.occ = new Int32Array(w * h);
    this.gate = new Uint8Array(w * h);
  }

  idx(tx: number, ty: number): number {
    return ty * this.w + tx;
  }
  inBounds(tx: number, ty: number): boolean {
    return tx >= 0 && ty >= 0 && tx < this.w && ty < this.h;
  }
  terrainAt(tx: number, ty: number): number {
    return this.inBounds(tx, ty) ? this.terrain[this.idx(tx, ty)] : T_ROCK;
  }
  terrainPassable(tx: number, ty: number): boolean {
    if (!this.inBounds(tx, ty)) return false;
    const t = this.terrain[this.idx(tx, ty)];
    return t === T_GRASS || t === T_DIRT || t === T_MEADOW;
  }
  passable(tx: number, ty: number, faction: Faction): boolean {
    if (!this.terrainPassable(tx, ty)) return false;
    const i = this.idx(tx, ty);
    if (this.occ[i] === 0) return true;
    return faction === 'survivor' && this.gate[i] === 1;
  }
  buildable(tx: number, ty: number): boolean {
    return this.terrainPassable(tx, ty) && this.occ[this.idx(tx, ty)] === 0;
  }
  setOcc(tx: number, ty: number, size: number, id: number, isGate: boolean): void {
    for (let y = ty; y < ty + size; y++)
      for (let x = tx; x < tx + size; x++) {
        const i = this.idx(x, y);
        this.occ[i] = id;
        this.gate[i] = isGate && id !== 0 ? 1 : 0;
      }
  }
}

export function tileOf(px: number): number {
  return Math.floor(px / TILE);
}
export function tileCenter(t: number): number {
  return t * TILE + TILE / 2;
}
