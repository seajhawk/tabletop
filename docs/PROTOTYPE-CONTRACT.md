# First comparison: a small playable slice

The full roadmap is in [GAME-DESIGN.md](GAME-DESIGN.md). This slice is deliberately
smaller than its four milestones. Both builds implement the same rules below;
neither is production-ready, and choosing a stack requires the hardware checks.

## Shared data v1

Canonical files: `shared-data/{turrets,enemies,maps,waves}.json`. Each root has
`schemaVersion: 1` and an array named after the file (e.g. `turrets`). Load at startup.
Coordinates are zero-based `[x,y]`; index is `y * width + x`. Use four-way movement.
Distances are cells, speeds cells/second, times seconds, damage/credits plain numbers.

- Turret: `id`, `name`, `cost`, `range`, `fireRate`, `damage`, `projectileSpeed`,
  `splashRadius`, `slowFactor`, `slowDuration`, `color`, `upgrades`.
  `slowFactor: 0.6` means 40% slower; 1 means no slow. `projectileSpeed: 0` is hitscan.
  Upgrade records hold `name`, `cost`, `damageMultiplier`, `rangeBonus` (future use).
- Enemy: `id`, `name`, `hp`, `shield`, `speed`, `bounty`, `armor`, `flying`, `color`.
  First slice uses shield=armor=0 and flying=false; advanced records are not required.
- Map: `id`, `name`, `width`, `height`, `spawns`, `exits`, `asteroids`,
  `startingCredits` (per active player), `startingLives`.
  `stressTurrets` lists exactly 20 `[x,y,turretId]` placements in order; owner is
  placement index modulo active players. Both builds use this canonical stress fixture.
- Wave: `index`, `name`, `groups`: `{enemyId,count,interval,spawnIndex}`;
  `stress` boolean. Groups run concurrently; `spawnIndex` selects map spawn.
  Stress is separate from the ordinary wave progression.

## Required parity

1. A 28×16 map, asteroids, portals, Earth/exit and visible route preview.
2. Three rotatable dock layouts: 2P opposing, 4P corners, 4P edges. Three draggable
   turret choices per player (Pulse, Plasma, Stasis), color-coded ghosts, wallets.
3. Per-pointer ownership, simultaneous drags, cancellation and mouse fallback.
   Capture ownership at drag start. Revalidate placement and funds atomically on release.
4. Reverse multi-source BFS; reject occupied/reserved/outside cells and any placement
   that strands a spawn/live ground enemy. Reject an enemy-occupied cell. Rebuild on sale.
   Movement follows safe cell-center waypoints; bilinear smoothing is deferred to avoid
   corner-cutting until collision constraints are implemented.
5. Fixed 60 Hz simulation, wave/start-pause/reset controls, three enemy kinds, three
   turret roles. Pulse hitscan, Plasma splash projectile, Stasis radial timed slow.
   Pooled projectile state is desirable; do not claim pooling unless implemented.
6. Owner receives 70% bounty, all active players (including owner) split remaining 30%.
   Keep fractional balances internally; display one decimal, never round each payout.
7. Sell a turret for 70% cost to its owner (simple tap/right-click acceptable initially).
   This replaces the full radial UI only in this slice. Explain the gesture onscreen.
8. A repeatable stress control creates 150 swarmers and 20 turrets using legal cells,
   same data and deterministic placement in both; expose FPS, live enemy and pointer
   counts. Label measurements as local observations, not target-hardware certification.
9. Layout changes reset the match and pointers so ownership/active-player changes stay
   consistent. Pause freezes simulation; focus loss cancels drags and pauses.

## Explicitly deferred

Flick-to-share, complete Upgrade/Sell/Priority radial menu, upgrades, Railgun, Swarm
Pod, shields/armor/DoT/boss/flying systems, coop difficulty scaling, full effects pools,
native distributable export, gamepad/network play, final balance and finished assets.
Keep entries in the full brief; never imply these have shipped.

## Visual direction

The playfield is the interface: dark orbital chart, restrained grid, Earth on the right,
procedural asteroid silhouettes, clear incoming ships and weapons. Palette: space
`#081321`, grid `#20354B`, ice `#C5E4ED`, player cyan `#4CD9EF`, amber `#FFC16E`,
coral `#FF7F87`, mint `#82E3B4`. Use readable Segoe UI/system sans; alignment belongs
to each player's rotated dock. No external art/fonts needed. Docks sit outside the
playfield; scale and inverse-transform hit tests together. Keep touch targets generous.

## Useful official references

- [PixiJS v8 async application initialization](https://pixijs.com/8.x/guides/components/application)
- [Godot input event examples](https://docs.godotengine.org/en/stable/tutorials/inputs/input_examples.html)
- [Godot environment properties](https://docs.godotengine.org/en/stable/classes/class_environment.html)

Renderer limitations and browser input capture must be checked against the actual
installed version; the blueprint's renderer/glow assumptions are not guarantees.
