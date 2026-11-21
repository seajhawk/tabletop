# Coordination handoff

Updated: 2026-11-20 ~7:20 PM Pacific. Theater benchmark complete: four valid
25-second browser samples, report saved, full suite353/353 PASS.

## Restart rule
Heartbeat `continue-galactic-alliance` ACTIVE, relative five-hour interval.
Rearmed first at this restart (~12:00 AM Pacific Nov 21). After a quota/usage
stall, update SAME timer for five hours from restart before reading the handoff
or implementing. Never fixed daily; uninterrupted messages do not reset it.
Automation updates require `destination: "thread"`; omitted field was rejected once.

## Objective and current game
- Selected PixiJS/TypeScript game in `proto-web/`; canonical `shared-data/`.
  Godot is historical. Read `docs/GAME-DESIGN.md` only as needed.
- 9 maps / 7 themes; 7 layouts including +90-degree phone court; fixed 60 Hz sim,
  independent multi-touch; 5 turret roles / 2 tiers; 5–30 waves plus overtime.
- Mars meteors/tower damage/credit repair; medieval dragons, mountable keep walls,
  knights/flaming trebuchet; Kitchen floorplan, counters +15% range, stove, Roombas.
- Lawn split halves turn opposite 90 degrees, nudge .28, walk 3 open cells then BFS;
  AoE loops protect new split children on their birth frame.
- All layouts retain square cells; health pill rotates behind exit squares.
- Pass 19 (`ca039fc`): Waves 1–3 use all three portals; normal waves shuffle ports
  and jitter spawn intervals ±16%. Stress waves remain deterministic.
- Local best scores, offline/subpath-safe PWA. Existing published sites:
  https://seajhawk.github.io/TTDefense/ and https://seajhawk.github.io/tabletop/
  Repo: https://github.com/seajhawk/tabletop (`main`).

## Previous restart (Nov 20, 7 PM)
- Claude Sonnet 5.5 implemented optional `profile:'theater'` in
  `scripts/benchmark-browser.js`, tests and `docs/BENCHMARKING.md`.
- Keeps default fixed-Swarmer baseline; theater uses canonical mixed non-boss
  enemies, floor150, natural splits retained, cap450. Tracks cues/active effects,
  operational towers (hp>0), HP; rejects nonfinite state; restores all hooks.
- Four samples: 1s warm-up +25s measured, 412x915 DPR2, Chromium158 / workstation
  RTX3060; production `7ac8de128e70edd8` / `index-DnyzsWPt.js`.
- Kitchen:128 Roomba sweeps +1 fridge cue. Lawn:22 mole flushes, NO splits.
  Mars:6 meteor impacts +1 storm, HP2000->1784. Medieval:126 dragon-breath,
  72 knight-clash cues; HP2000->700, operational20->7 (20 remain placed).
- All valid, no page/console/network errors or score writes; contexts closed.
  rAF median16.7 / p9516.8ms; max17.0–17.6ms. Variable workloads, not comparable
  across maps or to earlier baseline. Cues are emission calls, not damage proof.
- Report: `docs/PERFORMANCE-THEATER.md`; raw: `docs/benchmarks/2026-11-20-theater-*.json`.
  Earlier six 4s samples/build01ff retained in `docs/PERFORMANCE-SUSTAINED.md`.
- No app/data changes, deployment, paid Foundry use or Git commit in this restart.

## Verification and active workers
- `node --check scripts/benchmark-browser.js`: PASS.
- `git diff --check`: PASS; report tables checked against all four raw JSONs.
- `npm --prefix proto-web test`: 353/353 PASS,12 suites,60.09s (80 benchmark tests).
  Log `.tasks/theater-full-tests.log`. Overflow regression now independent of timer cadence.
- All Claude workers complete (implementation40109,review-fixes60447,report16569).
  Built-in review complete. No benchmark delegates or browser contexts left running.
- Production preview127.0.0.1:4173 exec31913; dev localhost:5173.
- Earlier app typecheck/data validation and root/subpath builds passed (22 assets);
  not rerun here because app/data/bundle sources unchanged.

## Next
1. Measure Lawn split and upgraded medieval fire-zone paths with a separately
   documented fixture; current base-tier samples did not exercise them.
2. Target hardware: multi-touch, DPI, thermal playtest, native PWA installation.
3. Profile only a reproduced performance issue before optimizing; keep these
   baseline and theater reports separate when adding new evidence.

## In progress (Nov 21, midnight)
- Claude Sonnet5.5 exec3141 adds opt-in tier2 theater fixture using canonical paid
  upgrades. Owns harness, benchmark tests and guide; log `.tasks/claude-upgraded-benchmark.log`.
- Parent owns verification, two raw measurements/report and STATUS. Read-only
  review confirms natural Lawn split and Medieval active fire-zone coverage criteria.
