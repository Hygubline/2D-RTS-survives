import { DT, MATCH, TILE } from './config/balance';
import type { Command } from './sim/commands';
import { issueCommand } from './sim/commands';
import { stepWorld } from './sim/step';
import type { EndReason, World } from './sim/types';
import { PHASES } from './config/lategame';
import { Perspective } from './render/perspective';
import { buildCost, buildingCenter, canPlace, checkBuild, createWorld, hunterUnits, spawnUnit } from './sim/world';
import { BUILDINGS, investedValue } from './config/balance';
import { nearestPassable } from './sim/pathfinding';
import { tileCenter } from './sim/grid';
import { Camera } from './render/camera';
import { Renderer, type ViewState } from './render/renderer';
import { Hud } from './ui/hud';
import { Input, type GameHost } from './ui/input';
import { Minimap } from './ui/minimap';
import { Sfx, soundFor, type Placement } from './audio/sfx';
import type { NetClient } from './net/client';
import { Lockstep } from './net/lockstep';
import { SEATS } from './net/protocol';

/** An online match: the relay connection plus the lockstep driver. */
export interface NetSession {
  client: NetClient;
  ls: Lockstep;
  /** called when the player leaves the finished/abandoned match */
  onExit: () => void;
}

/** how many ticks one frame may run to catch up after a hitch */
const MAX_CATCHUP = 24;

const HUD_TOP = 46;
const HUD_BOTTOM = 184;

export class Game implements GameHost {
  world: World;
  cam = new Camera();
  view: ViewState = { selection: new Set(), hoverId: 0, placement: null, placementLine: null, lastAlert: null, box: null, markers: [], pings: [], localPlayer: 0, persp: new Perspective() };
  canvas: HTMLCanvasElement;
  renderer: Renderer;
  hud = new Hud();
  sfx = new Sfx();
  input: Input;
  minimap: Minimap;
  paused = false;
  speed = 1;
  private acc = 0;
  private last = 0;
  private lastAlert = -99;
  private over = false;
  private running = false;
  private frameTimes: number[] = [];

  private seed: number;
  net: NetSession | null = null;
  /** the current world came from an online match */
  playedOnline = false;
  /** seat used by solo restarts: 0 = warden, 4 = hunter */
  soloSeat = 0;
  /** return to the title menu (set by main) */
  onMenu: () => void = () => {};

  constructor(seed: number) {
    this.seed = seed;
    this.canvas = document.getElementById('view') as HTMLCanvasElement;
    this.world = createWorld({ seed, humanControlled: true });
    this.renderer = new Renderer(this.canvas, this.world);
    this.input = new Input(this);
    this.hud.onAction = (a) => this.input.runAction(a);
    this.minimap = new Minimap(document.getElementById('minimap') as HTMLCanvasElement, () => this.world, this.cam, (x, y, shift) => this.input.moveTo(x, y, shift));
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.focusWarden();
  }

  /** Start a fresh match (used by restart). */
  /**
   * Start a fresh solo match. seat 0 = play the first warden (default); a hunter seat (4/5)
   * plays one beast of the pack against AI wardens and an AI packmate.
   */
  newMatch(seed: number, seat = this.soloSeat): void {
    this.leaveNet();
    this.playedOnline = false;
    this.soloSeat = seat;
    this.view.localPlayer = seat;
    this.seed = seed;
    this.world = seat === 0 ? createWorld({ seed, humanControlled: true }) : createWorld({ seed, humanControlled: false, humans: [seat], names: { [seat]: '你' } });
    this.renderer.setWorld(this.world);
    this.minimap.rebuild();
    this.view.selection.clear();
    this.view.markers = [];
    this.view.pings = [];
    this.over = false;
    this.paused = false;
    this.acc = 0;
    this.hud.hideOverlay();
    this.focusWarden();
    if (this.running) this.intro();
  }

