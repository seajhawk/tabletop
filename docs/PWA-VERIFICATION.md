# PWA real-browser smoke

Local, bounded, reusable check of the real service worker / `PwaController` in Chromium browser automation
(Playwright MCP; headless mode is not proven).
Files: `scripts/pwa-smoke-server.mjs` (fixture server), `scripts/pwa-smoke-browser.js` (Playwright MCP function).

Windows Chrome installation and cold offline launch were subsequently verified, and a shared
manifest-identity bug was fixed: see [desktop verification](PWA-DESKTOP-VERIFICATION.md).
The page-only scenarios below retain their original dates and scope.

## Verified on 2026-11-22

All five scenarios passed on Pass 22 source (`b728a79`) plus the existing local service-worker
fixes, around 1:16 AM Pacific in Chromium 158.0.8127.36. Each synthetic fixture now precaches
23 files, including its own revision probe. These are local synthetic updates, not released-version migrations.

| Scenario | Checks | Result | Raw evidence |
| --- | --- | --- | --- |
| Two tabs, root scope | 34 | PASS | [JSON](verification/2026-11-22-0116-pwa-multitab-root.json) |
| Two tabs, `/TTDefense/` scope | 34 | PASS | [JSON](verification/2026-11-22-0116-pwa-multitab-ttdefense.json) |
| Root offline/update lifecycle | 25 | PASS | [JSON](verification/2026-11-22-0116-pwa-root.json) |
| `/TTDefense/` offline/update lifecycle | 25 | PASS | [JSON](verification/2026-11-22-0116-pwa-ttdefense.json) |
| Closed sibling cache and offline reopen | 12 | PASS | [JSON](verification/2026-11-22-0116-pwa-siblings.json) |

**130 checks passed**, with zero warnings, page errors, console errors or unexpected network failures.
The two-tab checks proved that activating B in a fresh tab replaced the other tab's controller
with the saved waiting-worker object while preserving its A document and placed tower, ledger
and wallets. Its Update action remained blocked. Both caches survived; the A-only asset was
absent from B's cache and returned 404 from the B-selected HTTP server, yet B served its exact
bytes offline through the older cache. After reset, an explicit Update navigated the older tab
exactly once to B while offline; the other tab did not reload again. Storage sentinel and
best-score baseline were unchanged. No new production fix was needed for this scenario.

Both helpers passed syntax checks. Three fresh production fixture builds succeeded; the existing
`proto-web/dist` was untouched. All isolated browser contexts and the fixture server were closed.
The prior 43 focused PWA unit checks below were not repeated: this addition changes the smoke
harness and documentation, and the previously tested service-worker source is unchanged.

## Verified on 2026-11-21

All three real-browser scenarios passed on the Pass 21 source (`3a1f115`) plus the local
service-worker fixes below. Runs completed around 8:09 PM Pacific in Chromium
158.0.8127.36. Each synthetic build precached 22 files. These are local tests, not a deployment.

| Scenario | Checks | Result | Raw evidence |
| --- | --- | --- | --- |
| Root offline/update lifecycle | 25 | PASS | [JSON](verification/2026-11-21-2009-pwa-root.json) |
| `/TTDefense/` offline/update lifecycle | 25 | PASS | [JSON](verification/2026-11-21-2009-pwa-ttdefense.json) |
| Closed `/tabletop/` survives sibling activation and reopens offline | 12 | PASS | [JSON](verification/2026-11-21-2009-pwa-siblings.json) |

Both lifecycle runs verified offline navigation and asset reads before and after an update.
While a placed tower represented match progress, the new worker stayed waiting, the active
worker was unchanged, and progress survived. Reset followed by Update caused exactly one
reload. The localStorage sentinel survived and the best-score entry remained unchanged.
The sibling run also preserved unrelated and legacy-shaped caches. All final runs had
zero warnings, page errors, console errors and unexpected network failures. Their isolated
contexts were closed; the fixture server was stopped after verification.

Focused unit checks: **43/43 passed** (`sw.test.mjs`: 21; `pwa.test.ts`: 22).
The service worker and both helper scripts also passed syntax checks. Fixture builds for
`/`, `/tabletop/` and `/TTDefense/` succeeded without replacing `proto-web/dist`.

### Fixes established by this work

- Cache names now use `ga-scope-app:<encoded base>:`. Each deployment prunes only its own
  old versions. The distinct family also survives legacy workers' broad `ga-app-` cleanup;
  the colon delimiter avoids prefix collisions with paths such as `/-preview/`.
- Legacy `ga-app-<16 hex>` caches are retained because their ownership is ambiguous.
  Exact-path reads preserve old assets without serving a sibling's same-named file.
- Installation now drains each downloaded body before starting the next fetch, retaining
  a native response clone for the later cache write. The initial browser check stalled
  with response headers received but unread bodies occupying connections; the revised
  installer completed. A failed fetch/body read still leaves no partial candidate cache,
  and cache-write failure removes only that candidate. Native URL/type/headers are preserved.

Staging retains the full precache in memory until downloads complete. Legacy caches can
remain on disk; this change deliberately does not guess which app owns them. Native OS
installation, other browsers, CDN behavior and physical touch remain outside this proof.

## Run (3 calls)

1. Start the server in the background (needs `proto-web/node_modules`; no network, no installs):
   `node scripts/pwa-smoke-server.mjs [--port 4187]`
   It builds the current production app for bases `/`, `/tabletop/`, `/TTDefense/` into a NEW
   `.tasks/pwa-smoke-<stamp>-<rand>/` (never `proto-web/dist`; nothing deleted), then prints one compact JSON ready line
   (`origin`, `buildDir`, per-base A/B `version` + `files`). Parent deletes old `.tasks/pwa-smoke-*` dirs if desired.
