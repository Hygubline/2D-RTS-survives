import { Game } from './game';
import { MATCH } from './config/balance';
import { addHunterXp } from './sim/world';
import { Lobby } from './ui/lobby';

declare global {
  interface Window {
    __game?: Game;
    __debug?: ReturnType<Game['debugApi']>;
  }
}

const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed')) || ((Math.random() * 1e9) | 0);
const game = new Game(seed);
window.__game = game;
window.__debug = game.debugApi();

const HELP = `
<div class="help-grid">
  <div><h3>基本操作</h3>
    <p><kbd>左键</kbd> 选择 / 拖拽框选　<kbd>双击</kbd> 选择屏幕内同类建筑</p>
    <p><kbd>右键</kbd> 移动 · 攻击噬林魔 · 修理受损建筑</p>
    <p><kbd>Shift</kbd>+指令 加入队列；放置建筑时按住 Shift 连续建造</p>
    <p>壁垒/林门可<b>按住左键拖拽</b>一次画出整段</p>
    <p><kbd>空格</kbd> 定位守夜人　<kbd>H</kbd> 庇护所　<kbd>Backspace</kbd> 跳到遇袭处</p>
    <p><kbd>Ctrl+数字</kbd> 编队　<kbd>滚轮</kbd> 缩放　<kbd>P</kbd> 暂停　<kbd>M</kbd> 音效开关</p>
  </div>
  <div><h3>指令快捷键</h3>
    <p><kbd>Q</kbd>琥珀泉 <kbd>W</kbd>壁垒 <kbd>E</kbd>林门 <kbd>R</kbd>弩塔</p>
    <p><kbd>A</kbd>霜塔 <kbd>S</kbd>焰矛塔 <kbd>D</kbd>愈泉 <kbd>F</kbd>书阁</p>
    <p><kbd>Z</kbd>庇护所 <kbd>X</kbd>兵营 <kbd>C</kbd>破晓祭坛 <kbd>V</kbd>停止</p>
    <p>选中建筑：<kbd>Q</kbd>升级 <kbd>W</kbd>修理 <kbd>E</kbd>取消 <kbd>V</kbd>拆除</p>
    <p>兵营：<kbd>A</kbd>游侠 <kbd>S</kbd>林卫，右键设集结点；军团：<kbd>Q</kbd>攻击移动</p>
  </div>
  <div><h3>求生法则</h3>
    <p>琥珀泉等级越高收入呈指数增长，但每次升级都要承担被打断的风险。</p>
    <p>壁垒的本质是买时间；壁垒后的塔在噬林魔破墙时持续输出。</p>
    <p>噬林魔打建筑、杀守夜人都会变强。基地被破就撤退，去空地重建。</p>
    <p>塔每到特定等级会<b>质变</b>（连弩、冰封、灼魂、陨火……）。后期招募军团主动出击。</p>
    <p>15:00 可建破晓祭坛，守住 90 秒即胜；18:00 血月升起，双方不再复活。坚守 ${MATCH.surviveSeconds / 60} 分钟、或把两头噬林魔各击倒 ${MATCH.hunterLives} 次亦可获胜。</p>
  </div>
</div>`;

const ARC = [
  { n: '壹', name: '逃亡', time: '0 – 5 分', text: '寻一片林间空地，在噬林魔苏醒前封墙、种下琥珀泉。' },
  { n: '贰', name: '坚守', time: '5 – 15 分', text: '经济指数成长，塔在特定等级质变；破墙就撤，换地重建。' },
  { n: '叁', name: '反攻', time: '15 分 +', text: '兵营出兵、点亮破晓祭坛，在血月之下终结噬林魔。' },
];

function showStart(): void {
  game.hud.showOverlay(
    `<div class="title-screen">
    <div class="crest"></div>
    <h1>烬林守夜</h1>
    <p class="sub">ASHWOOD VIGIL</p>
    <p class="tagline">四位守夜人，两头越杀越强的噬林魔。<br>熬过这一夜。</p>
    <div class="arc">${ARC.map((a) => `<div class="arc-step"><i>${a.n}</i><b>${a.name}</b><small>${a.time}</small><p>${a.text}</p></div>`).join('<span class="arc-link"></span>')}</div>
    <div class="wins"><span>胜利条件</span><em>坚守至黎明 ${MATCH.surviveSeconds / 60}:00</em><em>破晓祭坛充能 90 秒</em><em>击倒两头噬林魔（各 ${MATCH.hunterLives} 条命）</em></div>
    <div class="roles">
      <button class="role warden" id="btn-start"><i></i><b>守夜人</b><span>点燃灯火，开始守夜</span><small>筑墙 · 种琥珀泉 · 与 3 名 AI 守夜人熬到黎明</small></button>
      <button class="role hunter" id="btn-hunt"><i></i><b>噬林魔</b><span>苏醒吧，开始狩猎</span><small>与 AI 同伴灰鬃一起撕开 4 座营地</small></button>
    </div>
    <div class="actions">
      <button class="ghost" id="btn-online">联机对战</button>
      <button class="ghost" id="btn-manual">守夜手册</button>
    </div>
    <p class="quickkeys"><kbd>空格</kbd> 定位守夜人 <kbd>右键</kbd> 移动 <kbd>Q</kbd> 琥珀泉 <kbd>W</kbd> 壁垒 <kbd>E</kbd> 林门 <kbd>R</kbd> 弩塔</p>
    <p class="seed">地图种子 ${seed}</p>
  </div>`,
    'night',
  );
  document.getElementById('btn-hunt')!.addEventListener('click', () => {
    game.newMatch(game.isOver() || game.playedOnline ? (Math.random() * 1e9) | 0 : seed, 4);
    game.hud.hideOverlay();
    game.start();
  });
  document.getElementById('btn-start')!.addEventListener('click', () => {
    // fresh warden night unless the untouched opening world is still waiting
    if (game.playedOnline || game.soloSeat !== 0 || game.isOver() || game.world.time > 0) game.newMatch(game.isOver() || game.playedOnline ? (Math.random() * 1e9) | 0 : seed, 0);
    game.hud.hideOverlay();
    game.start();
  });
  document.getElementById('btn-online')!.addEventListener('click', () => new Lobby(game, showStart).open());
  document.getElementById('btn-manual')!.addEventListener('click', () => {
    game.hud.showOverlay(`<div class="panel help"><h2>守夜手册</h2>${HELP}<button class="big" id="btn-back">合上手册</button></div>`, 'night');
    document.getElementById('btn-back')!.addEventListener('click', showStart);
  });
}

