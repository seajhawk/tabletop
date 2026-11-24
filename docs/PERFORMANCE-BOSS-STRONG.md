# Boss + Healer with Strong priority — 2026-11-23

Follow-up to the [first-priority boss + Healer report](PERFORMANCE-BOSS-HEALER.md), which
observed no boss phase. Two opt-in `bossHealer: true, bossPriority: 'strong'` samples (Mars
Outpost, Ironhold Keep) on the tier-2 theater fixture. Both are valid 30 s samples with
`sampleCoverage.complete: true`: boss phase and Healer repair were observed in the sample window.
This is a **distinct workload**, not an optimization or balance comparison with the
first-priority runs (different build and workload).

## Build and setup

- Source: Git HEAD `e6966cf` **plus the uncommitted local PWA fixes**. Production fixture A
  (synthetic revision marker/probe, 26 files) at `http://127.0.0.1:4187/` (loopback only),
  `assets/index-C5RHinrD.js`, SW version `8c184ae8f8f75a71`.
- Recorded Nov 23 at 16:13:11Z (Mars) and 16:13:54Z (Keep).
- Chromium 158.0.8127.36, RTX 3060 / ANGLE D3D11 (WebGL 2), 412×915 viewport at DPR2,
  824×1830 canvas, `2p-phone` layout, medium difficulty, service workers blocked, sound muted.
  Desktop GPU with a phone viewport, **not a physical phone**.
- 1 s warm-up and 30 s sample per map (62/1801 and 61/1800 steps), seed 12345, 60 Hz sim.
- Fixture: 20 tier-2 towers via 40 real `upgradeTower` calls (4280 credits granted and spent)
  plus 2 base Healers (+250 credits) = 22 towers; wallets stayed 195 each, ledger deltas
  reconcile. Canonical Dreadnought (2600 HP / 900 shield) is unmodified; combat triggers are real.
  The fixture starts with finite lives of 1e9; ordinary leaks still reduce lives.
- Priority: 20 real `game.setTowerPriority(id, 'strong')` calls, 20 succeeded, effective
  `strong`; wallet, all scalar ledger fields, tiers, HP, tower objects/ids and Healer
  priorities (`first`) unchanged. **Not universal boss focus**: RadialStasis and KeepKnightStable
  bypass priority.
- Zero page/console/failed/blocked-request errors, zero invariant or boss-audit violations,
  scores unchanged, contexts closed.

## Timing

| Map | rAF median / p95 / max (ms) | Sim÷wall | Core CPU p95 (ms) | Renderer prep CPU p95 (ms) |
| --- | --- | --- | --- | --- |
| Mars Outpost | 16.7 / 16.8 / 17.6 | 1.0005 | 0.3 | 1.4 |
| Ironhold Keep | 16.7 / 16.8 / 18.7 | 0.9999 | 0.6 | 2.0 |

CPU timings exclude GPU completion, composition and most Pixi draw work; timer resolution is
about 0.1 ms. No FPS threshold applied. Observer overhead is outside timed segments.

## Tower HP and operational count

| Sample | Tower HP start → min → end | Operational towers (min / end) of 22 |
| --- | --- | --- |
| Mars Outpost | 3500 → 3385.6 → 3426 | 22 / 22 |
| Ironhold Keep | 3500 → 2015.6 → 2015.6 | 15 / 15 |

The harness never repairs or freezes towers; real Healers may repair or revive them.
Disabled towers stay placed. Keep's later timing includes fewer operational defenses.

## Boss and Healer observations (sample window)

| Sample | Boss | Positive net HP recovery, steps with active Healers |
| --- | --- | --- |
| Mars Outpost | max phase 2, 2 `boss-phase` cues, 2 boss instances | 139 over 397 steps; 5 distinct towers, ≤2 per step |
| Ironhold Keep | max phase 2, 2 `boss-phase` cues, 2 boss instances | 13.5 over 45 steps; 2 distinct towers, ≤1 per step |

- Warm-up showed phase 0, no cues and no Healer activity; only the sample window counts.
- Each sample had 2 boss instances (2 harness spawns) and one post-combat step with no boss
  before refill. This does **not** show whether the boss was killed or leaked.
- Healers: max 2 active, 2 owners, 2 targets, no duplicate owner/target steps; no recovery
  without an active Healer.
- **Net recovery only**: per-tower positive HP change per step; same-step damage masks
  healing. It is not total healing and not per-target proof. Do not compare the two maps.
- Mars: 8 meteor-warn, 8 meteor-impact, 1 dust-storm cue, peak 1 meteor.
- Keep: peak 7 fire zones, 40 knights; 136 dragon-breath, 630 knight-clash, 99 enrage, 74
  leak cues (lives 1e9 → 999999852). Cue counts are `emitSound` calls, not audible playback.
- Population: floor 150, natural extras up to 4 (150–154 observed) on both maps.

## Reproduce and evidence

```javascript
await benchmark(existingPage, {
  profile: 'theater', towerTier: 2, bossHealer: true, bossPriority: 'strong',
  mapIds: ['mars-outpost'], // or 'ironhold-keep'
  warmupMs: 1000, sampleMs: 30000, seed: 12345,
  viewport: { width: 412, height: 915 }, deviceScaleFactor: 2,
});
```

Raw JSON: [Mars Outpost](benchmarks/2026-11-23-boss-strong-mars.json) and
[Ironhold Keep](benchmarks/2026-11-23-boss-strong-keep.json). See the
[benchmark guide](BENCHMARKING.md).

Validation this turn: `node --check` passed; 158/158 focused benchmark tests passed in 105.59 s
(log `.tasks/boss-priority-tests.log`); `npm --prefix proto-web run typecheck` passed; three
fresh production fixture builds preceded the browser runs. Harness SHA256
`7338126FB6F5279AFE0D423715AC459302E540062A3EB732B51EC462BC71BDD5`. The owned fixture
server shut down gracefully, exit 0.

## Limits

One 30 s sample per map on one machine. No optimization or balance claim, and no comparison
with the first-priority runs. Not measured: the new cyber/volcano/biolab gameplay, physical
multi-touch, thermal behavior, DPI comfort, native install. No gameplay/data change, commit,
publication or paid call was made.
