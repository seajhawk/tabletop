# Coordination handoff

Updated: 2026-11-20 3:39 PM Pacific. Pass 16 complete: Backyard Lawn Giant Centipede split parts now turn ±90° perpendicular to the parent's travel direction and advance up to 3 grid squares (stopping early if blocked by obstacles, turrets, or map edges) before turning back toward the House; verified, pushed to `seajhawk/tabletop`, and republished to `https://seajhawk.github.io/TTDefense/`.

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
- **Pass 16 — Backyard Lawn Centipede ±90° Split & 3-Square Flank**:
  - Updated `Enemy` (`divertDx`, `divertDy`, `divertSteps`), `pickNext()`, and `spawnSplitChildren()` in `proto-web/src/sim/game.ts`.
  - When a Giant Centipede (`cruiser`) splits (or Millipede Queen spawns split halves), the 2 resulting parts turn **±90° perpendicular** to the parent's cardinal travel direction, advance up to **3 grid squares** (`divertSteps = 3`) if open/reachable, and cancel early to resume BFS pathing toward the House if blocked by a map boundary, obstacle, or turret.

## Verified (2026-11-20)
- `node scripts/validate-data.mjs` -> PASS (5 turrets, 6 enemies, 9 maps, 11 waves; all spawns reachable).
- `npm --prefix proto-web run typecheck` -> PASS (0 errors).
- `npm --prefix proto-web test` -> PASS (**335/335** across 12 suites, incl. 3 new deterministic tests for horizontal ±90° 3-square split, vertical ±90° 3-square split, and obstacle/turret/edge early-stop).
- Production builds (`/` and `VITE_BASE=/TTDefense/`) -> PASS (22 precached files).
- Live Chromium `http://localhost:5173/` (`1280×800`) -> PASS (`0` console/page/network errors; verified Wave 3 `Centipede Split` on Backyard Lawn with North/South ±90° split halves scuttling vertically from East-moving parent). Archived in `.tasks/pass16-centipede-split-90deg.png`.
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
