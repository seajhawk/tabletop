# Prototype B completion report

Status: **verified in Godot 4.7.2 (headless + windowed).** `sync-data.ps1 -Check` (4/4 identical) and `tests/test_runner.gd` (158/158 passed, exit 0) pass after the final edit. Windowed rendering of all 3 layouts and stress mode (`150` swarmers + `20` canonical `stressTurrets`) was captured and visually inspected with zero HUD/dock/Earth overlap.

## Files (all under `proto-godot/`)

- `project.godot` — 1280x800, canvas_items/keep stretch, gl_compatibility, both touch/mouse emulations off, 60 Hz physics.
- `scenes/Main.tscn` — `Main` (main.gd) + child `GameView` (game_view.gd).
- `scripts/` — `sim.gd`, `grid_nav.gd`, `touch_router.gd`, `layout.gd`, `game_view.gd`, `main.gd`, `data_loader.gd`.
  No `class_name`s; scripts use `preload` consts so headless `--script` runs need no editor class cache.
- `data/*.json` — initial copy written by hand from `shared-data/` (same content; line endings may differ).
  Run `tools/sync-data.ps1` to make them byte-identical. `tests/test_runner.gd` also compares them (CRLF-normalised).
- `tools/sync-data.ps1` (`-Check` verifies only), `tests/test_runner.gd`, `README.md`, `.gitignore` (`.godot/`).

## To run (parent)

```powershell
pwsh -NoProfile -File proto-godot\tools\sync-data.ps1
.tools\godot-4.7.2\Godot_v4.7.2-stable_win64_console.exe --headless --path proto-godot --import
.tools\godot-4.7.2\Godot_v4.7.2-stable_win64_console.exe --headless --path proto-godot --script tests/test_runner.gd
```

## Covered by tests (158 passed, 0 failed)

BFS exits/spawns/asteroids; placement trapping a spawn; placement stranding a live ground enemy
(plus the same cell legal without the enemy); enemy-occupied/next-cell rejection; reserved/outside/
asteroid/occupied; atomic funds rejection and competing drops; sell 70% refund + field rebuild;
bounty conservation (2/3/4 players, fractions retained); kill-to-bounty flow; stress = 20 canonical
`stressTurrets` + 150 enemies, legal and connected; determinism; all three layouts' inverse-rotated
scaled dock hits, Earth clearance, and on-screen docks; router independence, ownership capture,
60 px touch finger-lift along rotated `dock.up()` (mouse unlifted), cancel, mouse id, `cancel_all`.

## Implemented per contract

28x16 map, route preview, three rotated layouts (default 2P) that reset the match, Pulse/Plasma/Stasis,
70/30 fractional bounty, three waves + separate stress wave, atomic placement with spawn + live-enemy BFS
validation, simple-click sell, pause/focus-loss cancel, FPS/enemies/pointers, canvas buttons, touch finger-lift.

## Remaining gaps / risks

- Hardware multi-touch feel, high-DPI scaling, sustained frame-time performance, and native export are unverified on target touch hardware.
- Projectiles/effects (`Projectile`, `Beam`, `Ring`) are allocated objects, not pooled.
- No HDR/bloom/glow; enemies move cell-centre to cell-centre; deferred items remain per contract.
