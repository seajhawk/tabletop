# Theater browser measurements (variable workload)

Four one-map samples of the opt-in `profile: 'theater'` harness, run 2026-11-20
19:15–19:17 Pacific (exact UTC times in each JSON). Guide: [BENCHMARKING.md](BENCHMARKING.md).
Fixed-workload baseline: [PERFORMANCE-SUSTAINED.md](PERFORMANCE-SUSTAINED.md).
Later [tier-two samples](PERFORMANCE-TIER2.md) exercise the missing split/fire-zone paths
on a newer build and a distinct fixture; they do not change this report's coverage limits.

Raw evidence: [kitchen](benchmarks/2026-11-20-theater-kitchen.json) ·
[lawn](benchmarks/2026-11-20-theater-lawn.json) ·
[mars](benchmarks/2026-11-20-theater-mars.json) ·
[medieval](benchmarks/2026-11-20-theater-medieval.json)

## Setup

- Production build `7ac8de128e70edd8` (`index-DnyzsWPt.js`), served locally at 127.0.0.1:4173,
  service workers blocked, sound muted via existing hooks.
- Viewport 412×915, DPR 2 (`2p-phone` layout) in desktop Chromium 158 on an RTX 3060
  workstation. This is **not** a physical phone.
- Per map: 1 s warm-up, then one 25 s sample (1500 steps; Mars 1501), fixed 60 Hz, seed 12345.
- Canonical fixture: 20 base-tier towers; 30 each of scout, swarmer, cruiser, frigate and
  phase (150 enemies), no bosses. Population is a floor of 150 replenished each step
  with a 3× (450) cap. Lives initialized to 1e9 and allowed to decrease; no tower
  repairs or saved-score writes.
- All four runs: `valid: true`, 0 step errors, 0 page/console/network errors, scores
  unchanged, browser contexts closed.

## Timing

Ratios and times are from the sample window. CPU columns are `performance.now()` spans.
GPU time, compositing and most Pixi draw work are not measured.

| Map | rAF median / p95 / max (ms) | Sim÷wall | Core step CPU p95 (ms) | Renderer prep CPU p95 (ms) |
|---|---|---|---|---|
| Midnight Kitchen | 16.7 / 16.8 / 17.0 | 0.9999 | 0.4 | 4.8 |
| Backyard Lawn | 16.7 / 16.8 / 17.6 | 0.9999 | 0.5 | 4.7 |
| Mars Outpost | 16.7 / 16.8 / 17.1 | 1.0006 | 0.3 | 4.1 |
| Ironhold Keep | 16.7 / 16.8 / 17.1 | 0.9999 | 0.3 | 3.9 |

Refill CPU p95 was ≤ 0.1 ms in every run. Each run's population stayed at the 150 floor
after refill (`overflowSteps` 0).

## Evidence of what ran

Cue counts are `game.emitSound` **call** counts in the sample window: emission only. They
are not proof of audible sound or of damage. Tower HP is aggregate across the 20 towers
(start 2000) and does confirm health loss. Operational = placed towers with HP > 0.

| Map | Cue calls | Distinctive cues | Active peaks | Tower HP start→end | Operational end |
|---|---|---|---|---|---|
| Kitchen | 760 | roomba-deploy 12, roomba-sweep 128, fridge-open 1 | Roombas 6, projectiles 2 | 2000→2000 | 20 / 20 |
| Lawn | 849 | shot-swarm 62, impact-missile 122, mole-flush 22 | projectiles 14 | 2000→2000 | 20 / 20 |
| Mars | 813 | meteor-warn 6, meteor-impact 6, dust-storm 1 | meteors 1, projectiles 14 | 2000→1784 | 20 / 20 |
| Medieval | 588 | dragon-breath 126, knight-clash 72, knight-charge 8, enrage 1 | knights 5, projectiles 2 | 2000→700 | 7 / 20 |

## Coverage limits

- **Lawn: no centipede split.** No split was emitted and `splitChildMax` was 0. These
  numbers are **not** split-performance coverage.
- **Medieval: no fire zones.** `fireZonesMax` was 0, as expected with base-tier plasma
  (not upgraded). The flaming trebuchet is not covered.
- **Mars** lost HP (2000→1784) with all 20 towers still operational.
- **Medieval** lost HP (2000→700) and fell to 7 operational of 20 (all 20 stay placed;
  disabled towers are not repaired). The harness warning records this: the workload
  declined as towers went down, so timings are **not** a constant-defense workload.
- No bosses; one sample per map; one seed.

## Interpretation

- Workload varies per map and over time (enemy mix, projectiles, hazards, tower losses),
  so the figures are not comparable to the fixed 150-Swarmer baseline or across maps.
- This fixture is not a campaign balance result.
- No balance or optimization changes are recommended without profiling.
- Unverified: physical-device multi-touch, thermal behavior, GPU time, DPI, and native
  PWA installation.
- No app code changed and nothing was deployed for this measurement.
