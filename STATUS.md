# Coordination handoff

Updated: 2026-11-21 ~4:46 PM Pacific. Pass 21 responsive aspect-matched 1:1 square
board & larger player docks complete; full suite & live browser check PASS.

## Restart rule
Heartbeat `continue-galactic-alliance` ACTIVE, relative five-hour interval.
Rearmed FIRST at this restart (~3:05 PM Pacific Nov 21; next ~8:05 PM).
After a quota/usage stall, update SAME timer for five hours from restart before
reading the handoff or implementing. Never fixed daily; ordinary messages do not reset it.
Automation updates require `destination: "thread"`.

## Objective and current game
- Selected PixiJS/TypeScript in `proto-web/`; canonical `shared-data/`.
  Godot is historical. Read `docs/GAME-DESIGN.md` only as needed.
- 9 maps / 7 themes, 7 layouts including rotated phone court; fixed 60 Hz sim,
  independent multi-touch; 5 canonical turret roles plus Healer defense (`125 cr`).
- Mars meteors/damage/credit repair & Repair Bot; Medieval one-breath first-hit-dodge
  dragons, keep walls, half-rate trebuchets, knights/fire zones & Healer;
  Kitchen counters/stove/Roombas; Lawn opposite-90-degree centipede splits.
- Wave end clears active troops (`clearTroops`); wave-set completion and `+ Add 5 More Waves?`
  clear both troops and lingering explosions/effects (`clearBattlefieldFxAndTroops`).
- Pass 21 (`adaptLayout` in `proto-web/src/layout.ts` + `render.ts` + `main.ts`):
  dynamically matches stage aspect ratio to viewport while strictly preserving 1:1 square
  grid cells (`cw === ch`), expanding the board to fill available width (`1246x712`,
  `44.5x44.5` cells on square/4:3 windows) and scaling top/bottom player cards up to
  `1.38x` with larger typography/icons so low-res screens have almost zero blank space.
- PC bottom-right version stamp (`vYYYY.MM.DD.HHMM`, hidden on phone layouts).
- Local best scores and offline/subpath-safe PWA. Existing published sites:
  https://seajhawk.github.io/TTDefense/ and https://seajhawk.github.io/tabletop/
  Repo: https://github.com/seajhawk/tabletop (`main`).

## Completed benchmark work
- Harness `scripts/benchmark-browser.js`; guide `docs/BENCHMARKING.md`.
  Default sustained profile stays fixed-Swarmer. Theater retains natural extras
  above floor 150, halts above cap 450; tracks cues/effects, tower HP and operational count.
- Opt-in `profile:'theater', towerTier:2`: validates 20 canonical base towers,
  uses 40 real upgrades, grants/spends 4280, preserves owner wallets.
- Lawn: 75 split cues, peak 29 split children, population 150–160; 20 working towers.
  Medieval: peak 7 active fire zones and 40 knights; HP 3300->1041.6, working towers 20->7.
- Report: `docs/PERFORMANCE-TIER2.md`; raw: `docs/benchmarks/2026-11-21-tier2-*.json`.

## Checks and workers
- `node scripts/validate-data.mjs`: PASS (9 maps, 30 waves, 5 turrets).
- `npm --prefix proto-web run typecheck`: PASS (0 errors).
- `npx --prefix proto-web vitest run`: PASS (288/288 unit tests + benchmark suites).
- `npm --prefix proto-web run build`: PASS.
- Live browser visual verification at `1055x1015` on `http://localhost:5173/`: PASS
  (`.tasks/pass21-responsive-1to1-board-and-larger-docks.png`, 0 console/page errors).

## Next
1. Target hardware: actual multi-touch, DPI comfort, sustained thermal playtest.
2. Verify native PWA/PC installation and offline/update behavior on target OS.
3. If Healer/boss performance needs measurement, document a distinct fixture;
   neither is covered here. Profile a reproduced issue before optimizing.

## In progress (Nov 21, 3:05 PM)
- PWA scope fix complete; 40 focused tests pass. New isolated smoke helpers complete.
- Real browser found initial-install stall: unconsumed response bodies exhaust
  fetch connections before precache staging finishes. Claude exec46561 fixes installer/tests;
  log `.tasks/claude-pwa-install-drain.log`. Initial fixture server stopped.
- Parent owns verification/report/STATUS; no deployment authorized by this heartbeat.
