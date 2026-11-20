# Prototype B — Godot 4 / GDScript

Cooperative multi-touch tower-defense slice that follows `docs/PROTOTYPE-CONTRACT.md`.
Compatibility (OpenGL) renderer, everything drawn procedurally in `Node2D._draw()`.

## Run (from the repo root `D:\git\tabletop\ga`)

```powershell
# 1. Copy canonical data into res://data (re-run whenever shared-data/ changes; -Check only verifies)
pwsh -NoProfile -File proto-godot\tools\sync-data.ps1

# 2. Headless tests (exit code 0 = pass)
.tools\godot-4.7.2\Godot_v4.7.2-stable_win64_console.exe --headless --path proto-godot --script tests/test_runner.gd

# 3. Play
.tools\godot-4.7.2\Godot_v4.7.2-stable_win64.exe --path proto-godot
```

If Godot has never opened the project, add `--import` once (or open it in the editor) before step 2.
If `res://data` is absent the loader falls back to `../shared-data`, but the sync script is
the supported path and `data/` must stay byte-identical to the canonical files.

## Controls

- Drag a turret card from your dock onto a free cell; release to buy. Green = legal, coral = rejected.
  Touch drags lift the ghost 60 px in the owning dock's facing direction so a finger does not cover it; mouse drags remain unlifted.
- Tap a turret (or right-click with a mouse) to sell it for 70% to its owner.
- Buttons (left column, drawn on the canvas — Godot `Button` nodes would need touch→mouse emulation, which is off):
  Start wave, Pause/Resume, Reset, Layout (cycles 2P opposing → 4P corners → 4P edges and resets),
  Stress 150+20 (uses canonical `maps.json` `stressTurrets` + 150 swarmers), Fullscreen. Keys: Space/P pause, Enter start, F11 fullscreen, Esc cancel drags.
- Right column shows FPS, live enemies, active pointers, wave, lives, state, kills/leaks, and the sell gesture hint.

## Layout

| Path | Role |
|------|------|
| `scripts/sim.gd` | Rules/state, 60 Hz `step()`, placement transaction, bounty, waves, stress |
| `scripts/grid_nav.gd` | Reverse multi-source BFS and neighbour choice |
| `scripts/touch_router.gd` | Per-pointer ownership (touch `index`, mouse id -1), drag/tap/button |
| `scripts/layout.gd` | Board/dock/button geometry; inverse-rotated dock hit tests |
| `scripts/game_view.gd` | Draw code only; reads sim and router |
| `scripts/main.gd` | Fixed-step accumulator, raw input dispatch, focus-loss handling |
| `scripts/data_loader.gd` | Loads and validates `res://data/*.json` |
| `tests/test_runner.gd` | Headless checks |
| `tools/sync-data.ps1` | Copies `../shared-data` into `data/` and compares hashes |

`project.godot` sets `emulate_mouse_from_touch=false` and `emulate_touch_from_mouse=false`;
touches are keyed by `InputEventScreenTouch/Drag.index`, the mouse uses a separate id.

## Honest gaps / unverified

- **Verified locally (headless + windowed)**: `sync-data.ps1 -Check` (4/4 identical) and `tests/test_runner.gd` (158/158 passed, exit 0). Windowed rendering of all 3 layouts and stress mode inspected via `.tasks/native-smoke.gd` screenshots.
- No real hardware multi-touch, DPI, performance or native-export testing. FPS numbers are local observations only.
- Rendering is plain 2D with stacked translucent strokes; no HDR/bloom/glow is used (deferred).
- Projectiles/effects are allocated objects, **not pooled**.
- Enemies move cell-centre to cell-centre (no smoothing). Board overlays/toasts are not rotated per player.
- `data/*.json` are JSON resources to Godot; add `*.json` to the export include filter for packaged builds.
- Deferred per contract: flick sharing, radial menu, upgrades, extra turrets/enemies, effect pools, export.
