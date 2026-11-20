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
  mapIds: ['mars-outpost', 'kitchen-counter', 'backyard-lawn'],
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

## Interpret the output

Inspect `valid`, `failures`, scenario `problems`, and `warnings` before comparing
timings. Missing/insufficient frame or CPU samples, hidden/paused runs, population
violations, and changed score storage invalidate measurements. Pre-step and
post-refill counts must equal the target; post-combat dips and replacements are
reported separately. Stress mode excludes persistent best scores, with storage
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
