# Reproduce sustained browser samples

`scripts/benchmark-browser.js` exports no module: it is a self-contained async
function accepting `(existingPlaywrightPage, options)`. It opens a fresh context
from that page's browser and closes only its own context. It does not navigate
or modify the supplied page. No standalone npm benchmark command is provided.

## Prepare and run

Build the current game and start a local production preview in a separate terminal:

```powershell
npm --prefix proto-web run build
npm --prefix proto-web run preview -- --host 127.0.0.1 --port 4173
```

With the existing Playwright MCP browser available, run `browser_run_code_unsafe`
using `filename: "D:/git/tabletop/ga/scripts/benchmark-browser.js"` for defaults.
Do not launch a second MCP browser against its already-used profile.

For custom options, load the function inside an **existing Playwright driver**
where `existingPage` is already available; the loader uses only Node built-ins:

```javascript
import { readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync('scripts/benchmark-browser.js', 'utf8');
const benchmark = vm.runInNewContext(`(${source})`, { URL, setTimeout, clearTimeout });
const result = await benchmark(existingPage, {
  url: 'http://127.0.0.1:4173/',
  mapIds: ['mars-outpost', 'kitchen-raid', 'backyard-lawn'],
  viewport: { width: 412, height: 915 },
  deviceScaleFactor: 2,
});
writeFileSync('.tasks/benchmark-result.json', JSON.stringify(result, null, 2));
```

Use map IDs from `shared-data/maps.json`. The example is browser emulation, not
a physical-phone measurement. Keep the output JSON alongside any written report.

## Configuration and workload

| Option | Default / constraint |
| --- | --- |
| `url` | `http://127.0.0.1:4173/`; HTTP loopback only (`localhost`, `127.0.0.1`, `[::1]`), directory/subpath allowed; no credentials, query, or fragment |
| `mapIds` | Orbital Crossing, Pacific Fleet, Ironhold Keep IDs; 1–9 unique IDs |
| `profile` | `'sustained'` (default) or `'theater'` (opt-in, see below); theater `sampleMs` up to 30000 |
| `towerTier` | `0` (default, canonical base-tier towers) or `2` (opt-in, theater only; see below); any other value, or `2` with `sustained`, is rejected before a context is created |
| `bossPriority` | `'first'` (default, no priority calls). `'strong'` only with `bossHealer: true`; see "Optional `bossPriority`" below |
| `bossHealer` | `false` (default). `true` (opt-in) only with `profile: 'theater'`, `towerTier: 2` and `mapIds` from `mars-outpost`, `ironhold-keep`; any other value or combination is rejected before a context is created (see below) |
| `viewport`, `deviceScaleFactor` | 1920×1080, DPR 1; custom values are validated before browser creation |
| `warmupMs`, `sampleMs` | 1000 / 4000; accepted ranges 0–2000 / 1000–10000 ms |
| `targetEnemies` | 150; accepted range 150–500 |
| `seed` | 12345; unsigned 32-bit integer for runtime `Math.random`/FX |
| `timeoutMs` | 45000 maximum workload allowance, plus a bounded 5-second cleanup allowance |

Combined requested warm-up/sample time must be at most 40 seconds. Defaults request
15 seconds across three maps, leaving time for loading/probes. Unknown options are rejected.

Each scenario uses the current map's canonical 20-tower stress fixture and the
canonical stress enemy definition (currently Swarmer). Speed is 1×, Auto-Wave is
off, and lives become the disclosed finite fixture value **1,000,000,000** to avoid
premature defeat. Missing enemies are replenished before/after simulation steps
through the existing spawn method. HP, movement, and combat are not frozen.
Service workers are blocked; non-loopback requests are aborted; sound is muted
through existing controls when available. Runtime patches are restored afterward.

## Opt-in `profile: 'theater'` (variable workload)

`profile` is `'sustained'` (default, the fixed baseline above, unchanged) or
`'theater'`. Theater allows `sampleMs` up to 30000 (the sustained cap stays 10000);
the total `mapIds.length * (warmupMs + sampleMs) <= 40000` rule still applies, so
run **one map per call**. Example (25 s Kitchen run, 1 s warm-up, 45 s workload
allowance + 5 s cleanup unchanged):

