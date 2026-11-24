/*
 * Galactic Defense - bounded local real-browser PWA smoke (single self-contained async function expression).
 *
 * Run it (parent/coordinator only) with Playwright MCP `browser_run_code_unsafe` { filename: "scripts/pwa-smoke-browser.js" }
 * AFTER `node scripts/pwa-smoke-server.mjs` printed its ready line. Host globals required: URL, setTimeout, clearTimeout.
 * No imports/exports.
 *
 *   await smoke(existingPage, options = {})
 *
 * `existingPage` is used ONLY to reach `existingPage.context().browser()`; it is never navigated, closed or modified.
 * The helper opens its OWN fresh context (service workers ALLOWED, no request interception), closes only that context
 * (success, failure, timeout, ~60 s deadline + 5 s bounded cleanup; close errors/timeouts are failures). The online reset is
 * fire-and-forget so it cannot block close; a context that resolves after the deadline is closed before any page/server use.
 *
 * Options (validated before any side effect; unknown keys rejected):
 *   origin  'http://127.0.0.1:4187' default; http only, loopback host, explicit port, no path/credentials/query/hash.
 *   mode    'lifecycle' (default) | 'siblings' | 'multitab'
 *   base    lifecycle and multitab: '/' (default) | '/tabletop/' | '/TTDefense/'
 *
 * lifecycle: fixture A -> real register/claim/precache -> offline reload (shell from SW) -> real game progress (tryPlace)
 *   -> fixture B -> real pwa.update() reaches "ready" -> second update blocked while progress exists (no reload) -> real
 *   game.reset + pwa.update() -> exactly one reload onto marker B -> offline reload of B. localStorage sentinel and best-score key
 *   must survive. GA_SKIP_WAITING is never posted directly.
 * siblings: /tabletop/ A loaded, claimed and CLOSED; /TTDefense/ A loaded and claimed; the first app's cache must still exist;
 *   offline reopen of /tabletop/ boots from its own worker. Root scope is never registered in this context.
 * multitab: two same-scope tabs on A in one context. Tab 1 holds real progress (tryPlace); tab 2 stays fresh. Fixture B ->
 *   tab 2 real pwa.update() installs waiting, second real pwa.update() activates and reloads tab 2 once. Tab 1 must get a NEW
 *   controller object without reloading, keep marker A / token / towers / ledger / wallet, and show ready+blocked; its own
 *   update() stays blocked. Both A and B caches complete. Offline, tab 1 fetches the A-only probe asset (assets/pwa-smoke-A.txt)
 *   through the new worker (bytes + fromServiceWorker; absent from the B cache). Then reset + update() reloads tab 1 to B once
 *   and B boots offline from the worker; sentinel and best-score key persist. GA_SKIP_WAITING is never posted directly.
 * Evidence is for Chromium browser automation on this machine only (tool mode not proven headless): not an OS install,
 * not touch hardware, not a real release version.
 * Console errors: online-phase errors invalidate the run; offline-phase errors are disclosed in result.console, never masked.
 */