  /** Opening tips for the role the local player is in. */
  private intro(): void {
    if (this.world.players[this.view.localPlayer].faction === 'hunter') {
      this.toast('你是噬林魔。50 秒后在巢穴苏醒——同伴灰鬃由 AI 操控，与你一起狩猎。', 'good');
      this.toast('右键地面移动，右键建筑或守夜人攻击；Q W E 释放技能，A S D F Z 用魂火购买装备。', 'info');
      return;
    }
    this.toast('寻找被树环包围的林间空地，在噬林魔苏醒前建好庇护所 (Z) 与琥珀泉 (Q)。', 'info');
    this.toast('用壁垒 (W) 与林门 (E) 封住空地缺口——林门只放行守夜人。', 'info');
  }

  private focusWarden(): void {
    const p = this.world.players[this.view.localPlayer];
    const u = this.world.units.get(p.unitId);
    if (p.faction === 'hunter' && (!u || !u.alive)) {
      // hunters wake at the lair
      this.cam.zoom = 1;
      this.cam.centerOn(tileCenter(this.world.lair.x), tileCenter(this.world.lair.y));
      this.view.selection.clear();
      return;
    }
    if (u) {
      this.cam.zoom = 1;
      this.cam.centerOn(u.x, u.y + 60);
      this.view.selection.clear();
      this.view.selection.add(u.id);
    }
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.resize(w, h);
    this.cam.resize(w, h);
  }

  issue(cmd: Command): void {
    if (this.net) this.net.client.command(cmd);
    else issueCommand(this.world, this.view.localPlayer, cmd);
  }

  /** Begin an online match from the relay's start message. */
  startNet(client: NetClient, m: { seed: number; humans: number[]; names: Record<number, string>; seat: number }, onExit: () => void): void {
    this.seed = m.seed;
    this.world = createWorld({ seed: m.seed, humanControlled: false, humans: m.humans, names: m.names });
    const ls = new Lockstep(this.world, (turn, hash) => client.hash(turn, hash));
    this.net = { client, ls, onExit };
    this.playedOnline = true;
    client.on.turn = (n, cmds) => ls.receive(n, cmds);
    client.on.desync = (turn) => this.toast(`联机状态不同步（回合 ${turn}）——请所有人使用同一浏览器版本，或重新开局`, 'bad');
    client.on.left = (name, seat) => this.toast(`${name} 离开了，${SEATS[seat]?.label ?? '该席位'}由 AI 接管`, 'warn');
    client.on.close = () => this.toast('与联机服务器的连接已断开', 'bad');
    this.view.localPlayer = m.seat;
    this.renderer.setWorld(this.world);
    this.minimap.rebuild();
    this.view.selection.clear();
    this.view.markers = [];
    this.view.pings = [];
    this.over = false;
    this.paused = false;
    this.speed = 1;
    this.acc = 0;
    this.hud.hideOverlay();
    this.focusWarden();
    const me = this.world.players[m.seat];
    this.start();
    this.toast(me.faction === 'hunter' ? '你是噬林魔。50 秒后在巢穴苏醒：右键移动/攻击，Q W E 释放技能，A S D F Z 购买装备。' : '你是守夜人。和队友一起在噬林魔苏醒前筑好营地！', 'good');
  }

  /** Close the online session (if any). */
  leaveNet(): void {
    if (!this.net) return;
    const n = this.net;
    this.net = null;
    n.client.on = {};
    n.client.close();
  }

  isOnline(): boolean {
    return !!this.net;
  }

  toast(text: string, tone: 'info' | 'warn' | 'bad' | 'good' = 'info'): void {
    this.hud.toast(text, tone);
  }

  togglePause(): void {
    if (this.over) return;
    if (this.net) {
      this.toast('联机对局中无法暂停', 'warn');
      return;
    }
    this.paused = !this.paused;
  }

  toggleMute(): void {
    this.sfx.setMuted(!this.sfx.muted);
    this.syncMuteButton();
    this.toast(this.sfx.muted ? '音效已关闭（M 开启）' : '音效已开启', 'info');
  }

