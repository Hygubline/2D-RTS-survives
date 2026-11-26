/**
 * Cheap fingerprint of the sim state. Lockstep clients exchange it every HASH_EVERY turns; any
 * difference means the worlds have diverged (desync). Positions/hp are quantised so the hash is
 * stable while still catching real divergence within a few seconds.
 */
import type { World } from '../sim/types';

export function worldHash(world: World): number {
  let h = 0x811c9dc5;
  const mix = (v: number) => {
    h ^= v | 0;
    h = Math.imul(h, 0x01000193) >>> 0;
  };
  mix(world.tick);
  mix(world.nextId);
  for (const u of world.units.values()) {
    if (!u.alive) continue;
    mix(u.id);
    mix(Math.round(u.x * 4));
    mix(Math.round(u.y * 4));
    mix(Math.round(u.hp * 4));
  }
  for (const b of world.buildings.values()) {
    mix(b.id);
    mix(b.level);
    mix(Math.round(b.hp * 4));
  }
  for (const p of world.players) {
    mix(Math.round(p.amber * 4));
    mix(p.lives);
    if (p.hunter) {
      mix(p.hunter.level);
      mix(Math.round(p.hunter.soulfire * 4));
    }
  }
  return h >>> 0;
}
