# Tier-two ability coverage — 2026-11-21

The upgraded fixture exercised both gaps from the [base-tier report](PERFORMANCE-THEATER.md):
natural Lawn centipede splits and active Medieval fire zones. Both samples are valid.
These are separate variable workloads, not a before/after performance comparison.

## Build and setup

- Production build `714f92cb16485834`, `assets/index-C4BRQSlh.js`, Git HEAD `4174842`.
  This build includes half-rate Medieval trebuchets, one-breath/dodging dragons and Healers.
  No Healers are present in these canonical 20-tower fixtures.
- Runs completed Nov 21 at 10:06–10:07 AM Pacific; exact UTC times in the raw JSON.
- Chromium 158.0.8127.36, RTX 3060/ANGLE D3D11, 412×915 viewport at DPR2,
  824×1830 canvas, `2p-phone` layout. Desktop GPU emulation, not a physical phone.
- One 1-second warm-up and 30-second sample per map, seed 12345; 60 Hz simulation.
  Lawn sampled 1800 steps; Medieval 1801. No concurrent test-suite execution.
- Initial enemies: 30 each of scout, swarmer, cruiser, frigate and phase. Replenish
  to a 150-enemy floor; retain natural extras up to the 450 cap. No bosses.
- The fixture initializes finite lives to 1e9; lives can decrease. Damage is not frozen
  and towers are not repaired during measurement.
- Each map validated 20 canonical base-tier towers, then performed 40 real
  `game.upgradeTower` calls. Exactly 4280 credits were granted and spent; both
  player wallets stayed at 195. Ledger deltas reconcile. All 20 towers reached
  tier 2, with aggregate HP 2000→3300 before warm-up. No direct tier/stat writes.

## Timing

| Map | rAF median / p95 / max (ms) | Sim÷wall | Core CPU p95 (ms) | Renderer prep CPU p95 (ms) |
| --- | --- | --- | --- | --- |
| Backyard Lawn | 16.7 / 16.8 / 18.3 | 0.9999 | 0.3 | 1.8 |
| Ironhold Keep | 16.7 / 16.8 / 17.0 | 1.0005 | 0.5 | 4.8 |

CPU timings exclude GPU completion, composition and most Pixi draw work. Timer
resolution is about 0.1 ms; a zero reading is below that resolution, not zero work.
Frame callbacks do not measure input latency. No FPS threshold was applied.

## Observed ability activity

| Sample | Evidence | Population before step / after refill | Tower HP start→end | Operational towers at end |
| --- | --- | --- | --- | --- |
| Lawn | 75 split cue calls; peak 29 split children; 28 mole-flush calls | 150–160; natural extras retained | 3300→3300 | 20 / 20 |
| Medieval | Peak 7 active fire zones and 40 knights; 100 dragon-breath and 769 knight-clash calls | 150 | 3300→1041.6 | 7 / 20 |

The Lawn result confirms natural splitting occurred without forced kills or reduced
enemy HP. Medieval fire zones were active; their damage contribution was not isolated.
Sound-event counts measure emission calls, not audible playback or damage.

All 20 Medieval towers remain placed, but 13 became disabled. The harness warns
about this; its later timing reflects fewer operational defenses. Tier 2 itself
is labeled as a separate fixture in each result.

Both runs had zero page, console, failed-request and blocked-request errors.
Score storage remained unchanged, no invariant violations occurred, and the
harness closed its isolated browser contexts.

## Reproduce and evidence

Use the [benchmark guide](BENCHMARKING.md) with one map per call:

```javascript
await benchmark(existingPage, {
  profile: 'theater', towerTier: 2, mapIds: ['backyard-lawn'], // or 'ironhold-keep'
  warmupMs: 1000, sampleMs: 30000,
  viewport: { width: 412, height: 915 }, deviceScaleFactor: 2,
});
```

Raw JSON: [Lawn](benchmarks/2026-11-21-tier2-lawn.json) and
[Medieval](benchmarks/2026-11-21-tier2-medieval.json).
Harness SHA256: `B342303628262B10D21EACA47BF787CCD39D8A57B96CEF756B16A5738814CAA3`.

Validation: syntax check passed; current full suite 373/373 across 12 suites
(including 97 benchmark tests). Test log: `.tasks/upgraded-current-full-tests.log`.
Earlier [sustained](PERFORMANCE-SUSTAINED.md) and base-tier samples use older builds,
different fixtures and shorter windows. Do not infer optimization gains or balance
quality from these differences. Physical multi-touch, thermal behavior, DPI comfort,
native PWA/PC installation, bosses and Healers remain outside these measurements.
No gameplay/data change or deployment was made for this benchmark work.