  syncMuteButton(): void {
    const b = document.getElementById('btn-mute');
    if (!b) return;
    b.classList.toggle('off', this.sfx.muted);
    b.title = this.sfx.muted ? '开启音效 (M)' : '关闭音效 (M)';
  }

  isOver(): boolean {
    return this.over;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.renderer.warmup();
    this.intro();
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  }

  /** Advance the simulation by n ticks without rendering. */
  stepTicks(n: number): void {
    // online the relay paces the sim; stepping locally would desync this client
    if (this.net) return;
    for (let i = 0; i < n && !this.world.winner; i++) {
      stepWorld(this.world);
      this.drainEvents();
    }
  }

  /** Lockstep pacing: run the ticks whose turns have arrived, catching up when behind. */
  private stepNet(dt: number): void {
    const ls = this.net!.ls;
    this.acc += dt;
    let steps = 0;
    // normal pace, plus catch-up when the relay is ahead of us (e.g. after a tab hitch)
    while (steps < MAX_CATCHUP && (this.acc >= DT || ls.backlog() > 4)) {
      if (!ls.step()) break;
      this.drainEvents(steps < 4);
      this.acc = Math.max(0, this.acc - DT);
      steps++;
    }
    // waiting for the relay: don't bank time, or we would sprint once turns arrive
    if (ls.backlog() <= 0) this.acc = Math.min(this.acc, DT);
  }

  /** Stereo placement for a world point the player can currently see on screen. */
  private soundPlace(x: number, y: number): Placement | null {
    if (!this.view.persp.visibleAt(this.world, x, y)) return null;
    const p = this.cam.toScreen(x, y);
    if (p.x < -40 || p.y < -40 || p.x > this.cam.viewW + 40 || p.y > this.cam.viewH + 40) return null;
    return { pan: ((p.x / Math.max(1, this.cam.viewW)) * 2 - 1) * 0.7, gain: 1 };
  }

  /** @param audible false while fast-forwarding, so skipped time stays silent */
  private drainEvents(audible = false): void {
    const w = this.world;
    const me = this.view.localPlayer;
    const sv = { me, place: (x: number, y: number) => this.soundPlace(x, y) };
    for (const e of w.events) {
      if (audible) {
        const cue = soundFor(e, sv);
        if (cue) this.sfx.play(cue.name, cue.at);
      }
      this.renderer.fx.onEvent(
        e,
        (x, y) => this.view.persp.visibleAt(w, x, y),
        (x, y) => {
          const p = this.cam.toScreen(x, y);
          return p.x > -60 && p.y > -60 && p.x < this.cam.viewW + 60 && p.y < this.cam.viewH + 60;
        },
      );
      if (e.e === 'hit' && !e.onBuilding && e.source !== 'burn') this.renderer.noteHit(e.id);
      if (e.e === 'banner') this.hud.banner(e.text, e.sub, e.tone);
      if (e.e === 'msg' && e.player === me) this.toast(e.text, e.tone);
      if (e.e === 'alert' && w.players[e.player].faction === 'survivor') {
        this.view.pings.push({ x: e.x, y: e.y, t: 0, color: e.player === me ? '#ff4a3a' : '#ffb03a' });
        if (e.player === me) this.view.lastAlert = { x: e.x, y: e.y, t: w.time };
        if (e.player === me && w.time - this.lastAlert > 8) {
          this.lastAlert = w.time;
          this.toast('你的基地正遭受攻击！（Backspace 跳转）', 'bad');
        }
      }
      if (e.e === 'built' && e.owner === me && e.btype === 'shelter') this.toast('闪烁的金色虚线格是空地缺口——用壁垒 (W) / 林门 (E) 封住它们，可按住左键拖拽成线。', 'good');
      if (e.e === 'gameover') this.gameOver(e.winner, e.reason);
    }
    w.events.length = 0;
  }