document.getElementById('btn-mute')!.addEventListener('click', () => game.toggleMute());
game.syncMuteButton();
// browsers only allow audio after a user gesture; UI buttons also get a soft click
const unlockAudio = (): void => game.sfx.unlock();
window.addEventListener('pointerdown', unlockAudio);
window.addEventListener('keydown', unlockAudio);
document.addEventListener('click', (e) => {
  if ((e.target as HTMLElement | null)?.closest('button')) game.sfx.play('click');
});

game.onMenu = showStart;
document.getElementById('btn-menu')!.addEventListener('click', openGameMenu);

/** In-game menu: pauses a solo match; online it only offers leaving. */
function openGameMenu(): void {
  if (game.isOver()) return showStart();
  const online = game.isOnline();
  const wasPaused = game.paused;
  if (!online) game.paused = true;
  const hunter = game.world.players[game.view.localPlayer].faction === 'hunter';
  game.hud.showOverlay(
    `<div class="panel game-menu"><h2>菜单</h2>
      <button class="big" id="gm-resume">继续</button>
      ${online ? '' : `<button class="ghost" id="gm-restart">重新开始（${hunter ? '噬林魔' : '守夜人'}）</button><button class="ghost" id="gm-swap">改玩${hunter ? '守夜人' : '噬林魔'}</button>`}
      <button class="ghost" id="gm-help">守夜手册</button>
      <button class="ghost" id="gm-quit">${online ? '离开联机对局' : '返回主菜单'}</button>
    </div>`,
  );
  const on = (id: string, fn: () => void) => document.getElementById(id)?.addEventListener('click', fn);
  on('gm-resume', () => {
    game.hud.hideOverlay();
    game.paused = wasPaused;
  });
  on('gm-restart', () => game.newMatch((Math.random() * 1e9) | 0));
  on('gm-swap', () => game.newMatch((Math.random() * 1e9) | 0, hunter ? 0 : 4));
  on('gm-help', () => {
    game.hud.showOverlay(`<div class="panel help"><h2>守夜手册</h2>${HELP}<button class="big" id="btn-close-help">返回菜单</button></div>`);
    document.getElementById('btn-close-help')!.addEventListener('click', openGameMenu);
  });
  on('gm-quit', () => {
    game.leaveNet();
    game.paused = true;
    showStart();
  });
}

document.getElementById('btn-pause')!.addEventListener('click', () => game.togglePause());
document.getElementById('btn-help')!.addEventListener('click', () => {
  if (!game.isOver()) game.paused = true;
  game.hud.showOverlay(`<div class="panel help"><h2>守夜手册</h2>${HELP}<button class="big" id="btn-close-help">继续</button></div>`);
  document.getElementById('btn-close-help')!.addEventListener('click', () => {
    game.hud.hideOverlay();
    game.paused = false;
  });
});

showStart();

// ---------------- developer phase jump ----------------
const dev = document.getElementById('devpanel')!;
const devStatus = document.getElementById('dev-status')!;
const devRoute = document.getElementById('dev-route') as HTMLSelectElement;
function runJump(min: number, route: string): void {
  devStatus.textContent = `正在模拟到第 ${min} 分钟…`;
  // let the status paint before the synchronous simulation runs
  setTimeout(() => {
    const t0 = performance.now();
    const r = game.jumpTo(min, route, seed);
    devStatus.textContent = r.note === 'failed' ? '跳转失败' : `已到 ${Math.floor(r.time / 60)}:${String(Math.floor(r.time % 60)).padStart(2, '0')} · 种子 ${r.seed} · ${Math.round(performance.now() - t0)}ms`;
  }, 30);
}
if (params.get('dev') === '1' || params.has('jump')) dev.hidden = false;
window.addEventListener('keydown', (e) => {
  if (e.key === 'F8') {
    e.preventDefault();
    dev.hidden = !dev.hidden;
  }
});
dev.querySelectorAll<HTMLButtonElement>('button[data-jump]').forEach((b) => b.addEventListener('click', () => runJump(Number(b.dataset.jump), devRoute.value)));
document.getElementById('dev-amber')!.addEventListener('click', () => (game.world.players[0].amber += 5000));
document.getElementById('dev-reveal')!.addEventListener('click', () => game.world.vision.fill(1));
document.getElementById('dev-hlv')!.addEventListener('click', () => {
  const w = game.world;
  for (const id of w.hunterPlayerIds) for (let i = 0; i < 3; i++) addHunterXp(w, id, 60 + 45 * w.players[id].hunter!.level);
});
if (params.has('jump')) {
  const route = params.get('route') ?? 'legion';
  devRoute.value = route;
  game.hud.hideOverlay();
  runJump(Number(params.get('jump')), route);
}
