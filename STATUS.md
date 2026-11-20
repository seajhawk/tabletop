# Coordination handoff

Updated: 2026-11-20 12:05 PM Pacific. Pass 13 complete: **Ironhold Keep Overhaul** (Fire-Breathing Dragons + Credit Repair, Keep Wall Mounts, Cleaned-up Goblin/Orc/Dragon Sprites, Knight Stable 1/3/5 Cavalry, and Max-Power Flaming Trebuchet Ground Fire); pushed to `seajhawk/tabletop` and republished to `https://seajhawk.github.io/TTDefense/`.

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
- **Rebrand (`Galactic Defense`)**, **9 Maps across 7 Themes**, **7 Adaptive Layouts** (vertical +90° phone court), **Configurable Waves (`5–30`) + Overtime (`+ Add 5 More Waves?`)**, **Mars Meteor Showers & Radial Credit Repair**, local best scores, offline PWA.
- **Pass 13 — Ironhold Keep Medieval Overhaul**:
  - **Fire-Breathing Dragons (`phase` on `medieval-frenzy`)**: Crimson & gold winged dragons lock onto online towers (`<= 2.8` cells), slow to `0.38×` speed while unleashing a roaring 3-layer flame cone (`1.35s`, `28 DPS`, `'dragon-breath'` SFX), damaging/disabling defenses until repaired with credits via the 4-button radial menu.
  - **Keep Wall Mounts (`wallCells`)**: 12 highlighted stone battlement cells on `ironhold-keep` (`[21,5..6],[21,9..10],[22..25,5],[22..25,10]`, gold brackets + `WALL` tags) let players mount defenses directly on the castle ramparts for `+15%` range (`t.onWall`).
  - **Upgraded Medieval Attacker Sprites**: Replaced green-blob silhouettes in `theaterSprites.ts` with detailed top-down armored Goblins (pointed ears, spears/daggers/bucklers), spiked-steel horned Orc Brutes, crystal-skull Orc Shamans, winged Fire Dragons, and Siege Troll King.
  - **Knight Stable Defense (`swarm` on `medieval-frenzy`)**: Deploys friendly armored mounted Knights (`1` at Lv 1, `3` at Lv 2, `5` at Lv 3) on a slow recharge (`8.0s / 7.5s / 7.0s` + blue recharge bar) that gallop out to duel & stall ground invaders (`'knight-charge'` / `'knight-clash'` SFX; `AA` pill hidden on Stable card).
  - **Max-Power Flaming Trebuchet (`plasma` Tier 2)**: Fires blazing pitch fireballs (`p.flaming`) that ignite a persistent `4.5s` `FireZone` (`radius 1.35`, `22 DPS` + burn) scorching subsequent attackers on the road.

## Verified (2026-11-20)
- `node scripts/validate-data.mjs` -> PASS (5 turrets, 6 enemies, 9 maps, 11 waves; `wallCells` validated).
- `npm --prefix proto-web run typecheck` -> PASS (0 errors).
- `npm --prefix proto-web test` -> PASS (**330/330** across 12 suites, incl. Keep wall range, Dragon breath/slow/repair, Stable 1/3/5 Knight deployment & combat, T2 Trebuchet FireZone, and 33 `SoundEvent`s).
- Production builds (`/` and `VITE_BASE=/TTDefense/`) -> PASS (22 precached files).
- Live Chromium `http://localhost:5173/` (`1280×800`) -> PASS (`0` console/page/network errors; verified Keep `WALL` mounting, `Stable` dock card without `AA`, cleaned-up Goblin/Orc/Dragon art, Dragon roaring flame cones + radial `REPAIR`, mounted Knight cavalry squads, and max-power Trebuchet ground fire patches). Archived in `.tasks/pass13-*.png`.
- Unverified: physical device multi-touch/DPI/thermal feel and native OS PWA installation.

## Runtime
- Local Vite dev server running at `http://localhost:5173/`.
- Live Pages: `https://seajhawk.github.io/TTDefense/` & `https://seajhawk.github.io/tabletop/`.

## Next
1. Playtest the upgraded **Ironhold Keep** locally (`http://localhost:5173/`) or live at `https://seajhawk.github.io/TTDefense/` (tap **Settings → Update app** if already cached on phone).
2. Verify physical multi-touch, DPI comfort, and sustained-load perf on target hardware.