  private gameOver(winner: 'survivor' | 'hunter', endReason: EndReason): void {
    this.over = true;
    const w = this.world;
    const me = w.players[this.view.localPlayer];
    const asHunter = me.faction === 'hunter';
    const win = winner === me.faction;
    const pack = w.hunterPlayerIds.map((id) => w.players[id]);
    const wardens = w.players.filter((p) => p.faction === 'survivor');
    const sum = (f: (p: (typeof w.players)[number]) => number) => pack.reduce((a, p) => a + f(p), 0);
    const reasonW = { altar: '破晓之光自祭坛升起，噬林魔化为灰烬。', hunterSlain: '你们由守转攻，亲手终结了噬林魔。', dawn: '黎明降临，烬林重归寂静。', wardensFell: '最后一盏灯火熄灭了……' }[endReason];
    const reasonH = { altar: '破晓之光自祭坛升起，你们化为灰烬。', hunterSlain: '守夜人由守转攻，终结了整个兽群。', dawn: '黎明降临，狩猎之夜结束了。', wardensFell: '最后一盏灯火熄灭，烬林归于兽群。' }[endReason];
    const reason = asHunter ? reasonH : reasonW;
    const reasonTag = { altar: '祭坛胜利', hunterSlain: '猎杀胜利', dawn: '黎明胜利', wardensFell: '全员倒下' }[endReason];
    const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
    const stat = (v: string | number, label: string) => `<div class="es"><b>${v}</b><span>${label}</span></div>`;
    this.hud.showOverlay(
      `<div class="end-screen ${win ? 'win' : 'lose'}">
      <p class="kicker">${reasonTag} · ${fmt(w.time)}</p>
      <h1>${asHunter ? (win ? '狩猎成功' : '兽群溃散') : win ? '守夜成功' : '烬林陷落'}</h1>
      <p class="sub">${reason}</p>
      ${this.timeline(w.time, win)}
      <div class="end-cols">
        ${asHunter ? this.hunterColumn(me, '你的狩猎', stat) : `<section><h3>你的守夜</h3><div class="es-grid">
          ${stat(Math.floor(me.totalEarned).toLocaleString(), '获得琥珀')}
          ${stat(Math.round(me.stats.hunterDamage).toLocaleString(), '对噬林魔伤害')}
          ${stat(me.stats.armyTrained, '招募军团')}
          ${stat(me.deaths, '阵亡次数')}
        </div></section>`}
        ${asHunter
          ? `<section class="foe"><h3>守夜人</h3><div class="es-grid">
          ${stat(Math.floor(wardens.reduce((a, p) => a + p.totalEarned, 0)).toLocaleString(), '琥珀总计')}
          ${stat(Math.round(wardens.reduce((a, p) => a + p.stats.hunterDamage, 0)).toLocaleString(), '对兽群伤害')}
          ${stat(wardens.reduce((a, p) => a + p.deaths, 0), '阵亡次数')}
          ${stat(wardens.filter((p) => p.lives > 0).length, '存活守夜人')}
        </div></section>`
          : `<section class="foe"><h3>噬林魔群</h3><div class="es-grid">
          ${stat(pack.map((p) => `Lv${p.hunter!.level}`).join(' · '), pack.some((p) => p.hunter!.evolved) ? '最终等级 · 含巨兽' : '最终等级')}
          ${stat(sum((p) => MATCH.hunterLives - p.hunter!.lives), '被击倒')}
          ${stat(sum((p) => p.hunter!.kills), '击杀守夜人')}
          ${stat(sum((p) => p.hunter!.buildingsDestroyed), '摧毁建筑')}
        </div></section>`}
      </div>
      <div class="actions">${
        this.net
          ? '<button class="big" id="btn-lobby">返回联机大厅</button>'
          : `<button class="big" id="btn-restart">${asHunter ? '再猎一夜' : '再守一夜'}</button><button class="ghost" id="btn-retry">同一片林地再战</button><button class="ghost" id="btn-menu">主菜单</button>`
      }</div>
      <p class="seed">地图种子 ${this.seed}</p>
    </div>`,
      win ? 'dawn' : 'ash',
    );
    if (this.net) {
      const exit = this.net.onExit;
      document.getElementById('btn-lobby')!.addEventListener('click', () => {
        this.leaveNet();
        exit();
      });
      return;
    }
    document.getElementById('btn-restart')!.addEventListener('click', () => this.newMatch((Math.random() * 1e9) | 0));
    document.getElementById('btn-retry')!.addEventListener('click', () => this.newMatch(this.seed));
    document.getElementById('btn-menu')!.addEventListener('click', () => this.onMenu());
  }

