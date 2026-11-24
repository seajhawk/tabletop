# Sustained browser performance samples — 2026-11-20

Completed local verification milestone. No app changes and no optimizations were made.
These are short, synthetic, same-machine samples, not an engine comparison or a
performance guarantee.

## Run identity

- **When:** Nov 20, 2026, about 1:59–2:00 PM Pacific (`21:59:04Z` desktop, `21:59:42Z` phone viewport).
- **Build:** service-worker version `01ff4d32926e0668`, main script `assets/index-CIQ8e-gj.js` (production preview, `127.0.0.1:4173`, service workers blocked).
- **Browser/GPU (both runs):** Chromium 158.0.8127.36, NVIDIA GeForce RTX 3060 via ANGLE/D3D11, WebGL 2.0.
- **Profiles:** desktop 1920×1080 at DPR 1; phone viewport 412×915 at DPR 2 (canvas 824×1830). The phone profile is **desktop-GPU emulation, not a physical phone**.
- **Raw results:** [desktop JSON](benchmarks/2026-11-20-desktop.json), [phone-viewport JSON](benchmarks/2026-11-20-phone-viewport.json). Reproduction: [BENCHMARKING.md](BENCHMARKING.md).

## Workload

- Each scenario: 1 s warm-up plus 4 s sample, seed `12345`, speed 1×, 20 canonical towers.
- A 150-Swarmer population is held constant: the count is exactly 150 before every step and after every refill.
- Combat dips after a step are allowed and refilled separately; counts fell as low as 75 before replenishment.
- Fixture lives are a finite 1,000,000,000. HP, movement and damage are not frozen, and there is no path freezing.

## Results (six scenarios)

| Map | Viewport profile | rAF median / p95 / max (ms) | Sim/wall ratio | Core CPU p95 (ms) | Renderer prep CPU p95 (ms) | Replacements (4 s sample) |
| --- | --- | --- | --- | --- | --- | --- |
| Orbital Crossing | Desktop 1920×1080 @1 | 16.7 / 16.8 / 17.2 | 1.002 | 0.6 | 3.3 | 231 |
| Pacific Fleet | Desktop 1920×1080 @1 | 16.7 / 16.8 / 17.0 | 0.998 | 0.9 | 2.2 | 13 |
| Ironhold Keep | Desktop 1920×1080 @1 | 16.7 / 16.8 / 17.0 | 1.002 | 0.9 | 3.7 | 185 |
| Mars Outpost | Phone 412×915 @2 | 16.7 / 16.8 / 33.2 | 1.001 | 0.7 | 2.7 | 155 |
| Midnight Kitchen | Phone 412×915 @2 | 16.7 / 16.8 / 17.0 | 0.999 | 0.9 | 4.8 | 425 |
| Backyard Lawn | Phone 412×915 @2 | 16.7 / 16.8 / 17.0 | 0.999 | 0.8 | 3.0 | 157 |

## Observations

- Both runs report `valid: true` with no failures, warnings, page/console errors, failed or blocked requests. Best-score storage was unchanged and the browser contexts were cleaned up.
- rAF cadence was about 60 Hz (median 16.7 ms, p95 16.8 ms) in all six scenarios. **Mars Outpost reached a maximum interval of 33.2 ms** across 239 measured intervals; its cause is not determined.
- **Midnight Kitchen** had the highest renderer-prep CPU (p95 4.8 ms, mean 2.5 ms) and the most replacements (425). This does not identify a bottleneck without profiling.
- Core simulation CPU p95 stayed at or below 0.9 ms in every scenario.

## What the numbers mean

- CPU figures are `performance.now()` timings (timer resolution about 0.1 ms) for core step, refill and `renderer.update` preparation. **GPU timings are not included** in renderer prep CPU, nor are composition and most Pixi draw work.
- rAF interval is browser callback cadence, **not input latency**.
- Replacement counts reflect defeated or leaked Swarmers being replenished, so they differ by map and are not a performance score.

## Unknowns (not tested)

- Physical phone or tablet hardware, long-duration thermal behavior, real multi-touch, high-DPI comfort, native PWA installation.
- Full campaign mixes: bosses, subs, split units and other mixed enemies are not represented by a Swarmer-only fixture.
- Short 4 s samples may not trigger newer mechanics at all (e.g. Roomba sweeps, Mars meteor showers), so those paths are effectively unmeasured.
- No FPS threshold was applied. `valid: true` means the invariants held, not that performance is certified.
