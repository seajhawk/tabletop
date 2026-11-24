# Tabletop Defense (Galactic Defense)

Play live on GitHub Pages: **https://seajhawk.github.io/TTDefense/**

A cooperative tabletop tower-defense game for a 16-inch Windows touch PC, with a
path toward larger touch tables. **The TypeScript/Vite/PixiJS v8 web stack is the
selected implementation.** The Godot prototype is retained as a comparison reference.

## Run the game

From this folder in PowerShell:

```powershell
pwsh -File scripts/start-web.ps1
```

The launcher installs locked dependencies on first run. Open
[Galactic Defense](http://127.0.0.1:5173) after the server starts.

Choose a map, layout, and difficulty in **Settings**, drag defenses from your dock,
then launch a wave.
Towers reshape ground-enemy routes; placements that seal a route are rejected.
Tap a tower to upgrade it, change its target priority, or sell it. Drag or flick a
credit chip toward a teammate to share funds. See the [web guide](proto-web/README.md)
for all controls.

For the installable/offline build, run `npm --prefix proto-web run build`, then
`npm --prefix proto-web run preview` and open the preview URL. After its first
successful online cache, the production build can reopen offline. **Settings →
Install app** uses the browser's install prompt or directs you to its menu.
**Update app** checks for a new build; applying it requires an explicit action
from a fresh, untouched setup or after finishing/resetting the match. Placed
defenses and credit transactions are protected even before the first wave. Serve the app at the
site root (`/`) over HTTPS or localhost. The development server does not register
an offline service worker. See the [web guide](proto-web/README.md#install-offline-and-updates)
for the full workflow; actual OS installation and device testing remain unverified.

## Current game

- Nine maps across seven themes: **Orbital Crossing**, **Washington DC**,
  **Pacific Fleet**, **Mars Outpost**, **Ironhold Keep**, **Midnight Kitchen**,
  **Backyard Lawn**, **Asteroid Belt**, and **Nebula Rift**.
- Five turret roles with two upgrade tiers, six enemy types, ten campaign waves,
  and a separate 150-ship stress scene with twenty towers.
- Seven adaptive layouts for one, two, or four players, including portrait phone
  arrangements, opposing docks, edge docks, and diagonal corners.
- Personal wallets with shared kill assists, radial menus, credit sharing,
  early-wave bonuses, automatic waves, and a summary with Play Again / Next Map controls.
- Completed wins and losses show a score and a local best for the current map,
  difficulty, and player count. Records stay in the same browser/site; no account is needed.
- Space and military theaters, plus illustrated naval, Mars, medieval, kitchen, and
  backyard lawn maps with custom units, procedural audio, and unique mechanics:
  stealth submarines & sea mines, geothermal vents & dust storms, berserk orcs & arcane
  runes, hot stove burners & Fridge Snack Rush, and burrowing moles, mosquitoes &
  centipedes that split in half.

Local automated and browser checks are recorded in [STATUS.md](STATUS.md).
Physical multi-touch, target-device frame times, input latency, and DPI comfort
still need hands-on testing. The stress scene is a burst, not a sustained-load benchmark.

## Validate

```powershell
node scripts/validate-data.mjs
npm --prefix proto-web ci
npm --prefix proto-web run typecheck
npm --prefix proto-web test
npm --prefix proto-web run build
```

`shared-data/` is the canonical balance/map pack and is imported directly by the
web game. The Godot project has not followed the web game's feature expansion;
see its [reference README](proto-godot/README.md) and the
[historical comparison](docs/COMPARISON.md). Its local launcher is
`pwsh -File scripts/start-godot.ps1`; runtime setup is in [TOOLCHAIN.md](docs/TOOLCHAIN.md).

## Reference and coordination

- [Game blueprint](docs/GAME-DESIGN.md): full product design.
- [Initial prototype contract](docs/PROTOTYPE-CONTRACT.md): scope of the original comparison.
- [Model routing](docs/MODEL-ROUTING.md): provider research and quota-aware delegation.
- [Current handoff](STATUS.md): verified state, active work, and next actions.
- [Sustained-load samples](docs/PERFORMANCE-SUSTAINED.md): six measured scenarios, raw results, and limits.
- [Theater samples](docs/PERFORMANCE-THEATER.md): four variable-workload one-map runs with coverage limits.
- [Tier-two ability samples](docs/PERFORMANCE-TIER2.md): observed centipede splits and Medieval fire zones.
- [Boss and Healer samples](docs/PERFORMANCE-BOSS-STRONG.md): normal-combat phase transitions and repair activity.
- [Cybergrid, Volcano, and Bio-Lab samples](docs/PERFORMANCE-CYBER-VOLCANO-BIO.md): observed mechanic coverage and limits.
- [Offline and update verification](docs/PWA-VERIFICATION.md): real-browser lifecycle and sibling-cache regression checks.
- [Agent instructions](AGENTS.md): common policy for every coordinator.

Claude, Gemini, and Copilot entry files point to the same policy. Claude handles
bulk coding; OpenAI usage is reserved for coordination and focused checks.
