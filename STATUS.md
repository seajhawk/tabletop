# Coordination handoff

Updated: 2026-11-20 12:37 PM Pacific. Pass 14 complete: redesigned Kitchen map into true-to-scale full-room **Midnight Kitchen** floorplan with mountable Countertops, real built-in Stove/Induction burners, and patrolling **Roomba** Robot Vacuum defense; pushed to `seajhawk/tabletop` and republished to `https://seajhawk.github.io/TTDefense/`.

## Restart rule
Heartbeat `continue-galactic-alliance` ACTIVE, relative 5-hour interval; rearmed
at this restart (~3:54 AM Pacific Nov 20), before implementation. After a quota/usage
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
- **Pass 14 — Midnight Kitchen Full-Room Floorplan & Roomba Defense**:
  - **Architectural Floorplan Redesign (`kitchen-raid` → `"Midnight Kitchen"`)**: Replaced mismatched countertop art with a cohesive 90° top-down full-room kitchen (`kitchen-map.jpg`): checkered linoleum floor, left pantry doorway (`PANTRY`), full-size stainless **Refrigerator** standing naturally on the floor (`FRIDGE` at `[24,7..8]`), true-scale `"Furniture"` floor obstacles (center butcher-block island + barstools, trash/recycling bins, pet bowls, step stool/mop bucket, grocery bag on rug, double sink).
  - **Mountable Granite Countertops (`wallCells`, `COUNTER`)**: 10 perimeter countertop spots along top & bottom counters granting `+15%` high-ground range (`t.onWall`).
  - **Built-In Stove & Induction Burners (`boostCells`, `+BURN`)**: 4 real glowing burners (`[12,2],[15,2],[13,14],[15,14]`) granting `+25%` fire rate, `+20%` range, and `10 DPS` burn + Fridge Open Snack Rush.
  - **Roomba / Robot Vacuum Defense (`swarm` on `kitchen-rush`)**: Replaces Soap Spray with a **Roomba Dock** (`VAC`, no `AA` badge) deploying **1 / 2 / 3 Roombas** at Lv 1/2/3 on slow recharge (`7.5s / 7.0s / 6.5s`, cyan recharge bar) that roll across the checkered floor performing 360° AoE vacuum sweeps (`0.85 + tier * 0.15` radius, slow, stove-burn synergy, `'roomba-deploy'` & `'roomba-sweep'` SFX).

## Verified (2026-11-20)
- `node scripts/validate-data.mjs` -> PASS (5 turrets, 6 enemies, 9 maps, 11 waves; all spawns reachable).
- `npm --prefix proto-web run typecheck` -> PASS (0 errors).
- `npm --prefix proto-web test` -> PASS (**332/332** across 12 suites, incl. Midnight Kitchen countertop `onWall`, Roomba 1/2/3 deployment & AoE sweep, `roomba` sprite, and 35 `SoundEvent`s).
- Production builds (`/` and `VITE_BASE=/TTDefense/`) -> PASS (22 precached files).
- Live Chromium `http://localhost:5173/` (`1280×800`) -> PASS (`0` console/page/network errors; HTTP `200` on new `kitchen-map.jpg`; verified `Midnight Kitchen` floorplan, `"Furniture"` island toast, `COUNTER` / stove / floor placements, and active patrolling Roombas sweeping pests). Archived in `.tasks/pass14-*.png`.
- Unverified: physical device multi-touch/DPI/thermal feel and native OS PWA installation.

## Runtime
- Local Vite dev server running at `http://localhost:5173/`.
- Live Pages: `https://seajhawk.github.io/TTDefense/` & `https://seajhawk.github.io/tabletop/`.

## Next
1. Playtest the redesigned **Midnight Kitchen** & **Roomba** defense locally (`http://localhost:5173/`) or at `https://seajhawk.github.io/TTDefense/` (tap **Settings → Update app** if already cached).
2. Verify physical multi-touch, DPI comfort, and sustained-load perf on target hardware.