```javascript
const result = await benchmark(existingPage, {
  profile: 'theater', mapIds: ['kitchen-raid'], warmupMs: 1000, sampleMs: 25000,
});
writeFileSync('.tasks/benchmark-theater-kitchen-raid.json', JSON.stringify(result, null, 2));
```

Same canonical 20 stress towers, speed 1×, Auto-Wave off, finite lives, no saved
scores, and `Math.random` seeded before `setMap`/`setupStress`/fixture creation
(default profile too). Before the first simulation step the canonical Swarmer
fixture is validated, then replaced with 150 enemies cycling the canonical
non-boss defs `scout, swarmer, cruiser, frigate, phase` (unmodified HP/shield/armor/
speed, `hpScale` 1; no new balance data). Every step replenishes to a **floor** of
`targetEnemies` with the same cycling types and spawn ports. Natural splits/extras
are kept, never trimmed or killed; the population is therefore **not exactly**
the target. Above `3 × targetEnemies` the result is invalid and the fixture halts
(game paused) rather than growing unbounded.

Extra per-scenario fields: `composition` (canonical, initial, warm-up and sample
replacement type/port counts), `population.endTypeCounts/naturalExtraMax/overflow*`,
`towers` (min/max/end count and HP sum), and `effects.warmup` / `effects.sample`:
per-type min/max, `splitChildMax`, and active maxima for meteors, knights, roombas
(`game.knights` kind) and fire zones. `*Pool` values are array capacities, not
active counts. `cues` counts `game.emitSound` **calls** per window (original runs
unaltered, queue not drained); unlisted keys fall under `other`. A missing
`emitSound` (or effect arrays) makes the theater scenario explicitly invalid.

**Placed vs operational towers.** Destroyed towers (Mars meteors, medieval dragons)
are *not* removed from `game.towers`; they stay with `hp = 0` and are disabled, so
the placed count stays 20. `towers` therefore reports both: `placed` (array length;
`end`, `sampleMin/Max`, `warmupMin/Max`) and `operational` (towers with finite
`hp > 0`: `end`, plus per-window `min/max/end` under `warmup` and `sample`), and
finite aggregate `hp` (`end`, per-window `min/max/end`). `effects.*` windows carry
`towerOperationalMin/Max/End` and `towerHpEnd`. Warnings fire when the operational
count drops below 20 and when it reaches 0 (the old "all destroyed" check looked
only at the array length, which never shrinks for disabled towers). Nothing is
repaired. Missing or non-finite tower `hp` makes the operational count
unavailable (`null`) and the scenario invalid; it is never reported as 0.

**Non-finite state invalidates a run.** The harness checks finiteness *before*
any canonical comparison (`Math.abs(NaN - x) > eps` is false, so NaN would pass):
spawned `maxHp`, `maxShield` and `speedScale` (if present; `spawnEnemy` always
sets `maxShield`, 0 when the def has no shield), `game.time`, `game.lives` (each
step and at the end), and theater tower `hp`. Theater additionally requires
finite `maxHp`/`maxShield` on every spawn and finite, positive hp on all towers
at fixture start; absent stats are reported as unavailable, not assumed.
`composition.invalidSpawns` counts bad spawns.

Limits: theater timings are variable-workload and **not comparable** with the
fixed sustained baseline or with other maps/runs. No boss is covered unless the
separate `bossHealer` fixture below is requested. The harness never
repairs or freezes towers, so environmental loss (e.g. Mars meteors) is reported
and warned, not hidden; do not assume a constant 20 towers (with `bossHealer`, the
harness still never repairs or freezes towers, but real Healer units can). Cue counts show
emission only, not damage or audibility. Per-step observation runs outside the
timed segments but uses wall time. Same hardware limits as above apply: no
physical-phone, thermal, GPU, DPI, or multi-touch claim.

## Opt-in `towerTier: 2` (labelled tier-2 theater fixture)

`towerTier` is `0` (default; nothing changes) or `2`, and `2` requires
`profile: 'theater'`. It exists to give independently labelled coverage fixtures for
abilities base-tier towers did not exercise (lawn cruiser splits, the medieval
flaming trebuchet). It is a **separate fixture**, never comparable with canonical
tier-0 theater or the sustained baseline; config, result, scenario
(`towerTier`, `scenarioLabel`, `towers.tier`), `comparability`, warnings and
disclosures all say so.

