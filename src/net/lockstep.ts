/**
 * Client side of deterministic lockstep. The sim may only run ticks whose turn has arrived from
 * the relay; the commands of turn n are applied right before tick n * TICKS_PER_TURN, on every
 * client alike. Pure TypeScript (no DOM), so the same code runs in the game and in tests.
 */
import { issueCommand, type Command } from '../sim/commands';
import { stepWorld } from '../sim/step';
import type { World } from '../sim/types';
import { worldHash } from './hash';
import { HASH_EVERY, TICKS_PER_TURN, type TurnCmd } from './protocol';
import { sanitizeCommand } from './validate';

export class Lockstep {
  private turns = new Map<number, TurnCmd[]>();
  /** highest turn n such that every turn 0..n has arrived */
  private received = -1;

  constructor(
    readonly world: World,
    private reportHash: (turn: number, hash: number) => void = () => {},
  ) {}

  receive(n: number, cmds: TurnCmd[]): void {
    if (!Number.isInteger(n) || n <= this.received) return;
    this.turns.set(n, Array.isArray(cmds) ? cmds : []);
    while (this.turns.has(this.received + 1)) this.received++;
  }

  /** Ticks available but not yet simulated. */
  backlog(): number {
    return (this.received + 1) * TICKS_PER_TURN - this.world.tick;
  }

  /** Run one sim tick if its turn has arrived; false means "waiting for the relay". */
  step(): boolean {
    const w = this.world;
    if (w.winner || this.backlog() <= 0) return false;
    if (w.tick % TICKS_PER_TURN === 0) {
      const n = w.tick / TICKS_PER_TURN;
      if (n % HASH_EVERY === 0) this.reportHash(n, worldHash(w));
      for (const tc of this.turns.get(n) ?? []) {
        const cmd: Command | null = tc?.c?.t === 'leave' ? { t: 'leave' } : sanitizeCommand(tc?.c);
        if (cmd && Number.isInteger(tc.p) && w.players[tc.p]) issueCommand(w, tc.p, cmd);
      }
      this.turns.delete(n);
    }
    stepWorld(w);
    return true;
  }
}
