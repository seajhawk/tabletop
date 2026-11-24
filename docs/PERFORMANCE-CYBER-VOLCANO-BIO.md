# Theater mechanic observation: Cyber / Volcano / Bio (tier-2, 30 s)

Date 2026-11-23. Three valid 30 s samples, one per map, each with declared
`sampleCoverage.complete: true`. Observation only; no optimization or balance comparison.

## Setup

- Profile `theater`, `towerTier: 2`, seed 12345, warmup 1 s, sample 30 s, floor 150,
  overflow cap 450, no bosses, no Healers. Setup: 20 tier-2 towers, 40 real
  `upgradeTower` calls, 4280 cr granted = 4280 spent (wallets 200/200 before/after).
- Enemies: mixed canonical non-boss (scout/swarmer/cruiser/frigate/phase), 150 floor.
- During measurement, enemy HP and ability timers progress normally; missing enemies are
  replenished to the floor. Fixture lives start at finite 1e9 and can fall. Towers are never repaired.
- Build: reused 8 AM production fixture from
  `.tasks/pwa-smoke-20261123161201-546ea279/root/A` (synthetic A marker/probe, 26 files),
  HEAD e6966cf + local PWA fixes; game code unchanged, no rebuild/typecheck this turn.
  Raw build `8c184ae8f8f75a71`, asset `index-C5RHinrD.js`.
- Chromium 158.0.8127.36, desktop RTX 3060, phone viewport 412x915 DPR 2.
  **Not a physical phone.**
- Harness SHA256 `C86D6AF782D386E0D60310C6767A242A87CC46D07A0921EED629B868A1F21EFD`.

## Timing (1800 simulation steps each)

| Map | rAF median / p95 / max (ms) | Core CPU p95 (ms) | Renderer prep p95 (ms) | Sim / wall |
| --- | --- | --- | --- | --- |
| Cyber | 16.7 / 16.8 / 17.2 | 0.5 | 3.2 | 0.9998 |
| Volcano | 16.7 / 16.8 / 17.5 | 0.5 | 3.8 | 1.0000 |
| Bio | 16.7 / 16.8 / 17.3 | 0.4 | 3.2 | 0.9999 |

Timer resolution is about 0.1 ms. State scans and HP snapshots run outside timed segments
but consume wall time. Cyber's damage-call hook runs inside the core timer, including its
overhead. GPU completion, composition and most Pixi draw work are excluded.

## Observed mechanic counts (sample window)

| Map | Observed | HP / operational / population |
|---|---|---|
| Cyber | EMP active 150 steps, 1 entry; pulse `damageEnemy` calls 876, 292 multi-hit tower-steps (max 3 ids/tower) | towers 20/20, HP 3300 constant; extras 0, overflow 0 |
| Volcano | active meteor max 1, `meteor-impact` cues 4; environmental geyser zone max 1; tower-owned fire zones max 14; fire zones max 15 | tower HP 3300 -> 3134 min/end; 20/20 operational; extras 0 |
| Bio | mutation active 330 steps, 1 entry; `centipede-split` cues 77, split-child max 37; net-HP-up 753.0 HP over 1773 steps, 120 distinct enemies | towers 20/20, HP 3300; population 150–160, above the floor for 207 steps and always below the cap |

## What coverage means (bounds)

- **Cyber:** EMP flag + multi-enemy `damageEnemy` CALLS per pulse tower in one step are
  evidence of state and calls, NOT applied damage and NOT proof of EMP boosted-immunity.
- **Volcano:** environmental geyser zones (owner -1, towerId 0) are separate from tower-owned
  plasma zones, which never satisfy geyser coverage. Cue counts are emission only. No Forge
  Drone fixture or claim.
- **Bio:** regen = positive NET HP change of the same id + same object across one real step;
  excludes refills, births, dead and removed enemies. Same-step damage masks regen, so this
  is not gross regen, a rate comparison, or slow-suppression proof. Natural split requires a
  sample-window `centipede-split` cue AND a live `isSplitChild` enemy; neither alone counts.
  `slowOrBurnSuppressedEnemySteps` (88656) is informational only.
- Warmup coverage was incomplete on all three (expected); only sample coverage counts.

## Checks

- Syntax passed; full focused suite 175/175 PASS, 140.96 s (`.tasks/new-theater-recheck.log`),
  after one case-sensitive warning assertion was corrected. Typecheck/production builds were
  earlier today, not rerun.
- Three browser contexts closed; static server (exec session 2511) closed, exit 0.
- Per run: scores unchanged, 0 violations, 0 page/console/failed/blocked requests.
- No game/data edits, deploy, commit or paid calls.

## Reproduce (one map per call) and raw data

```javascript
const result = await benchmark(existingPage, {
  profile: 'theater', towerTier: 2, mapIds: ['neon-cybergrid'], // or 'volcanic-caldera', 'biolab-outbreak'
  warmupMs: 1000, sampleMs: 30000, seed: 12345, viewport: { width: 412, height: 915 }, deviceScaleFactor: 2,
});
```

Raw: [cyber](benchmarks/2026-11-23-theater-cyber.json),
[volcano](benchmarks/2026-11-23-theater-volcano.json),
[bio](benchmarks/2026-11-23-theater-bio.json). Method: [BENCHMARKING.md](BENCHMARKING.md).
