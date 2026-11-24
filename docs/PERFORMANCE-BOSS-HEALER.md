# Boss + Healer coverage — 2026-11-22

Two opt-in `bossHealer: true` samples (Mars Outpost, Ironhold Keep) on a tier-2 theater
fixture with two Healer stations and a live canonical Dreadnought. Both samples are valid.
This is a **separate workload**, not comparable to the [tier-2](PERFORMANCE-TIER2.md),
[base-tier](PERFORMANCE-THEATER.md) or [sustained](PERFORMANCE-SUSTAINED.md) reports, and
not a before/after comparison. **No boss phase was observed in either sample.**

## Build and setup

- Measured source: Git HEAD `b728a79` **plus the uncommitted local PWA fixes**. Production
  fixture A (synthetic revision marker/probe), `assets/index-MbsZoOzE.js`, SW version
  `545e346be989af66`, served at `http://127.0.0.1:4187/` (root URL, loopback only).
- **For these first-priority samples, current HEAD `e6966cf` (Pass 25: new
  cyber/volcano/biolab sprites, Share cycling) was NOT measured**; they predate those
  commits. A later Strong-priority follow-up on `e6966cf` observed boss phases: see
  [PERFORMANCE-BOSS-STRONG.md](PERFORMANCE-BOSS-STRONG.md) (historical; distinct workload).
- Recorded timestamps: Nov 22 at 11:30 and 11:31 AM Pacific (19:30:22Z and 19:31:04Z).
- Chromium 158.0.8127.36, RTX 3060/ANGLE D3D11, 412×915 viewport at DPR2, 824×1830
  canvas, `2p-phone` layout, medium difficulty, service workers blocked, sound muted.
  Desktop GPU emulation, not a physical phone.
- 1-second warm-up and 30-second sample per map, seed 12345; 60 Hz simulation
  (1801 sample steps each). One map per call.
- Enemies: 150-enemy floor with the five canonical types plus one unmodified canonical
  Dreadnought (counted in the floor), 450 cap. The boss is re-spawned only when none is
  live. Boss HP, phases, damage and death and tower HP are never forced; the harness does
  not repair or freeze towers. Damage and healing are genuine.
- Fixture: 20 tier-2 towers via 40 real `game.upgradeTower` calls (4280 credits granted
  and spent), **plus 2 base-tier Healer stations** (125 cr each, 250 additional credits,
  one per player, via `game.grant` + `game.tryPlace`) = 22 towers. Wallets unchanged at
  195 each; grant/spend deltas reconcile. Tower HP 3500 before warm-up.
- Zero page, console, failed-request and blocked-request errors; zero invariant
  violations; score storage unchanged; one canonical boss audited every step (0 violations).

## Timing

| Map | rAF median / p95 / max (ms) | Sim÷wall | Core CPU p95 (ms) | Renderer prep CPU p95 (ms) |
| --- | --- | --- | --- | --- |
| Mars Outpost | 16.7 / 16.8 / 17.4 | 1.0002 | 0.5 | 4.1 |
| Ironhold Keep | 16.7 / 16.8 / 17.1 | 1.0005 | 0.8 | 4.6 |

CPU timings exclude GPU completion, composition and most Pixi draw work; timer
resolution is about 0.1 ms. Frame callbacks do not measure input latency. No FPS
threshold was applied. Observer overhead (tower HP snapshots, scans) is outside the
timed segments but consumes wall time.

## Observed activity

| Sample | Positive net HP recovery on steps with active Healers | Tower HP start→min→end | Operational towers (min / end) |
| --- | --- | --- | --- |
| Mars Outpost | 230.0 over 578 steps; 7 distinct towers, ≤2 per step | 3500 → 3351 → 3447 | 22 / 22 |
| Ironhold Keep | 21.9 over 72 steps; 2 distinct towers, ≤2 per step | 3500 → 2307.8 → 2318.1 | 17 / 17 of 22 |

- Both owners had active Healer units (max 2 active, 2 owners, 2 targets; no duplicate
  owner/target steps). All recovery occurred on steps with an active healer unit; none
  without one. Warm-up showed no active healer and no recovery.
- **Net recovery only, not total healing:** per-tower positive HP change across each
  step, so same-step damage masks healing. Treat it as a lower bound; do not compare
  the two maps' values or infer Healer strength.
- Mars: 7 meteor-impact and 8 meteor-warn calls, peak 1 meteor, 1 dust-storm cue.
  All 22 towers stayed operational.
- Keep: peak 7 fire zones and 40 knights; 129 dragon-breath, 622 knight-clash and 87
  enrage calls; 26 leak cues (lives 1e9→999999948). Operational towers fell from 22 to
  17, leaving 5 disabled at the end despite the Healers (22 placed throughout).
- Sound counts measure `emitSound` calls, not audible playback or damage.

## Missing coverage

- **Boss phase:** the Dreadnought was present in every step of both samples, but
  `bossPhaseMax` stayed 0 and boss-phase cues were 0 in warm-up and sample. The harness
  reports `coverage.missing: ["boss phase"]` and a `COVERAGE MISSING` warning for each.
  Phase-transition abilities are **not** measured; boss presence is not coverage.
- Healer repair is covered only as net recovery above; total healing, Healer revival
  of disabled towers and Healer effect on tower survival were not isolated.
- Boss kill and boss-specific damage to towers were not separated from escort damage.

## Reproduce and evidence

Use the [benchmark guide](BENCHMARKING.md) with one map per call:

```javascript
await benchmark(existingPage, {
  profile: 'theater', towerTier: 2, bossHealer: true,
  mapIds: ['mars-outpost'], // or 'ironhold-keep'
  warmupMs: 1000, sampleMs: 30000,
  viewport: { width: 412, height: 915 }, deviceScaleFactor: 2,
});
```

Raw JSON: [Mars Outpost](benchmarks/2026-11-22-boss-healer-mars.json) and
[Ironhold Keep](benchmarks/2026-11-22-boss-healer-keep.json).

Historical checks (Nov 22, about 11:29 AM Pacific, before the runs): `node --check
scripts/benchmark-browser.js` passed; focused benchmark tests 136/136 passed. This was
not a current full-suite run. Syntax was rechecked while finishing this report on
Nov 22 evening; the recorded browser samples and test suite were not repeated.

One 30-second sample per map on one machine: do not infer optimization gains, balance
quality or Healer/boss tuning. Physical multi-touch, thermal behavior, DPI comfort and
native installation remain outside these measurements. No gameplay/data change or
deployment was made for this benchmark work.
