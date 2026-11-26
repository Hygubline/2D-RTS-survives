import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startRelay, type Relay } from '../server/relay';
import { NetClient } from '../src/net/client';
import { worldHash } from '../src/net/hash';
import { Lockstep } from '../src/net/lockstep';
import { TICKS_PER_TURN, type RoomState, type TurnCmd } from '../src/net/protocol';
import { sanitizeCommand } from '../src/net/validate';
import { createWorld } from '../src/sim/world';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function until(cond: () => boolean, ms = 3000): Promise<void> {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error('timed out');
    await wait(10);
  }
}

describe('command validation', () => {
  it('accepts well-formed commands and strips unknown fields', () => {
    const c = sanitizeCommand({ t: 'order', unitIds: [3], order: { type: 'move', x: 10, y: 20, evil: 1 }, queue: false, extra: true });
    expect(c).toEqual({ t: 'order', unitIds: [3], order: { type: 'move', x: 10, y: 20 }, queue: false });
    expect(sanitizeCommand({ t: 'skill', skill: 'roar' })).toEqual({ t: 'skill', skill: 'roar' });
  });

  it('rejects malformed or forbidden commands', () => {
    expect(sanitizeCommand(null)).toBeNull();
    expect(sanitizeCommand({ t: 'order', unitIds: 'all', order: { type: 'move', x: 1, y: 1 } })).toBeNull();
    expect(sanitizeCommand({ t: 'order', unitIds: [1], order: { type: 'move', x: NaN, y: 1 } })).toBeNull();
    expect(sanitizeCommand({ t: 'order', unitIds: [1], order: { type: 'build', btype: 'castle', tx: 1, ty: 1 } })).toBeNull();
    expect(sanitizeCommand({ t: 'buy', slot: '__proto__' })).toBeNull();
    expect(sanitizeCommand({ t: 'leave' })).toBeNull();
    expect(sanitizeCommand({ t: 'stop', unitIds: Array(500).fill(1) })).toBeNull();
  });
});

describe('lockstep', () => {
  it('only advances through turns that have arrived', () => {
    const ls = new Lockstep(createWorld({ seed: 5, humanControlled: false }));
    expect(ls.step()).toBe(false);
    ls.receive(0, []);
    let n = 0;
    while (ls.step()) n++;
    expect(n).toBe(TICKS_PER_TURN);
  });

  it('two clients fed the same turns stay identical', () => {
    const mk = () => new Lockstep(createWorld({ seed: 21, humanControlled: false, humans: [0, 4] }));
    const a = mk();
    const b = mk();
    const warden = a.world.players[0].unitId;
    for (let n = 0; n < 400; n++) {
      const cmds: TurnCmd[] = n === 3 ? [{ p: 0, c: { t: 'order', unitIds: [warden], order: { type: 'move', x: 900, y: 900 }, queue: false } }] : [];
      a.receive(n, cmds);
      b.receive(n, JSON.parse(JSON.stringify(cmds)) as TurnCmd[]);
    }
    while (a.step());
    while (b.step());
    expect(a.world.tick).toBe(400 * TICKS_PER_TURN);
    expect(worldHash(a.world)).toBe(worldHash(b.world));
  });

  it('a leave command hands the seat to the AI on the same tick', () => {
    const ls = new Lockstep(createWorld({ seed: 2, humanControlled: false, humans: [0, 4] }));
    expect(ls.world.players[4].isAI).toBe(false);
    ls.receive(0, [{ p: 4, c: { t: 'leave' } }]);
    ls.step();
    expect(ls.world.players[4].isAI).toBe(true);
  });
});

describe('relay end to end', () => {
  let relay: Relay;
  beforeAll(async () => {
    relay = await startRelay({ port: 0, host: '127.0.0.1' });
  });
  afterAll(async () => {
    await relay.close();
  });

  it('runs a lobby, starts a match and keeps two clients in lockstep', async () => {
    const url = `ws://127.0.0.1:${relay.port}`;
    const a = await NetClient.connect(url, '甲');
    const b = await NetClient.connect(url, '乙');
    let roomA: RoomState | null = null;
    let roomB: RoomState | null = null;
    a.on.room = (r) => (roomA = r);
    b.on.room = (r) => (roomB = r);
    a.create();
    await until(() => !!roomA);
    b.join(roomA!.code);
    await until(() => !!roomB && roomB.seats.includes(b.id));
    b.sit(4); // take the first hunter seat
    await until(() => roomA!.seats[4] === b.id);

    const starts: { seed: number; humans: number[]; seat: number }[] = [];
    const sims: Lockstep[] = [];
    for (const c of [a, b]) {
      c.on.start = (m) => {
        starts.push(m);
        const ls = new Lockstep(createWorld({ seed: m.seed, humanControlled: false, humans: m.humans, names: m.names }));
        sims[c === a ? 0 : 1] = ls;
        c.on.turn = (n, cmds) => ls.receive(n, cmds);
      };
    }
    b.start(); // not the host: ignored
    await wait(150);
    expect(starts.length).toBe(0);
    a.start();
    await until(() => starts.length === 2);
    expect(starts[0].seed).toBe(starts[1].seed);
    expect(starts.map((s) => s.seat).sort()).toEqual([0, 4]);
    expect(sims[0].world.players[4].isHuman).toBe(true);
    expect(sims[0].world.players[4].name).toContain('乙');

    // the warden player moves; a forged order for the other seat's unit must not apply
    const warden = sims[0].world.players[0].unitId;
    a.command({ t: 'order', unitIds: [warden], order: { type: 'move', x: 1200, y: 1200 }, queue: false });
    b.command({ t: 'order', unitIds: [warden], order: { type: 'move', x: 0, y: 0 }, queue: false });
    b.send({ type: 'cmd', cmd: { t: 'order', unitIds: 'x' } as never });
    await wait(600);
    // advance both in step, as far as both have turns
    const [x, y] = sims;
    while (x.backlog() > 0 && y.backlog() > 0) {
      x.step();
      y.step();
    }
    expect(x.world.tick).toBeGreaterThan(6);
    expect(x.world.tick).toBe(y.world.tick);
    expect(worldHash(x.world)).toBe(worldHash(y.world));
    const u = x.world.units.get(warden)!;
    const o = u.orders[0];
    expect(o && o.type === 'move' ? o.x : -1).toBe(1200);

    // b disconnects: everyone sees seat 4 handed to the AI
    let leftSeat = -1;
    a.on.left = (_n, seat) => (leftSeat = seat);
    b.close();
    await until(() => leftSeat === 4);
    await wait(300);
    while (sims[0].step());
    expect(sims[0].world.players[4].isAI).toBe(true);
    a.close();
  }, 15000);

  it('rejects joining an unknown room', async () => {
    const c = await NetClient.connect(`ws://127.0.0.1:${relay.port}`, '丙');
    let err = '';
    c.on.error = (m) => (err = m);
    c.join('ZZZZ');
    await until(() => !!err);
    expect(err).toContain('找不到');
    c.close();
  });
});
