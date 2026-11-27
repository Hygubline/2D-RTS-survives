import { BUILDINGS, HUNTER, ITEM_SLOTS, ITEMS, MATCH, STRATEGIES, TILE } from '../config/balance';
import { isArmy, type Building, type Entity, type Player, type Unit, type World } from '../sim/types';
import { ARMY, ARMY_RULES, EVOLUTION, HUNTER_SKILLS, PHASES, perkAt, type HunterSkill } from '../config/lategame';
import { skillRank } from '../sim/hunterSkills';
import { armyCap, armyCount, playerIncome, playerRawIncome, unitStats } from '../sim/world';
import { buildingSprite, PAD, TOP } from '../render/buildingSprites';
import { drawGuard, drawHunter, drawRanger, drawSurvivor } from '../render/unitSprites';
import { cardFor, type CardButton } from './commands';
import { ICONS } from './icons';
import { chipify } from './statIcons';
import { Backdrop, type SceneMode } from './backdrop';
import { objectives } from './objectives';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

function fmtTime(s: number): string {
  s = Math.max(0, Math.ceil(s));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const ITEM_ICON: Record<string, string> = { claws: ICONS.claws, hide: ICONS.hide, striders: ICONS.striders, heart: ICONS.heartItem, horn: ICONS.horn };

export class Hud {
  private cardEls: HTMLButtonElement[] = [];
  private cardSig = '';
  private infoSig = '';
  private portrait: HTMLCanvasElement;
  private pctx: CanvasRenderingContext2D;
  private tooltip = $('tooltip');
  private msgBox = $('msgs');
  onAction: (a: string) => void = () => {};

  constructor() {
    const card = $('card');
    card.innerHTML = '';
    for (let i = 0; i < 12; i++) {
      const b = document.createElement('button');
      b.className = 'cmd empty';
      b.dataset.idx = String(i);
      b.addEventListener('click', () => {
        const a = b.dataset.action;
        if (a) this.onAction(a);
      });
      b.addEventListener('mouseenter', () => this.showTip(b));
      b.addEventListener('mouseleave', () => (this.tooltip.style.display = 'none'));
      card.appendChild(b);
      this.cardEls.push(b);
    }
    this.portrait = $<HTMLCanvasElement>('portrait');
    this.pctx = this.portrait.getContext('2d')!;
    $('ico-amber').innerHTML = ICONS.amber;
    $('ico-income').innerHTML = ICONS.income;
    $('ico-lives').innerHTML = ICONS.heart;
    $('ico-tech').innerHTML = ICONS.tech;
    $('ico-time').innerHTML = ICONS.moon;
    $('ico-hunter').innerHTML = ICONS.skull;
  }

  private tips = new Map<HTMLButtonElement, CardButton>();
  private showTip(b: HTMLButtonElement): void {
    const c = this.tips.get(b);
    if (!c) return;
    this.tooltip.innerHTML = `<div class="tt-title">${c.label} <span class="tt-key">[${c.key}]</span></div>${c.cost !== undefined ? `<div class="tt-cost">${ICONS.amber}<b>${c.cost}</b></div>` : ''}<div class="tt-desc">${c.desc}</div>${!c.enabled && c.reason ? `<div class="tt-bad">${c.reason}</div>` : ''}`;
    const r = b.getBoundingClientRect();
    this.tooltip.style.display = 'block';
    const tw = this.tooltip.offsetWidth;
    this.tooltip.style.left = `${Math.min(window.innerWidth - tw - 8, r.right - tw)}px`;
    this.tooltip.style.top = `${r.top - this.tooltip.offsetHeight - 8}px`;
  }

  toast(text: string, tone: 'info' | 'warn' | 'bad' | 'good' = 'info'): void {
    const last = this.msgBox.lastElementChild as HTMLElement | null;
    if (last && last.dataset.text === text) {
      last.dataset.n = String(Number(last.dataset.n ?? 1) + 1);
      last.querySelector('.n')!.textContent = `×${last.dataset.n}`;
      last.style.animation = 'none';
      void last.offsetWidth;
      last.style.animation = '';
      return;
    }
    const d = document.createElement('div');
    d.className = `msg ${tone}`;
    d.dataset.text = text;
    d.innerHTML = `<span>${text}</span><span class="n"></span>`;
    this.msgBox.appendChild(d);
    while (this.msgBox.children.length > 6) this.msgBox.firstElementChild?.remove();
    setTimeout(() => d.remove(), 6000);
  }

  private faction = '';
  /** Swap the four top-left medallions between the warden and the hunter economy. */
  private setFactionLabels(faction: string): void {
    if (faction === this.faction) return;
    this.faction = faction;
    const hunter = faction === 'hunter';
    const label = (cls: string, text: string, title: string) => {
      const el = document.querySelector<HTMLElement>(`.res.${cls}`)!;
      el.querySelector('small')!.textContent = text;
      el.title = title;
    };
    label('amber', hunter ? '魂火' : '琥珀', hunter ? '魂火：在巢穴商店购买装备' : '琥珀：建造与升级的唯一资源');
    label('income', hunter ? '等级 · 经验' : '收入 / 秒', hunter ? '等级越高，技能越强' : '每秒收入');
    label('lives', '生命', '剩余生命');
    label('tech', hunter ? '嗅觉' : '书阁', hunter ? '下次嗅到全部守夜人的倒计时' : '书阁科技等级');
    $('ico-amber').innerHTML = hunter ? ICONS.roar : ICONS.amber;
    $('ico-tech').innerHTML = hunter ? ICONS.pounce : ICONS.tech;
    document.body.classList.toggle('as-hunter', hunter);
  }

  update(world: World, me: number, sel: Entity[], mode: string, paused: boolean): void {
    const p = world.players[me];
    this.setFactionLabels(p.faction);
    if (p.faction === 'hunter') this.updateTopHunter(world, p);
    else this.updateTopWarden(world, me);
    $('v-time').textContent = fmtTime(MATCH.surviveSeconds - world.time);
    const t = world.time;
    const phase = world.bloodMoon ? ['血月决战', 'moon'] : t < PHASES.midAt ? ['前期 · 逃亡', 'early'] : t < PHASES.lateAt ? ['中期 · 坚守', 'mid'] : ['后期 · 反攻', 'late'];
    const nextMs = t < PHASES.altarUnlockAt ? `祭坛 ${fmtTime(PHASES.altarUnlockAt - t)}` : !world.bloodMoon ? `血月 ${fmtTime(PHASES.bloodMoonAt - t)}` : '不再复活';
    $('v-dawnbar').style.width = `${Math.min(100, (t / MATCH.surviveSeconds) * 100).toFixed(1)}%`;
    $('v-phase').parentElement!.classList.toggle('moon', world.bloodMoon);
    const ph = $('v-phase');
    ph.textContent = `${phase[0]} · ${nextMs}`;
    ph.dataset.phase = phase[1];
    this.updatePack(world, me);
    // the pause banner would sit on top of menus and manuals
    $('pause-ind').style.display = paused && $('overlay').style.display === 'none' ? 'flex' : 'none';
    const me_u = world.units.get(p.unitId);
    const dead = $('dead-ind');
    if (!me_u || !me_u.alive) {
      dead.style.display = 'block';
      const hunter = p.faction === 'hunter';
      dead.textContent = hunter && !p.hunter!.awake
        ? `你将在 ${fmtTime(MATCH.hunterGrace - world.time)} 后于巢穴苏醒`
        : p.lives > 0
          ? `${hunter ? '你' : '你的守夜人'}将在 ${Math.ceil(p.respawnTimer)} 秒后${hunter ? '于巢穴重生' : '复活'}`
          : hunter ? '你已彻底消散——观战中，同伴仍在狩猎' : '你已永远倒下——观战中，队友仍在坚守';
    } else dead.style.display = 'none';

    this.updateCard(world, me, sel, mode);
    this.updateInfo(world, me, sel);
    this.updateObjectives(world, me);
  }

  private updateTopWarden(world: World, me: number): void {
    const p = world.players[me];
    $('v-amber').textContent = String(Math.floor(p.amber));
    $('v-income').textContent = `+${playerIncome(world, me).toFixed(1)}`;
    $('v-lives').textContent = `${p.lives}`;
    $('v-tech').textContent = `${p.labLevel}`;
    const raw = playerRawIncome(world, me);
    $('v-income').title = raw > playerIncome(world, me) + 0.05 ? `原始收入 ${raw.toFixed(1)}/秒（超过软上限部分效率降低）` : '每秒收入';
  }

  private updateTopHunter(world: World, p: Player): void {
    const h = p.hunter!;
    const need = HUNTER.xpBase + HUNTER.xpPerLevel * h.level;
    $('v-amber').textContent = String(Math.floor(h.soulfire));
    $('v-income').textContent = h.level >= HUNTER.maxLevel ? `Lv${h.level}` : `Lv${h.level} · ${Math.floor((h.xp / need) * 100)}%`;
    $('v-income').title = '';
    $('v-lives').textContent = `${h.lives}`;
    $('v-tech').textContent = h.scentActive > 0 ? '嗅探中' : fmtTime(h.scentTimer);
  }

  /** Threat panel: one row per hunter of the pack, plus the items of the most dangerous one. */
  private updatePack(world: World, me: number): void {
    const rows = world.hunterPlayerIds.map((id) => {
      const hp = world.players[id];
      const h = hp.hunter!;
      const hu = world.units.get(hp.unitId);
      const alive = !!hu && hu.alive && hu.utype === 'hunter';
      const st = !h.awake ? fmtTime(MATCH.hunterGrace - world.time) : alive ? `Lv${h.level}` : h.lives > 0 ? `↻${Math.ceil(hp.respawnTimer)}` : '消散';
      const lives = '◆'.repeat(Math.max(0, h.lives)) + '◇'.repeat(Math.max(0, MATCH.hunterLives - h.lives));
      const short = hp.name.replace(/^.*·/, '').replace(/）$/, '');
      return `<span class="hrow${id === me ? ' me' : ''}${alive ? '' : ' down'}"><i style="background:${hp.color}"></i><em>${short}</em><b>${st}</b><span class="hl">${lives}</span></span>`;
    });
    const html = rows.join('');
    const el = $('v-hunter');
    if (el.dataset.sig !== html) {
      el.dataset.sig = html;
      el.innerHTML = html;
    }
    const mine = world.players[me].faction === 'hunter' ? world.players[me] : null;
    const shown = mine ?? world.hunterPlayerIds.map((id) => world.players[id]).reduce((a, b) => (b.hunter!.level > a.hunter!.level ? b : a));
    const h = shown.hunter!;
    const items = ITEM_SLOTS.map((s) => `<span class="hitem t${h.items[s]}" title="${shown.name} · ${ITEMS[s].name} ${h.items[s]}/${ITEMS[s].tiers.length}">${ITEM_ICON[s]}<i>${h.items[s]}</i></span>`).join('');
    const itemsEl = $('v-hitems');
    if (itemsEl.dataset.sig !== items) {
      itemsEl.dataset.sig = items;
      itemsEl.innerHTML = items;
    }
  }

  private objSig = '';
  /** Early-game checklist; rebuilt only when its content changes. */
  private updateObjectives(world: World, me: number): void {
    const el = $('objectives');
    const o = objectives(world, me);
    const h = world.players[world.hunterPlayerIds[0]].hunter!;
    const wake = !h.awake ? `<div class="obj-wake">噬林魔群 <b>${fmtTime(MATCH.hunterGrace - world.time)}</b> 后苏醒</div>` : '';
    const html = o.visible
      ? `<div class="obj-title">守夜目标</div>${wake}<ol>${o.items
          .map((it, i) => `<li class="${it.done ? 'done' : i === o.current ? 'now' : ''}"><i></i><span>${it.text}</span>${it.progress && !it.done ? `<em>${it.progress}</em>` : ''}<kbd>${it.key}</kbd></li>`)
          .join('')}</ol>`
      : '';
    if (html === this.objSig) return;
    this.objSig = html;
    el.hidden = !o.visible;
    el.innerHTML = html;
  }

  /** Floating label next to the build ghost: name, cost and why it can't go there. */
  placeTip(info: { x: number; y: number; name: string; cost: number; count: number; ok: boolean; reason: string | null } | null): void {
    const el = $('place-tip');
    if (!info) {
      if (!el.hidden) el.hidden = true;
      return;
    }
    const total = info.cost * info.count;
    const html = `<b>${info.name}${info.count > 1 ? ` ×${info.count}` : ''}</b><span class="pt-cost${info.reason === '琥珀不足' ? ' bad' : ''}">${ICONS.amber}${total}</span>${info.reason ? `<span class="pt-bad">${info.reason}</span>` : '<span class="pt-hint">左键放置 · Shift 连续 · 右键取消</span>'}`;
    if (el.dataset.sig !== html) {
      el.dataset.sig = html;
      el.innerHTML = html;
    }
    el.classList.toggle('blocked', !info.ok || !!info.reason);
    el.style.transform = `translate(${Math.round(info.x)}px, ${Math.round(info.y)}px)`;
    el.hidden = false;
  }

  private updateCard(world: World, me: number, sel: Entity[], mode: string): void {
    const card = cardFor(world, me, sel as (Unit | Building)[], mode);
    const sig = card.map((c) => (c ? `${c.action}|${c.enabled}|${c.cost}|${c.label}` : '-')).join(',') + mode;
    if (sig === this.cardSig) return;
    this.cardSig = sig;
    this.tips.clear();
    this.cardEls.forEach((el, i) => {
      const c = card[i];
      if (!c) {
        el.className = 'cmd empty';
        el.innerHTML = '';
        el.dataset.action = '';
        return;
      }
      this.tips.set(el, c);
      el.className = `cmd${c.enabled ? '' : ' disabled'}`;
      el.dataset.action = c.action;
      el.innerHTML = `${c.icon}<span class="hk">${c.key}</span>${c.cost ? `<span class="cost">${c.cost}</span>` : ''}`;
    });
  }

  private drawPortrait(world: World, e: Entity): void {
    const ctx = this.pctx;
    const W = this.portrait.width;
    const H = this.portrait.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const g = ctx.createRadialGradient(W / 2, H / 2, 4, W / 2, H / 2, W * 0.7);
    g.addColorStop(0, '#f3f8e6');
    g.addColorStop(1, '#bcd9a5');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    if (e.kind === 'unit') {
      const fake = { ...e, facing: 0.3, moving: false, attackAnim: 0, workAnim: 0 };
      ctx.translate(W / 2 - 4, H - (e.utype === 'hunter' ? 14 : 8));
      const evo = e.utype === 'hunter' && world.players[e.owner].hunter!.evolved;
      const sc = e.utype === 'hunter' ? (evo ? 1.4 : 1.9) : 2.1; // animals' ears (rabbits!) need headroom
      ctx.scale(sc, sc);
      const now = performance.now() / 1000;
      if (e.utype === 'hunter') drawHunter(ctx, fake, world.players[e.owner].hunter!, now, world.players[e.owner].color);
      else if (e.utype === 'guard') drawGuard(ctx, fake, world.players[e.owner].color, now);
      else if (e.utype === 'ranger') drawRanger(ctx, fake, world.players[e.owner].color, now);
      else drawSurvivor(ctx, fake, world.players[e.owner].color, now);
    } else {
      const spr = buildingSprite(e.btype, e.level, world.players[e.owner].color, 0);
      const s = Math.min((W - 6) / spr.width, (H - 6) / spr.height);
      ctx.drawImage(spr, (W - spr.width * s) / 2, (H - spr.height * s) / 2, spr.width * s, spr.height * s);
    }
  }

  private updateInfo(world: World, me: number, sel: Entity[]): void {
    const info = $('info-body');
    if (!sel.length && world.players[me].faction === 'hunter') {
      if (this.infoSig !== 'hunter-guide') {
        this.infoSig = 'hunter-guide';
        info.innerHTML = `<div class="hint"><b>狩猎指南</b><kbd>空格</kbd> 定位你的噬林魔 · <kbd>Y</kbd> 镜头跟随 · <kbd>右键</kbd> 地面移动 · <kbd>右键</kbd> 建筑或守夜人攻击<br><kbd>Q</kbd> 扑杀 <kbd>W</kbd> 震地咆哮 <kbd>E</kbd> 腐蚀撕裂（随等级解锁）· <kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><kbd>F</kbd><kbd>Z</kbd> 用魂火购买装备<br>撕咬<b>琥珀泉</b>得到 3 倍魂火，啃墙只得一半——绕开城墙直扑经济！巢穴附近可快速回血。</div>`;
        this.pctx.clearRect(0, 0, this.portrait.width, this.portrait.height);
      }
      return;
    }
    if (!sel.length) {
      if (this.infoSig !== 'none') {
        this.infoSig = 'none';
        info.innerHTML = `<div class="hint"><b>守夜指南</b><kbd>空格</kbd> 选中并定位守夜人 · <kbd>Y</kbd> 镜头跟随 · <kbd>右键</kbd> 移动 / 修理 / 攻击<br><kbd>Q</kbd> 琥珀泉 <kbd>W</kbd> 壁垒 <kbd>E</kbd> 林门 <kbd>R</kbd> 弩塔 · 按住 <kbd>Shift</kbd> 连续建造<br>小地图上的金色圆圈是未被占据的林间空地，缺口越少越易防守。</div>`;
        this.pctx.clearRect(0, 0, this.portrait.width, this.portrait.height);
      }
      return;
    }
    const e = sel[0];
    this.drawPortrait(world, e);
    let html = '';
    if (sel.length > 1) {
      const counts = new Map<string, number>();
      for (const s of sel) {
        const k = s.kind === 'unit' ? (s.utype === 'hunter' ? HUNTER.name : isArmy(s.utype) ? ARMY[s.utype].name : '守夜人') : BUILDINGS[s.btype].name;
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
      html = `<div class="title">已选择 ${sel.length} 个</div><div class="multi">${[...counts].map(([k, n]) => `<span>${k} ×${n}</span>`).join('')}</div>`;
      if (e.kind === 'building') html += this.buildingInfo(world, e, true);
    } else if (e.kind === 'unit') html = this.unitInfo(world, e);
    else html = this.buildingInfo(world, e, false);
    html = chipify(html);
    if (html !== this.infoSig) {
      this.infoSig = html;
      info.innerHTML = html;
    }
  }

  private hpBar(hp: number, max: number): string {
    const f = Math.max(0, Math.min(1, hp / max));
    const c = f > 0.5 ? 'hi' : f > 0.25 ? 'mid' : 'lo';
    return `<div class="hpbar"><div class="${c}" style="width:${f * 100}%"></div><span>${Math.ceil(hp)} / ${Math.ceil(max)}</span></div>`;
  }

  private unitInfo(world: World, u: Unit): string {
    const st = unitStats(world, u);
    const p = world.players[u.owner];
    if (u.utype === 'hunter') {
      const h = p.hunter!;
      const need = HUNTER.xpBase + HUNTER.xpPerLevel * h.level;
      const skills = (Object.keys(HUNTER_SKILLS) as HunterSkill[]).map((k) => skillChip(k, skillRank(h.level, k), h.skillCd[k])).join('');
      const evo = h.evolved ? `<span class="skill evo">${EVOLUTION.name}</span>` : `<span class="skill locked">进化 Lv${EVOLUTION.level}/血月</span>`;
      return `<div class="title hunter">${h.evolved ? EVOLUTION.name : HUNTER.name} <small>等级 ${h.level}</small></div>${this.hpBar(u.hp, st.maxHp)}
      <div class="skills">${skills}${evo}</div>
      <div class="xp"><div style="width:${(h.xp / need) * 100}%"></div></div>
      <div class="stats"><span>攻击 <b>${Math.round(st.dmg)}</b></span><span>护甲 <b>${st.armor}</b></span><span>速度 <b>${st.speed}</b></span><span>攻城 <b>×${st.siege.toFixed(2)}</b></span><span>回复 <b>${st.regen.toFixed(1)}/秒</b></span><span>魂火 <b>${Math.floor(h.soulfire)}</b></span></div>
      <div class="items">${ITEM_SLOTS.map((s) => `<span class="hitem t${h.items[s]}">${ITEM_ICON[s]}<i>${h.items[s]}</i><em>${ITEMS[s].name}</em></span>`).join('')}</div>`;
    }
    if (isArmy(u.utype)) {
      const a = ARMY[u.utype];
      return `<div class="title">${a.name}<small>${u.elite ? '精锐 · ' : ''}${p.name === '你' ? '你的军团' : p.name}</small></div>${this.hpBar(u.hp, st.maxHp)}
      <div class="stats"><span>攻击 <b>${Math.round(st.dmg)}</b></span><span>护甲 <b>${st.armor}</b></span><span>射程 <b>${a.range}</b></span><span>速度 <b>${st.speed}</b></span><span>军团 <b>${armyCount(world, u.owner)}/${armyCap(world, u.owner)}</b></span></div><div class="hint">${a.desc}；待命时自动迎击 ${ARMY_RULES.aggroRange} 格内的噬林魔。</div>`;
    }
    const strat = p.isAI ? ` · ${STRATEGIES[p.strategy]?.label ?? ''}` : '';
    const orders = u.orders.map((o) => (o.type === 'build' ? BUILDINGS[o.btype].name : o.type === 'move' ? '移动' : o.type === 'repair' ? '修理' : '攻击')).slice(0, 6);
    return `<div class="title">${p.name === '你' ? '你的守夜人' : p.name}<small>${strat}</small></div>${this.hpBar(u.hp, st.maxHp)}
    <div class="stats"><span>攻击 <b>${st.dmg}</b></span><span>护甲 <b>${st.armor}</b></span><span>速度 <b>${st.speed}</b></span><span>射程 <b>${(st.range / TILE).toFixed(1)}</b></span><span>生命 <b>${p.lives}</b></span></div>
    ${orders.length ? `<div class="queue">指令队列：${orders.map((o) => `<i>${o}</i>`).join('')}</div>` : ''}`;
  }

  private buildingInfo(world: World, b: Building, brief: boolean): string {
    const def = BUILDINGS[b.btype];
    const lv = def.levels[b.level];
    const name = def.levelNames?.[b.level] ? `${def.levelNames[b.level]} · ` : '';
    const owner = world.players[b.owner];
    let status = '';
    if (b.constructing) status = `<div class="status">建造中 ${Math.floor(b.progress * 100)}%</div>`;
    else if (b.upgrading) status = `<div class="status up">升级中 ${Math.floor(b.upgrading.progress * 100)}%</div>`;
    const stats: string[] = [`护甲 <b>${lv.armor}</b>`];
    if (lv.income) stats.push(`收入 <b>${lv.income}/秒</b>`);
    if (lv.dmg) stats.push(`伤害 <b>${lv.dmg}</b>`, `DPS <b>${(lv.dmg / (lv.cooldown ?? 1)).toFixed(0)}</b>`, `射程 <b>${lv.range}</b>`);
    if (lv.slow) stats.push(`减速 <b>${Math.round(lv.slow * 100)}%</b>`);
    if (lv.heal) stats.push(`修复 <b>${lv.heal}/秒</b>`, `范围 <b>${lv.healRadius}</b>`);
    if (b.btype === 'lab') stats.push(`科技 <b>${owner.labLevel}</b>`);
    if (b.btype === 'altar') status += `<div class="status">破晓充能 ${Math.floor(b.charge * 100)}% — 守住它！</div>`;
    if (b.train) status += `<div class="status">训练队列：${b.train.queue.map((q) => ARMY[q].name).join('、') || '空'} · 军团 ${armyCount(world, b.owner)}/${armyCap(world, b.owner)}</div>`;
    if (b.silenceT > 0) status += `<div class="status bad">被咆哮沉默 ${Math.ceil(b.silenceT)} 秒</div>`;
    const perk = perkAt(b.btype, b.level);
    if (perk) status += `<div class="perkline"><b>【${perk.name}】</b>${perk.desc}</div>`;
    if (brief) return `${this.hpBar(b.hp, b.maxHp)}`;
    return `<div class="title">${def.name} <small>${name}Lv${b.level + 1}/${def.levels.length}</small></div>${this.hpBar(b.hp, b.maxHp)}${status}<div class="stats">${stats.map((s) => `<span>${s}</span>`).join('')}</div><div class="owner" style="color:${owner.color}">${owner.name === '你' ? '你的建筑' : owner.name}</div>`;
  }

  private bannerTimer = 0;
  /** Big centre-screen announcement for phase changes and turning points. */
  banner(text: string, sub: string, tone: 'good' | 'bad' | 'epic'): void {
    const el = $('banner');
    el.className = `show ${tone}`;
    el.innerHTML = `<div class="b-title">${text}</div><div class="b-sub">${sub}</div>`;
    void el.offsetWidth;
    el.classList.add('anim');
    window.clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => (el.className = ''), 3600);
  }

  private backdrop: Backdrop | null = null;

  /** True while an opaque scenic overlay hides the battlefield (no need to render it). */
  coversView(): boolean {
    return this.backdrop !== null;
  }

  /** Show a full-screen overlay; with a scene it gets the animated forest backdrop. */
  showOverlay(html: string, scene?: SceneMode): void {
    const o = $('overlay');
    this.backdrop?.stop();
    this.backdrop = null;
    o.innerHTML = html;
    o.classList.toggle('scenic', !!scene);
    if (scene) {
      const c = document.createElement('canvas');
      c.className = 'backdrop';
      o.prepend(c);
      this.backdrop = new Backdrop(c, scene);
    }
    o.style.display = 'flex';
  }

  hideOverlay(): void {
    this.backdrop?.stop();
    this.backdrop = null;
    $('overlay').style.display = 'none';
  }
}

export { PAD, TOP };

const RANK = ['', 'Ⅰ', 'Ⅱ', 'Ⅲ'];

/** Hunter skill chip: name + rank (or unlock level) + remaining cooldown. */
function skillChip(k: HunterSkill, rank: number, cd: number): string {
  const s = HUNTER_SKILLS[k];
  const label = rank ? `${s.name} ${RANK[rank]}` : `${s.name} Lv${s.unlock[0]}`;
  const cool = rank && cd > 0 ? ` <em>${Math.ceil(cd)}s</em>` : '';
  return `<span class="skill${rank ? '' : ' locked'}" title="${s.desc}">${label}${cool}</span>`;
}
