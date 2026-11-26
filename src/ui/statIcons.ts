/** Tiny line icons for HUD stat chips (24×24, currentColor). */
const svg = (body: string): string =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

const SWORD = svg('<path d="M14.5 17.5 3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2"/>');
const SHIELD = svg('<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/>');
const BOOT = svg('<path d="M7 3v9l-3 4v4h16v-2c0-2-2-3-5-3l-3-1V3z"/>');
const TARGET = svg('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>');
const RAM = svg('<path d="M3 14h12l5-5M3 10h12M6 18a2 2 0 1 0 0 .1M14 18a2 2 0 1 0 0 .1M20 5v8"/>');
const PLUS = svg('<path d="M12 5v14M5 12h14"/><circle cx="12" cy="12" r="10"/>');
const FLAME = svg('<path d="M12 22c4 0 7-3 7-7 0-5-5-7-5-12-3 2-4 5-4 7-1-1-2-2-2-4-2 2-3 5-3 9 0 4 3 7 7 7z"/>');
const HEART = svg('<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/>');
const COIN = svg('<path d="M4 17l6-6 4 4 6-7M15 8h5v5"/>');
const BOLT = svg('<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>');
const SNOW = svg('<path d="M12 2v20M3 7l18 10M3 17 21 7M9 4l3 2 3-2M9 20l3-2 3 2"/>');
const WRENCH = svg('<path d="M14 7a4 4 0 0 0 5 5l-9 9-3-3 9-9a4 4 0 0 1-2-2z"/>');
const RING = svg('<circle cx="12" cy="12" r="9" stroke-dasharray="3 3"/><circle cx="12" cy="12" r="2"/>');
const BOOK = svg('<path d="M4 4h7a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4zM20 4h-5a2 2 0 0 0-2 2"/>');
const HELM = svg('<path d="M4 15a8 8 0 0 1 16 0v3H4zM12 7V3M9 18v-4h6v4"/>');
const LIFE = svg('<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-7 8-7s8 3 8 7"/>');

export const STAT_ICON: Record<string, string> = {
  攻击: SWORD,
  伤害: SWORD,
  护甲: SHIELD,
  速度: BOOT,
  射程: TARGET,
  攻城: RAM,
  回复: PLUS,
  魂火: FLAME,
  生命: LIFE,
  收入: COIN,
  DPS: BOLT,
  减速: SNOW,
  修复: WRENCH,
  范围: RING,
  科技: BOOK,
  军团: HELM,
};

export const HEART_ICON = HEART;

/** Turn the plain `<span>label <b>value</b></span>` stat markup into icon chips. */
export function chipify(html: string): string {
  return html.replace(/<span>([^<\s]+) <b>([^<]+)<\/b><\/span>/g, (m, label: string, value: string) => {
    const icon = STAT_ICON[label];
    if (!icon) return m;
    return `<span class="st" title="${label}"><i>${icon}</i><b>${value}</b><small>${label}</small></span>`;
  });
}