  private hunterColumn(p: (typeof this.world.players)[number], title: string, stat: (v: string | number, label: string) => string): string {
    const h = p.hunter!;
    return `<section><h3>${title}</h3><div class="es-grid">
          ${stat(`Lv${h.level}`, h.evolved ? '最终形态 · 巨兽' : '最终等级')}
          ${stat(h.kills, '击杀守夜人')}
          ${stat(h.buildingsDestroyed, '摧毁建筑')}
          ${stat(Math.floor(h.totalSoulfire).toLocaleString(), '获得魂火')}
        </div></section>`;
  }

  /** Match timeline: phase bands, milestones and where this night ended. */
  private timeline(end: number, win: boolean): string {
    const total = MATCH.surviveSeconds;
    const pct = (t: number) => `${((Math.min(t, total) / total) * 100).toFixed(2)}%`;
    const bands = [
      ['early', 0, PHASES.midAt, '逃亡'],
      ['mid', PHASES.midAt, PHASES.lateAt, '坚守'],
      ['late', PHASES.lateAt, PHASES.bloodMoonAt, '反攻'],
      ['moon', PHASES.bloodMoonAt, total, '血月'],
    ] as const;
    const marks = [
      [PHASES.altarUnlockAt, '祭坛'],
      [PHASES.bloodMoonAt, '血月'],
    ] as const;
    return `<div class="timeline">
      <div class="tl-track">${bands.map(([k, a, b, n]) => `<div class="tl-band ${k}${end >= a ? ' reached' : ''}" style="left:${pct(a)};width:calc(${pct(b)} - ${pct(a)})"><span>${n}</span></div>`).join('')}
        <div class="tl-fill" style="width:${pct(end)}"></div>
        ${marks.map(([t, n]) => `<div class="tl-mark" style="left:${pct(t)}"><small>${n}</small></div>`).join('')}
        <div class="tl-end ${win ? 'win' : 'lose'}" style="left:${pct(end)}"><b>${Math.floor(end / 60)}:${String(Math.floor(end % 60)).padStart(2, '0')}</b></div>
      </div>
      <div class="tl-axis"><span>0:00</span><span>黎明 ${total / 60}:00</span></div>
    </div>`;
  }

  private frame(now: number): void {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.frameTimes.push(dt);
    if (this.frameTimes.length > 120) this.frameTimes.shift();
    this.input.update(dt);
    if (this.net && !this.over) {
      this.stepNet(dt);
      this.renderer.fx.update(dt);
    } else if (!this.paused && !this.over) {
      this.acc += dt * this.speed;
      let steps = 0;
      while (this.acc >= DT && steps < 8) {
        stepWorld(this.world);
        this.drainEvents(true);
        this.acc -= DT;
        steps++;
      }
      if (steps >= 8) this.acc = 0;
      this.renderer.fx.update(dt);
    }
    for (const m of this.view.markers) m.t += dt;
    this.view.markers = this.view.markers.filter((m) => m.t < 0.6);
    for (const p of this.view.pings) p.t += dt;
    this.view.pings = this.view.pings.filter((p) => p.t < 4);
    const alpha = this.paused ? 1 : this.acc / DT;
    this.updateCamera(dt, alpha);
    if (!this.hud.coversView()) {
      this.view.persp.sync(this.world, this.view.localPlayer);
      this.renderer.render(this.cam, alpha, this.view, dt);
      this.minimap.draw(this.view.pings, this.view.localPlayer, this.view.persp);
      this.hud.update(this.world, this.view.localPlayer, this.input.selected(), this.input.mode.kind, this.paused);
      this.hud.placeTip(this.placementInfo());
    }
    requestAnimationFrame((t) => this.frame(t));
  }

