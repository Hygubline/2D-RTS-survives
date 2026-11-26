/** Thin WebSocket wrapper around the relay protocol (works in browsers and Node 22+). */
import type { Command } from '../sim/commands';
import { NET_VERSION, parseMsg, type ClientMsg, type RoomState, type ServerMsg, type TurnCmd } from './protocol';

export interface NetHandlers {
  room?: (room: RoomState) => void;
  start?: (m: { seed: number; humans: number[]; names: Record<number, string>; seat: number }) => void;
  turn?: (n: number, cmds: TurnCmd[]) => void;
  error?: (msg: string) => void;
  desync?: (turn: number) => void;
  left?: (name: string, seat: number) => void;
  close?: () => void;
}

export class NetClient {
  id = 0;
  room: RoomState | null = null;
  on: NetHandlers = {};
  private closedByUs = false;

  private constructor(private ws: WebSocket) {}

  /** Connect and say hello; resolves once the relay has assigned us an id. */
  static connect(url: string, name: string, timeoutMs = 5000): Promise<NetClient> {
    return new Promise((resolve, reject) => {
      let ws: WebSocket;
      try {
        ws = new WebSocket(url);
      } catch (err) {
        reject(new Error(`无法连接 ${url}：${err instanceof Error ? err.message : String(err)}`));
        return;
      }
      const c = new NetClient(ws);
      const timer = setTimeout(() => {
        ws.close();
        reject(new Error(`连接超时：${url}`));
      }, timeoutMs);
      ws.onerror = () => {
        clearTimeout(timer);
        reject(new Error(`无法连接服务器 ${url}（服务器是否已用 npm run server 启动？）`));
      };
      ws.onmessage = (ev) => {
        const m = parseMsg<ServerMsg>(ev.data);
        if (!m) return;
        if (m.type === 'welcome' && !c.id) {
          c.id = m.id;
          clearTimeout(timer);
          c.send({ type: 'hello', name, version: NET_VERSION });
          ws.onerror = null;
          resolve(c);
          return;
        }
        c.dispatch(m);
      };
      ws.onclose = () => {
        clearTimeout(timer);
        if (!c.closedByUs) c.on.close?.();
      };
    });
  }

  private dispatch(m: ServerMsg): void {
    switch (m.type) {
      case 'room':
        this.room = m.room;
        this.on.room?.(m.room);
        return;
      case 'start':
        this.on.start?.(m);
        return;
      case 'turn':
        this.on.turn?.(m.n, m.cmds);
        return;
      case 'error':
        this.on.error?.(m.msg);
        return;
      case 'desync':
        this.on.desync?.(m.turn);
        return;
      case 'left':
        this.on.left?.(m.name, m.seat);
        return;
      default:
        return;
    }
  }

  send(m: ClientMsg): void {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }

  create(): void {
    this.send({ type: 'create' });
  }
  join(code: string): void {
    this.send({ type: 'join', code });
  }
  sit(seat: number): void {
    this.send({ type: 'seat', seat });
  }
  start(): void {
    this.send({ type: 'start' });
  }
  command(cmd: Command): void {
    this.send({ type: 'cmd', cmd });
  }
  hash(turn: number, hash: number): void {
    this.send({ type: 'hash', turn, hash });
  }

  close(): void {
    this.closedByUs = true;
    this.send({ type: 'leave' });
    this.ws.close();
  }
}
