---
name: rts-game-design
description: Project rules for Ashwood Vigil (烬林守夜), a 2D asymmetric RTS survival game in TypeScript + Canvas. Use when changing controls, economy numbers, pathfinding, combat balance, AI behaviour, or when running/validating a playtest of this project.
---

# RTS Game Design — Ashwood Vigil

Read `docs/DESIGN.md` for the full design. This skill is the checklist you must keep true.

## 1. Architecture rules
- `src/config/balance.ts` is the ONLY place for numbers (costs, hp, dps, speeds, timers). No magic numbers in sim/ai/render.
- `src/sim/**` must stay pure: no DOM, no `Math.random`, no `Date`/`performance`. Use `world.rng`. Fixed tick `DT` (20 Hz).
- Every player action (human or AI) goes through `issueCommand(world, playerId, Command)`. AI has no privileged API — this keeps lockstep multiplayer possible.
- Render reads `World` + drains `world.events`; it never mutates sim state.

## 2. RTS control standard
| Input | Behaviour |
|---|---|
| LMB click / drag | select unit/building / box select (own units first, then buildings) |
| Double-click / Ctrl+click | select all of that type on screen |
| RMB | contextual: ground=move, enemy=attack, own damaged building=repair, construction site=help build |
| Shift + order | append to queue; Shift while placing = keep placing (continuous build) |
| Q W E R / A S D F / Z X C V | command card grid hotkeys |
| Space | select + center own Warden; Ctrl+0-9 / 0-9 control groups |
| Drag while placing wall/gate | paint a 4-connected line, queued nearest-end first |
| H / Backspace | jump to own shelter / to last attack alert |
| Queued build without amber | warden waits on site up to `SURVIVOR.buildWaitForAmber` s (never silently dropped) |
| Open gap tiles | pulsing dashed highlight for own clearing, and all clearings while placing walls |
| Wheel / edge / arrows / MMB-drag | zoom / pan; minimap click = jump, minimap RMB = move order |
| Esc | cancel placement/targeting |
Perf rule: no per-frame `createRadialGradient` — use cached sprites (`glow()`), cached vignette, viewport-clipped fog, and a pre-rendered title/end backdrop. Skip world rendering while an opaque scenic overlay covers it; no `backdrop-filter` over animated canvases. Gate perf on the game's own frame cost (render + HUD + minimap JS < 8 ms) — headless fps swings with machine load.
Feedback requirement: click marker and UI response in the same frame as input; sim executes next tick (≤50 ms).

## 3. Economy model
- Income levels grow ~×2.3; cost(n) = payback(n) × Δincome(n). Keep payback ~40–75 s (15-minute tempo) and monotonically rising.
- Defense must be "time purchase": wallEHP / hunterSiegeDPS ≈ 12 s early → 30 s late.
- After any balance change run `npm run simulate` and check: hunter win-rate 30–60 % across strategies, no strategy dominates by > 25 pts, average game length > 9 min (dawn is 15:00).

## 4. Pathfinding standard
- Grid A* (8-dir, octile, no corner cutting past ANY obstacle incl. siege-passable buildings — otherwise the hunter plans routes through wall seams), binary heap, node cap with closest-node fallback.
- Faction passability: gates pass for Wardens, block the Gloomhide.
- Hunter uses *siege cost*: building tile cost = hp / siegeDPS × speedTiles. First building on path = breach target.
- String-pull smoothing; stuck detection (no progress 0.6 s → repath; 3 fails → drop order); soft separation between units.

## 5. Balance guardrails
- Wardens (speed 158) out-run the hunter (128) until it buys Striders tier 3 (166); late-game escapes rely on gates and terrain.
- Two same-tier bolt towers behind a same-tier wall must force a hunter retreat ~50 % of the time.
- Ember Lance tier 3 cluster (4+) must be able to kill a fully geared hunter.

## 6. AI design
- Hunter: AWAKEN → HUNT (utility scoring) / BREACH / RETREAT (<22 % hp) ; shops by situational weights; limited vision + periodic scent reveal.
- Warden AI: claim grove → shelter → seal gaps (1 gate + walls) → demand-driven loop (defense deficit vs ROI) → flee & rebuild when breached.

## 6b. Late game (src/config/lategame.ts)
- Arc (15-minute tempo): escape (0–3:30) → hold (3:30–7) → counter-attack (7–12, altar from 10:00) → Blood Moon showdown (12–15, no respawns). Phase times live only in `PHASES`; UI text must read them, never hardcode clock times. Never lengthen the game with raw hp/dmg inflation — use phases, perks, army, skills, evolution.
- Tower tiers must change *behaviour* (multishot, mark, freeze, shatter, burn, meteor, thorns) and look different.
- Track the **counter-attack index** in the simulator: should be < 1 at 3.5 min and > 2 by 10 min.
- AI placement must keep the warden connected (no self-walling) and only use reachable spots.
- Dev phase jump (`?dev=1&jump=15&route=legion`) must hand over an undecided state with the player's base alive.

## 7. Playtest acceptance (run with Playwright, see `scripts/playtest.mjs`)
1. Page loads with no console errors; start screen → game.
2. HUD: top resource bar (labelled medallions + hanging dawn crest with night-progress bar), bottom-left minimap, bottom info (icon stat chips via `chipify`) + command card fully on screen. HUD styles live in `src/hud.css`; overlays/help/end screen in `src/style.css`. Screenshot states with `node scripts/dev/hud-shots.mjs`.
   Title/end screens: `src/screens.css` + animated `ui/backdrop.ts` (night / dawn / ash). Overlay HUD pieces that overhang the map (dawn crest) must be `pointer-events: none`. Screenshot with `node scripts/dev/screen-shots.mjs`.
   Early-game guidance: `ui/objectives.ts` (pure, unit-tested checklist, hidden after the mid phase (3:30) or when done) and the build-ghost label (name, cost, count for drag lines, blocked reason). Screenshot with `node scripts/dev/guide-shots.mjs`.
   Audio: `audio/sfx.ts` synthesizes every sound with Web Audio (no files). `soundFor(event)` is the pure, unit-tested event→cue map; only events the player can see on screen are voiced (own building lost / own warden down / alerts always are). Per-sound cooldowns + a voice cap keep fights readable. Fast-forward and dev jumps are silent (`drainEvents(audible=false)`). M / top-bar button mutes (persisted in localStorage). Sim commands apply on the next tick: playtests must wait ≥1 tick before reading orders.
3. Select Warden (click), move via RMB, path goes around trees.
4. Place Amber Tap (Q hotkey) → construction completes → amber/s rises.
5. Box-select, Shift-queue two walls, continuous placement works.
6. Building selected → upgrade/demolish buttons work; repair works.
7. Hunter awakens at grace end, attacks buildings, towers damage it.
8. Fast-forward (`window.__game.debug.fastForward(sec)`) to verify victory and defeat screens.
9. `npm test` and `npm run simulate` pass.
10. `npm run playtest:late`: dev jumps to 7/10/12 min, barracks training, army attack-move, tower statuses, Blood Moon evolution.
