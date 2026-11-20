# Coordination handoff

Updated: 2026-11-20 6:49 AM Pacific. Published `seajhawk/tabletop` & GitHub Pages (`https://seajhawk.github.io/TTDefense/`), and completed Pass 9 (**Kitchen Counter** & **Backyard Lawn** maps).

## Restart rule
Heartbeat `continue-galactic-alliance` ACTIVE, relative 5-hour interval; rearmed
at this restart (~3:54 AM Pacific Nov 20), before implementation. After a quota/usage
stall, rearm SAME timer for 5 hours from restart before other work. Never fixed daily.
Automation updates require `destination: "thread"`; omitted field was rejected once.

## Objective
Polish selected PixiJS/TypeScript game in `proto-web/`; `shared-data/` canonical.
Godot remains a historical prototype, not feature parity. Full design in `docs/`.

## Implemented
- **GitHub & Pages Publishing**:
  - Pushed full repo to public **`https://github.com/seajhawk/tabletop`** (`main`, with `.github/workflows/pages.yml` for `https://seajhawk.github.io/tabletop/`).
  - Published live GitHub Pages build at **`https://seajhawk.github.io/TTDefense/`** (`seajhawk/TTDefense`).
  - Subpath-safe Vite + PWA + Service Worker (`VITE_BASE`, relative manifest/icons, `GA_BASE` in `sw-template.js`/`sw-lib.mjs`/`pwa.ts`).
- **Core Game, Scores, Phone Settings & PWA**: 5 turrets × 2 upgrades, 6 enemy types,
  10 waves + stress, 3 difficulties, 7 adaptive solo/2P/4P layouts, phone Settings (860×1200,
  >=44 CSS px targets), local best scores, offline PWA with explicit safe updates.
- **9 Maps across 7 Themes** (`shared-data/maps.json`):
  - `orbital-crossing`, `asteroid-belt`, `nebula-rift` (`space`), `dc-defense` (`military`),
    `pacific-fleet` (`naval-subs-mines`), `mars-outpost` (`mars-storms`), `ironhold-keep` (`medieval-frenzy`).
  - **NEW — `kitchen-raid` (`Kitchen Counter`, `kitchen-rush`)**: illustrated countertop + open
    `FRIDGE` (`kitchen-map.jpg`), `"Appliances"` obstacles, 4 **Hot Stove Burners** (`+BURN`:
    `+25%` fire rate, `+20%` range + bonus `10 DPS / 2.5s` burn), periodic **Fridge Open — Snack Rush**
    (20s calm / 5.5s rush: `+30%` speed on unslowed pests, `0.80×` extra honey counter when slowed),
    themed sprites (`Swatter`, `Pepper Mill`, `Honey Trap`, `Chef Knife`, `Soap Spray`, Ants/Roaches/Rats/Fruit Flies/King Rat) & kitchen audio.
  - **NEW — `backyard-lawn` (`Backyard Lawn`, `lawn-split-burrow`)**: illustrated striped lawn +
    `HOUSE` porch (`lawn-map.jpg`), `"Garden Beds"` obstacles, 4 `+PWR` sunlit patio pads,
    **Burrowing Moles** (`frigate` moving as `moleMound` dirt mounds until flushed by `Thumper` or
    hit `1.4×` by `Mole Spade`), flying **Swarm Mosquitoes**, and **Giant Centipedes** (`cruiser`)
    that **split in half** on death into 2 fast `isSplitChild` halves (`0.72×` scale, non-recursive) +
    **Millipede Queen** Boss splitting halves on phase transitions.

## Verified (2026-11-20)
- `node scripts/validate-data.mjs` -> PASS (5 turrets, 6 enemies, 9 maps, 11 waves; all spawns reachable).
- `npm --prefix proto-web run typecheck` -> PASS (0 errors).
- `npm --prefix proto-web test` -> PASS (**248/248** across 11 suites, incl. subpath SW + Kitchen/Lawn mechanics).
- `npm --prefix proto-web run build` & `VITE_BASE=/TTDefense/ npm --prefix proto-web run build` -> PASS (22 precached files).
- Live Chromium `http://localhost:5173/` (`1280×800`) -> PASS (`0` console/network errors; HTTP `200` on
  `kitchen-map.jpg` & `lawn-map.jpg`; inspected initial layouts, `"Appliances"` & `"Garden Beds"` toasts,
  `FRIDGE OPEN! — SNACK RUSH` beam/banner, burrowing mole mounds/flushes, mosquitoes, centipedes, and
  `MILLIPEDE QUEEN` Boss). Archived in `.tasks/pass9-*.png`.
- Live GitHub Pages `https://seajhawk.github.io/TTDefense/` verified HTTP 200.
- Unverified: real hardware multi-touch, target-device frame times/DPI, and native app installation.

## Runtime
- Local Vite dev server running at `http://localhost:5173/`.
- Public repos: `seajhawk/tabletop` (source + Pages workflow) and `seajhawk/TTDefense` (live Pages).

## Next
1. Playtest `https://seajhawk.github.io/TTDefense/` with a friend (try `Kitchen Counter` and `Backyard Lawn`!).
2. Verify PWA install, offline reload, and physical multi-touch/DPI feel on real touch hardware.
3. Review sustained-load performance and remaining phone HUD/dock touch sizing.
