# Coordination handoff

Updated: 2026-11-20 3:59 PM Pacific. Pass 17 complete: prevented AoE splash kills from damaging newborn split centipede halves so both halves always peel off opposite 90° (left & right), moved the on-map health indicator behind the exit/house squares matching their screen orientation (portrait vertical on desktop, landscape horizontal on rotated phone), and stretched all maps edge-to-edge (`adaptLayout` + full-bleed `LAYOUTS`) between player cards and outer borders; verified, pushed to `seajhawk/tabletop`, and republished to `https://seajhawk.github.io/TTDefense/`.

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
- **Pass 16–17 — Centipede Opposite-90° Split, Behind-Exit Health Indicator & Edge-to-Edge Stretched Maps**:
  - **Centipede Opposite-90° Split (`proto-web/src/sim/game.ts`)**: Split parts turn opposite 90° (one left `sign=-1`, one right `sign=+1`), separate cleanly (`0.28` cell nudge), advance up to 3 open squares before resuming BFS toward House, and snapshot `this.enemies.length` across all AoE loops (`stasis`, `plasma`, `missile`, `mines`, `meteors`, `roomba`, `fireZones`, `updateEnemies`) so killing splash blasts never damage newborn split halves on their birth frame.
  - **Behind-Exit Orientation-Matched Health Bar (`proto-web/src/render.ts`)**: Maps with space behind exits (`backyard-lawn`, `kitchen-raid`, `mars-outpost`, `pacific-fleet`, `ironhold-keep`, `dc-defense`) render the health indicator behind the exit squares (`maxExitX + 1`) matching their screen orientation — portrait vertical pill behind vertical 1×2 exits on desktop, landscape horizontal pill behind/below horizontal 2×1 exits on rotated phone.
  - **Edge-to-Edge Stretched Maps (`proto-web/src/layout.ts`, `render.ts`, `main.ts`)**: Expanded all 7 base `LAYOUTS` and added `adaptLayout(base, sw, sh)` to stretch boards across the full available space between player docks, HUD, and outer borders on 16:9, 16:10, 4:3, and portrait phone screens, with exact stretched `boardLocalToWorld`/`worldToBoardLocal`/`boardCellSize`, counter-scaled crisp in-map labels, and elliptical true-grid range previews.

## Verified (2026-11-20)
- `node scripts/validate-data.mjs` -> PASS (5 turrets, 6 enemies, 9 maps, 11 waves; all spawns reachable).
- `npm --prefix proto-web run typecheck` -> PASS (0 errors).
- `npm --prefix proto-web test` -> PASS (**337/337** across 12 suites, incl. Gnome splash opposite-90° split test and 12-viewport `adaptLayout` SAT & cell-mapping round-trip suite).
- Production builds (`/` and `VITE_BASE=/TTDefense/`) -> PASS (22 precached files).
- Live Chromium `http://localhost:5173/` (`1280×720` 16:9 desktop + `390×844` portrait phone) -> PASS (`0` console/page/network errors; visually confirmed full-bleed Backyard Lawn & Midnight Kitchen maps and orientation-matched portrait/landscape health bars behind House/Fridge squares). Archived in `.tasks/pass17-*.png`.
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
