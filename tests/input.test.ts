import { describe, expect, it } from 'vitest';
import { lineTiles } from '../src/ui/input';

describe('drag-painted wall line', () => {
  it.each([
    [0, 0, 5, 0],
    [0, 0, 0, -4],
    [0, 0, 3, 3],
    [2, 1, -4, 3],
    [0, 0, 7, 2],
  ])('from (%i,%i) to (%i,%i) is 4-connected and covers both ends', (x0, y0, x1, y1) => {
    const t = lineTiles(x0, y0, x1, y1);
    expect(t[0]).toEqual({ x: x0, y: y0 });
    expect(t.at(-1)).toEqual({ x: x1, y: y1 });
    expect(t.length).toBe(Math.abs(x1 - x0) + Math.abs(y1 - y0) + 1);
    for (let i = 1; i < t.length; i++) expect(Math.abs(t[i].x - t[i - 1].x) + Math.abs(t[i].y - t[i - 1].y)).toBe(1);
  });

  it('stays close to the straight line', () => {
    const t = lineTiles(0, 0, 8, 2);
    for (const p of t) expect(Math.abs(p.y - p.x / 4)).toBeLessThanOrEqual(1);
  });
});
