/**
 * Wire protocol between game clients and the relay server (server/relay.ts).
 *
 * Model: deterministic lockstep with a server-paced turn clock. Clients never send world state,
 * only Commands. Every TURN_MS the relay broadcasts one "turn" holding every command it received
 * in that window, tagged with the sender's seat. All clients apply turn n right before sim tick
 * n * TICKS_PER_TURN, so every world stays identical. Seat ownership is enforced by the relay
 * (it stamps the seat) and by the sim (commands only act on the issuing player's units).
 */
import type { Command } from '../sim/commands';

export const NET_VERSION = 1;
export const DEFAULT_PORT = 8787;
/** sim ticks per lockstep turn (sim runs at 20 Hz, so one turn = 100 ms) */
export const TICKS_PER_TURN = 2;
export const TURN_MS = 100;
/** clients report a world hash this often (turns) so desyncs are caught early */
export const HASH_EVERY = 50;
export const MAX_NAME = 16;
export const MAX_CMDS_PER_TURN = 40;

/** 4 warden seats (players 0..3) then 2 hunter seats (players 4..5). */
export const SEATS = [
  { faction: 'survivor', label: '守夜人 1' },
  { faction: 'survivor', label: '守夜人 2' },
  { faction: 'survivor', label: '守夜人 3' },
  { faction: 'survivor', label: '守夜人 4' },
  { faction: 'hunter', label: '噬林魔·赤瞳' },
  { faction: 'hunter', label: '噬林魔·灰鬃' },
] as const;
export const SEAT_COUNT = SEATS.length;

export interface LobbyMember {
  id: number;
  name: string;
}

export interface RoomState {
  code: string;
  you: number;
  host: number;
  /** client id sitting in each seat, or null for an AI seat */
  seats: (number | null)[];
  members: LobbyMember[];
  started: boolean;
}

export interface TurnCmd {
  /** seat / player id that issued it */
  p: number;
  c: Command;
}

export type ClientMsg =
  | { type: 'hello'; name: string; version: number }
  | { type: 'create' }
  | { type: 'join'; code: string }
  | { type: 'seat'; seat: number }
  | { type: 'start' }
  | { type: 'leave' }
  | { type: 'cmd'; cmd: Command }
  | { type: 'hash'; turn: number; hash: number };

export type ServerMsg =
  | { type: 'welcome'; id: number }
  | { type: 'room'; room: RoomState }
  | { type: 'error'; msg: string }
  | { type: 'start'; seed: number; humans: number[]; names: Record<number, string>; seat: number }
  | { type: 'turn'; n: number; cmds: TurnCmd[] }
  | { type: 'desync'; turn: number }
  | { type: 'left'; name: string; seat: number };

export function parseMsg<T>(raw: unknown): T | null {
  try {
    const v = JSON.parse(String(raw)) as unknown;
    return v && typeof v === 'object' && typeof (v as { type?: unknown }).type === 'string' ? (v as T) : null;
  } catch {
    return null;
  }
}
