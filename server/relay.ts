/**
 * Lockstep relay for Ashwood Vigil multiplayer.
 *
 *   npm run server            # listens on ws://0.0.0.0:8787 (PORT env overrides)
 *
 * It never simulates the game. It runs lobbies (6 seats: 4 wardens + 2 hunters), picks the seed,
 * then paces the match: every TURN_MS it broadcasts the commands it collected, stamped with the
 * sender's seat. A player who disconnects mid-match is handed to the AI through a 'leave'
 * command, so every client switches that seat at the same tick.
 */
import { WebSocketServer, type WebSocket } from 'ws';
import {
  DEFAULT_PORT,
  HASH_EVERY,
  MAX_CMDS_PER_TURN,
  MAX_NAME,
  NET_VERSION,
  parseMsg,
  SEAT_COUNT,
  TURN_MS,
  type ClientMsg,
  type RoomState,
  type ServerMsg,
  type TurnCmd,
} from '../src/net/protocol';
import { sanitizeCommand } from '../src/net/validate';

const MAX_ROOMS = 200;
const MAX_MSGS_PER_SEC = 80;
const MAX_PAYLOAD = 8 * 1024;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

interface Client {
  id: number;
  ws: WebSocket;
  name: string;
  room: Room | null;
  msgWindow: number;
  msgCount: number;
  cmdsThisTurn: number;
}

interface Room {
  code: string;
  host: number;
  members: Map<number, Client>;
  seats: (number | null)[];
  started: boolean;
  turn: number;
  pending: TurnCmd[];
  timer: ReturnType<typeof setInterval> | null;
  hashes: Map<number, Map<number, number>>;
}

export interface Relay {
  port: number;
  close(): Promise<void>;
}

export interface RelayOptions {
  port?: number;
  host?: string;
  log?: (line: string) => void;
}