  /** Smooth zoom, then (in follow mode) keep the local unit centred at its interpolated, drawn position. */
  private updateCamera(dt: number, alpha: number): void {
    this.cam.updateZoom(dt);
    if (!this.cam.follow) return;
    const u = this.world.units.get(this.world.players[this.view.localPlayer].unitId);
    if (!u || !u.alive) return;
    this.cam.track(u.px + (u.x - u.px) * alpha, u.py + (u.y - u.py) * alpha, dt);
  }

  /** What the build ghost should say: name, cost, count for drag lines, and why it is blocked. */
  private placementInfo(): Parameters<Hud['placeTip']>[0] {
    const pl = this.view.placement;
    if (this.input.mode.kind !== 'place' || !pl) return null;
    const w = this.world;
    const p = w.players[this.view.localPlayer];
    const def = BUILDINGS[pl.btype];
    const line = this.view.placementLine && this.view.placementLine.length > 1 ? this.view.placementLine : null;
    const tiles = line ?? [{ x: pl.tx, y: pl.ty }];
    const ok = tiles.every((t) => canPlace(w, pl.btype, t.x, t.y));
    const reason = checkBuild(w, p, pl.btype) ?? (ok ? null : line ? '部分位置被阻挡' : '此处无法建造');
    const anchor = this.cam.toScreen((pl.tx + def.size) * TILE + 6, pl.ty * TILE);
    return { x: anchor.x, y: anchor.y, name: def.name, cost: buildCost(w, p, pl.btype), count: tiles.length, ok, reason };
  }

  fps(): number {
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / Math.max(1, this.frameTimes.length);
    return avg > 0 ? 1 / avg : 0;
  }

  /**
   * Developer phase jump: rebuild the match and let the AI play the local warden (with the chosen
   * late route) up to the target minute, then hand control back. Tries several seeds; if every
   * simulated match is decided early, the deterministic sim replays the longest one up to 30 s
   * before its decisive moment, so the player always receives a live late-game position.
   */
  jumpTo(minutes: number, route: string, baseSeed: number): { seed: number; time: number; note: string } {
    if (this.net) return { seed: this.seed, time: this.world.time, note: '联机对局中不可跳转' };
    const target = Math.min(minutes * 60, PHASES.dawnAt - 30);
    const simulate = (seed: number, until: number): World => {
      const w = createWorld({ seed, humanControlled: true });
      w.players[0].isAI = true;
      w.players[0].strategy = route;
      while (!w.winner && w.time < until) {
        stepWorld(w);
        w.events.length = 0;
      }
      return w;
    };
    // a "typical" state: match undecided and the player's own base still standing
    const health = (w: World): number => {
      if (w.winner) return -1;
      const mine = [...w.buildings.values()].filter((b) => b.owner === 0);
      // still undecided beats any decided fallback, even without a shelter (the jump revives the warden)
      if (!mine.some((b) => b.btype === 'shelter')) return 1;
      return mine.reduce((v, b) => v + investedValue(b.btype, b.level), 0) + w.players[0].lives * 500;
    };
    let chosen: World | null = null;
    let chosenSeed = baseSeed;
    let chosenScore = 0;
    let best = { seed: baseSeed, end: 0 };
    for (let attempt = 0; attempt < 8; attempt++) {
      const seed = baseSeed + attempt * 101;
      const w = simulate(seed, target);
      const score = health(w);
      if (score > chosenScore) {
        chosen = w;
        chosenSeed = seed;
        chosenScore = score;
      } else if (w.winner && w.time > best.end) best = { seed, end: w.time };
      // good enough: stop early to keep the jump fast
      if (chosenScore > 2500 + minutes * 600) break;
    }
    let note = '';
    if (!chosen) {
      chosenSeed = best.seed;
      chosen = simulate(best.seed, Math.max(60, best.end - 30));
      note = `（各种子均在 ${minutes} 分钟前分出胜负，已载入决胜前 30 秒的局面）`;
    }
    const w = chosen;
    w.players[0].isAI = false;
    const me = w.players[0];
    const u = w.units.get(me.unitId);
    if (!u || !u.alive) {
      // dev assist: hand the player a living warden even if the AI lost it
      const t = nearestPassable(w.grid, w.plaza.x, w.plaza.y, 'survivor', 10) ?? w.plaza;
      const nu = spawnUnit(w, 'survivor', 0, tileCenter(t.x), tileCenter(t.y));
      me.unitId = nu.id;
      me.lives = Math.max(1, me.lives);
      note += '（已为你复活守夜人）';
    }
    this.world = w;
    this.renderer.setWorld(w);
    this.minimap.rebuild();
    this.view.selection.clear();
    this.view.markers = [];
    this.view.pings = [];
    this.over = false;
    this.paused = false;
    this.acc = 0;
    this.hud.hideOverlay();
    this.focusWarden();
    this.start();
    this.toast(`开发者跳转：第 ${minutes} 分钟 · 路线 ${route} · 种子 ${chosenSeed}${note}`, 'good');
    return { seed: chosenSeed, time: w.time, note };
  }

