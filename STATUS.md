# Coordination handoff

Updated: 2026-11-20 4:54 PM Pacific. Pass 19 complete: spread Waves 1–3 across all 3 portals (`spawnIndex: 0, 1, 2`) so the bottom/3rd portal can never be ignored, and randomized per-wave portal permutations, shuffled per-spawner portal bags, and ±16% spawn-interval jitter so enemy types emerge unpredictably from every portal; verified (**338/338** tests), pushed to `seajhawk/tabletop`, and republished to `https://seajhawk.github.io/TTDefense/`.

## Restart rule
Heartbeat `continue-galactic-alliance` ACTIVE, relative 5-hour interval; rearmed
at this restart (~1:58 PM Pacific Nov 20), before implementation. After a quota/usage
stall, rearm SAME timer for 5 hours from restart before other work. Never fixed daily.
Automation updates require `destination: "thread"`; omitted field was rejected once.

## Objective
Polish selected PixiJS/TypeScript game in `proto-web/`; `shared-data/` canonical.
Godot remains a historical prototype, not feature parity. Full design in `docs/`.

## Implemented
- **GitHub & Live Pages**:
  - Main repo: `https://github.com/seajhawk/tabletop` (`main`, Node 22 CI + Pages at `https://seajhawk.github.io/tabletop/`).
  - Shareable Pages site: **`https://seajhawk.github.io/TTDefense/`** (`seajhawk/TTDefense`, subpath-safe PWA/SW).
- **9 Maps across 7 Themes** (`shared-data/maps.json`), **7 Adaptive Layouts** (vertical +90° phone court), **Configurable Waves (`5–30`) + Overtime (`+ Add 5 More Waves?`)**, **Mars Meteors & Radial Credit Repair**, **Ironhold Keep Dragons/Keep Walls/Knight Stable/Flaming Trebuchet**, local best scores, offline PWA.
- **Pass 14–15 — Midnight Kitchen & 1:1 Grid-Aligned Floor Tiles**: Full-room `kitchen-map.jpg` floorplan with Fridge on floor, 10 mountable `COUNTER` `wallCells` (`+15%` range), 4 stove `+BURN` burners, patrolling 1/2/3 **Roomba** (`swarm`) defense, and mathematically aligned `28×16` checkered floor tiles.
- **Pass 16–18 — Centipede Opposite-90° Split, Uniform 1:1 Square Board Scaling & Rotated Behind-House Health Pill**:
  - **Centipede Opposite-90° Split (`proto-web/src/sim/game.ts`)**: Split parts turn opposite 90° (one left `sign=-1`, one right `sign=+1`), separate cleanly (`0.28` cell nudge), advance up to 3 open squares before resuming BFS toward House, and snapshot `this.enemies.length` across all AoE loops (`stasis`, `plasma`, `missile`, `mines`, `meteors`, `roomba`, `fireZones`, `updateEnemies`) so killing splash blasts never damage newborn split halves on their birth frame.
  - **Strictly 1:1 Uniform Square Board Scaling (`proto-web/src/layout.ts`, `render.ts`)**: Enlarged all 7 layouts uniformly while preserving exact 1:1 square cells (`cw === ch`: `37×37` `1036×592` on `2p-opposing`, `39×39` `1092×624` on `1p-base`, `34×34` `952×544` on `4p-edges`/`4p-2x2`, `33×33` `528×924` on `2p-phone`/`1p-phone`, `32.5×32.5` `910×520` on `4p-corners`) so circles, fountains, and sprites never distort.
  - **Rotated Standard Health Pill Behind Exit Squares (`proto-web/src/render.ts`)**: Uses the standard horizontal health pill (`♥ 25/25` + bottom bar) inside `healthC`, placed behind the exit squares (`maxExitX + 1`) and rotated `-90°` vertically when the exit squares are vertical on screen (desktop) or `0°` horizontally when horizontal on screen (rotated phone).
  - **Unpredictable All-Portal Wave Spawning (`shared-data/waves.json`, `proto-web/src/sim/game.ts`)**: Split Waves 1, 2, and 3 across all 3 portals (`spawnIndex: 0, 1, 2`, preserving exact wave unit totals) and added per-wave portal permutation + shuffled portal-bag mixing + `±16%` interval jitter in `startWave`/`runSpawners` so all 3 portals are active from Wave 1 and every enemy type mixes unpredictably across portals.

## Verified (2026-11-20)
- `node scripts/validate-data.mjs` -> PASS (5 turrets, 6 enemies, 9 maps, 11 waves; all spawns reachable).
- `npm --prefix proto-web run typecheck` -> PASS (0 errors).
- `npm --prefix proto-web test` -> PASS (**338/338** across 12 suites, incl. Wave 1–3 all-portal activation & enemy-type portal-mixing test, `cw === ch` 1:1 square-cell test, and Gnome splash opposite-90° split test).
- Production builds (`/` and `VITE_BASE=/TTDefense/`) -> PASS (22 precached files).
- Live Chromium `http://localhost:5173/` (`1280×800`) -> PASS (`0` console/page/network errors; confirmed 1:1 round patio circles/fountain on `1036×592` board and standard health pill rotated 90° vertically behind the 2 House squares). Archived in `.tasks/pass18-1to1-square-board-and-rotated-health-pill.png`.
- Unverified: physical device multi-touch/DPI/thermal feel and native OS PWA installation.

## Sustained benchmark verified (this restart)
- Completed prior harness integration: `scripts/benchmark-browser.js`; `docs/BENCHMARKING.md`.
- Actual production build `01ff4d32926e0668` / `index-CIQ8e-gj.js`: SIX valid 1s warm-up +
  4s samples, 150 enemies every pre-step/post-refill, 20 towers, no errors or score writes.
- Desktop1920x1080 DPR1: Space/Naval/Medieval. Phone viewport412x915 DPR2: Mars/Kitchen/Lawn.
  BOTH use workstation RTX3060/Chromium158; not physical-phone results. rAF median16.7ms,
  p95 16.8ms; Mars max33.2ms. Sim/wall0.9978–1.0025. GPU completion excluded from CPU timings.
- `npm --prefix proto-web test -- --run tests/benchmark.test.mjs`: 65/65 PASS (39.74s).
  Existing full-game suite above was not rerun: no app code changed in this verification.
- Report + raw evidence: `docs/PERFORMANCE-SUSTAINED.md`, `docs/benchmarks/*.json`.
  Fixed kitchen map ID in reproduction example. Physical/thermal/long campaign remain unverified.
- Benchmark contexts closed; report Claude exec69608 complete; no benchmark delegates active.
  No deployment, paid Foundry calls, or Git commit during this restart.

## Runtime
- Local Vite dev server running at `http://localhost:5173/`.
- Live Pages: `https://seajhawk.github.io/TTDefense/` & `https://seajhawk.github.io/tabletop/`.

## Next
1. Playtest **Backyard Lawn** centipede ±90° split flanks locally (`http://localhost:5173/`) or at `https://seajhawk.github.io/TTDefense/` (tap **Settings → Update app** if already cached).
2. Run sustained-load checks on target hardware; verify multi-touch, DPI, thermal comfort, and native PWA installation.
3. Extend measured scenarios to mixed enemies and longer themed ability cycles before optimizing those paths.