export function startRelay(opts: RelayOptions = {}): Promise<Relay> {
  const log = opts.log ?? (() => {});
  const rooms = new Map<string, Room>();
  let nextId = 1;
  const wss = new WebSocketServer({ port: opts.port ?? DEFAULT_PORT, host: opts.host, maxPayload: MAX_PAYLOAD });

  const send = (c: Client, m: ServerMsg) => {
    if (c.ws.readyState === c.ws.OPEN) c.ws.send(JSON.stringify(m));
  };
  const broadcast = (r: Room, m: ServerMsg) => {
    const data = JSON.stringify(m);
    for (const c of r.members.values()) if (c.ws.readyState === c.ws.OPEN) c.ws.send(data);
  };
  const roomState = (r: Room, you: number): RoomState => ({
    code: r.code,
    you,
    host: r.host,
    seats: [...r.seats],
    members: [...r.members.values()].map((c) => ({ id: c.id, name: c.name })),
    started: r.started,
  });
  const pushRoom = (r: Room) => {
    for (const c of r.members.values()) send(c, { type: 'room', room: roomState(r, c.id) });
  };
  const newCode = (): string => {
    for (;;) {
      let s = '';
      for (let i = 0; i < 4; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
      if (!rooms.has(s)) return s;
    }
  };
  const seatOf = (r: Room, c: Client): number => r.seats.indexOf(c.id);

  function joinRoom(c: Client, r: Room): void {
    if (r.started) return send(c, { type: 'error', msg: '这局已经开始了' });
    // prefer a free warden seat, then a hunter seat
    const free = r.seats.indexOf(null);
    if (free < 0) return send(c, { type: 'error', msg: '房间已满（6 人）' });
    c.room = r;
    r.members.set(c.id, c);
    r.seats[free] = c.id;
    pushRoom(r);
  }

  function leaveRoom(c: Client): void {
    const r = c.room;
    if (!r) return;
    c.room = null;
    r.members.delete(c.id);
    const seat = seatOf(r, c);
    if (seat >= 0) r.seats[seat] = null;
    if (r.started && seat >= 0) {
      r.pending.push({ p: seat, c: { t: 'leave' } });
      broadcast(r, { type: 'left', name: c.name, seat });
    }
    if (r.members.size === 0) {
      if (r.timer) clearInterval(r.timer);
      rooms.delete(r.code);
      log(`room ${r.code} closed`);
      return;
    }
    if (r.host === c.id) r.host = r.members.keys().next().value!;
    if (!r.started) pushRoom(r);
  }

  function startMatch(r: Room): void {
    r.started = true;
    const seed = Math.floor(Math.random() * 1e9);
    const humans: number[] = [];
    const names: Record<number, string> = {};
    r.seats.forEach((id, seat) => {
      if (id === null) return;
      humans.push(seat);
      names[seat] = r.members.get(id)?.name ?? '玩家';
    });
    for (const c of r.members.values()) send(c, { type: 'start', seed, humans, names, seat: seatOf(r, c) });
    log(`room ${r.code} started: seats ${humans.join(',')}`);
    r.timer = setInterval(() => {
      const cmds = r.pending;
      r.pending = [];
      for (const c of r.members.values()) c.cmdsThisTurn = 0;
      broadcast(r, { type: 'turn', n: r.turn, cmds });
      r.turn++;
    }, TURN_MS);
  }

  function checkHash(r: Room, c: Client, turn: number, hash: number): void {
    if (turn % HASH_EVERY !== 0 || turn < 0 || turn > r.turn) return;
    let m = r.hashes.get(turn);
    if (!m) r.hashes.set(turn, (m = new Map()));
    m.set(c.id, hash >>> 0);
    const reporters = [...r.members.keys()];
    if (!reporters.every((id) => m!.has(id))) return;
    const values = new Set(m.values());
    r.hashes.delete(turn);
    if (values.size > 1) {
      log(`room ${r.code} desync at turn ${turn}`);
      broadcast(r, { type: 'desync', turn });
    }
    // forget stale entries from players who left
    for (const t of r.hashes.keys()) if (t < turn) r.hashes.delete(t);
  }

  function onMessage(c: Client, m: ClientMsg): void {
    const r = c.room;
    switch (m.type) {
      case 'hello':
        if (m.version !== NET_VERSION) return send(c, { type: 'error', msg: '客户端版本与服务器不一致，请刷新页面' });
        c.name = String(m.name ?? '').replace(/[<>&"]/g, '').trim().slice(0, MAX_NAME) || `玩家${c.id}`;
        return;
      case 'create': {
        if (r) leaveRoom(c);
        if (rooms.size >= MAX_ROOMS) return send(c, { type: 'error', msg: '服务器房间已满' });
        const room: Room = { code: newCode(), host: c.id, members: new Map(), seats: Array(SEAT_COUNT).fill(null), started: false, turn: 0, pending: [], timer: null, hashes: new Map() };
        rooms.set(room.code, room);
        log(`room ${room.code} created by ${c.name}`);
        return joinRoom(c, room);
      }
      case 'join': {
        const room = rooms.get(String(m.code ?? '').toUpperCase().trim());
        if (!room) return send(c, { type: 'error', msg: '找不到这个房间号' });
        if (r === room) return;
        if (r) leaveRoom(c);
        return joinRoom(c, room);
      }
      case 'seat': {
        if (!r || r.started) return;
        const seat = Number(m.seat);
        if (!Number.isInteger(seat) || seat < 0 || seat >= SEAT_COUNT || r.seats[seat] !== null) return;
        r.seats[seatOf(r, c)] = null;
        r.seats[seat] = c.id;
        return pushRoom(r);
      }
      case 'start':
        if (!r || r.started || r.host !== c.id) return;
        return startMatch(r);
      case 'leave':
        return leaveRoom(c);
      case 'cmd': {
        if (!r || !r.started) return;
        const seat = seatOf(r, c);
        if (seat < 0 || c.cmdsThisTurn >= MAX_CMDS_PER_TURN) return;
        const cmd = sanitizeCommand(m.cmd);
        if (!cmd) return;
        c.cmdsThisTurn++;
        r.pending.push({ p: seat, c: cmd });
        return;
      }
      case 'hash':
        if (r && r.started && Number.isInteger(m.turn) && Number.isInteger(m.hash)) checkHash(r, c, m.turn, m.hash);
        return;
    }
  }

  wss.on('connection', (ws) => {
    const c: Client = { id: nextId++, ws, name: '', room: null, msgWindow: Date.now(), msgCount: 0, cmdsThisTurn: 0 };
    c.name = `玩家${c.id}`;
    send(c, { type: 'welcome', id: c.id });
    ws.on('message', (raw) => {
      const now = Date.now();
      if (now - c.msgWindow > 1000) {
        c.msgWindow = now;
        c.msgCount = 0;
      }
      if (++c.msgCount > MAX_MSGS_PER_SEC) return;
      const m = parseMsg<ClientMsg>(raw);
      if (!m) return;
      try {
        onMessage(c, m);
      } catch (err) {
        log(`bad message from ${c.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    });
    ws.on('close', () => leaveRoom(c));
    ws.on('error', () => leaveRoom(c));
  });

  return new Promise((resolve, reject) => {
    wss.once('error', reject);
    wss.once('listening', () => {
      const addr = wss.address();
      const port = typeof addr === 'object' && addr ? addr.port : (opts.port ?? DEFAULT_PORT);
      log(`relay listening on ws://${opts.host ?? '0.0.0.0'}:${port}`);
      resolve({
        port,
        close: () =>
          new Promise<void>((done) => {
            for (const r of rooms.values()) if (r.timer) clearInterval(r.timer);
            for (const ws of wss.clients) ws.terminate();
            wss.close(() => done());
          }),
      });
    });
  });
}
