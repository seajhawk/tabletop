# Coordination handoff

Updated: 2026-11-20 4:01 AM Pacific. Phone Settings and local performance sample complete.

## Restart rule
Heartbeat `continue-galactic-alliance` ACTIVE, relative 5-hour interval; rearmed
at this restart (~3:54 AM Pacific Nov 20), before implementation. After a quota/usage
stall, rearm SAME timer for 5 hours from restart before other work. Never fixed daily.
Automation updates require `destination: "thread"`; omitted field was rejected once.

## Objective
Polish selected PixiJS/TypeScript game in `proto-web/`; `shared-data/` canonical.
Godot remains a historical prototype, not feature parity. Full design in `docs/`.

## Implemented
- 5 defenses × 2 upgrades; 6 enemy types; armor/shields/flying/3-stage boss;
  10 campaign waves + stress, 3 difficulties, 7 adaptive solo/2P/4P layouts.
- Independent drags/radials/flick sharing, 70/30 bounty, early-send bonus,
  auto waves, 4 HUD controls + canvas Settings, on-map lives, replay/next-map.
- 7 maps / 5 themes: 3 space maps, Washington DC, Pacific Fleet, Mars Outpost,
  Ironhold Keep. Illustrated maps, procedural units, theme-specific audio.
- Naval: stealth subs/sonar/ASW; ASW 1.4× damage, mines, T2 deep charges.
  Mars: vents +25% fire/+20% range/storm immunity; 22s calm / 6s storm cuts
  unboosted T0/T1 range 20%. Medieval: brutes/boss <=40% HP gain 35% speed.
- Best scores: normal wins/losses; kills×10 + lives×100 + victory1000; per
  map/difficulty/players. Stress/reset excluded; denied storage session-only.
- PWA: icons/manifest, production root-scope worker, all 20 build files precached;
  Settings Install app / Update app. Explicit updates only from untouched setup or
  ended/reset game; placement/economy/pause/stress protected, activation rechecked.
  Other tabs never auto-reload; old app caches retained while multiple tabs exist.
- Phone result cards enlarged. NEW: phone Settings860×1200, centered in stage,
  all 12 targets114 world-px high, scaled typography/wrapping, stage-wide backdrop.
  Desktop geometry restored on layout change. Blank modal space cannot hit hidden HUD.
- READMEs document current behavior; measured performance in `docs/PERFORMANCE.md`.

## Verified
- Latest: 236/236 tests across 11 suites; production build + TypeScript PASS.
  Current worker version `2aec66662add3230`, 20 precached files.
- Isolated production Chromium: BOTH phone layouts at360×640/390×844/460×760;
  minimum target sizes44.61/48.33/57CSSpx. All7map labels fit, three long PWA messages
  clear the footer. Desktop geometry/fonts/wrapping restore; screenshots inspected.
- Real browser synthetic two-touch speed/auto toggles independent; touchCancel
  leaves state unchanged and clears pointers. Outside dismiss works; hidden HUD
  cannot receive blank-header taps. Offline reload includes new phone Settings.
  No page errors; all test contexts closed. Evidence: ignored `.tasks/phone-settings-*`.
- Prior PWA browser checks: all7maps/fourJPGs offline; update reloads requesting tab
  once, score unchanged, other paused tab survives; old/unrelated caches preserved.
  Prior scores/phone summary browser checks pass. Data:5turrets/6enemies/7maps/11waves.
- Burst perf: Chromium158, RTX3060,1920×1080 DPR1; 3maps,1s warmup+4s sample each.
  rAF median17.6ms/p95 18.2–18.3ms; sim/wall0.9988–1.0033. Naval140–149 enemies;
  other maps clear to0. Not sustained150 load or target-device evidence. See report.
- Physical multi-touch/latency/DPI/thermal performance and native app installation
  remain unverified. Incognito install prompt unavailable; menu fallback verified.

## Runtime / workers
- Dev http://localhost:5173/ (no worker); production http://127.0.0.1:4173/
  preview exec26765. No active workers; Claude phone exec86227 completed.
- Claude Sonnet5.5 did bulk layout/render/tests; parent integrated hidden-HUD fix
  and ran tests/browser. docs_current_state authored bounded perf harness/report.
- No paid Foundry calls, public deployment, native installation, or Git commit.

## Next
1. Verify install/icon launch, offline restart, touch/DPI on actual target devices.
2. Add a bounded, reproducible sustained-load performance harness before optimizing;
   preserve canonical balance and distinguish workstation samples from target hardware.
3. Review touch sizing of remaining phone HUD/dock controls; Settings work is complete.
4. Address playtest feedback before expanding gameplay; keep handoffs concise.


