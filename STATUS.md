# Coordination handoff

Updated: 2026-11-23 ~6:12 PM Pacific. Verified PWA and benchmark work saved in two
scoped local commits (below); reviews clear. Measured game source remains e6966cf.
No publication or paid invocation. Existing-install migration is the next local check.

## Restart rule
Heartbeat `continue-galactic-alliance` ACTIVE, relative five-hour interval.
Rearmed FIRST at this restart (~6:00 PM Pacific Nov 23; next ~11:00 PM Nov 23).
After a quota/usage stall, update SAME timer five hours from restart BEFORE reading
handoff or implementing. Never fixed daily; ordinary messages do not reset it.
App automation updates require `destination: "thread"`.

## Current game
- Selected PixiJS/TypeScript in `proto-web/`; canonical `shared-data/`; Godot historical.
  12 maps / 10 themes, 7 layouts, fixed 60 Hz, independent multi-touch; 5 roles + Healer.
- Pass 25 e6966cf: cyber/volcano/biolab sprites fix invisible towers; Share 25/50/100;
  `.agents/skills/new-map/SKILL.md`. Earlier coordinator reported 229 game tests/browser PASS.
- Cyber EMP/chain; Volcano geysers/plateaus/Forge Drone; Bio regen/mutation/mitosis.
  Mars meteors/Repair Bot; Medieval walls/dragons/knights/Healer/fire zones;
  Kitchen counters/stove/Goombas; Lawn centipede splits. Other content in design docs.
- Pass 22: Goomba rename; Knight/Goomba speed -25%, regen rate -20%, damage -30%;
  automatic Healers silent. Wave transitions clear troops/FX.
- Responsive stage preserves square grid cells; cards scale up to 1.38x; phone layouts.
  PC version stamp; local best scores; offline/subpath-safe PWA.
- Existing published sites: https://seajhawk.github.io/TTDefense/ and
  https://seajhawk.github.io/tabletop/ . Repo https://github.com/seajhawk/tabletop (`main`).

## Benchmark evidence
- Harness `scripts/benchmark-browser.js`; guide `docs/BENCHMARKING.md`.
  Theater:20 towers, tier2 via40 real upgrades/4280 credits; mixed canonical enemies,
  150 floor/450 cap, natural extras retained, no forced damage/ability timers.
- Nov23 1:17-1:18 PM: Cyber/Volcano/Bio valid30s samples on build8c184ae8f8f75a71
  (e6966cf + local PWA fixes), reusing the morning production fixture. No rebuild needed.
  Cyber:150 EMP-active steps;292 multi-hit Pulse tower-steps (call evidence, not damage).
  Volcano:4 impact cues,1 environmental geyser zone peak,14 tower-zone peak;HP3300->3134.
  Bio:330 mutation steps,77 split cues/37 children peak;753.0006 positive net HP recovery.
  All20 towers remained operational; Bio population150–160. All declared coverage complete.
- Report/raw: `docs/PERFORMANCE-CYBER-VOLCANO-BIO.md`, `docs/benchmarks/2026-11-23-theater-*.json`.
  Full focused harness175/175 PASS (140.96s), after fixing one case-sensitive warning
  assertion; syntax PASS. Log `.tasks/new-theater-recheck.log`. No game-code changes.
- Observers separate warmup/sample, require actual flags/finite timers, distinguish
  environmental fire zones, exclude refill/identity changes from Bio net HP recovery.
  Missing required telemetry invalidates runs; absent ability is a coverage gap.
  Cyber hook overhead is inside core timing; other observation consumes wall time.
- Morning Strong boss fixture:20 real priority calls +2 base Healers/250 credits;
  both Mars/Keep reached phase2 with2 cues and net repair139/13.5 HP; Keep ended15/22 working.
  Report `docs/PERFORMANCE-BOSS-STRONG.md`; earlier reports retained. Workloads differ.
- All samples are desktop RTX3060 at phone viewport/DPR2, not physical phone/thermal tests.
  No optimization/balance claim. Forge Drone, EMP immunity and regen-rate effects not measured.

## PWA fixes and verification
- Scoped `ga-scope-app:<encoded base>:` protects sibling/legacy caches; exact-path fallback.
  Installer drains response bodies and stages clones, avoiding stall/partial-cache exposure.
- Removed manifest id:"./" origin-root collision; Chrome shows distinct app identities.
  Existing-install migration still unverified.
- Prior focused manifest/worker/controller47/47 PASS; production fixtures for3bases.
  Browser lifecycle/multi-tab/sibling130 PASS; state and old offline assets preserved.
  Report/raw: `docs/PWA-VERIFICATION.md`, `docs/verification/2026-11-22-0116-pwa-*.json`.
- Native Chrome158 Windows install/cold-offline-launch/uninstall36/36 PASS, isolated
  local-CDP-pipe profile; storage preserved, test shortcuts removed. Report/raw:
  `docs/PWA-DESKTOP-VERIFICATION.md`, `docs/verification/2026-11-22-desktop-*.json`.
- No publication or paid Foundry invocation; real install dialogs, release migration,
  other browsers, physical touch/DPI/thermal behavior remain unverified.

## Workers and next actions
- All workers/servers/contexts closed. Claude Sonnet5.5 review exec25502 exited0;
  log `.tasks/claude-consolidation-review.log`, report `.tasks/consolidation-review.md`.
- Local commits: `fd70771` PWA (23 files), `0a7f652` benchmarks/evidence/docs (27 files).
  Independent check:29 JSON artifacts parse/match hashes;46 report links resolve.
  README links refreshed; diff --check PASS. Unchanged code checks were not repeated.
1. Validate released-PWA identity migration in an isolated profile; preserve installed user apps.
2. Target hardware: actual multi-touch, DPI comfort, sustained thermal playtest.
3. Prepare release notes and the exact deployment diff after migration verification;
   publish only when explicitly authorized. Heartbeat is not publication approval.
