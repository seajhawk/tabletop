# Local performance sample

Measured **2026-11-20, 03:58 AM Pacific** against the production preview at
`http://127.0.0.1:4173/`. Simulation kept pace with wall time in all three samples.
Median animation-frame intervals were **17.6 ms**, with p95 **18.2–18.3 ms**;
this does **not** establish sustained 60 FPS or performance on the target touch PC.

## Method and environment

- Fresh isolated Chromium context, closed afterward; no existing user pages changed.
- Chromium **158.0.8127.36**, Windows; **1920×1080**, device-pixel ratio **1**.
- Browser-reported WebGL 2 renderer: **ANGLE / NVIDIA GeForce RTX 3060 / Direct3D11**.
  Software rendering was not reported. Browser metadata exposed 16 logical processors
  and 32 GiB device memory; CPU model, display refresh rate, and power state were not captured.
- **2P opposing**, two players, Medium difficulty, sound muted, page visible throughout.
- For each map: call `game.setMap(index)` and `game.setupStress()`, warm up for one
  second, then measure for four seconds. Each scene starts with 150 enemies and
  20 canonical towers. No enemies are replenished. Total reported run time: **15.47 s**.
- Record `requestAnimationFrame` intervals and enemy counts. Temporarily wrap
  `game.step` and `renderer.update` with `performance.now()`, then restore both.
  CPU preparation timings exclude GPU completion, browser composition, and most
  of Pixi's separate rendering work. Percentiles use the nearest-rank method.

## Results

| Map | Sample wall time | rAF callbacks | rAF median / p95 / max | Simulation advanced | Sim/wall ratio | Live enemies min–max (end) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Orbital Crossing | 4.0049 s | 227 | 17.6 / 18.3 / 19.3 ms | 4.0000 s | 0.9988 | 0–148 (0) |
| Pacific Fleet | 4.0035 s | 228 | 17.6 / 18.2 / 18.8 ms | 4.0167 s | 1.0033 | 140–149 (140) |
| Ironhold Keep | 4.0024 s | 227 | 17.6 / 18.3 / 18.8 ms | 4.0000 s | 0.9994 | 0–150 (0) |

All samples retained 20 towers, remained unpaused, and produced no captured page errors.
There is one fewer rAF interval than callback because the first callback establishes
the starting timestamp. Simulation ran 240, 241, and 240 steps respectively.

| Map | Simulation CPU median / p95 | Simulation CPU total | Renderer-update CPU median / p95 | Renderer-update CPU total |
| --- | ---: | ---: | ---: | ---: |
| Orbital Crossing | 0.0 / 0.2 ms | 13.6 ms | 0.2 / 0.7 ms | 68.0 ms |
| Pacific Fleet | 0.1 / 0.3 ms | 22.6 ms | 0.2 / 1.0 ms | 74.7 ms |
| Ironhold Keep | 0.0 / 0.2 ms | 13.0 ms | 0.3 / 0.9 ms | 87.9 ms |

Zero-duration samples are below timer resolution, not evidence of zero CPU cost.

## Interpretation and limits

Space and medieval enemies fell to zero before measurement ended; their timings
include lighter and empty-board frames. Naval retained 140–149 enemies during its
sample. These are **short burst samples, not a sustained 150-enemy benchmark** and
not comparable equal-load engine scores. A four-second single run cannot characterize
thermal throttling, long-frame tails, browser background work, or device variability.

No touch gestures, input latency, high-DPI rendering, phone layout, installed-app
launch, or target-hardware behavior were measured. This sample used the production
PWA build preceding the subsequent phone Settings UI changes; no build hash was
recorded. Repeat on the intended device with a sustained-load harness before drawing
performance conclusions about gameplay there.

Local reproduction/evidence: `.tasks/perf-sample.js` and
`.tasks/perf-results-2026-11-20.json` (ignored, machine-local artifacts).
