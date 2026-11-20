# Coordination handoff

Updated: 2026-11-20 10:29 AM Pacific. Renamed **Galactic Alliance → Galactic Defense** across app/docs/GitHub, and completed Pass 11 (**Mars Meteor Showers, Turret Durability & Radial Credit Repair**); pushed to `seajhawk/tabletop` and republished to `https://seajhawk.github.io/TTDefense/`.

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
- **Rebrand (`Galactic Defense`)**: Renamed product/title/packages/storage key/docs/Godot config/benchmark/repo description from `Galactic Alliance` to `Galactic Defense` (preserving only the external Codex heartbeat ID `continue-galactic-alliance`).
- **9 Maps across 7 Themes** (`shared-data/maps.json`), **7 Adaptive Layouts** (vertical +90°-rotated `512×896` court on `2P phone` & `1P phone`), **Configurable Wave Count** (`5 | 10 | 15 | 20 | 30` in Settings), local best scores, offline PWA.
- **Pass 11 — Mars Meteor Showers & Credit Defense Repair**:
  - **Incoming Mars Meteors (`mars-storms`)**: `Meteor` pool spawns every `3.3–4.7s` (20% brisker cadence, and `1.25×` faster during Dust Storms) with anti-clustering target selection (avoids spawns/exits and the last 5 impact locations, spreading strikes across varied random spots & defenses).
  - **Telegraph, Fireball & Impact**: `1.35s` pulsing concentric ground warning reticle + streaking 3-layer glowing fireball, followed by fiery blast/craters dealing `18–40` damage to nearby defenses (`radius 1.65`) and `25` collateral scorch to ground enemies.
  - **Turret Durability & Offline State**: Towers have `hp`/`maxHp` (`100 -> 130 T1 -> 165 T2`, healing `+30/+35` on upgrade); `<50%` HP slows fire rate (`0.80×`); `0 HP` disables firing (`OFFLINE!` + pulsing repair emblem + smoke, preserving maze paths).
  - **Radial Credit Repair (`repair`)**: Tapping any damaged tower adds a 4th emerald **`REPAIR` / `FIX!`** radial button (`(0, +52)` opposite Upgrade) showing exact credit cost (`max(8, round(invested * 0.30 * missingRatio))`) & `+HP`; restores full HP, preserves strict `ledger.spent` conservation, and plays procedural `'ui-repair'` / `'meteor-warn'` / `'meteor-impact'` SFX.

## Verified (2026-11-20)
- `node scripts/validate-data.mjs` -> PASS (5 turrets, 6 enemies, 9 maps, 11 waves).
- `npm --prefix proto-web run typecheck` -> PASS (0 errors).
- `npm --prefix proto-web test` -> PASS (**322/322** across 12 suites, incl. Mars meteor spread/damage, offline disable, credit repair conservation, 4-button radial hit-test, and 30 `SoundEvent`s).
- Production builds (`/` and `VITE_BASE=/TTDefense/`) -> PASS (22 precached files).
- Live Chromium `http://localhost:5173/` (`1280×800`) -> PASS (`0` console/page/network errors; verified incoming streaking meteor + orange reticle, varied impact damage bar on `[3, 13]`, 4-button P2 radial showing `REPAIR 9 cr +80 HP`, and live repair deducting `9 cr` + `REPAIRED!` + clearing HP bar). Archived in `.tasks/pass11-*.png`.
- Unverified: physical device multi-touch/DPI/thermal feel and native OS PWA installation.

## Runtime
- Local Vite dev server running at `http://localhost:5173/`.
- Live Pages: `https://seajhawk.github.io/TTDefense/` & `https://seajhawk.github.io/tabletop/`.

## Next
1. Playtest Mars Meteor Showers & Credit Repair at `http://localhost:5173/` or `https://seajhawk.github.io/TTDefense/` (tap **Settings → Update app** if already cached on phone).
2. Verify physical multi-touch, DPI comfort, and sustained-load perf on target hardware.
