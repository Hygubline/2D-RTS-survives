/**
 * What the local player is allowed to see. Wardens share the sim's team vision; a hunter player
 * gets its own fog built from the pack's eyes, the scent sense, and the buildings the pack has
 * found (hunterKnown). Render/UI only: the sim never reads this, so it is lockstep-safe.
 */
import { HUNTER, TILE } from '../config/balance';
import type { Building, Faction, Unit, World } from '../sim/types';
import { factionOf } from '../sim/types';
import { visibleToSurvivors } from '../sim/vision';
import { buildingCenter, hunterPlayers, hunterUnits } from '../sim/world';

const REFRESH_TICKS = 5;

export class Perspective {
  faction: Faction = 'survivor';
  private own: Uint8Array | null = null;
  private stampTick = -1;
  private world: World | null = null;

  /** Call once per frame with the current world and local player. */
  sync(world: World, localPlayer: number): void {
    this.faction = world.players[localPlayer]?.faction ?? 'survivor';
    if (world !== this.world) {
      this.world = world;
      this.own = null;
      this.stampTick = -1;
    }
    if (this.faction !== 'hunter') return;
    if (!this.own || this.own.length !== world.vision.length) this.own = new Uint8Array(world.vision.length);
    if (this.stampTick >= 0 && world.tick - this.stampTick < REFRESH_TICKS) return;
    this.stampTick = world.tick;
    this.stampHunters(world, this.own);
  }

  /** Fog grid for the local side: 0 unexplored, 1 explored, 2 visible. */
  grid(world: World): Uint8Array {
    return this.faction === 'hunter' && this.own ? this.own : world.vision;
  }

  visibleAt(world: World, x: number, y: number): boolean {
    if (this.faction !== 'hunter') return visibleToSurvivors(world, x, y);
    const g = this.grid(world);
    const tx = Math.floor(x / TILE);
    const ty = Math.floor(y / TILE);
    if (!world.grid.inBounds(tx, ty)) return false;
    return g[ty * world.grid.w + tx] === 2;
  }

  /** Whether a unit should be drawn / pickable for the local player. */
  seesUnit(world: World, u: Unit): boolean {
    const side = factionOf(u.utype);
    if (side === this.faction) return true;
    if (this.faction === 'hunter' && this.scenting(world)) return true;
    return this.visibleAt(world, u.x, u.y);
  }

  /** Enemy buildings only show up for hunters once the pack has found them. */
  seesBuilding(world: World, b: Building): boolean {
    if (this.faction !== 'hunter') return true;
    if (world.hunterKnown.has(b.id)) return true;
    const c = buildingCenter(b);
    return this.visibleAt(world, c.x, c.y);
  }

  private scenting(world: World): boolean {
    return hunterPlayers(world).some((p) => (p.hunter?.scentActive ?? 0) > 0);
  }

  private stampHunters(world: World, v: Uint8Array): void {
    for (let i = 0; i < v.length; i++) if (v[i] === 2) v[i] = 1;
    const g = world.grid;
    const r = HUNTER.vision;
    const R = Math.ceil(r);
    const stamp = (cx: number, cy: number): void => {
      for (let y = -R; y <= R; y++)
        for (let x = -R; x <= R; x++) {
          if (x * x + y * y > r * r) continue;
          const tx = cx + x;
          const ty = cy + y;
          if (tx >= 0 && ty >= 0 && tx < g.w && ty < g.h) v[ty * g.w + tx] = 2;
        }
    };
    for (const u of hunterUnits(world)) stamp(Math.floor(u.x / TILE), Math.floor(u.y / TILE));
    // the lair is always in sight
    stamp(world.lair.x, world.lair.y);
  }
}