Reproduce one map per call, 25 s sample, phone viewport:

```javascript
const result = await benchmark(existingPage, {
  profile: 'theater', towerTier: 2, mapIds: ['backyard-lawn'], // or 'ironhold-keep'
  warmupMs: 1000, sampleMs: 25000, viewport: { width: 412, height: 915 }, deviceScaleFactor: 2,
});
```

Setup, after the canonical 20 base-tier towers are validated and before any step or
mixed-enemy fixture: every tower is upgraded twice (at most 40 upgrades) through the
real `game.upgradeTower`. For each upgrade the exact canonical cost
(`tower.def.upgrades[tier].cost`) is first granted with `game.grant(owner, cost)`, so
net wallets are unchanged and `ledger.granted` and `ledger.spent` each rise by the
total cost. No tier, stat or credit is written directly, and the harness does not repair
or freeze towers afterwards. Methods (`canUpgrade`, `grant`, `upgradeTower`, `credits`,
`ledger`) are required only for tier 2. Any failure (missing method, non-finite or
missing canonical cost, a tower not at base tier, a refused or non-advancing upgrade,
unreconciled wallet/ledger) makes the scenario `measured: false` with a reason; there
is no fallback, and patches are restored. An upgrade API exception is recorded as
an unmeasured setup failure with the partial upgrade audit.
The game state is not rolled back; the next scenario's `setMap`/`setupStress` resets it.

`scenario.towerUpgrade` is the compact audit: canonical fixture, tier counts and
aggregate `hp`/`maxHp` before and after, attempted/succeeded/call counts, `totalCost`
and `totalGranted`, and wallet and ledger before/after (with deltas). `upgradeTower`
raises `maxHp` to 130/165, so initial aggregate HP is about 3300, not the 2000 of
tier 0; read it from the audit rather than assuming a number.

Tier choice alone proves nothing: ability coverage is claimed only from observed
evidence (`effects.*` cue counts, `fireZonesMax`, `splitChildMax`), exactly as for
tier 0.

## Opt-in `bossHealer: true` (separate boss + Healer fixture)

Fills the remaining coverage gap: a live canonical boss and Healer stations on the two
maps with defeatable defenses (Mars Outpost, Ironhold Keep). It is a **separate
workload**, not comparable with tier-2 theater, tier-0 theater or sustained; config,
`comparability`, `scenarioLabel`, warnings and disclosures all say so. Default
behavior is unchanged. Run one map per call:

```javascript
const result = await benchmark(existingPage, {
  profile: 'theater', towerTier: 2, bossHealer: true,
  mapIds: ['mars-outpost'], // or 'ironhold-keep'
  warmupMs: 1000, sampleMs: 25000,
});
writeFileSync('.tasks/benchmark-boss-healer-mars-outpost.json', JSON.stringify(result, null, 2));
```

Validation happens before any context is created: `bossHealer` must be a boolean, and
`true` requires theater, `towerTier: 2` and only the two map IDs above. The page also
re-checks that `currentMap.mechanic` is `mars-storms` or `medieval-frenzy`.

Setup order: canonical 20 base-tier towers validated, upgraded twice via the existing
tier-2 sequence, then exactly **2 base-tier Healer stations** (one per player) via
`game.grant(owner, cost)` + `game.tryPlace` only. Cells are searched deterministically
(nearest free cell to the owner's defenses, then row, then column; `game.check` is a
read-only legality filter). Nothing writes paths, HP, stats or credits directly. Any
failure (no legal cell, refused or no-op placement, unreconciled wallet/ledger, wrong
mechanic) makes the scenario `measured: false` with a reason; there is no fallback.
The two extra Healers (22 towers) are a **declared fixture difference**, audited in
`scenario.bossHealerFixture` (placements, costs, grants, tower counts, wallets, ledger).

