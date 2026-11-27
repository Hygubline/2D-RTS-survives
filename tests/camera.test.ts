import { describe, expect, it } from 'vitest';
import { HUNTER, TILE } from '../src/config/balance';
import { Camera } from '../src/render/camera';
import { Perspective } from '../src/render/perspective';
import { stepWorld } from '../src/sim/step';
import { createWorld, hunterUnits, placeBuilding } from '../src/sim/world';

function cam(): Camera {
  const c = new Camera();
  c.resize(1200, 800);
  c.centerOn(1500, 1500);
  return c;
}
const centre = (c: Camera) => ({ x: c.x + c.viewW / c.zoom / 2, y: c.y + c.viewH / c.zoom / 2 });

describe('follow camera', () => {
  it('eases toward the target and settles on it', () => {
    const c = cam();
    c.track(1560, 1500, 1 / 60);
    const one = centre(c).x;
    expect(one).toBeGreaterThan(1500);
    expect(one).toBeLessThan(1560);
    for (let i = 0; i < 120; i++) c.track(1560, 1500, 1 / 60);
    expect(centre(c).x).toBeCloseTo(1560, 1);
  });

  it('snaps instead of sliding across the map after a respawn', () => {
    const c = cam();
    c.track(2500, 2600, 1 / 60); // more than a screen away
    expect(centre(c).x).toBeCloseTo(2500, 5);
    expect(centre(c).y).toBeCloseTo(2600, 5);
  });

  it('manual panning leaves follow mode', () => {
    const c = cam();
    c.follow = true;
    c.pan(10, 0);
    expect(c.follow).toBe(false);
  });
});

describe('smooth zoom', () => {
  it('reaches the target and keeps the anchored world point under the cursor', () => {
    const c = cam();
    const before = c.toWorld(300, 200);
    c.zoomToward(300, 200, 1.5);
    for (let i = 0; i < 120; i++) c.updateZoom(1 / 60);
    expect(c.zoom).toBeCloseTo(1.5, 5);
    const after = c.toWorld(300, 200);
    expect(after.x).toBeCloseTo(before.x, 3);
    expect(after.y).toBeCloseTo(before.y, 3);
  });

  it('is gradual: one frame moves only part of the way', () => {
    const c = cam();
    c.zoomToward(600, 400, 1.6);
    c.updateZoom(1 / 60);
    expect(c.zoom).toBeGreaterThan(1);
    expect(c.zoom).toBeLessThan(1.6);
  });

  it('clamps to the zoom limits', () => {
    const c = cam();
    for (let i = 0; i < 20; i++) c.zoomToward(600, 400, 2);
    for (let i = 0; i < 300; i++) c.updateZoom(1 / 60);
    expect(c.zoom).toBe(c.maxZoom);
  });

  it('a direct zoom assignment becomes the new resting zoom', () => {
    const c = cam();
    c.zoomToward(600, 400, 1.6);
    for (let i = 0; i < 5; i++) c.updateZoom(1 / 60); // mid-animation
    c.zoom = 1; // e.g. a dev jump re-focusing the warden
    for (let i = 0; i < 60; i++) c.updateZoom(1 / 60);
    expect(c.zoom).toBe(1);
  });
});

describe('enemy building details for the hunter', () => {
  function setup() {
    const w = createWorld({ seed: 3, humanControlled: true });
    const g = w.groves[0];
    const b = placeBuilding(w, 0, 'shelter', g.cx - 1, g.cy - 1)!;
    while (!hunterUnits(w).length) stepWorld(w); // hunters spawn when the grace period ends
    const hunterId = w.hunterPlayerIds[0];
    const p = new Perspective();
    return { w, b, hunterId, p };
  }

  it('wardens always see their own bars', () => {
    const { w, b, p } = setup();
    p.sync(w, 0);
    expect(p.seesBuildingDetail(w, b)).toBe(true);
  });

  it('a hunter far away sees no construction or hp bars, even for a building it already knows', () => {
    const { w, b, hunterId, p } = setup();
    w.hunterKnown.add(b.id);
    for (const h of hunterUnits(w)) h.x = h.y = 40; // far corner
    p.sync(w, hunterId);
    expect(p.seesBuilding(w, b)).toBe(true); // remembered on the map
    expect(p.seesBuildingDetail(w, b)).toBe(false); // but no live details
  });

  it('a hunter standing next to the building sees its bars', () => {
    const { w, b, hunterId, p } = setup();
    const h = hunterUnits(w)[0];
    h.x = (b.tx + 1.5) * TILE + (HUNTER.vision - 3) * TILE;
    h.y = (b.ty + 1.5) * TILE;
    p.sync(w, hunterId);
    expect(p.seesBuildingDetail(w, b)).toBe(true);
  });
});
