# Coordination handoff

Updated: 2026-11-22 ~12:22 PM Pacific. Pass 23 complete: added 3 new distinct maps
(Neon Cybergrid, Volcanic Caldera, Bio-Lab Outbreak) with custom art & unique twists;
12 maps / 10 themes total. Manifest/PWA & benchmark work preserved.

## Restart rule
Heartbeat `continue-galactic-alliance` ACTIVE, relative five-hour interval.
Rearmed FIRST at this restart (~11:12 AM Pacific Nov 22; next ~4:12 PM Nov 22).
After a quota/usage stall, update SAME timer for five hours from restart before
reading the handoff or implementing. Never fixed daily; ordinary messages do not reset it.
Automation updates require `destination: "thread"`.

## Objective and current game
- Selected PixiJS/TypeScript in `proto-web/`; canonical `shared-data/`.
  Godot is historical. Read `docs/GAME-DESIGN.md` only as needed.
- 12 maps / 10 themes, 7 layouts including rotated phone court; fixed 60 Hz sim,
  independent multi-touch; 5 canonical turret roles plus Healer defense (`125 cr`).
- Pass 23 (`shared-data/maps.json`, `theme.ts`, `sim/game.ts`, `layout.ts`, `render.ts`,
  `main.ts`, `audio.ts`, `public/assets/{cyber,volcano,biolab}-map.jpg`):
  added **Neon Cybergrid** (`cyber-emp-chain`: Arc Node chain lightning + EMP Glitch),
  **Volcanic Caldera** (`volcano-lava-geyser`: Lava Geyser FireZones + Basalt Plateaus + Forge Drone healer),
  and **Bio-Lab Outbreak** (`biolab-mutate-regen`: pathogen HP regen halted by Antibody slow + Mutation Surge + Macro-Amoeba mitosis split).
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
  Theater tier2:20 towers,40 real upgrades,4280 spent; natural extras,150 floor/450 cap.
- Lawn:75 split cues/29 children; Medieval:7 fire zones/40 knights,20->7 working towers.
  Historical report/raw: `docs/PERFORMANCE-TIER2.md`, `docs/benchmarks/2026-11-21-tier2-*.json`.

## PWA fixes and verification
- SW caches use `ga-scope-app:<encoded base>:`; siblings and legacy workers cannot
  prune another app's cache. Legacy exact-path asset fallback retained; old caches preserved.
- Installer drains each response body before the next fetch and stages native clones.
  This fixed an observed install stall without exposing a partial cache on download failure.
- Focused manifest/worker/controller unit checks:47/47 PASS (4+21+22), Nov22.
  Syntax checks passed; fresh production fixture builds succeeded for all three bases.
- Fresh synthetic A/B production fixtures for /, /tabletop/, /TTDefense/: 23 files
  including distinct revision probes. Existing dist untouched; Chromium158, loopback only.
- Multi-tab root and /TTDefense/:34 checks each. Updating a fresh tab preserves the
  other tab's A document/tower/ledger/wallet under B's controller; old assets work offline.
  Explicit reset/update then reloads to B offline exactly once; the other tab stays put.
- Lifecycle:25 checks per root/subpath; sibling reopen:12. Total130 PASS, no warnings/errors.
- Report/reproduction: `docs/PWA-VERIFICATION.md`; latest raw evidence:
  `docs/verification/2026-11-22-0116-pwa-*.json`. Earlier results retained.
- Helpers: `scripts/pwa-smoke-server.mjs`, `scripts/pwa-smoke-browser.js`.
  PWA workers/contexts/server closed; desktop CLI logs `.tasks/claude-pwa-desktop*.log`.
  Claude initial exec89987 complete; active review fixes exec71179:
  `.tasks/claude-boss-healer-review-fixes.log`. Fixture server exec80288 on4187 (10min cap).
- Desktop:36/36 PASS, Chrome158 Windows, standalone installed app cold-launched with
  server off; exact app navigation from worker Cache Storage, storage preserved, uninstall
  verified and no test shortcuts remain. Helper `scripts/pwa-desktop-smoke.mjs` uses local
  CDP pipe; report/raw: `docs/PWA-DESKTOP-VERIFICATION.md`, `docs/verification/2026-11-22-desktop-*.json`.
- Removed manifest `id:"./"` (origin-root collision); Chrome now reports distinct root,
  tabletop and TTDefense identities. Existing-install identity migration remains unverified.
- No deployment, paid Foundry call or commit. Physical touch/DPI/thermal, normal-user
  install dialogs, other browsers, public CDN updates and release migration remain unverified.

## Next
1. Target hardware: actual multi-touch, DPI comfort, sustained thermal playtest.
2. Verify normal-user install prompts and real release migration; preserve existing apps.
3. Publish the local PWA fixes only when deployment is authorized; this heartbeat
   does not authorize public publication.
4. Healer/boss effects remain unmeasured; use the existing theater harness for a bounded check.
