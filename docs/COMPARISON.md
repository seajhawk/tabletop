# Stack comparison worksheet

Do not select a winner from screenshots or a developer workstation FPS reading.
Run both prototypes on the same target device with the same map, player layout,
window size and test duration. First choose between stacks; then finish the roadmap.

## First playable slice

| Test | Procedure | Web | Godot |
| --- | --- | --- | --- |
| Basic loop | Place each of three weapons; launch all ordinary waves; sell; reset | Local smoke + unit tests pass (interactive 3-wave playthrough on target device pending) | Local headless/SceneTree tests pass (interactive 3-wave playthrough on target device pending) |
| Anti-walling | Build toward a complete wall; last placement must reject without charging | Automated tests pass (spawn + live-enemy + concurrent drop) | Automated tests pass (spawn + live-enemy + concurrent drop) |
| Four independent fingers | Use 4P layout; drag four weapons at once, cross paths, release together | Hardware pending (4-pointer synthetic routing tests pass) | Hardware pending (4-touch SceneTree smoke + unit tests pass) |
| Cancellation | Drag off window, switch apps, resume; no stuck ghosts or credit loss | Automated DOM cancel/blur/visibility tests pass; interactive OS check pending | Automated touch-cancel + focus-loss tests pass; interactive OS check pending |
| Layouts | Check opposing/corner/edge docks, rotations, readable wallets, correct hitboxes | Automated + 1280×800 visual check pass (0 overlaps); touch comfort hardware pending | Automated + 1280×800 visual check pass (0 overlaps); touch comfort hardware pending |
| Economy | Compare owner and teammate credits after kills; verify no rounding losses | Automated + live browser stress check pass (exact 70/30, 1-decimal display) | Automated tests pass (exact 70/30, 1-decimal display) |
| Stress | Repeat the identical 150-ship + 20-tower burst for 60 seconds; record peak-load frames separately | Hardware pending (local burst smoke passes; 0 console errors) | Hardware pending (local burst smoke passes; 0 runtime errors) |
| Input latency | Record rapid drag with phone slow-motion; compare fingertip/ghost separation | Hardware pending | Hardware pending |
| DPI | Repeat 100%, 150%, 200% Windows scaling; check 4K if available | Hardware pending | Hardware pending |
| Iteration speed | Change one turret cost in shared-data, restart both and verify | Direct Vite import of `shared-data/*.json`; hands-on timing pending | `sync-data.ps1` (run by `start-godot.ps1`); hands-on timing pending |

Record device/GPU, power mode, OS scaling, viewport resolution, renderer, build version,
active-player count, exact stress placement, average FPS, worst frame time and dropped
touches. Include screenshots plus notes on comfort and legibility. Browser emulation
can verify routing logic but cannot certify physical four-finger input or panel latency.
The initial stress scene is a burst: ships die quickly. It does not sustain 150 live
ships for a minute; a sustained-load harness remains future profiling work.

## Local verification snapshot (2026-11-19 — workstation only, NOT hardware certification)

- **Shared data**: `node scripts/validate-data.mjs` passes; `proto-godot/tools/sync-data.ps1 -Check` confirms 4/4 byte-identical JSON files.
- **Web (`proto-web`)**: `npm --prefix proto-web test` passes (`58/58` across 4 suites); `typecheck` & `build` pass; live Chromium check at `1280×800` verified 0 console errors, interactive drag/wave/sell loop, all 3 layouts (`opposing`, `corners`, `edges`), and canonical `Stress 150 + 20` scene. Screenshots archived in `.tasks/web-*.png`.
- **Godot (`proto-godot`)**: `tests/test_runner.gd` headless passes (`158/158`); `.tasks/native-smoke.gd` windowed passes (`10/10`, 0 errors) covering 4-touch corner drags with 60 px touch finger-lift, cancellation, focus-loss pause, all 3 layouts, and canonical `Stress 150 + 20`. Screenshots archived in `.tasks/godot-*.png`.

## Decision guidance

- Favor Web if target-hardware touch and frame-time tests pass and distribution/iteration
  are easier. Browser fullscreen and wake lock depend on the browser and user gestures.
- Favor Godot if native interaction, frame stability and eventual packaging materially
  improve the experience enough to justify the additional toolchain.
- If either has a basic bug, fix it before scoring the engine. Keep gameplay and assets
  comparable; do not count deferred HDR/radial menus against only one stack.
- Advanced Godot HDR glow and standalone exports remain separate follow-up work.

Decision: **Prototype A (Web / TypeScript + Vite + PixiJS v8)** selected by user on 2026-11-19 to proceed into full game development (`docs/GAME-DESIGN.md`). Prototype B (`proto-godot/`) remains preserved as reference.