2. Playwright MCP `browser_run_code_unsafe` `{ filename: "scripts/pwa-smoke-browser.js" }` runs lifecycle for `/`.
   Options come from editing the call's code wrapper: `{ origin, mode: 'lifecycle'|'siblings'|'multitab', base: '/'|'/tabletop/'|'/TTDefense/' }`
   (lifecycle and multitab once per base you want; `siblings` takes no base).
3. `POST http://127.0.0.1:4187/__pwa_fixture__/shutdown` (the server also exits after 10 minutes).

## Server

- Binds only `127.0.0.1`, default port 4187 (`--port` 1024..65535). Host/Origin checked on control routes.
- `GET /__pwa_fixture__/meta`; `POST /__pwa_fixture__/select {"base":"/tabletop/","version":"A"|"B"}` switches one base;
  `POST /__pwa_fixture__/shutdown`.
- `/TTDefense/` and `/tabletop/` are routed before the `/` fallback; missing files are real 404s; no-cache headers;
  `ga-sw.js` carries `Service-Worker-Allowed: <base>`; paths are confined to the fixture directory.
- **A/B are synthetic.** Each is the same current production build plus `<meta name="ga-pwa-smoke" content="A|B">` in the
  generated `index.html`; the worker is regenerated with the existing `generateWorker()` and the current
  `proto-web/scripts/sw-template.js`, so A and B have genuinely different content-hash versions. They are not released versions.
  Cache names are parsed from the actual template/worker, not hardcoded.
- Each fixture also gets one small synthetic asset written before the worker is generated: `assets/pwa-smoke-A.txt` exists
  only in A and `assets/pwa-smoke-B.txt` only in B (B's copy of the A file is removed). Its URL and exact body are exposed in
  `/meta` as `probeUrl`/`probeBody`. Each fixture therefore precaches 23 files (the 22 app files plus the probe). The probe is
  for old-asset fallback proof only; it is not a real release migration.

## Browser helper

Uses `existingPage.context().browser()` only (the page is never navigated or closed), opens its own fresh context with
service workers allowed and no request interception, ~60 s deadline + 5 s bounded cleanup, and closes only its own context
(never the caller's page/context). Close errors or a close timeout are failures. The online reset is issued independently of
`close()` so a hung reset cannot block closure. If `newContext` resolves after the deadline, that context is closed before any
page or server call; if it is still pending after the cleanup budget the result reports `pending` (a failure) and a late-close
handler is registered. Validates options (plain object, no unknown keys), origin (loopback http), mode and base before any
side effect. Returns JSON:
`ok, checks[], failures[], warnings[], build, pageErrors[], console{online, offline, samples}, network{expectedOffline, unexpected, evidence}, durationMs`.
`ok:true` needs every check to pass, no page errors, no unexpected online network failures and no online console errors.
Offline-phase console errors (e.g. failed fetches while offline) are not failures but are always disclosed in `console`/`warnings`.

**lifecycle** expected proof: real registration with scope = base and `ga-sw.js` in state `activated` (past the activate
handler's cache pruning, not merely claimed) whose URL equals the page controller's; cache named for version A holding
shell, manifest, main JS and all files; offline reload answered by the worker with marker A and the game booted; real
`game.tryPlace` progress; fixture B installs to waiting via real `pwa.update()`; a second update is blocked (blocked message,
no reload, same token and progress, B still `waiting` in state `installed`, and the page's controller and the registration's
active worker are the identical objects captured before the update, so no activation occurred); after `game.reset()` one `pwa.update()` gives exactly one reload to marker B and
a complete B cache; offline reload of B boots; localStorage sentinel and best-score key unchanged.
`GA_SKIP_WAITING` is never posted directly.

**siblings** expected proof (cache-isolation regression): `/tabletop/` A loads, claims, its page is closed; `/TTDefense/` A
loads and claims; the `/tabletop/` cache and every earlier cache name still exist, plus seeded unrelated and legacy-shaped caches;
each app has its own cache; root scope is never registered; offline reopen of `/tabletop/` boots marker A from its worker.

**multitab** expected proof, using one fresh isolated context with two
same-scope tabs, both loaded on A and fully activated. Tab 1 gets real `game.tryPlace` progress plus a window token; tab 2 stays
fresh. With fixture B selected, tab 2's real `pwa.update()` installs B to waiting and a second real `pwa.update()` activates it
and reloads tab 2 exactly once onto marker B. Tab 1 must then show: its controller and `registration.active` are the
saved B waiting-worker object (A and B share the same `scriptURL`), now `activated` with no waiting worker; no reload, marker A, same token; identical
tower, ledger and wallet state; `PwaController` in `ready` with the blocked message. Tab 1's own `pwa.update()` stays blocked
(no reload, controller unchanged, progress intact). Both A and B caches are complete; A's holds `assets/pwa-smoke-A.txt`, B's
does not, and the B-selected server returns 404 for A's probe. With the context offline, tab 1 fetches the A-only probe
using `cache: 'no-store'` and gets exactly A's bytes with `fromServiceWorker()` true
(old-cache fallback through the new worker), and the B probe from the B cache. Then tab 1 reset plus `pwa.update()` reloads it
to marker B exactly once while offline, with the navigation served by the worker. Tab 2 does not reload again;
the localStorage sentinel and best-score key persist. Navigation listeners are attached before each action.
`GA_SKIP_WAITING` is never posted directly. Checks for the other modes are unchanged apart from the precache count (now 23).

## Not proven

Chromium browser automation on this machine only (not proven headless). Not an OS/native install (Chrome/Edge install UI, Add to Home Screen, standalone
window), not real touch hardware, not other browsers, not a real released-version update, not HTTPS/CDN/GitHub Pages behaviour.