Enemies: the usual five-type replenishment plus one unmodified canonical `dreadnought`.
A new boss spawns only when none is live; it counts within the population floor and the
`3 × targetEnemies` cap, and natural escorts/splits are kept. Boss HP, phases, damage
and death are never forced by the harness, and it never damages, repairs or freezes towers
(real Healer units can repair or revive them). Boss spawns go through the same
canonical-stats checks as the other types. At step **entry** and **after refill** exactly
one live canonical `dreadnought` is required (no other boss def, finite unique id,
integer `bossPhase` 0..2); more than one, a foreign boss or bad id/phase is an explicit
violation (`singleCanonicalBoss: false`, `bossAuditViolations`). Zero right after combat
is allowed (natural death/leak) and counted as `postCombatNoBossSteps`; the refill then
spawns exactly one.

`scenario.bossHealer` has per-window (`warmup`, `sample`) evidence: boss present
min/max, unique bosses observed, max `bossPhase`, active healer units / distinct owners
/ assigned targets (max), duplicate-owner and duplicate-target steps (each also an
explicit invariant failure), and **net** tower HP recovery (`netRecoveryHp`, affected
towers). Net recovery is the positive per-tower HP change (matched by tower id) across
the original step only: the pre snapshot is taken immediately before it (after the
pre-refill) and the post snapshot immediately after it (before the post-refill), outside
every timer, so refill/fixture HP writes and reordered or new towers are never counted.
Same-step damage can mask healing, so it is not total healing, and active healers alone
are not proof: `healerAttributedRecoveryHp` counts only steps with an actual active
healer unit before or after that step; `gainWithoutHealerHp` is reported separately and
is not healer coverage. Healer units are never counted as knights. `bossPhaseCues`
counts `boss-phase` emissions. `warmupCoverage` and `sampleCoverage` state whether a boss
phase and healer-attributed recovery were observed in that window; `coverage` is an
alias of **sampleCoverage**, so warmup-only evidence never claims sampled coverage.
Otherwise `coverage.missing` and a `COVERAGE MISSING` warning (a finding, not an
unreliable-timing failure) say so. Fixture presence is never reported as coverage.

### Optional `bossPriority: 'strong'` (focused-boss targeting)

The first boss + Healer samples never reached a boss phase because the fixture towers
use the default `first` priority. `bossPriority` is `'first'` (default: no change, zero
priority calls) or `'strong'`, and is valid **only** with `bossHealer: true`: an
unsupported value, or any supplied value without `bossHealer`, is rejected before a
context is created.

With `'strong'`, after the Healer fixture and before any step, the REQUESTED procedure is
the real `game.setTowerPriority(id, 'strong')` once on each of the 20 canonical towers
(never the Healer stations; no direct priority or stat write). `scenario.bossPriority`
(also `scenario.bossHealer.priority`) records the requested priority, `effective`
(`null` until the priority is observed on the live towers, so failures never report
`strong`), call and success counts, target ids, final priorities and an `unchanged` audit:
wallet, all scalar ledger fields, tiers, HP, and the original 22 tower objects/ids in
order (a swapped tower with the same count fails). The default `first` makes zero calls
but still inspects all 20 towers and both Healers (must all be `first`). A failed,
mismatched or mutating call makes the scenario `measured: false`; there is no fallback.

This is a **distinct workload**: `scenarioLabel`, `comparability`, warnings and
disclosures say so, and it is not comparable with `first`-priority boss + Healer runs.

**Limitation:** setting priority is not universal boss focus. RadialStasis and
KeepKnightStable bypass `pickTarget`, so they ignore it. The disclosures describe the
requested procedure; do not claim 20 completed calls unless `bossPriority.ok` and
`setCalls`/`succeededCalls` say so.
Targeting does not prove boss-phase coverage: only the per-window phases actually observed
in `warmupCoverage`/`sampleCoverage` count, and `COVERAGE MISSING` still applies. Enemy HP,
phases and combat are never forced.

First recorded results: [boss + Healer report](PERFORMANCE-BOSS-HEALER.md).
Strong-priority follow-up: [boss + Healer Strong report](PERFORMANCE-BOSS-STRONG.md).

Observer overhead (tower HP snapshots, enemy/healer scans) runs outside the timed core
step but consumes wall time; the 45 s workload + 5 s cleanup bound is unchanged. Same
hardware limits as above apply.

## Automatic mechanic observation (Cyber / Volcano / Bio)

