/**
 * Online lobby: connect to a relay, create / join a room by code, pick one of the 6 seats
 * (4 wardens + 2 hunters; empty seats are played by the AI), and let the host start.
 */
import type { Game } from '../game';
import { NetClient } from '../net/client';
import { DEFAULT_PORT, SEATS, type RoomState } from '../net/protocol';

const NAME_KEY = 'ashwood.netName';
const SERVER_KEY = 'ashwood.netServer';

function load(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode: just not remembered */
  }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** A relay address passed in the link (?server=wss://...), e.g. when shared through a tunnel. */
function linkServer(): string | null {
  try {
    const s = new URLSearchParams(location.search).get('server')?.trim();
    return s && /^wss?:\/\/\S+$/.test(s) ? s : null;
  } catch {
    return null;
  }
}

function defaultServer(): string {
  const host = location.hostname || 'localhost';
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${host}:${DEFAULT_PORT}`;
}

export class Lobby {
  private client: NetClient | null = null;
  private status = '';

  constructor(
    private game: Game,
    private back: () => void,
  ) {}

  open(): void {
    this.renderConnect();
  }

  private overlay(html: string): HTMLElement {
    this.game.hud.showOverlay(`<div class="lobby">${html}</div>`, 'night');
    return document.querySelector<HTMLElement>('#overlay .lobby')!;
  }

  private renderConnect(code = ''): void {
    const root = this.overlay(`
      <h2>联机对战</h2>
      <p class="lobby-sub">最多 6 人：4 名守夜人 + 2 头噬林魔。空位由 AI 补上。</p>
      <label>你的名字<input id="lb-name" maxlength="16" value="${esc(load(NAME_KEY, ''))}" placeholder="守夜人"></label>
      <label>服务器地址<input id="lb-server" value="${esc(linkServer() ?? load(SERVER_KEY, defaultServer()))}" spellcheck="false"></label>
      <div class="lobby-row">
        <button class="big" id="lb-create">创建房间</button>
      </div>
      <div class="lobby-row join">
        <input id="lb-code" maxlength="4" placeholder="房间号" value="${esc(code)}" spellcheck="false">
        <button class="ghost" id="lb-join">加入房间</button>
      </div>
      <p class="lobby-status" id="lb-status">${esc(this.status)}</p>
      <p class="lobby-hint">没有服务器？在游戏目录运行 <kbd>npm run server</kbd>，局域网好友连接 <code>ws://你的IP:${DEFAULT_PORT}</code>。</p>
      <button class="ghost" id="lb-back">返回</button>`);
    const val = (id: string) => (root.querySelector<HTMLInputElement>(`#${id}`)!.value ?? '').trim();
    const go = (join: boolean) => {
      const name = val('lb-name') || '守夜人';
      const server = val('lb-server') || defaultServer();
      const code = val('lb-code').toUpperCase();
      if (join && code.length !== 4) return this.setStatus('请输入 4 位房间号');
      save(NAME_KEY, name);
      save(SERVER_KEY, server);
      void this.connect(server, name, join ? code : null);
    };
    root.querySelector('#lb-create')!.addEventListener('click', () => go(false));
    root.querySelector('#lb-join')!.addEventListener('click', () => go(true));
    root.querySelector('#lb-code')!.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') go(true);
    });
    root.querySelector('#lb-back')!.addEventListener('click', () => {
      this.disconnect();
      this.back();
    });
  }

  private setStatus(text: string): void {
    this.status = text;
    const el = document.getElementById('lb-status');
    if (el) el.textContent = text;
  }

  private async connect(server: string, name: string, code: string | null): Promise<void> {
    this.setStatus('正在连接…');
    this.disconnect();
    let c: NetClient;
    try {
      c = await NetClient.connect(server, name);
    } catch (err) {
      this.setStatus(err instanceof Error ? err.message : String(err));
      return;
    }
    this.client = c;
    this.status = '';
    c.on.room = (room) => this.renderRoom(room);
    c.on.error = (msg) => {
      this.setStatus(msg);
      if (!c.room) this.renderConnect(code ?? '');
    };
    c.on.close = () => {
      this.client = null;
      this.status = '与服务器的连接已断开';
      this.renderConnect();
    };
    c.on.start = (m) => {
      this.client = null; // the game owns the connection from here on
      this.game.startNet(c, m, () => this.open());
    };
    if (code) c.join(code);
    else c.create();
  }

  private disconnect(): void {
    if (!this.client) return;
    this.client.on = {};
    this.client.close();
    this.client = null;
  }

  private renderRoom(room: RoomState): void {
    const c = this.client;
    if (!c) return;
    const nameOf = (id: number | null) => (id === null ? null : (room.members.find((m) => m.id === id)?.name ?? '玩家'));
    const isHost = room.host === room.you;
    const seats = SEATS.map((s, i) => {
      const who = room.seats[i];
      const mine = who === room.you;
      const name = nameOf(who);
      const cls = `seat ${s.faction}${mine ? ' mine' : ''}${who === null ? ' open' : ''}`;
      return `<button class="${cls}" data-seat="${i}" ${who !== null && !mine ? 'disabled' : ''}>
        <small>${s.label}</small>
        <b>${name ? esc(name) : 'AI 托管'}</b>
        <em>${mine ? '你' : who === null ? '点击入座' : who === room.host ? '房主' : ''}</em>
      </button>`;
    });
    const root = this.overlay(`
      <h2>房间 <span class="code">${esc(room.code)}</span></h2>
      <p class="lobby-sub">把房间号发给朋友。点击空位换座；空位开局时由 AI 控制。</p>
      <div class="seat-group"><h3>守夜人</h3><div class="seats">${seats.slice(0, 4).join('')}</div></div>
      <div class="seat-group hunters"><h3>噬林魔群</h3><div class="seats">${seats.slice(4).join('')}</div></div>
      <div class="lobby-row">
        ${isHost ? '<button class="big" id="lb-start">开始对局</button>' : '<p class="lobby-wait">等待房主开始…</p>'}
        <button class="ghost" id="lb-leave">离开房间</button>
      </div>
      <p class="lobby-status" id="lb-status">${esc(this.status)}</p>`);
    root.querySelectorAll<HTMLButtonElement>('.seat.open').forEach((b) => b.addEventListener('click', () => c.sit(Number(b.dataset.seat))));
    root.querySelector('#lb-start')?.addEventListener('click', () => c.start());
    root.querySelector('#lb-leave')!.addEventListener('click', () => {
      this.disconnect();
      this.renderConnect();
    });
  }
}
