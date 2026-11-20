# Coordination handoff

Updated: 2026-11-20 8:34 AM Pacific. Pass 10 complete: vertical 90°-rotated phone battlefield (`2p-phone` / `1p-phone`) and configurable wave count (`5 | 10 | 15 | 20 | 30`) in Settings; pushed to `seajhawk/tabletop` and republished to `https://seajhawk.github.io/TTDefense/`.

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
  - Main repo: `https://github.com/seajhawk/tabletop` (`main`, Node 22 Actions CI + Pages at `https://seajhawk.github.io/tabletop/`).
  - Shareable Pages site: **`https://seajhawk.github.io/TTDefense/`** (`seajhawk/TTDefense`, subpath-safe PWA/SW).
- **9 Maps across 7 Themes** (`shared-data/maps.json`): Space (`Orbital Crossing`,
  `Asteroid Belt`, `Nebula Rift`), Military (`Washington DC`), Naval (`Pacific Fleet`:
  stealth subs/sonar/ASW/mines), Mars (`Mars Outpost`: geothermal vents/dust storms),
  Medieval (`Ironhold Keep`: arcane runes/orc frenzy), Kitchen (`Kitchen Counter`:
  stove `+BURN` + Fridge Open Snack Rush), Lawn (`Backyard Lawn`: burrowing moles,
  mosquitoes, centipedes that split in half).
- **Pass 10 — Vertical Phone Court & Configurable Waves**:
  - **`2P phone` (`548×1244`) & `1P phone` (`548×1140`)**: `boardRotated: true` rotates the
    `28×16` grid +90° CW into a full-screen vertical `512×896` court (~65% larger cells on
    portrait phones, enemies march top-to-bottom toward the base above P1's dock).
    `boardRoot` rotates all 9 maps/sprites/FX while counter-rotating labels & enemy HP bars
    upright; `boardLocalToWorld`/`worldToBoardLocal`/`cellAt` keep drag/drop & radials exact.
    Phone Settings (`516×1060`) & Summary (`480×440`) keep all touch targets `>= 44 CSS px`.
  - **Configurable Wave Count (`5 | 10 | 15 | 20 | 30`, default `10`)**: `Waves: N` button
    paired with `Diff:` on Row 3 of Settings; `buildWavePlan()` scales 5-wave quick matches
    (Boss on W5 at `0.80×` HP) and 15/20/30-wave endurance runs (Bosses on W10/20/30 & final
    wave) with themed tier names (`formatWaveName`) and separate `ScoreBook` keys for non-10 runs.

## Verified (2026-11-20)
- `node scripts/validate-data.mjs` -> PASS (5 turrets, 6 enemies, 9 maps, 11 waves).
- `npm --prefix proto-web run typecheck` -> PASS (0 errors).
- `npm --prefix proto-web test` -> PASS (**253/253** across 11 suites, incl. rotated phone
  geometry/hit-testing, `>= 44 CSS px` phone Settings targets, and 5/10/15/20/30 wave plans).
- Production builds (`/` and `VITE_BASE=/TTDefense/`) -> PASS (22 precached files).
- Live Chromium `http://localhost:5173/` (`412×915` portrait phone & `1280×800` desktop) -> PASS
  (`0` console/page/network errors; verified vertical `2P phone` & `1P phone` on Space and
  `Backyard Lawn`, drag/drop + radial menus on rotated grid, `Waves` cycling `10->15->20->30->5`,
  5-wave Boss spawn, and desktop Settings). Boss bar / storm pill offset below Wave pill on
  vertical phone boards. Archived in `.tasks/pass10-*.png`.
- Unverified: physical device multi-touch/DPI/thermal feel and native OS PWA installation.

## Runtime
- Local Vite dev server running at `http://localhost:5173/`.
- Live Pages: `https://seajhawk.github.io/TTDefense/` & `https://seajhawk.github.io/tabletop/`.

## Next
1. Playtest the updated vertical `2P phone` layout and `Waves` setting on a real phone at `https://seajhawk.github.io/TTDefense/` (note: tap **Settings → Update app** if an older PWA cache is installed!).
2. Verify physical multi-touch, DPI comfort, and sustained-load perf on target hardware.