No option exists or is needed. With `profile: 'theater'`, when the scenario map's actual
`currentMap.mechanic` is `cyber-emp-chain`, `volcano-lava-geyser` or `biolab-mutate-regen`,
the scenario gains `scenario.mechanics` (other maps, sustained and the boss fixture are
unchanged). It is observation only: no state, HP, timer, population cap or target changes.
Fields: `kind`, `warmup`, `sample`, `warmupCoverage`, `sampleCoverage` (alias `coverage`),
`missing`, `warnings`, and `notes`.
Warmup-only evidence is never sampled coverage; missing coverage lands in `missing` and a
scenario warning (`MECHANIC COVERAGE MISSING`), not in invalid timing.

- **Cyber:** real `empActive` (boolean) with finite `empTimer` per step: `activeSteps`,
  `activeEntries`. A wrapper on `game.damageEnemy` (this/args/return/errors preserved) groups
  distinct finite enemy ids per canonical `pulse` tower inside the original step only;
  `>= 2` ids is `multiHitTowerSteps` evidence of chain damageEnemy *calls*, not proof damage
  was applied. Other towers, tower-less calls and calls outside the step are ignored.
  **The wrapper runs inside the timed core step, so `coreStepCpu` includes its overhead.**
- **Volcano:** existing active meteor / fire-zone maxima and `meteor-impact` cue counts,
  scoped to the actual volcano mechanic. Forge Drone presence is not observed or claimed;
  cue counts are emission only. Geyser coverage needs an active **environmental** zone
  (`owner === -1 && towerId === 0`, `geyserZonesMax`); tower-owned zones such as plasma are
  counted separately (`towerFireZonesMax`) and never satisfy it. Generic `fireZonesMax` /
  `fireZoneActiveObserved` stay informational.
- **Bio:** real `mutationActive`/`mutationTimer`; natural splits need a sample-window
  `centipede-split` cue (`splitCues`) AND an active `isSplitChild` enemy in the same window
  (warmup children persisting into the sample are not a sample event); positive per-enemy
  **net** HP change across one original step, matched by finite unique id and object
  identity (refills, new/replaced ids, dead or removed enemies excluded). Damage masks regen,
  so this is neither gross regen nor proof of slow suppression. `eligibleEnemySteps` /
  `slowOrBurnSuppressedEnemySteps` (informational) never count as coverage. Eligibility
  uses a by-value PRE-step snapshot of `dead`/`maxHp`, so an eligible enemy that dies during
  the step is still counted (and is unobserved, never regen).

Missing or non-finite mechanic state invalidates the run and remains unobserved
(`stateInvalidSteps`; active counts are `null` if no valid state was observed).
A missing Cyber damage-call observer or an internal observer error also invalidates the
run. These failures differ from a valid observation in which an ability never occurred.
Distinct-id sets are capped at 512
(`netRegenDistinctCapped`, set only when a NEW id cannot be added; ids already in a full set
do not trip it). Snapshots run outside the timed segments but consume wall time.
Patches are restored in the existing `finally`.
Measured samples: [Cyber / Volcano / Bio report](PERFORMANCE-CYBER-VOLCANO-BIO.md).

## Interpret the output

Inspect `valid`, `failures`, scenario `problems`, and `warnings` before comparing
timings. Missing/insufficient frame or CPU samples, hidden/paused runs, population
violations, and changed score storage invalidate measurements. For sustained,
pre-step and post-refill counts must equal the target; for theater, they must
meet the floor without exceeding the overflow cap. Post-combat dips and
replacements are reported separately. Stress mode excludes persistent best scores, with storage
checked before/after. Bad options, timeout, and method failures reject the call.

The report separates original simulation CPU, refill CPU, and `renderer.update`
CPU preparation. These are transient JavaScript pipeline timings: **GPU completion,
composition, and most Pixi draw work are excluded**. rAF intervals describe browser
callback cadence, not touch latency. Timer resolution/instrumentation overhead,
browser/GPU metadata, build identity, and simulation-time/wall-time ratio matter.

Seeding FX does not make frame scheduling deterministic. A fixed Swarmer population
does not reproduce mixed campaign enemies, bosses, subs, split units, or every
theater mechanic. Short samples do not certify physical-phone performance, sustained
thermal behavior, high-DPI comfort, or multi-touch quality. No FPS pass threshold
or hardware claim follows from `valid: true`; it means the sample met its invariants.
