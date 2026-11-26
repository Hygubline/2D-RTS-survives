/** Hand-authored SVG icons for the command card and HUD (no external assets). */

const wrap = (body: string, bg = '#2a2118') =>
  `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="g" cx="35%" cy="30%" r="80%"><stop offset="0" stop-color="${bg}" stop-opacity="0.35"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient></defs><rect width="48" height="48" fill="url(#g)"/>${body}</svg>`;

const S = 'stroke="#3d2817" stroke-width="1.8" stroke-linejoin="round"';

export const ICONS: Record<string, string> = {
  harvester: wrap(
    `<ellipse cx="24" cy="36" rx="15" ry="6" fill="#6f5a40" ${S}/><path d="M17 35 L19 18 L24 10 L29 18 L31 35Z" fill="#f5a83a" ${S}/><path d="M19 18 L24 10 L24 35Z" fill="#ffe7a8" opacity=".6"/><path d="M11 35 L15 24 L18 35Z" fill="#e08a24" ${S}/><path d="M30 35 L34 26 L37 35Z" fill="#e08a24" ${S}/><circle cx="24" cy="22" r="10" fill="#ffc35a" opacity=".18"/>`,
    '#ffb43a',
  ),
  wall: wrap(
    `<rect x="7" y="20" width="34" height="18" rx="2" fill="#8b877b" ${S}/><path d="M7 29 H41 M18 20 V29 M30 20 V29 M12 29 V38 M24 29 V38 M36 29 V38" stroke="#4a463e" stroke-width="1.4"/><rect x="7" y="14" width="34" height="7" rx="2" fill="#aaa598" ${S}/>`,
  ),
  gate: wrap(
    `<rect x="5" y="12" width="8" height="28" fill="#8b877b" ${S}/><rect x="35" y="12" width="8" height="28" fill="#8b877b" ${S}/><rect x="13" y="17" width="22" height="23" fill="#6a4526" ${S}/><path d="M18 17 V40 M24 17 V40 M30 17 V40" stroke="#3a2412" stroke-width="1.2"/><circle cx="28" cy="29" r="1.8" fill="#e0b84a"/>`,
  ),
  bolt: wrap(
    `<rect x="14" y="22" width="20" height="20" fill="#8b877b" ${S}/><rect x="11" y="16" width="26" height="7" fill="#6a4526" ${S}/><path d="M24 4 L24 18" stroke="#5a3d1e" stroke-width="3"/><path d="M14 8 Q24 15 34 8" fill="none" stroke="#7a5230" stroke-width="3"/><path d="M24 2 L21 7 H27Z" fill="#ddd" ${S}/>`,
  ),
  frost: wrap(
    `<path d="M10 40 L16 34 H32 L38 40Z" fill="#7f8b91" ${S}/><path d="M18 35 L21 14 L24 6 L27 14 L30 35Z" fill="#9fe8ff" ${S}/><path d="M13 35 L15 22 L18 35Z" fill="#9fe8ff" ${S}/><path d="M30 35 L33 20 L35 35Z" fill="#9fe8ff" ${S}/><path d="M21 14 L24 6 L24 35Z" fill="#fff" opacity=".55"/>`,
    '#8fe6ff',
  ),
  lance: wrap(
    `<rect x="14" y="24" width="20" height="18" fill="#3a3638" ${S}/><circle cx="24" cy="33" r="5" fill="#ff7a2a"/><path d="M8 22 L36 10" stroke="#5a5458" stroke-width="4"/><path d="M36 10 L44 6 L38 14Z" fill="#ff8a3a" ${S}/><circle cx="40" cy="9" r="6" fill="#ff8a3a" opacity=".35"/>`,
    '#ff6a2a',
  ),
  repair: wrap(
    `<ellipse cx="24" cy="34" rx="15" ry="7" fill="#7d786c" ${S}/><ellipse cx="24" cy="32" rx="10" ry="4" fill="#4ecf7a"/><path d="M11 33 V14 M37 33 V14" stroke="#4a2f18" stroke-width="3"/><path d="M8 15 L24 6 L40 15Z" fill="#7a3e2a" ${S}/><path d="M21 22 h6 M24 19 v6" stroke="#bfffcf" stroke-width="2.4"/>`,
    '#7dff9e',
  ),
  lab: wrap(
    `<rect x="15" y="18" width="18" height="24" fill="#6e6676" ${S}/><path d="M14 18 A10 10 0 0 1 34 18Z" fill="#5f90a8" ${S}/><path d="M24 24 v6 M21 27 h6" stroke="#c49bff" stroke-width="2"/><path d="M26 12 L38 4" stroke="#c9a24a" stroke-width="3"/><rect x="34" y="34" width="9" height="3" fill="#8a2f2f"/><rect x="34" y="37" width="9" height="3" fill="#2f5a8a"/>`,
    '#c49bff',
  ),
  shelter: wrap(
    `<ellipse cx="24" cy="38" rx="17" ry="5" fill="#5f5a50"/><path d="M8 32 Q16 14 24 6 Q32 14 40 32 Q24 40 8 32Z" fill="#c7a25a" ${S}/><path d="M20 38 V31 Q24 27 28 31 V38Z" fill="#2a1a0e"/><path d="M14 26 Q24 22 34 26" stroke="#6e5228" stroke-width="1.6" fill="none"/>`,
  ),
  barracks: wrap(
    `<rect x="8" y="22" width="32" height="18" fill="#6e4a2a" ${S}/><path d="M4 23 L24 8 L44 23Z" fill="#5a4630" ${S}/><rect x="20" y="29" width="8" height="11" fill="#24160c"/><path d="M11 26 h6 v6 l-3 3 l-3 -3Z" fill="#3f8fd8" ${S}/><path d="M37 40 L41 24 M40 40 L44 24" stroke="#9aa0a8" stroke-width="2"/>`,
  ),
  altar: wrap(
    `<ellipse cx="24" cy="38" rx="18" ry="7" fill="#8a857a" ${S}/><path d="M19 38 L21 14 L24 8 L27 14 L29 38Z" fill="#d8d2c2" ${S}/><path d="M21 12 L24 2 L27 12 L24 15Z" fill="#ffe6a0" ${S}/><circle cx="24" cy="8" r="9" fill="#fff0b0" opacity=".35"/>`,
    '#ffe08a',
  ),
  guard: wrap(
    `<path d="M12 40 L11 22 L16 16 L32 16 L37 22 L36 40Z" fill="#8a8f96" ${S}/><path d="M17 16 A7 7 0 0 1 31 16Z" fill="#a7acb3" ${S}/><path d="M6 20 L18 18 L18 38 L12 43 L6 38Z" fill="#3f8fd8" ${S}/><path d="M34 26 L46 10" stroke="#d8dde2" stroke-width="3"/>`,
  ),
  ranger: wrap(
    `<path d="M16 42 L15 24 L20 18 L28 18 L33 24 L32 42Z" fill="#5d4a2e" ${S}/><path d="M17 18 Q16 8 24 7 Q31 8 31 15 Q26 13 24 18Z" fill="#2a5a8a" ${S}/><path d="M36 8 A16 16 0 0 1 36 40" fill="none" stroke="#6a4526" stroke-width="3"/><path d="M36 8 L30 24 L36 40" stroke="#eee" stroke-width="1"/><path d="M30 24 H46" stroke="#ddd" stroke-width="1.6"/>`,
  ),
  upgrade: wrap(`<path d="M24 6 L38 22 H30 V40 H18 V22 H10Z" fill="#f2c14e" ${S}/><path d="M24 10 L32 20 H24Z" fill="#fff3c0" opacity=".6"/>`, '#f2c14e'),
  repairCmd: wrap(
    `<path d="M10 36 L26 20" stroke="#6a4526" stroke-width="5" stroke-linecap="round"/><rect x="24" y="8" width="16" height="10" rx="2" transform="rotate(45 32 13)" fill="#8e939a" ${S}/><path d="M10 12 l5 5 M15 12 l-5 5" stroke="#7dff9e" stroke-width="2.4"/>`,
  ),
  demolish: wrap(
    `<path d="M12 40 L20 26 L28 32 L36 18" stroke="#c84a3a" stroke-width="3" fill="none"/><path d="M10 10 L38 38 M38 10 L10 38" stroke="#e05a4a" stroke-width="4" stroke-linecap="round"/>`,
    '#e05a4a',
  ),
  cancel: wrap(`<circle cx="24" cy="24" r="14" fill="none" stroke="#e0b84a" stroke-width="3.5"/><path d="M15 33 L33 15" stroke="#e0b84a" stroke-width="3.5"/>`),
  stop: wrap(`<path d="M17 6 H31 L42 17 V31 L31 42 H17 L6 31 V17Z" fill="#a8322a" ${S}/><rect x="14" y="21" width="20" height="6" fill="#f0e0d0"/>`),
  move: wrap(`<path d="M8 40 L24 8 L40 40 L24 30Z" fill="#7ad07a" ${S}/>`),
  attack: wrap(`<path d="M10 38 L32 16 L36 6 L42 12 L32 16" stroke="#d8d8d8" stroke-width="3.5" fill="none"/><path d="M8 34 l6 6" stroke="#7a5230" stroke-width="4"/>`),
  amber: `<svg viewBox="0 0 24 24"><path d="M12 2 L19 9 L16 21 H8 L5 9Z" fill="#f5a83a" stroke="#3a1a04" stroke-width="1.4"/><path d="M12 2 L12 21 L8 21 L5 9Z" fill="#ffd98a" opacity=".55"/></svg>`,
  income: `<svg viewBox="0 0 24 24"><path d="M4 18 L10 12 L14 15 L20 7" stroke="#9fe07a" stroke-width="2.4" fill="none"/><path d="M15 7 H20 V12" stroke="#9fe07a" stroke-width="2.4" fill="none"/></svg>`,
  heart: `<svg viewBox="0 0 24 24"><path d="M12 21 C4 15 2 11 4 7 C6 3 11 4 12 8 C13 4 18 3 20 7 C22 11 20 15 12 21Z" fill="#d8443a" stroke="#3a0a06" stroke-width="1.3"/></svg>`,
  moon: `<svg viewBox="0 0 24 24"><path d="M15 3 A9 9 0 1 0 21 15 A7 7 0 0 1 15 3Z" fill="#cfd8ff" stroke="#1a1e3a" stroke-width="1.2"/></svg>`,
  skull: `<svg viewBox="0 0 24 24"><path d="M12 3 C6 3 4 7 4 11 C4 14 6 15 7 16 V20 H17 V16 C18 15 20 14 20 11 C20 7 18 3 12 3Z" fill="#e8dcc0" stroke="#2a1a10" stroke-width="1.3"/><circle cx="9" cy="11" r="2" fill="#a01e24"/><circle cx="15" cy="11" r="2" fill="#a01e24"/></svg>`,
  tech: `<svg viewBox="0 0 24 24"><path d="M5 4 H15 L19 8 V20 H5Z" fill="#6e5a8a" stroke="#1a1028" stroke-width="1.3"/><path d="M8 10 H16 M8 13 H16 M8 16 H13" stroke="#e8d8ff" stroke-width="1.3"/></svg>`,
  pounce: wrap(`<path d="M6 38 Q18 30 26 18" stroke="#ffb070" stroke-width="2.5" fill="none" stroke-dasharray="3 3"/><path d="M28 8 L40 14 L36 26 L26 22Z" fill="#c23b2a" ${S}/><path d="M30 26 L28 34 M35 26 L35 35 M39 24 L42 32" stroke="#e8dcc0" stroke-width="2.4" stroke-linecap="round"/>`, '#ff7a3a'),
  roar: wrap(`<path d="M10 18 Q20 10 24 24 Q20 36 10 30Z" fill="#7a2a2a" ${S}/><path d="M28 16 Q33 24 28 32 M33 11 Q41 24 33 37 M38 7 Q48 24 38 41" stroke="#ffd070" stroke-width="2.4" fill="none" stroke-linecap="round"/>`, '#ffcf5a'),
  rend: wrap(`<rect x="8" y="24" width="32" height="16" fill="#6a5a48" ${S}/><path d="M8 32 H40 M20 24 V32 M30 32 V40" stroke="#3a2e22" stroke-width="1.4"/><path d="M14 6 L22 30 M24 4 L30 28 M34 6 L36 26" stroke="#9aff6a" stroke-width="3" stroke-linecap="round"/>`, '#7aff5a'),
  claws: wrap(`<path d="M12 10 Q18 26 14 40 M22 8 Q28 26 24 42 M32 10 Q38 26 34 40" stroke="#e8dcc0" stroke-width="4" fill="none" stroke-linecap="round"/>`, '#d86a4a'),
  hide: wrap(`<path d="M24 6 L38 12 V24 C38 32 32 38 24 42 C16 38 10 32 10 24 V12Z" fill="#7a7468" ${S}/><path d="M16 16 L24 13 L32 16 M15 24 L24 21 L33 24" stroke="#4a463e" stroke-width="1.6" fill="none"/>`),
  striders: wrap(`<path d="M14 8 L20 30 L36 34 L38 40 L12 40 Z" fill="#3b2e40" ${S}/><path d="M6 18 h8 M4 24 h10 M6 30 h8" stroke="#c890ff" stroke-width="2"/>`, '#c890ff'),
  heartItem: wrap(`<path d="M24 42 C10 32 6 24 9 16 C12 9 21 10 24 17 C27 10 36 9 39 16 C42 24 38 32 24 42Z" fill="#6a3a2a" ${S}/><path d="M18 20 Q24 26 30 20" stroke="#ff8a6a" stroke-width="2" fill="none"/>`, '#ff6a4a'),
  horn: wrap(`<path d="M8 36 Q14 10 40 8 Q24 18 18 40Z" fill="#d9cbb0" ${S}/><path d="M14 30 L20 28 M17 22 L24 21 M22 15 L30 14" stroke="#8a7a5a" stroke-width="1.5"/>`, '#d9cbb0'),
};