  /** Debug / test hooks (used by Playwright playtests). */
  debugApi() {
    return {
      fastForward: (sec: number) => this.stepTicks(Math.round(sec / DT)),
      addAmber: (n: number) => {
        this.world.players[0].amber += n;
      },
      state: () => {
        const w = this.world;
        const me = w.players[0];
        const u = w.units.get(me.unitId);
        const hu = hunterUnits(w)[0];
        return {
          time: w.time,
          amber: me.amber,
          lives: me.lives,
          winner: w.winner,
          fps: this.fps(),
          unit: u && u.alive ? { id: u.id, x: u.x, y: u.y, orders: u.orders.length, hp: u.hp } : null,
          hunter: hu && hu.alive ? { x: hu.x, y: hu.y, hp: hu.hp, level: w.players[hu.owner].hunter!.level } : null,
          myBuildings: [...w.buildings.values()].filter((b) => b.owner === 0).map((b) => ({ id: b.id, btype: b.btype, level: b.level, constructing: b.constructing, hp: b.hp, tx: b.tx, ty: b.ty })),
          selection: [...this.view.selection],
          groves: w.groves.map((g) => ({ cx: g.cx, cy: g.cy, r: g.r, claimedBy: g.claimedBy, gaps: g.gaps })),
          camera: { x: this.cam.x, y: this.cam.y, zoom: this.cam.zoom },
        };
      },
      worldToScreen: (x: number, y: number) => this.cam.toScreen(x, y),
      tileToScreen: (tx: number, ty: number) => this.cam.toScreen((tx + 0.5) * TILE, (ty + 0.5) * TILE),
      centerOn: (x: number, y: number) => {
        this.cam.follow = false; // a manual jump, like a minimap click
        this.cam.centerOn(x, y);
      },
      buildingScreen: (id: number) => {
        const b = this.world.buildings.get(id);
        if (!b) return null;
        const c = buildingCenter(b);
        return this.cam.toScreen(c.x, c.y);
      },
      setSpeed: (s: number) => (this.speed = s),
      jumpTo: (min: number, route = 'legion', seed = 1000) => this.jumpTo(min, route, seed),
      killHunter: () => {
        for (const h of hunterUnits(this.world)) h.hp = 1;
      },
      select: (ids: number[]) => {
        this.view.selection.clear();
        for (const id of ids) this.view.selection.add(id);
      },
      world: () => this.world,
      hudTop: HUD_TOP,
      hudBottom: HUD_BOTTOM,
    };
  }
}
