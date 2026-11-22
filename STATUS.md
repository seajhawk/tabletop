# Coordination handoff

Updated: 2026-11-21 ~11:32 PM Pacific. Pass 22 complete (Roomba -> Goomba, Goomba/Knight
speed -25%, regen rate -20%, damage -30%, silent healer auto-deploy) & two PWA fixes complete.

## Restart rule
Heartbeat `continue-galactic-alliance` ACTIVE, relative five-hour interval.
Rearmed FIRST at this restart (~8:08 PM Pacific Nov 21; next ~1:08 AM Nov 22).
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
  Kitchen counters/stove/Goombas; Lawn opposite-90-degree centipede splits.
- Pass 22 (`proto-web/src/theme.ts`, `proto-web/src/sim/game.ts`):
  renamed Kitchen `Roomba` -> `Goomba` (`Goomba Dock`, `2 Turbo Goombas`, `3 Heavy Goombas`);
  reduced Goomba & Knight move speed by 25%, regeneration rate by 20% (`baseCd * 1.25`),
  and damage by 30%; removed `ui-repair` sound from automatic Healer deployment.
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

## Historical benchmark work
- Harness `scripts/benchmark-browser.js`; guide `docs/BENCHMARKING.md`.
  Default sustained profile stays fixed-Swarmer. Theater retains natural extras
  above floor 150, halts above cap 450; tracks cues/effects, tower HP and operational count.
- Opt-in `profile:'theater', towerTier:2`: validates 20 canonical base towers,
  uses 40 real upgrades, grants/spends 4280, preserves owner wallets.
- Lawn: 75 split cues, peak 29 split children, population 150–160; 20 working towers.
  Medieval: peak 7 active fire zones and 40 knights; HP 3300->1041.6, working towers 20->7.
- Report: `docs/PERFORMANCE-TIER2.md`; raw: `docs/benchmarks/2026-11-21-tier2-*.json`.

## PWA fixes and verification
- SW caches use `ga-scope-app:<encoded base>:`; siblings and legacy workers cannot
  prune another app's cache. Legacy exact-path asset fallback retained; old caches preserved.
- Installer drains each response body before the next fetch and stages native clones.
  This fixed an observed install stall without exposing a partial cache on download failure.
- `npm --prefix proto-web test -- --run tests/sw.test.mjs tests/pwa.test.ts`: 43/43 PASS.
  Syntax checks passed for worker and both new smoke scripts.
- Fresh synthetic A/B production fixtures built for /, /tabletop/, /TTDefense/:
  22 files each, no replacement of existing dist. Chromium158, local loopback only.
- Root and /TTDefense/ lifecycle: 25 checks each; sibling isolation/offline reopen:12.
  Verified full activation, offline boots/assets, blocked waiting update while progress
  exists, exactly one reload after reset, preserved storage. Zero warnings/errors.
- Report/reproduction: `docs/PWA-VERIFICATION.md`; latest raw evidence:
  `docs/verification/2026-11-21-2009-pwa-*.json`. Earlier 3:24 PM results retained.
- Helpers: `scripts/pwa-smoke-server.mjs`, `scripts/pwa-smoke-browser.js`.
  All Claude/review workers complete; isolated browser contexts and fixture server closed.
- Prior Pass 21 feature chat reported data/typecheck/build/unit/visual checks PASS;
  screenshot `.tasks/pass21-responsive-1to1-board-and-larger-docks.png`.
- No deployment, paid Foundry call or commit in this PWA work. Native installation,
  target hardware touch/DPI/thermal behavior and public CDN updates remain unverified.

## Next
1. Target hardware: actual multi-touch, DPI comfort, sustained thermal playtest.
2. Verify native PWA/PC installation and real release migration on target OS/browser.
3. Publish the local PWA fixes only when deployment is authorized; this heartbeat
   does not authorize public publication. Healer/boss performance is still unmeasured.
