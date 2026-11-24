# Galactic Defense — Web

The selected implementation uses TypeScript, Vite, and PixiJS v8. A 28×16 maze grid
fits adaptive landscape and portrait stages (1280×800 and 920×1280). Canonical data is imported from
`../shared-data/*.json`.

## Commands

Run these inside `proto-web/`:

```powershell
npm ci
npm run dev        # Vite; this direct command exposes the server on the LAN
npm run typecheck
npm test
npm run build      # TypeScript check + production bundle and offline worker in dist/
npm run preview    # Preview the production build
```

For a localhost-only launch from the repository root, use
`pwsh -File scripts/start-web.ps1` and open [the game](http://127.0.0.1:5173).

## Install, offline, and updates

Build with `npm run build`, then use `npm run preview` for a local production
preview. Serve the contents of `dist/` at the **site root (`/`)**, over HTTPS or
localhost; subdirectory deployment is not supported by the current root-scoped
manifest and worker. Development builds do not register a service worker. Use
the separate preview port for offline testing, rather than the development origin.

The production worker caches the game shell, bundled code, icons, and map assets
after a successful online load. Let that first cache complete before disconnecting;
subsequent launches at the same origin can use the cached build offline. This
does not save an unfinished match, and clearing browser site data removes the cache.

- **Settings → Install app:** opens the browser-provided install prompt when
  available; otherwise use its Install app / Add to Home Screen menu. Installation
  is user-initiated, and the exact browser/OS flow varies.
- **Settings → Update app:** checks online for a newer build. When an update is
  ready, tap again to apply it and reload. Updates never automatically reload a
  running match. Apply from a fresh, untouched setup or finish/reset the match
  first. Placed defenses, purchases/sales, and credit transfers block updates even
  before the first wave; paused matches and time between waves also count as in
  progress. Safety is checked again when the worker activates, so starting a match
  while an update is applying will not trigger a reload.

See [STATUS.md](../STATUS.md) for executed offline/update checks. Actual OS
installation, launch from an installed icon, and hardware behavior remain unverified.

## Play

- **Build:** Drag one of five defenses from your own dock onto an empty cell.
  Touch ghosts sit above the finger toward the board. The preview shows range and
  whether placement is legal; release rechecks paths and funds before committing.
- **Manage a tower:** Tap it for a player-oriented radial menu: Upgrade (two tiers),
  Target Priority (`1ST`, `STR`, `CLS`, `AIR`), or Sell. Right-click sells directly.
  Selling refunds 70% of invested credits to the owner.
- **Share credits:** Drag or flick the diamond credit chip toward another player's
  dock to transfer up to 25 credits. Each pointer retains independent ownership.
- **Run waves:** Launch manually, send the next wave early for a credit bonus, or
  enable Auto to launch after a wave clears. Pause/Resume and Speed (1×/2×) control play.
- **Choose a match in Settings:** Map cycles seven theaters; Difficulty cycles
  Easy/Medium/Hard; Layout cycles the seven arrangements below. Changing difficulty,
  layout, or map resets the match. Reset restarts the current selection.
- **Other Settings controls:** Speed, Auto-Wave, SFX, Stats, Reset, Stress,
  Install app, and Update app.
  Stress starts a separate 150-swarmer burst with twenty predetermined towers.
  Settings does not pause active waves; use Pause when you need planning time.

Both phone layouts use a larger Settings panel with wrapped text and independently
operated touch controls. All twelve targets measure at least 44 CSS pixels in the
tested portrait viewports: 360×640, 390×844, and 460×760. Desktop Settings keeps its
compact layout. Browser touch simulation passed; physical device testing is pending.

Four shared controls remain visible: Launch Wave, Pause/Resume, Fullscreen, and
Settings. Base health/lives appear on the map. Optional Stats shows FPS, enemies,
active pointers, and match progress. Victory/defeat offers **Play Again** and
**Next Map**. Losing window focus cancels input and pauses; audio and best-effort
screen wake lock start after a pointer action.

Completed normal wins and losses show **Score**, **Best**, and **New best** when
applicable. Score is `kills × 10 + remaining lives × 100 + 1000 for victory`.
Bests are stored locally in the same browser/site, separately by map ID,
difficulty, and active player count (1/2/4). Tied or lower scores retain the old
record; stress, unfinished, and reset runs do not count. If storage is unavailable
or full, the session best remains usable and the summary says **Best this session
only**. Records require no account or network service.

Layout order: **2P opposing → 2P phone → 1P base side → 1P phone → 4P edges →
4P 2×2 → 4P corners**. Portrait startup selects 2P phone; solo layouts use adjusted
single-player balance. Docks and hit tests scale/rotate together.

## Maps and defenses

Map order: **Orbital Crossing → Washington DC → Pacific Fleet → Mars Outpost →
Ironhold Keep → Asteroid Belt → Nebula Rift**.

| Theme / maps | Defenses and distinctive mechanics |
| --- | --- |
| Space: Orbital Crossing, Asteroid Belt, Nebula Rift | Pulse, Plasma, Stasis, Railgun, and Swarm defenses protect Earth. |
| Military: Washington DC | Vulcan CIWS, Howitzer, EW Jammer, Abrams, and Patriot defend an illustrated continental-US map. |
| Naval: Pacific Fleet | Submerged submarines require detection; Sonar Buoys reveal them, ASW Destroyers counter them, and Minefields deploy contact mines. |
| Mars: Mars Outpost | Geothermal vents boost defenses. Dust storms reduce range for unboosted towers below the final upgrade tier. |
| Medieval: Ironhold Keep | Arcane runes boost defenses; wounded Orc Brutes and the Siege Troll King gain speed in Berserk Frenzy. |

Each theme has five defenses with two upgrade tiers, distinct sprites, names,
and procedural audio. The shared roles span direct fire, area damage, crowd control,
armor piercing, and homing attacks; naval mines replace the usual mortar attack.

Six enemy roles cover fast scouts, swarms, armor, regenerating shields, flying
units, and a three-phase boss. Each theater has ten campaign waves and a themed
boss. Kill bounties pay 70% to the turret owner and split the other 30%
among all active players, including the owner; balances retain fractional credits.

## Code and verification

`src/sim/` owns fixed-60-Hz movement, BFS route validation, combat, waves, and economy.
`input.ts` owns per-pointer drags, sharing, and radial menus; `inputDom.ts` handles
browser capture/cancellation. `layout.ts` provides rotated geometry and hit tests.
`render.ts`, `theme.ts`, `militarySprites.ts`, `theaterSprites.ts`, and `audio.ts`
provide presentation.
`pwa.ts` handles installation/update UI; `scripts/generate-sw.mjs` generates a
content-versioned offline worker from the production output.

See [STATUS.md](../STATUS.md) for the latest executed checks. Vitest covers game,
pathfinding, input, layout, audio, themes, sprites, and theater mechanics. Local browser
results do not certify real four-finger input, touch latency, 16-inch legibility,
Windows DPI scaling, or sustained thermal performance. Native packaging and managed
kiosk deployment remain follow-up work.

The [browser benchmark guide](../docs/BENCHMARKING.md) describes a separate local
harness that replenishes the canonical stress fixture to maintain 150 enemies.
See the [measured results](../docs/PERFORMANCE-SUSTAINED.md) for desktop and phone
viewport samples on the same workstation; these do not establish physical-phone performance.
The opt-in theater profile (mixed enemies, real tower damage) has separate
[variable-workload results](../docs/PERFORMANCE-THEATER.md) that are not comparable to that baseline.
The [tier-two samples](../docs/PERFORMANCE-TIER2.md) separately exercise Lawn splits and Medieval fire zones.
Later samples cover [boss phases and Healer repair](../docs/PERFORMANCE-BOSS-STRONG.md)
and [Cybergrid, Volcano, and Bio-Lab mechanics](../docs/PERFORMANCE-CYBER-VOLCANO-BIO.md).
The [PWA verification guide](../docs/PWA-VERIFICATION.md) records offline/update checks and cache-isolation fixes.
