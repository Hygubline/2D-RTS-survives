import { describe, expect, it } from 'vitest';
import { soundFor, type SoundView } from '../src/audio/sfx';

const onScreen: SoundView = { me: 0, place: () => ({ pan: 0.3, gain: 1 }) };
const offScreen: SoundView = { me: 0, place: () => null };

describe('sound cue mapping', () => {
  it('plays combat sounds only where the player is looking', () => {
    const hit = { e: 'hit', id: 1, x: 0, y: 0, dmg: 10, onBuilding: true, source: 'melee' } as const;
    expect(soundFor(hit, onScreen)?.name).toBe('hitWood');
    expect(soundFor(hit, offScreen)).toBeNull();
    expect(soundFor({ e: 'shoot', x: 0, y: 0, ptype: 'frost', variant: '', level: 0 }, onScreen)?.name).toBe('frost');
  });

  it('skips burn ticks so damage-over-time does not buzz', () => {
    expect(soundFor({ e: 'hit', id: 1, x: 0, y: 0, dmg: 3, onBuilding: false, source: 'burn' }, onScreen)).toBeNull();
  });

  it('always tells you when your own building falls, even off-screen', () => {
    const cue = soundFor({ e: 'destroyed', x: 0, y: 0, btype: 'wall', size: 1, owner: 0 }, offScreen);
    expect(cue?.name).toBe('destroyed');
    expect(soundFor({ e: 'destroyed', x: 0, y: 0, btype: 'wall', size: 1, owner: 2 }, offScreen)).toBeNull();
  });

  it('only voices your own economy and construction', () => {
    expect(soundFor({ e: 'built', x: 0, y: 0, btype: 'wall', owner: 1 }, onScreen)).toBeNull();
    expect(soundFor({ e: 'income', x: 0, y: 0, amount: 5, owner: 0, level: 0 }, onScreen)?.name).toBe('income');
  });

  it('marks the outcome and your own warden falling', () => {
    expect(soundFor({ e: 'gameover', winner: 'survivor', reason: 'dawn' }, offScreen)?.name).toBe('win');
    expect(soundFor({ e: 'gameover', winner: 'hunter', reason: 'wardensFell' }, offScreen)?.name).toBe('lose');
    expect(soundFor({ e: 'death', x: 0, y: 0, utype: 'survivor', owner: 0 }, offScreen)?.name).toBe('wardenDown');
    expect(soundFor({ e: 'alert', x: 0, y: 0, player: 0 }, offScreen)?.name).toBe('alert');
  });
});
