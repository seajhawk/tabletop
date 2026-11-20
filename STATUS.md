# Coordination handoff

Updated: 2026-11-20 10:43 AM Pacific. Pass 12 complete: **"+ Add 5 More Waves?"** Overtime continuation on Victory with rapidly escalating exponential difficulty; pushed to `seajhawk/tabletop` and republished to `https://seajhawk.github.io/TTDefense/`.

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
- **Rebrand (`Galactic Defense`)**: Renamed product/title/packages/storage key/docs/Godot config/benchmark/repo description (preserving only external Codex heartbeat ID `continue-galactic-alliance`).
- **9 Maps across 7 Themes** (`shared-data/maps.json`), **7 Adaptive Layouts** (vertical +90° phone court on `2P phone` & `1P phone`), **Configurable Waves** (`5 | 10 | 15 | 20 | 30`), **Mars Meteor Showers & Radial Credit Repair**, local best scores, offline PWA.
- **Pass 12 — "+ Add 5 More Waves?" Overtime Continuation**:
  - **Victory Card (`over === 'won'`)**: Added prominent gold-highlighted **`+ Add 5 More Waves?`** button above `▶ Play Again` and `Next Map ▸` (desktop `500×296`, phone `480×540` with all targets `>= 44 CSS px`; hidden and unclickable on defeat/stress).
  - **State Preservation & Repeat Overtime**: Clicking `+ Add 5 More Waves?` (`game.addMoreWaves(5)`) keeps all towers, upgrades, credits, lives, and kills intact, pauses for a planning breather, appends 5 late-game waves (ending every +5 block on a Boss wave, tagged `OT` / `OT2`...), and allows chaining again if cleared.
  - **Rapidly Escalating Overtime Difficulty**: Past the configured wave count (`overtimeStartWave`), enemy HP escalates exponentially at **`1.16^ot`** per overtime wave (vs `+5%/wave` linear base), speed increases **`+3.5%/wave`** (up to `+45%`), non-boss group counts grow **`1.20^batch`**, and spawn intervals tighten (`-10%/batch`, min `0.55×`).

## Verified (2026-11-20)
- `node scripts/validate-data.mjs` -> PASS (5 turrets, 6 enemies, 9 maps, 11 waves).
- `npm --prefix proto-web run typecheck` -> PASS (0 errors).
- `npm --prefix proto-web test` -> PASS (**326/326** across 12 suites, incl. overtime guards, chaining, exponential HP/speed scaling, 3-button summary fit `>= 44 CSS px` on phone, and victory/defeat hit gating).
- Production builds (`/` and `VITE_BASE=/TTDefense/`) -> PASS (22 precached files).
- Live Chromium `http://localhost:5173/` (`1280×800`) -> PASS (`0` console/page/network errors; cleared 5-wave Easy match -> inspected `EARTH IS SAFE` Victory card with `+ Add 5 More Waves?` -> clicked -> verified `+5 Overtime Waves! (W6–10)`, preserved towers/credits/lives, and launched `W6/10 • Combined Arms OT`). Archived in `.tasks/pass12-*.png`.
- Unverified: physical device multi-touch/DPI/thermal feel and native OS PWA installation.

## Runtime
- Local Vite dev server running at `http://localhost:5173/`.
- Live Pages: `https://seajhawk.github.io/TTDefense/` & `https://seajhawk.github.io/tabletop/`.

## Next
1. Playtest Overtime (`+ Add 5 More Waves?`) and Mars Meteors at `http://localhost:5173/` or `https://seajhawk.github.io/TTDefense/` (tap **Settings → Update app** if already cached on phone).
2. Verify physical multi-touch, DPI comfort, and sustained-load perf on target hardware.