async (existingPage, options = {}) => {
  const DEADLINE_MS = 60000, CLEANUP_MS = 5000, POLL_MS = 100;
  const BLOCKED_RE = /reset the match/i; // src/pwa.ts BLOCKED_MESSAGE: 'Finish or reset the match before updating.'
  const SENTINEL_KEY = 'ga-pwa-smoke:sentinel';
  const SCORE_KEY = 'galactic-defense:best-scores:v1';
  const t0 = Date.now();
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  const result = {
    timestamp: new Date(t0).toISOString(),
    ok: false, mode: null, base: null, origin: null, synthetic: 'A/B are synthetic fixtures (same app + meta marker + distinct probe asset), not released versions',
    checks: [], failures: [], warnings: [], build: null, pageErrors: [], network: { expectedOffline: [], unexpected: [], evidence: [] },
    console: { online: 0, offline: 0, samples: [] },
    durationMs: 0, claims: 'Chromium browser automation only (not proven headless): no native/OS install, no touch hardware, no real release',
  };
  const fail = msg => { result.failures.push(msg); };

  // ---- validate before any side effect ----
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    fail('options must be a plain object'); result.invalid = true; return result;
  }
  if (!existingPage || typeof existingPage.context !== 'function') {
    fail('existingPage must be a Playwright page'); result.invalid = true; return result;
  }
  const allowed = ['origin', 'mode', 'base'];
  const bad = Object.keys(options).filter(k => !allowed.includes(k));
  if (bad.length) fail(`unknown option(s): ${bad.join(', ')}`);
  const mode = options.mode === undefined ? 'lifecycle' : options.mode;
  if (mode !== 'lifecycle' && mode !== 'siblings' && mode !== 'multitab') fail(`mode must be 'lifecycle', 'siblings' or 'multitab'`);
  const base = options.base === undefined ? '/' : options.base;
  if (!['/', '/tabletop/', '/TTDefense/'].includes(base)) fail(`base must be one of '/', '/tabletop/', '/TTDefense/'`);
  if (mode === 'siblings' && options.base !== undefined) fail(`base is not used in siblings mode`);
  let origin = null;
  try {
    const u = new URL(options.origin === undefined ? 'http://127.0.0.1:4187' : options.origin);
    const loop = ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname);
    if (u.protocol !== 'http:' || !loop || !u.port || u.username || u.password || u.search || u.hash || u.pathname !== '/') {
      fail('origin must be http://<127.0.0.1|localhost|[::1]>:<port> with no path/credentials/query/hash');
    } else origin = u.origin;
  } catch { fail('origin is not a valid URL'); }
  result.mode = mode; result.base = mode === 'siblings' ? null : base; result.origin = origin;
  if (result.failures.length) { result.invalid = true; return result; }

  // ---- helpers ----
  const aborted = { v: false };
  const check = (name, pass, detail) => {
    result.checks.push({ name, pass: !!pass, detail: detail === undefined ? null : detail });
    if (!pass) fail(`${name}${detail === undefined ? '' : ': ' + JSON.stringify(detail)}`);
    return !!pass;
  };
  const must = (name, pass, detail) => { if (!check(name, pass, detail)) throw new Error(`required check failed: ${name}`); };
  async function waitFor(desc, fn, ms = 15000) {
    const end = Math.min(Date.now() + ms, t0 + DEADLINE_MS);
    let last;
    for (;;) {
      if (aborted.v) throw new Error(`aborted while waiting for ${desc}`);
      try { last = await fn(); if (last) return last; } catch (e) { last = null; }
      if (Date.now() >= end) throw new Error(`timeout waiting for ${desc}`);
      await sleep(POLL_MS);
    }
  }

  let ctx = null, phase = 'online';
  const loads = new Map(); // page -> load count
  const navigations = new Map(); // page -> main-frame navigation count
  const pageErrors = result.pageErrors;
  const netCap = 60;
  function watch(page, label) {
    loads.set(page, 0);
    navigations.set(page, 0);
    page.on('load', () => loads.set(page, (loads.get(page) || 0) + 1));
    page.on('framenavigated', frame => { if (frame === page.mainFrame()) navigations.set(page, (navigations.get(page) || 0) + 1); });
    page.on('pageerror', e => { if (pageErrors.length < 20) pageErrors.push({ page: label, phase, message: String(e && e.message || e).slice(0, 300) }); });
    page.on('console', m => {
      if (m.type() !== 'error') return;
      result.console[phase === 'offline' ? 'offline' : 'online']++;
      if (result.console.samples.length < 10) result.console.samples.push({ page: label, phase, text: String(m.text()).slice(0, 200) });
    });
    page.on('requestfailed', r => {
      let p; try { p = new URL(r.url()); } catch { return; }
      if (p.origin !== origin) return;
      const e = { page: label, phase, path: p.pathname, error: (r.failure() || {}).errorText || 'failed' };
      if (phase === 'offline') { if (result.network.expectedOffline.length < netCap) result.network.expectedOffline.push(e); }
      else if (/ERR_ABORTED/.test(e.error)) result.warnings.push(`aborted request while online: ${p.pathname}`);
      else if (result.network.unexpected.length < netCap) result.network.unexpected.push(e);
    });
    page.on('response', r => {
      let p; try { p = new URL(r.url()); } catch { return; }
      if (p.origin !== origin) return;
      if (r.status() >= 400 && phase === 'online' && result.network.unexpected.length < netCap) {
        result.network.unexpected.push({ page: label, phase, path: p.pathname, status: r.status() });
      }
      if (/ga-sw\.js$|index\.html$|manifest\.webmanifest$|\/$/.test(p.pathname) && result.network.evidence.length < netCap) {
        result.network.evidence.push({ page: label, phase, path: p.pathname, status: r.status(), fromServiceWorker: r.fromServiceWorker() });
      }
    });
  }

  const api = async (method, p, data) => {
    const res = method === 'GET' ? await ctx.request.get(origin + p) : await ctx.request.post(origin + p, { data });
    if (!res.ok()) throw new Error(`${method} ${p} -> ${res.status()}`);
    return res.json();
  };
  const select = (b, version) => api('POST', '/__pwa_fixture__/select', { base: b, version });

  const snap = page => page.evaluate(() => {
    const ga = window.__ga, pwa = ga && ga.pwa, g = ga && ga.game;
    return {
      hasGa: !!(ga && g && pwa), registered: !!(pwa && pwa.registered), controlled: !!navigator.serviceWorker.controller,
      updateState: pwa ? pwa.updateState : null, message: pwa ? pwa.message : null,
      marker: (document.querySelector('meta[name="ga-pwa-smoke"]') || {}).content || null,
      canvas: !!document.querySelector('canvas'), token: window.__gaSmokeToken || null,
      towers: g ? g.towers.length : null, spent: g ? g.ledger.spent : null, credits: g ? g.credits.slice() : null,
    };
  }).catch(() => null);

  // Locate the app cache for a fixture (name from build metadata; version-suffix fallback) and list its paths.
  const cacheInfo = (page, fx, b) => page.evaluate(async ({ name, version, b }) => {
    const names = await caches.keys();
    const pick = names.includes(name) ? name : (name ? null : names.find(n => n.endsWith(version) && n.includes(encodeURIComponent(b))) || null);
    let paths = null;
    if (pick) paths = (await (await caches.open(pick)).keys()).map(r => new URL(r.url).pathname);
    return { names, pick, paths };
  }, { name: fx.cacheName, version: fx.version, b });

  const cacheComplete = (info, fx, b) => {
    if (!info || !info.paths) return false;
    const need = [new URL(fx.shellUrl, origin).pathname, new URL(fx.manifestUrl, origin).pathname];
    if (fx.mainJsUrl) need.push(new URL(fx.mainJsUrl, origin + b).pathname);
    return need.every(x => info.paths.includes(x)) && info.paths.length === fx.precacheCount;
  };

  // Registration for base `b`: active/waiting worker URL+state and the page's controller URL.
  const swInfo = (page, b) => page.evaluate(async b => {
    const r = await navigator.serviceWorker.getRegistration(location.origin + b);
    if (!r) return null;
    const c = navigator.serviceWorker.controller, w = x => x ? { url: x.scriptURL, state: x.state } : null;
    return { scope: r.scope, active: w(r.active), waiting: w(r.waiting), controller: w(c) };
  }, b).catch(() => null);

  // Targeted worker is ACTIVATED (activate event + waitUntil prune finished, not merely claimed) and controls this page.
  const activatedOk = (i, b) => !!(i && i.scope === origin + b && i.active && i.active.state === 'activated' &&
    i.active.url === origin + b + 'ga-sw.js' && i.controller && i.controller.url === i.active.url);

  async function settled(page, fx, b, label) {
    const s = await waitFor(`${label}: app boot + registration + claim`, async () => {
      const x = await snap(page);
      return x && x.hasGa && x.registered && x.controlled && x.canvas ? x : null;
    }, 20000);
    const reg = await waitFor(`${label}: worker activated and controlling`, async () => {
      const i = await swInfo(page, b);
      return activatedOk(i, b) ? i : null;
    }, 15000);
    const info = await waitFor(`${label}: complete precache`, async () => {
      const i = await cacheInfo(page, fx, b);
      return cacheComplete(i, fx, b) ? i : null;
    }, 15000);
    check(`${label}: registered with scope ${b}, ga-sw.js activated, same worker controls page`, activatedOk(reg, b), reg);
    check(`${label}: cache complete (shell, manifest, main JS, ${fx.precacheCount} files)`, true, { cache: info.pick });
    return { s, info };
  }

  const assetUrls = (fx, b) => [fx.mainJsUrl && new URL(fx.mainJsUrl, origin + b).pathname, fx.manifestUrl].filter(Boolean);

  async function offlineReload(page, expectMarker, label, urls) {
    phase = 'offline';
    await ctx.setOffline(true);
    try {
      const resp = await page.reload({ waitUntil: 'load', timeout: 20000 });
      const fromSw = !!(resp && resp.fromServiceWorker());
      const s = await waitFor(`${label}: boot offline`, async () => { const x = await snap(page); return x && x.hasGa && x.canvas ? x : null; }, 20000);
      check(`${label}: navigation answered by service worker`, fromSw);
      check(`${label}: game boots offline with marker ${expectMarker}`, s.marker === expectMarker && s.controlled, { marker: s.marker, controlled: s.controlled });
      const assets = await page.evaluate(async urls => Promise.all(urls.map(async u => { try { const r = await fetch(u); await r.arrayBuffer(); return r.status; } catch { return 'fail'; } })), urls);
      check(`${label}: cached assets fetchable offline`, assets.every(x => x === 200), assets);
    } finally {
      await ctx.setOffline(false);
      phase = 'online';
    }
  }

  let sentinel = null;

  async function lifecycle() {
    let meta = await api('GET', '/__pwa_fixture__/meta');
    const fb = meta.bases && meta.bases[base];
    must('fixture metadata has A and B for base', fb && fb.A && fb.B && fb.A.version !== fb.B.version, fb && { A: fb.A && fb.A.version, B: fb.B && fb.B.version });
    result.build = { origin, synthetic: meta.synthetic, buildDir: meta.buildDir, A: { version: fb.A.version, files: fb.A.precacheCount }, B: { version: fb.B.version, files: fb.B.precacheCount } };
    await select(base, 'A');

    const page = await ctx.newPage();
    watch(page, 'app');
    await page.goto(origin + base, { waitUntil: 'load', timeout: 20000 });
    const first = await settled(page, fb.A, base, 'A');
    check('A: document carries synthetic marker A', first.s.marker === 'A', first.s.marker);
    check('A: worker version A cache exists', first.info.pick === fb.A.cacheName || !fb.A.cacheName, { pick: first.info.pick, expected: fb.A.cacheName });

    // Isolated sentinel + best-score baseline; token proves no reload happens later.
    sentinel = 'sentinel-' + Math.random().toString(36).slice(2);
    const base0 = await page.evaluate(([k, v, sk]) => { localStorage.setItem(k, v); window.__gaSmokeToken = v; return localStorage.getItem(sk); }, [SENTINEL_KEY, sentinel, SCORE_KEY]);

    await offlineReload(page, 'A', 'A offline', assetUrls(fb.A, base));
    await page.evaluate(([k, v]) => { window.__gaSmokeToken = v; }, [SENTINEL_KEY, sentinel]);

    // Real placement through game.tryPlace so the update is blocked.
    const placed = await page.evaluate(() => {
      const g = window.__ga.game;
      for (const [x, y, id] of g.currentMap.stressTurrets) { const r = g.tryPlace(0, id, x, y); if (r.ok) return { x, y, id, towers: g.towers.length }; }
      return null;
    });
    must('planning progress created with game.tryPlace (no stress/gameover)', placed && placed.towers > 0, placed);
    const before = await snap(page);
    const loadsBefore = loads.get(page);

    // Keep object identity of the live controller/active worker to prove no activation happens while blocked.
    await page.evaluate(async b => {
      const r = await navigator.serviceWorker.getRegistration(location.origin + b);
      window.__gaSmokeCtl = navigator.serviceWorker.controller; window.__gaSmokeActive = r && r.active;
    }, base);
    await select(base, 'B');
    await page.evaluate(() => { window.__ga.pwa.update(); }); // real controller; not awaited: it resolves after the check
    const ready = await waitFor('update reaches ready', async () => {
      const x = await snap(page);
      const i = await swInfo(page, base);
      return x && x.updateState === 'ready' && i && i.waiting && i.waiting.state === 'installed' ? x : null;
    }, 20000);
    const bInfo = await cacheInfo(page, fb.B, base);
    check('B installed in waiting state (cache complete) while A still serves', cacheComplete(bInfo, fb.B, base) && ready.marker === 'A', { pick: bInfo.pick });
    check('A cache still present before activation', (await cacheInfo(page, fb.A, base)).pick !== null);

    await page.evaluate(() => window.__ga.pwa.update());
    await sleep(800);
    const blocked = await snap(page);
    check('second update blocked by progress (message, still ready)', blocked && BLOCKED_RE.test(blocked.message || '') && blocked.updateState === 'ready', blocked && { m: blocked.message, s: blocked.updateState });
    check('blocked update: no reload, marker A, same token', loads.get(page) === loadsBefore && blocked.marker === 'A' && blocked.token === sentinel, { loads: loads.get(page), token: blocked && blocked.token });
    const held = await page.evaluate(async b => {
      const r = await navigator.serviceWorker.getRegistration(location.origin + b);
      const c = navigator.serviceWorker.controller;
      return {
        waitingState: r && r.waiting ? r.waiting.state : null, activeState: r && r.active ? r.active.state : null,
        sameController: !!c && c === window.__gaSmokeCtl, sameActive: !!(r && r.active) && r.active === window.__gaSmokeActive,
      };
    }, base);
    check('blocked update: B still waiting (installed), A active+controller unchanged by identity',
      held.waitingState === 'installed' && held.activeState === 'activated' && held.sameController && held.sameActive, held);
    check('blocked update: game progress unchanged', blocked.towers === before.towers && blocked.spent === before.spent && JSON.stringify(blocked.credits) === JSON.stringify(before.credits));

    // Reset through the real game/input objects, then the real update path.
    await page.evaluate(() => { window.__ga.input.cancelAll(); window.__ga.game.reset(); });
    const fresh = await snap(page);
    check('game reset leaves fresh planning (0 towers)', fresh.towers === 0, fresh.towers);
    await page.evaluate(() => { window.__ga.pwa.update(); });
    await waitFor('exactly one reload onto B', () => loads.get(page) === loadsBefore + 1, 20000);
    const b1 = await waitFor('B boots', async () => { const x = await snap(page); return x && x.hasGa && x.canvas && x.registered && x.controlled ? x : null; }, 20000);
    const bReg = await waitFor('B worker activated and controlling', async () => { const i = await swInfo(page, base); return activatedOk(i, base) ? i : null; }, 15000);
    check('B: ga-sw.js activated and controls page', activatedOk(bReg, base), bReg);
    await sleep(1500);
    check('update caused exactly one reload', loads.get(page) === loadsBefore + 1, loads.get(page) - loadsBefore);
    check('B: marker B, game booted, new document (token gone)', b1.marker === 'B' && b1.token === null, { marker: b1.marker, token: b1.token });
    const bAfter = await waitFor('B cache complete', async () => { const i = await cacheInfo(page, fb.B, base); return cacheComplete(i, fb.B, base) ? i : null; }, 10000);
    check('B: cache named for version B complete', bAfter.pick === fb.B.cacheName || !fb.B.cacheName, { pick: bAfter.pick, expected: fb.B.cacheName });
    result.build.cachesAfterUpdate = bAfter.names;

    await offlineReload(page, 'B', 'B offline', assetUrls(fb.B, base));

    const end = await page.evaluate(([k, sk]) => ({ sentinel: localStorage.getItem(k), score: localStorage.getItem(sk) }), [SENTINEL_KEY, SCORE_KEY]);
    check('localStorage sentinel survived update', end.sentinel === sentinel);
    check('best-score key unchanged by smoke', end.score === base0, { before: base0 === null ? null : 'present', after: end.score === null ? null : 'present' });
  }

  async function siblings() {
    const meta = await api('GET', '/__pwa_fixture__/meta');
    const t = meta.bases && meta.bases['/tabletop/'], d = meta.bases && meta.bases['/TTDefense/'];
    must('fixture metadata has both sibling bases', t && t.A && d && d.A);
    result.build = { origin, synthetic: meta.synthetic, buildDir: meta.buildDir, tabletopA: t.A.version, ttdefenseA: d.A.version };
    await select('/tabletop/', 'A'); await select('/TTDefense/', 'A');

    const p1 = await ctx.newPage(); watch(p1, 'tabletop');
    await p1.goto(origin + '/tabletop/', { waitUntil: 'load', timeout: 20000 });
    const a = await settled(p1, t.A, '/tabletop/', 'tabletop A');
    const extra = 'ga-smoke-' + Math.random().toString(36).slice(2);
    const seeded = await p1.evaluate(async u => {
      const names = ['ga-smoke-unrelated-' + u, 'ga-app-0123456789abcdef']; // unrelated + pre-namespace legacy shape
      for (const n of names) await (await caches.open(n)).put('/' + n, new Response('x'));
      return names;
    }, extra);
    const snapshot1 = await p1.evaluate(() => caches.keys());
    await p1.close(); // no open first client while the second worker activates

    const p2 = await ctx.newPage(); watch(p2, 'ttdefense');
    await p2.goto(origin + '/TTDefense/', { waitUntil: 'load', timeout: 20000 });
    const b = await settled(p2, d.A, '/TTDefense/', 'TTDefense A');
    const after = await cacheInfo(p2, t.A, '/tabletop/');
    check('tabletop cache survived TTDefense activation', after.pick !== null && cacheComplete(after, t.A, '/tabletop/'), { pick: after.pick, names: after.names });
    check('every pre-existing cache name survived', snapshot1.every(n => after.names.includes(n)), { before: snapshot1, after: after.names });
    check('unrelated and legacy-shaped caches untouched', seeded.every(n => after.names.includes(n)), seeded);
    check('both apps have own distinct cache', a.info.pick && b.info.pick && a.info.pick !== b.info.pick, { tabletop: a.info.pick, ttdefense: b.info.pick });
    const scopes = await p2.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).map(r => r.scope));
    check('root scope never registered in this context', !scopes.includes(origin + '/'), scopes);
    await p2.close();

    const p3 = await ctx.newPage(); watch(p3, 'tabletop-reopen');
    await ctx.setOffline(true); phase = 'offline';
    try {
      const resp = await p3.goto(origin + '/tabletop/', { waitUntil: 'load', timeout: 20000 });
      const s = await waitFor('tabletop boots offline', async () => { const x = await snap(p3); return x && x.hasGa && x.canvas ? x : null; }, 20000);
      check('tabletop offline reopen: navigation from service worker', !!(resp && resp.fromServiceWorker()));
      check('tabletop offline reopen: game boots with marker A', s.marker === 'A' && s.controlled, { marker: s.marker, controlled: s.controlled });
    } finally { await ctx.setOffline(false); phase = 'online'; }
  }

  // Detailed tower/ledger/wallet state (no reload-sensitive references) for before/after equality.
  const progress = page => page.evaluate(() => {
    const g = window.__ga.game;
    return JSON.stringify({
      towers: g.towers.map(t => [t.id, t.owner, t.x, t.y, t.tier, t.invested]),
      spent: g.ledger.spent, credits: g.credits.slice(), ledger: g.ledger,
    });
  });

  // Identity probe for the page's current controller / registration.active versus the objects captured under `tag`.
  const identity = (page, b, tag) => page.evaluate(async ([b, tag]) => {
    const r = await navigator.serviceWorker.getRegistration(location.origin + b);
    const c = navigator.serviceWorker.controller;
    return {
      controllerChanged: !!c && c !== window['__gaSmokeCtl' + tag], activeChanged: !!(r && r.active) && r.active !== window['__gaSmokeActive' + tag],
      expectedB: !!c && c === window.__gaSmokeWaitingB && !!r && r.active === c,
      controllerState: c ? c.state : null, controllerUrl: c ? c.scriptURL : null, waiting: r && r.waiting ? r.waiting.state : null,
    };
  }, [b, tag]);

  const captureIdentity = (page, b, tag) => page.evaluate(async ([b, tag]) => {
    const r = await navigator.serviceWorker.getRegistration(location.origin + b);
    window['__gaSmokeCtl' + tag] = navigator.serviceWorker.controller; window['__gaSmokeActive' + tag] = r && r.active;
  }, [b, tag]);

  async function multitab() {
    const meta = await api('GET', '/__pwa_fixture__/meta');
    const fb = meta.bases && meta.bases[base];
    must('fixture metadata has A and B for base', fb && fb.A && fb.B && fb.A.version !== fb.B.version, fb && { A: fb.A && fb.A.version, B: fb.B && fb.B.version });
    must('fixtures carry distinct per-revision probe assets (A has A probe, B has B probe)',
      fb.A.probeUrl && fb.B.probeUrl && fb.A.probeUrl !== fb.B.probeUrl && fb.A.probeBody && fb.B.probeBody && fb.A.probeBody !== fb.B.probeBody,
      { A: fb.A.probeUrl, B: fb.B.probeUrl });
    result.build = { origin, synthetic: meta.synthetic, buildDir: meta.buildDir, A: { version: fb.A.version, files: fb.A.precacheCount, probe: fb.A.probeUrl }, B: { version: fb.B.version, files: fb.B.precacheCount, probe: fb.B.probeUrl } };
    await select(base, 'A');

    const p1 = await ctx.newPage(); watch(p1, 'tab1');
    await p1.goto(origin + base, { waitUntil: 'load', timeout: 20000 });
    const a1 = await settled(p1, fb.A, base, 'tab1 A');
    const p2 = await ctx.newPage(); watch(p2, 'tab2');
    await p2.goto(origin + base, { waitUntil: 'load', timeout: 20000 });
    const a2 = await settled(p2, fb.A, base, 'tab2 A');
    check('both tabs carry synthetic marker A', a1.s.marker === 'A' && a2.s.marker === 'A', { tab1: a1.s.marker, tab2: a2.s.marker });

    sentinel = 'sentinel-' + Math.random().toString(36).slice(2);
    const base0 = await p1.evaluate(([k, v, sk]) => { localStorage.setItem(k, v); window.__gaSmokeToken = v; return localStorage.getItem(sk); }, [SENTINEL_KEY, sentinel, SCORE_KEY]);
    const placed = await p1.evaluate(() => {
      const g = window.__ga.game;
      for (const [x, y, id] of g.currentMap.stressTurrets) { const r = g.tryPlace(0, id, x, y); if (r.ok) return { x, y, id, towers: g.towers.length }; }
      return null;
    });
    must('tab 1 planning progress created with game.tryPlace', placed && placed.towers > 0, placed);
    const before = await snap(p1), beforeDetail = await progress(p1);
    const loads1 = loads.get(p1), loads2 = loads.get(p2);
    const navs1 = navigations.get(p1), navs2 = navigations.get(p2);
    await captureIdentity(p1, base, 'A');
    const t2 = await snap(p2);
    check('tab 2 stays fresh (0 towers, no token)', t2.towers === 0 && t2.token === null, { towers: t2.towers, token: t2.token });
    await p2.evaluate(() => { window.__gaSmokeToken = 'tab2-before-update'; });

    // Tab 2: real update flow. First call installs B to waiting; second call activates and reloads tab 2 once.
    await select(base, 'B');
    await p2.evaluate(() => { window.__ga.pwa.update(); });
    await waitFor('tab 2 update reaches ready (B waiting)', async () => {
      const x = await snap(p2), i = await swInfo(p2, base);
      return x && x.updateState === 'ready' && i && i.waiting && i.waiting.state === 'installed' ? x : null;
    }, 20000);
    check('tab 2 first update installed B waiting; tab 2 not reloaded', loads.get(p2) === loads2, loads.get(p2) - loads2);
    must('tab 1 captured the actual waiting B worker', await p1.evaluate(async b => {
      const r = await navigator.serviceWorker.getRegistration(location.origin + b);
      window.__gaSmokeWaitingB = r && r.waiting;
      return !!window.__gaSmokeWaitingB && window.__gaSmokeWaitingB.state === 'installed';
    }, base));
    await p2.evaluate(() => { window.__ga.pwa.update(); });
    await waitFor('tab 2 reload onto B', () => loads.get(p2) === loads2 + 1, 20000);
    const b2 = await waitFor('tab 2 B boots', async () => { const x = await snap(p2); return x && x.hasGa && x.canvas && x.registered && x.controlled ? x : null; }, 20000);

    // Tab 1: B activated under it. New controller OBJECT (scriptURL is identical for A and B, so identity is the evidence).
    const id1 = await waitFor('tab 1 controller replaced by activated B worker', async () => {
      const i = await identity(p1, base, 'A');
      return i && i.controllerChanged && i.activeChanged && i.expectedB && i.waiting === null && i.controllerState === 'activated' ? i : null;
    }, 20000);
    const ready1 = await waitFor('tab 1 PwaController ready + blocked', async () => {
      const x = await snap(p1);
      return x && x.updateState === 'ready' && BLOCKED_RE.test(x.message || '') ? x : null;
    }, 15000);
    await sleep(1500);
    check('tab 2: exactly one reload, marker B, new document', loads.get(p2) === loads2 + 1 && b2.marker === 'B' && b2.token === null, { reloads: loads.get(p2) - loads2, marker: b2.marker, token: b2.token });
    check('tab 1: controller and active worker are the saved B worker, activated with none waiting', id1.controllerChanged && id1.activeChanged && id1.expectedB && id1.waiting === null && id1.controllerState === 'activated', id1);
    const after1 = await snap(p1);
    check('tab 1: did not reload, marker still A, same token', loads.get(p1) === loads1 && after1.marker === 'A' && after1.token === sentinel, { reloads: loads.get(p1) - loads1, marker: after1.marker, token: after1.token });
    check('tab 1: tower/ledger/wallet state unchanged', (await progress(p1)) === beforeDetail && after1.towers === before.towers, { towers: after1.towers, spent: after1.spent });
    check('tab 1: PwaController offers ready and is blocked by progress', ready1.updateState === 'ready' && BLOCKED_RE.test(ready1.message || ''), { s: ready1.updateState, m: ready1.message });

    // Caches: A kept (two windows were open at activation) and B complete.
    const cA = await cacheInfo(p1, fb.A, base), cB = await cacheInfo(p1, fb.B, base);
    must('A cache still complete', cacheComplete(cA, fb.A, base) && cA.pick !== null, { pick: cA.pick });
    must('B cache complete', cacheComplete(cB, fb.B, base) && cB.pick !== null, { pick: cB.pick });
    check('A cache holds A probe; B cache lacks it and holds B probe',
      cA.paths.includes(fb.A.probeUrl) && !cB.paths.includes(fb.A.probeUrl) && cB.paths.includes(fb.B.probeUrl) && !cA.paths.includes(fb.B.probeUrl),
      { a: cA.paths.filter(x => /pwa-smoke-/.test(x)), b: cB.paths.filter(x => /pwa-smoke-/.test(x)) });
    const serverProbe = await ctx.request.get(origin + fb.A.probeUrl);
    await serverProbe.body();
    must('B-selected HTTP server cannot serve the A-only probe', serverProbe.status() === 404, serverProbe.status());
    await captureIdentity(p1, base, 'B'); // new controller, for the blocked-update identity check below

    // Tab 1 update while progress exists: blocked, no reload, nothing replaced.
    await p1.evaluate(() => { window.__ga.pwa.update(); });
    await sleep(800);
    const blocked = await snap(p1), held = await identity(p1, base, 'B');
    check('tab 1 update blocked: message, still ready, no reload, marker A, same token',
      BLOCKED_RE.test(blocked.message || '') && blocked.updateState === 'ready' && loads.get(p1) === loads1 && blocked.marker === 'A' && blocked.token === sentinel,
      { m: blocked.message, s: blocked.updateState, reloads: loads.get(p1) - loads1 });
    check('tab 1 update blocked: controller unchanged, progress intact', !held.controllerChanged && (await progress(p1)) === beforeDetail, held);
    check('tab 1 has zero navigations; tab 2 has exactly one', navigations.get(p1) === navs1 && navigations.get(p2) === navs2 + 1,
      { tab1: navigations.get(p1) - navs1, tab2: navigations.get(p2) - navs2 });

    // Offline: tab 1 (still A document) fetches an A-only asset through the NEW worker's older-cache fallback.
    phase = 'offline';
    await ctx.setOffline(true);
    try {
      const aUrl = origin + fb.A.probeUrl, bUrl = origin + fb.B.probeUrl;
      const fetchProbe = async u => {
        const [resp, got] = await Promise.all([
          p1.waitForResponse(r => r.url() === u, { timeout: 10000 }),
          p1.evaluate(async u => { try { const r = await fetch(u, { cache: 'no-store' }); return { status: r.status, text: await r.text() }; } catch (e) { return { status: 'fail', text: String(e) }; } }, u),
        ]);
        return { got, fromSw: resp.fromServiceWorker() };
      };
      const pa = await fetchProbe(aUrl);
      check('offline: A-only probe served with exact A bytes via the new worker', pa.got.status === 200 && pa.got.text === fb.A.probeBody && pa.fromSw, { status: pa.got.status, fromServiceWorker: pa.fromSw, bytesMatch: pa.got.text === fb.A.probeBody });
      const pb = await fetchProbe(bUrl);
      check('offline: B probe served with exact B bytes from the B cache', pb.got.status === 200 && pb.got.text === fb.B.probeBody && pb.fromSw, { status: pb.got.status, fromServiceWorker: pb.fromSw });
    } finally {
      await ctx.setOffline(false);
      phase = 'online';
    }

    // Reset + explicit update reloads tab 1 to B exactly once while STILL OFFLINE.
    phase = 'offline';
    await ctx.setOffline(true);
    try {
    await p1.evaluate(() => { window.__ga.input.cancelAll(); window.__ga.game.reset(); });
    const resetState = await snap(p1);
    check('tab 1 reset leaves fresh planning in the same A document with update ready', resetState.towers === 0 && resetState.marker === 'A' && resetState.token === sentinel && resetState.updateState === 'ready', resetState);
    must('tab 1 reset itself caused no navigation', loads.get(p1) === loads1 && navigations.get(p1) === navs1);
    const [updateResponse] = await Promise.all([
      p1.waitForResponse(r => r.request().isNavigationRequest() && r.request().frame() === p1.mainFrame(), { timeout: 15000 }),
      p1.evaluate(() => { window.__ga.pwa.update(); }),
    ]);
    check('tab 1 explicit update navigation served offline by the worker', updateResponse.fromServiceWorker() && updateResponse.status() === 200,
      { fromServiceWorker: updateResponse.fromServiceWorker(), status: updateResponse.status() });
    await waitFor('tab 1 reload onto B', () => loads.get(p1) === loads1 + 1, 20000);
    const b1 = await waitFor('tab 1 B boots', async () => { const x = await snap(p1); return x && x.hasGa && x.canvas && x.registered && x.controlled ? x : null; }, 20000);
    const reg = await waitFor('tab 1 B worker activated and controlling', async () => { const i = await swInfo(p1, base); return activatedOk(i, base) ? i : null; }, 15000);
    await sleep(1500);
    check('tab 1: update caused exactly one reload, marker B, new document', loads.get(p1) === loads1 + 1 && b1.marker === 'B' && b1.token === null, { reloads: loads.get(p1) - loads1, marker: b1.marker, token: b1.token });
    check('tab 1: B ga-sw.js activated and controls page', activatedOk(reg, base), reg);
    check('explicit update navigated tab 1 once; tab 2 did not reload again', navigations.get(p1) === navs1 + 1 && navigations.get(p2) === navs2 + 1 && loads.get(p2) === loads2 + 1,
      { tab1: navigations.get(p1) - navs1, tab2: navigations.get(p2) - navs2 });
    check('tab 2 still runs B after tab 1 updates', (await snap(p2)).marker === 'B');
    } finally { await ctx.setOffline(false); phase = 'online'; }
    const end = await p1.evaluate(([k, sk]) => ({ sentinel: localStorage.getItem(k), score: localStorage.getItem(sk) }), [SENTINEL_KEY, SCORE_KEY]);
    check('localStorage sentinel survived update', end.sentinel === sentinel);
    check('best-score key unchanged by smoke', end.score === base0, { before: base0 === null ? null : 'present', after: end.score === null ? null : 'present' });
  }

  // Close ONLY a context this helper created. The offline reset is fire-and-forget so a hang there cannot block close();
  // close errors/timeouts are failures (bounded by CLEANUP_MS).
  let cleanupDeadline = 0;
  async function closeOwn(c, label) {
    c.setOffline(false).catch(() => {}); // observed; independent of close
    let t;
    const remaining = Math.max(0, cleanupDeadline - Date.now());
    const err = await Promise.race([
      c.close().then(() => null, e => `${label} close error: ${String(e && e.message || e).slice(0, 200)}`),
      new Promise(r => { t = setTimeout(() => r(`${label} close exceeded the shared cleanup budget`), remaining); }),
    ]);
    clearTimeout(t);
    if (err) fail(err);
  }

  let timer, creating = null;
  const deadline = new Promise(res => { timer = setTimeout(() => { aborted.v = true; res('timeout'); }, DEADLINE_MS); });
  const work = (async () => {
    const browser = existingPage.context().browser();
    if (!browser) throw new Error('existingPage context has no browser handle (persistent context?)');
    result.browserVersion = browser.version();
    creating = browser.newContext({ serviceWorkers: 'allow', viewport: { width: 1280, height: 720 } });
    const c = await creating;
    if (aborted.v) return 'late'; // deadline already won: no newPage/server calls; the main flow closes c
    ctx = c;
    if (mode === 'lifecycle') await lifecycle(); else if (mode === 'multitab') await multitab(); else await siblings();
    return 'done';
  })().catch(e => { fail(`aborted: ${String(e && e.message || e).slice(0, 300)}`); return 'error'; });

  const outcome = await Promise.race([work, deadline]);
  clearTimeout(timer);
  if (outcome === 'timeout') fail(`deadline of ${DEADLINE_MS / 1000}s exceeded`);
  aborted.v = true;
  cleanupDeadline = Date.now() + CLEANUP_MS;
  if (ctx) await closeOwn(ctx, 'context');
  else if (creating) {
    let t;
    const late = await Promise.race([creating.then(c => c, () => null), new Promise(r => { t = setTimeout(() => r(undefined), CLEANUP_MS); })]);
    clearTimeout(t);
    if (late) await closeOwn(late, 'late context');
    else if (late === undefined) {
      result.pending = 'browser.newContext still pending after cleanup budget; late-close handler registered';
      fail(result.pending);
      creating.then(c => c.close(), () => {}).catch(() => {}); // observed; closes the context if it ever resolves
    }
  }

  if (pageErrors.length) fail(`${pageErrors.length} uncaught page error(s)`);
  if (result.network.unexpected.length) fail(`${result.network.unexpected.length} unexpected online network failure(s)`);
  if (result.console.online) fail(`${result.console.online} console error(s) while online`);
  if (result.console.offline) result.warnings.push(`${result.console.offline} console error(s) while offline (disclosed in console.samples, not failures)`);
  result.ok = outcome === 'done' && result.failures.length === 0 && result.checks.length > 0;
  result.durationMs = Date.now() - t0;
  return result;
}
