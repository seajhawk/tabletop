/*
 * Galactic Alliance - bounded SUSTAINED-load browser benchmark (single self-contained async function expression).
 *
 * Run it (parent/coordinator only) with Playwright MCP `browser_run_code_unsafe` { filename: "scripts/benchmark-browser.js" },
 * or load it in Node: `const fn = vm.runInNewContext('(' + source + ')', { URL, setTimeout, clearTimeout })`.
 * Host globals required: URL, setTimeout, clearTimeout (Date/Promise/Math/JSON are language built-ins). No imports/exports.
 *
 *   await benchmark(existingPage, options = {})
 *
 * `existingPage` is used ONLY to reach `page.context().browser()`; it is never navigated, closed or modified.
 * The harness opens its OWN fresh browser context (default 1920x1080, DPR 1, configurable; service workers blocked, non-loopback requests
 * aborted), always closes only that context (success, failure, timeout), and restores every page-side patch it makes
 * (game.step, renderer.update, Math.random, rAF loop) in a finally block.
 * Build to measure: production preview recommended (`npm --prefix proto-web run build` + `vite preview` => :4173).
 *
 * Options (ALL validated before any context is created; unknown keys rejected):
 *   url          string  http only, host localhost | 127.0.0.1 | [::1], subpath ok, no credentials/query/hash.
 *                        default 'http://127.0.0.1:4173/'
 *   mapIds       string[] 1..9 unique map ids from shared-data/maps.json. default
 *                        ['orbital-crossing','pacific-fleet','ironhold-keep'] (unknown ids -> invalid result)
 *   warmupMs     int 0..2000    default 1000 (warmup is also sustained-load: refill active)
 *   sampleMs     int 1000..10000 default 4000
 *   targetEnemies int 150..500  default 150; population held EXACTLY at this value after every simulation step
 *   seed         uint32  seeds Math.random inside the fresh context only (default 12345)
 *   timeoutMs    int 1000..45000 default 45000 (workload timeout; starts BEFORE context creation and also races it)
 *   viewport     {width:int 320..3840, height:int 480..2160} default {1920,1080}  (e.g. phone: {412,915} with DPR 2)
 *   deviceScaleFactor finite number 1..3 default 1
 *   Time ceiling: <= timeoutMs (45 s) workload + <= 5 s separate cleanup (late-context wait + context close share that 5 s budget).
 *   A close that fails/times out is reported (result.failures, or appended to the thrown error); never silently ignored.
 *   Constraint: mapIds.length * (warmupMs + sampleMs) <= 40000.
 *
 * Per map: game.setMap(i); game.setupStress() (canonical 20 towers + canonical stress wave, enemy def resolved from
 * game.stressWave.groups); lives set to a large finite fixture value; speed 1, autoWave off, unpaused. game.step is wrapped:
 *   pre-step  ensure population == target (replenish via game.spawnEnemy, canonical def, alternating canonical spawn ports)
 *   core      run the ORIGINAL step (timed alone = core simulation CPU)
 *   post      observe count after combat/compaction, replenish again (timed separately), assert count == target exactly.
 * renderer.update is wrapped only to time its CPU preparation cost. Enemy HP/motion/damage are untouched.
 * DEPENDS ON debug API: window.__ga.{game,renderer,input} and the TypeScript-private (callable in JS) game.spawnEnemy.
 * Missing internals => scenario marked invalid and NOT measured. Enemies are never deleted; if combat ever pushes the count
 * above target (e.g. splitting) the run is marked invalid.
 *
 * Result: { kind, valid:boolean, failures:string[], warnings:string[], timestamp, config, environment, build, disclosures,
 *   scenarios:[{ id, valid, problems, wallMs, simSeconds, simToWallRatio, steps, raf{callbacks,intervals{median,p95,p99,max}},
 *   coreStepCpu, refillCpu, rendererUpdateCpu, population{initial/warmup/sample replacements, preStep/postCombat/postRefill min/max},
 *   scores{before,after,unchanged}, ... }], pageErrors, consoleErrors, elapsedMs }.
 * `valid:false` = measurement unreliable (reasons in `failures`). Method failures (bad options, navigation/eval errors,
 * timeout) REJECT with an Error whose `.kind` is 'invalid-options' | 'timeout' | 'method-failure'. No pass/fail FPS threshold.
 *
 * Limits/disclosure: CPU timings use performance.now() (resolution + per-call overhead reported in environment.timer) and
 * exclude GPU, composition and most Pixi draw work. NOT a hardware touch, thermal, GPU-time or target-device benchmark.
 */
async function galacticBenchmarkBrowser(existingPage, options) {
  const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '[::1]'];
  const DEFAULT_MAPS = ['orbital-crossing', 'pacific-fleet', 'ironhold-keep'];
  const ALLOWED_OPTIONS = ['url', 'mapIds', 'warmupMs', 'sampleMs', 'targetEnemies', 'seed', 'timeoutMs', 'viewport', 'deviceScaleFactor'];
  const CLEANUP_MS = 5000;
  const MAX_TOTAL_MS = 40000;
  const FIXTURE_LIVES = 1000000000;
  const EXPECTED_TOWERS = 20;
  const SCORE_KEY = 'galactic-alliance:best-scores:v1';

  const fail = (kind, message, cause) => {
    const e = new Error(message);
    e.name = 'BenchmarkError';
    e.kind = kind;
    if (cause !== undefined) e.cause = cause;
    return e;
  };
  const optionError = message => fail('invalid-options', 'invalid options: ' + message);

  // ---------- option validation (no side effects) ----------
  const normalizeUrl = raw => {
    if (typeof raw !== 'string' || raw.length === 0 || raw.length > 200) throw optionError('url must be a non-empty string');
    let u;
    try { u = new URL(raw); } catch (e) { throw optionError('url is not a valid absolute URL'); }
    if (u.protocol !== 'http:') throw optionError('url must use http:');
    if (u.username || u.password) throw optionError('url must not contain credentials');
    if (!LOOPBACK_HOSTS.includes(u.hostname)) throw optionError('url host must be localhost, 127.0.0.1 or [::1]');
    if (u.search || u.hash) throw optionError('url must not contain a query or fragment');
    if (!u.pathname.endsWith('/')) {
      const last = u.pathname.split('/').pop();
      if (last.indexOf('.') >= 0) throw optionError('url must be a directory base (e.g. http://127.0.0.1:4173/ or /TTDefense/)');
      u.pathname += '/';
    }
    return u.href;
  };
  const normalize = opts => {
    if (opts === undefined || opts === null) opts = {};
    if (typeof opts !== 'object' || Array.isArray(opts)) throw optionError('options must be an object');
    for (const k of Object.keys(opts)) if (!ALLOWED_OPTIONS.includes(k)) throw optionError('unknown option "' + k + '"');
    const intOpt = (name, def, min, max) => {
      const v = opts[name] === undefined ? def : opts[name];
      if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) throw optionError(name + ' must be an integer in [' + min + ', ' + max + ']');
      return v;
    };
    const url = normalizeUrl(opts.url === undefined ? 'http://127.0.0.1:4173/' : opts.url);
    const mapIds = opts.mapIds === undefined ? DEFAULT_MAPS.slice() : opts.mapIds;
    if (!Array.isArray(mapIds) || mapIds.length < 1 || mapIds.length > 9) throw optionError('mapIds must be an array of 1..9 map ids');
    for (const id of mapIds) {
      if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,39}$/.test(id)) throw optionError('mapIds entries must be lowercase map id strings');
    }
    if (new Set(mapIds).size !== mapIds.length) throw optionError('mapIds must be unique');
    const warmupMs = intOpt('warmupMs', 1000, 0, 2000);
    const sampleMs = intOpt('sampleMs', 4000, 1000, 10000);
    const targetEnemies = intOpt('targetEnemies', 150, 150, 500);
    const seed = intOpt('seed', 12345, 0, 4294967295);
    const timeoutMs = intOpt('timeoutMs', 45000, 1000, 45000);
    if (mapIds.length * (warmupMs + sampleMs) > MAX_TOTAL_MS) {
      throw optionError('mapIds.length * (warmupMs + sampleMs) must be <= ' + MAX_TOTAL_MS + ' ms');
    }
    const vp = opts.viewport === undefined ? { width: 1920, height: 1080 } : opts.viewport;
    if (!vp || typeof vp !== 'object' || Array.isArray(vp) || Object.keys(vp).some(k => k !== 'width' && k !== 'height')) {
      throw optionError('viewport must be { width, height }');
    }
    if (!Number.isInteger(vp.width) || vp.width < 320 || vp.width > 3840) throw optionError('viewport.width must be an integer in [320, 3840]');
    if (!Number.isInteger(vp.height) || vp.height < 480 || vp.height > 2160) throw optionError('viewport.height must be an integer in [480, 2160]');
    const dsf = opts.deviceScaleFactor === undefined ? 1 : opts.deviceScaleFactor;
    if (typeof dsf !== 'number' || !Number.isFinite(dsf) || dsf < 1 || dsf > 3) throw optionError('deviceScaleFactor must be a finite number in [1, 3]');
    return {
      url, mapIds: mapIds.slice(), warmupMs, sampleMs, targetEnemies, seed, timeoutMs,
      viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: dsf, serviceWorkers: 'block',
      fixtureLives: FIXTURE_LIVES, expectedTowers: EXPECTED_TOWERS, scoreKey: SCORE_KEY,
    };
  };

  const cfg = normalize(options);
  if (!existingPage || typeof existingPage.context !== 'function') throw fail('method-failure', 'existingPage must be a Playwright page');
  const browser = existingPage.context().browser();
  if (!browser || typeof browser.newContext !== 'function') throw fail('method-failure', 'no browser available to create an isolated context');

  // ---------- page-side probes (serialised by page.evaluate: MUST NOT reference outer variables) ----------
  const probeEnvironment = async () => {
    const w = window;
    const out = { errors: [] };
    const note = (what, e) => out.errors.push(what + ': ' + (e && e.message ? e.message : String(e)));
    const ga = w.__ga;
    out.muted = { before: null, after: null, toggled: false };
    try {
      const r = ga.renderer;
      if (typeof r.isMuted === 'function') out.muted.before = !!r.isMuted();
      if (out.muted.before === false && ga.input && ga.input.hooks && typeof ga.input.hooks.button === 'function') {
        ga.input.hooks.button('sfx');
        out.muted.toggled = true;
      }
      if (typeof r.isMuted === 'function') out.muted.after = !!r.isMuted();
    } catch (e) { note('mute', e); }
    out.webgl = { vendor: null, renderer: null, version: null, source: null };
    try {
      const rr = ga.renderer.app && ga.renderer.app.renderer;
      out.rendererType = rr && rr.type !== undefined ? rr.type : null;
      let gl = rr && rr.gl;
      out.webgl.source = gl ? 'pixi' : null;
      if (!gl) { gl = document.createElement('canvas').getContext('webgl2'); out.webgl.source = gl ? 'probe-canvas' : null; }
      if (gl) {
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        out.webgl.vendor = gl.getParameter(ext ? ext.UNMASKED_VENDOR_WEBGL : gl.VENDOR);
        out.webgl.renderer = gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER);
        out.webgl.version = gl.getParameter(gl.VERSION);
      } else out.errors.push('webgl: no context available');
    } catch (e) { note('webgl', e); }
    try {
      const scripts = Array.from(document.scripts || []).filter(s => s.src);
      const main = scripts.find(s => s.type === 'module') || scripts[scripts.length - 1] || null;
      const mainSrc = main ? main.src : null;
      const m = mainSrc ? /^(.*\/)assets\/[^/?#]+$/.exec(mainSrc) : null;
      const base = m ? m[1] : w.location.href.replace(/[?#].*$/, '').replace(/[^/]*$/, '');
      out.build = {
        mainScriptUrl: mainSrc, scriptUrls: scripts.map(s => s.src).slice(0, 10), base,
        devServer: scripts.some(s => /\/src\/main\.[jt]s|@vite\/client/.test(s.src)),
        swUrl: base + 'ga-sw.js', swVersion: null, swVersionError: null,
      };
      let swTimer = null;
      try {
        const res = await Promise.race([
          fetch(out.build.swUrl, { cache: 'no-store' }),
          new Promise((_, rej) => { swTimer = setTimeout(() => rej(new Error('timed out')), 3000); }),
        ]);
        clearTimeout(swTimer);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const hit = /GA_VERSION\s*=\s*'([^']*)'/.exec(await res.text());
        if (hit && hit[1] && hit[1] !== '__GA_VERSION__') out.build.swVersion = hit[1];
        else out.build.swVersionError = 'GA_VERSION not found (dev server or unbuilt worker?)';
      } catch (e) { clearTimeout(swTimer); out.build.swVersionError = 'fetch/parse failed: ' + (e && e.message ? e.message : String(e)); }
    } catch (e) { note('build', e); }
    try {
      let minDelta = Infinity;
      for (let i = 0; i < 200; i++) {
        const a = performance.now();
        let b = a, guard = 0;
        while (b === a && guard++ < 100000) b = performance.now();
        if (b > a && b - a < minDelta) minDelta = b - a;
      }
      const n = 20000, t0 = performance.now();
      for (let i = 0; i < n; i++) { const a = performance.now(); const b = performance.now(); if (b < a) break; }
      out.timer = { resolutionMs: Number.isFinite(minDelta) ? minDelta : null, pairOverheadMs: (performance.now() - t0) / n };
    } catch (e) { note('timer', e); }
    try { out.layout = typeof ga.layout === 'function' ? ga.layout().id : null; } catch (e) { note('layout', e); }
    try {
      out.playerCount = ga.game.playerCount;
      out.difficulty = ga.game.difficulty;
      out.mapIds = ga.game.data.maps.map(m => m.id);
    } catch (e) { note('game', e); }
    out.userAgent = navigator.userAgent;
    out.viewport = { width: w.innerWidth, height: w.innerHeight };
    out.dpr = w.devicePixelRatio;
    out.visibility = document.visibilityState;
    try {
      const cv = ga.renderer.app && (ga.renderer.app.canvas || (ga.renderer.app.renderer && ga.renderer.app.renderer.canvas));
      out.canvas = cv ? { width: cv.width, height: cv.height, clientWidth: cv.clientWidth === undefined ? null : cv.clientWidth, clientHeight: cv.clientHeight === undefined ? null : cv.clientHeight } : null;
    } catch (e) { note('canvas', e); }
    out.hardwareConcurrency = navigator.hardwareConcurrency === undefined ? null : navigator.hardwareConcurrency;
    out.deviceMemoryGiB = navigator.deviceMemory === undefined ? null : navigator.deviceMemory;
    return out;
  };

  const runScenario = async c => {
    const w = window;
    const out = { id: c.mapId, measured: false, problems: [] };
    const problems = out.problems;
    const ga = w.__ga;
    const game = ga && ga.game;
    const renderer = ga && ga.renderer;
    const readScores = () => {
      try { return { ok: true, value: w.localStorage.getItem(c.scoreKey) }; } catch (e) { return { ok: false, value: null, error: String(e && e.name) }; }
    };
    const countActive = a => { let n = 0; if (Array.isArray(a)) for (const x of a) if (x && x.active === true) n++; return n; };
    const visEvents = [];
    let visPhase = 'warmup', visListening = false;
    const onVis = () => { visEvents.push({ phase: visPhase, state: document.visibilityState }); };
    const need = (ok, msg) => { if (!ok) problems.push(msg); return ok; };
    out.visibilityStart = document.visibilityState;
    if (!game || !renderer) { problems.push('window.__ga.game / renderer debug handle missing'); return out; }
    need(typeof game.setMap === 'function', 'game.setMap is not a function');
    need(typeof game.setupStress === 'function', 'game.setupStress is not a function');
    need(typeof game.spawnEnemy === 'function', 'game.spawnEnemy (TS-private runtime method) is not a function');
    need(typeof game.step === 'function', 'game.step is not a function');
    need(typeof renderer.update === 'function', 'renderer.update is not a function');
    need(Array.isArray(game.enemies) && Array.isArray(game.towers), 'game.enemies / game.towers are not arrays');
    need(game.enemyById && typeof game.enemyById.get === 'function', 'game.enemyById lookup missing');
    need(game.data && Array.isArray(game.data.maps), 'game.data.maps missing');
    need(game.stressWave && Array.isArray(game.stressWave.groups) && game.stressWave.groups.length > 0, 'game.stressWave.groups missing');
    if (problems.length) return out;

    const maps = game.data.maps;
    const mapIndex = maps.findIndex(m => m && m.id === c.mapId);
    if (mapIndex < 0) { problems.push('map "' + c.mapId + '" not found (have: ' + maps.map(m => m.id).join(', ') + ')'); return out; }
    const groups = game.stressWave.groups;
    const enemyIds = Array.from(new Set(groups.map(g => g.enemyId)));
    if (enemyIds.length !== 1) { problems.push('stress wave must use exactly one enemy type, found: ' + enemyIds.join(', ')); return out; }
    const def = game.enemyById.get(enemyIds[0]);
    if (!def) { problems.push('stress enemy def "' + enemyIds[0] + '" not found'); return out; }
    const canonicalInitial = groups.reduce((a, g) => a + g.count, 0);
    const target = c.targetEnemies;
    out.stressEnemyId = enemyIds[0];
    out.canonicalInitialEnemies = canonicalInitial;
    out.targetEnemies = target;
    out.fixtureLives = c.fixtureLives;
    out.seed = c.seed;
    if (canonicalInitial > target) { problems.push('canonical stress population ' + canonicalInitial + ' exceeds target ' + target); return out; }

    const scoresBefore = readScores();
    game.setMap(mapIndex);
    const setup = game.setupStress();
    game.lives = c.fixtureLives;
    game.speed = 1;
    game.autoWave = false;
    game.paused = false;
    out.mapName = game.currentMap && game.currentMap.name;
    out.setup = setup;
    out.expectedTowers = c.expectedTowers;
    out.towersAtStart = game.towers.length;
    need(game.mode === 'stress', 'game.mode is not "stress" after setupStress');
    need(game.currentMap && game.currentMap.id === c.mapId, 'currentMap is not ' + c.mapId + ' after setMap');
    need(game.towers.length === c.expectedTowers, 'expected ' + c.expectedTowers + ' towers, found ' + game.towers.length);
    need(game.enemies.length === canonicalInitial, 'expected ' + canonicalInitial + ' initial stress enemies, found ' + game.enemies.length);
    need(game.currentMap && Array.isArray(game.currentMap.spawns) && game.currentMap.spawns.length > 0, 'currentMap.spawns missing');
    need(!game.spawners || game.spawners.length === 0, 'stress spawners still pending after setupStress');
    need(!game.over && !game.paused, 'game over/paused immediately after setupStress');
    if (problems.length) return out;
    out.measured = true;

    const spawns = game.currentMap.spawns;
    let cursor = 0;
    const st = {
      violations: 0, first: [], steps: 0, warmupSteps: 0, sampleSteps: 0, blockedSteps: 0, stepErrors: 0,
      initialReplacements: 0, warmupReplacements: 0, sampleReplacements: 0, preStepReplacements: 0, overTargetSteps: 0,
      preMin: null, preMax: null, postCombatMin: null, postCombatMax: null, postRefillMin: null, postRefillMax: null,
      projMax: 0, minesMax: 0, projCap: 0, minesCap: 0,
    };
    const violate = msg => { st.violations++; if (st.first.length < 8) st.first.push(msg); };
    const refill = () => {
      let n = 0;
      while (game.enemies.length < target) {
        const before = game.enemies.length;
        const sp = spawns[cursor++ % spawns.length];
        game.spawnEnemy(def, sp[0], sp[1]);
        n++;
        if (game.enemies.length !== before + 1) { violate('game.spawnEnemy did not add exactly one enemy (missed replenishment)'); break; }
      }
      return n;
    };
    const lo = (a, v) => (a === null || v < a ? v : a);
    const hi = (a, v) => (a === null || v > a ? v : a);
    const stats = values => {
      const s = values.slice().sort((a, b) => a - b);
      const at = p => (s.length ? s[Math.max(0, Math.ceil(p * s.length) - 1)] : null);
      const total = values.reduce((a, b) => a + b, 0);
      return { count: values.length, totalMs: total, meanMs: values.length ? total / values.length : null, medianMs: at(0.5), p95Ms: at(0.95), p99Ms: at(0.99), maxMs: at(1) };
    };
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

    const hadOwnStep = Object.prototype.hasOwnProperty.call(game, 'step');
    const hadOwnUpdate = Object.prototype.hasOwnProperty.call(renderer, 'update');
    const origStep = game.step;
    const origUpdate = renderer.update;
    const origRandom = Math.random;
    const coreTimes = [], refillTimes = [], updateTimes = [], intervals = [];
    let phase = 'warmup', measure = false, sampling = false, raf = 0, frames = 0, last = null;
    let wallMs = 0, simSeconds = 0, visibilityEnd = null;
    let rs = c.seed >>> 0;
    try {
      if (typeof document.addEventListener === 'function') {
        document.addEventListener('visibilitychange', onVis);
        visListening = true;
      }
      Math.random = () => {
        rs = (rs + 0x6D2B79F5) | 0;
        let t = Math.imul(rs ^ (rs >>> 15), 1 | rs);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      st.initialReplacements = refill();
      game.step = function (...args) {
        if (game.paused || game.over) {
          st.blockedSteps++;
          return origStep.apply(this, args);
        }
        const inSample = measure;
        const a = performance.now();
        const r1 = refill();
        const b = performance.now();
        const pre = game.enemies.length;
        const timeBefore = game.time;
        let ret;
        const c0 = performance.now();
        try { ret = origStep.apply(this, args); } catch (e) { st.stepErrors++; if (st.first.length < 8) st.first.push('step threw: ' + (e && e.message)); throw e; }
        const c1 = performance.now();
        const post = game.enemies.length;
        const r2 = refill();
        const d = performance.now();
        const fin = game.enemies.length;
        st.steps++;
        if (pre !== target) violate('pre-step population ' + pre + ' != target ' + target);
        if (fin !== target) violate('post-refill population ' + fin + ' != target ' + target);
        if (post > target) { st.overTargetSteps++; violate('post-combat population ' + post + ' exceeds target ' + target + ' (cannot trim)'); }
        if (!(game.time > timeBefore)) violate('simulation time did not advance during step');
        if (r1 > 0) st.preStepReplacements += r1;
        if (inSample) {
          st.sampleSteps++;
          st.sampleReplacements += r1 + r2;
          coreTimes.push(c1 - c0);
          refillTimes.push((b - a) + (d - c1));
          st.preMin = lo(st.preMin, pre); st.preMax = hi(st.preMax, pre);
          st.postCombatMin = lo(st.postCombatMin, post); st.postCombatMax = hi(st.postCombatMax, post);
          st.postRefillMin = lo(st.postRefillMin, fin); st.postRefillMax = hi(st.postRefillMax, fin);
          st.projMax = Math.max(st.projMax, countActive(game.projectiles));
          st.minesMax = Math.max(st.minesMax, countActive(game.mines));
          if (Array.isArray(game.projectiles)) st.projCap = Math.max(st.projCap, game.projectiles.length);
          if (Array.isArray(game.mines)) st.minesCap = Math.max(st.minesCap, game.mines.length);
        } else {
          st.warmupSteps++;
          st.warmupReplacements += r1 + r2;
        }
        return ret;
      };
      renderer.update = function (...args) {
        const t0 = performance.now();
        try { return origUpdate.apply(this, args); } finally { if (measure) updateTimes.push(performance.now() - t0); }
      };

      if (c.warmupMs > 0) await sleep(c.warmupMs);

      const onFrame = now => {
        if (!sampling) return;
        if (last !== null) intervals.push(now - last);
        last = now;
        frames++;
        raf = requestAnimationFrame(onFrame);
      };
      phase = 'sample';
      visPhase = 'sample';
      const wall0 = performance.now();
      const sim0 = game.time;
      measure = true;
      sampling = true;
      raf = requestAnimationFrame(onFrame);
      await sleep(c.sampleMs);
      sampling = false;
      measure = false;
      wallMs = performance.now() - wall0;
      simSeconds = game.time - sim0;
      visibilityEnd = document.visibilityState;
    } finally {
      sampling = false;
      measure = false;
      try { cancelAnimationFrame(raf); } catch (e) { /* best effort */ }
      if (hadOwnStep) game.step = origStep; else delete game.step;
      if (hadOwnUpdate) renderer.update = origUpdate; else delete renderer.update;
      Math.random = origRandom;
      if (visListening) { try { document.removeEventListener('visibilitychange', onVis); } catch (e) { /* best effort */ } }
    }

    const scoresAfter = readScores();
    out.phase = phase;
    out.wallMs = wallMs;
    out.simSeconds = simSeconds;
    out.simToWallRatio = wallMs > 0 ? simSeconds / (wallMs / 1000) : null;
    out.steps = { warmup: st.warmupSteps, sample: st.sampleSteps, blocked: st.blockedSteps, errors: st.stepErrors };
    out.raf = { callbacks: frames, intervals: stats(intervals) };
    out.coreStepCpu = stats(coreTimes);
    out.refillCpu = stats(refillTimes);
    out.rendererUpdateCpu = stats(updateTimes);
    out.population = {
      target, initialReplacements: st.initialReplacements, warmupReplacements: st.warmupReplacements,
      sampleReplacements: st.sampleReplacements, preStepReplacements: st.preStepReplacements, overTargetSteps: st.overTargetSteps,
      preStepMin: st.preMin, preStepMax: st.preMax, postCombatMin: st.postCombatMin, postCombatMax: st.postCombatMax,
      postRefillMin: st.postRefillMin, postRefillMax: st.postRefillMax, endEnemies: game.enemies.length,
    };
    out.activeMax = { projectiles: st.projMax, mines: st.minesMax }; // entries with active === true
    out.poolCapacity = { projectiles: st.projCap, mines: st.minesCap }; // pool array length (not active count)
    out.visibilityEvents = visEvents.slice(0, 20);
    out.towersAtEnd = game.towers.length;
    out.endState = { paused: !!game.paused, over: game.over || null, lives: game.lives, mode: game.mode };
    out.muted = typeof renderer.isMuted === 'function' ? !!renderer.isMuted() : null;
    out.visibilityEnd = visibilityEnd;
    const scoresReadable = scoresBefore.ok && scoresAfter.ok;
    out.scores = {
      before: scoresBefore.value, after: scoresAfter.value, readable: scoresReadable,
      unchanged: scoresReadable ? scoresBefore.value === scoresAfter.value : null,
    };
    out.violations = { count: st.violations, first: st.first };

    if (st.sampleSteps === 0) problems.push('no simulation steps ran during the sample window');
    if (frames < 2) problems.push('fewer than 2 requestAnimationFrame callbacks during the sample window (' + frames + '; hidden/throttled page?)');
    if (intervals.length === 0) problems.push('no requestAnimationFrame interval samples');
    if (updateTimes.length === 0) problems.push('renderer.update was never called during the sample window');
    if (!visListening) problems.push('cannot observe visibilitychange events (document.addEventListener missing)');
    if (visEvents.some(v => v.state !== 'visible')) problems.push('page became hidden during warmup/sample (' + visEvents.map(v => v.phase + ':' + v.state).join(', ') + ')');
    if (!(simSeconds > 0)) problems.push('simulation time did not advance during the sample');
    if (out.simToWallRatio === null || !Number.isFinite(out.simToWallRatio)) problems.push('simulation/wall ratio is not finite');
    if (out.visibilityStart !== 'visible' || visibilityEnd !== 'visible') problems.push('page was not visible throughout (' + out.visibilityStart + ' -> ' + visibilityEnd + ')');
    if (game.paused || game.over) problems.push('game ended or paused during the run (paused=' + game.paused + ', over=' + game.over + ')');
    if (st.blockedSteps > 0) problems.push('game.step was invoked ' + st.blockedSteps + ' time(s) while paused/over');
    if (st.stepErrors > 0) problems.push(st.stepErrors + ' step error(s) thrown');
    if (game.towers.length !== c.expectedTowers) problems.push('tower count changed: ' + game.towers.length + ' != ' + c.expectedTowers);
    if (game.enemies.length !== target) problems.push('end population ' + game.enemies.length + ' != target ' + target);
    if (!scoresReadable) problems.push('best-score localStorage unreadable (' + (scoresBefore.error || scoresAfter.error) + '); unchanged-ness NOT verified');
    else if (!out.scores.unchanged) problems.push('best-score localStorage entry changed during the run');
    if (st.violations > 0) problems.push(st.violations + ' population/step invariant violation(s): ' + st.first.join('; '));
    return out;
  };

  // ---------- orchestration ----------
  const startedAt = Date.now();
  let context = null;
  let timer = null;
  let result = null;
  let failure = null;
  let closeError = null;
  let creationRef = null;
  let abandoned = false, creationPending = true, cleanupDeadline = 0, lateClose = null;
  // Close with its own bound (never unbounded); resolves to null on success or an Error.
  const closeBounded = (ctx, ms) => new Promise(resolve => {
    let done = false;
    const finish = err => { if (done) return; done = true; clearTimeout(t); resolve(err); };
    const t = setTimeout(() => finish(new Error('context close timed out after ' + ms + ' ms')), ms);
    let p;
    try { p = Promise.resolve(ctx.close()); } catch (e) { p = Promise.reject(e); }
    p.then(() => finish(null), e => finish(e || new Error('context close failed')));
  });
  const pageErrors = [], consoleErrors = [], failedRequests = [], blockedRequests = [];
  try {
    // Workload timeout starts BEFORE context creation and also races it.
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(fail('timeout', 'benchmark exceeded overall timeout of ' + cfg.timeoutMs + ' ms')), cfg.timeoutMs);
    });
    timeout.catch(() => { /* observed by the race below; avoid unhandled rejection */ });
    const creation = Promise.resolve().then(() => browser.newContext({
      viewport: { width: cfg.viewport.width, height: cfg.viewport.height },
      deviceScaleFactor: cfg.deviceScaleFactor,
      serviceWorkers: cfg.serviceWorkers,
    }));
    creation.then(ctx => {
      creationPending = false;
      if (abandoned) lateClose = closeBounded(ctx, Math.max(1, cleanupDeadline - Date.now())); // late context: close only our own
      else context = ctx;
    }, () => { creationPending = false; });
    creationRef = creation;
    await Promise.race([creation, timeout]);
    if (!context) throw fail('method-failure', 'browser context was not created');
    const job = (async () => {
      await context.route('**/*', route => {
        const url = route.request().url();
        let host = '', protocol = '';
        try { const u = new URL(url); host = u.hostname; protocol = u.protocol; } catch (e) { /* treated as external */ }
        if (LOOPBACK_HOSTS.includes(host) || protocol === 'data:' || protocol === 'blob:' || protocol === 'about:') return route.continue();
        if (blockedRequests.length < 20) blockedRequests.push(url.slice(0, 200));
        return route.abort();
      });
      const page = await context.newPage();
      page.on('pageerror', e => { if (pageErrors.length < 20) pageErrors.push(String(e && e.message ? e.message : e).slice(0, 300)); });
      page.on('console', m => { if (m.type() === 'error' && consoleErrors.length < 20) consoleErrors.push(String(m.text()).slice(0, 300)); });
      page.on('requestfailed', r => { if (failedRequests.length < 20) failedRequests.push(String(r.url()).slice(0, 200)); });
      page.on('crash', () => { if (pageErrors.length < 20) pageErrors.push('page crashed'); });
      await page.goto(cfg.url, { waitUntil: 'load', timeout: 15000 });
      await page.waitForFunction(() => !!(window.__ga && window.__ga.game && window.__ga.renderer), null, { timeout: 15000 });
      const environment = await page.evaluate(probeEnvironment);
      let browserVersion = null;
      try { browserVersion = browser.version(); } catch (e) { browserVersion = null; }
      const scenarios = [];
      for (const mapId of cfg.mapIds) {
        scenarios.push(await page.evaluate(runScenario, {
          mapId, warmupMs: cfg.warmupMs, sampleMs: cfg.sampleMs, targetEnemies: cfg.targetEnemies, seed: cfg.seed,
          fixtureLives: cfg.fixtureLives, expectedTowers: cfg.expectedTowers, scoreKey: cfg.scoreKey,
        }));
      }
      return { environment, browserVersion, scenarios };
    })();
    job.catch(() => { /* swallow post-timeout rejection */ });
    const raw = await Promise.race([job, timeout]);

    const failures = [], warnings = [];
    const env = raw.environment || {};
    if (env.viewport && (env.viewport.width !== cfg.viewport.width || env.viewport.height !== cfg.viewport.height || env.dpr !== cfg.deviceScaleFactor)) {
      failures.push('viewport/DPR is not ' + cfg.viewport.width + 'x' + cfg.viewport.height + ' @' + cfg.deviceScaleFactor + ': ' + JSON.stringify({ viewport: env.viewport, dpr: env.dpr }));
    }
    if (!env.muted || env.muted.after !== true) warnings.push('sound could not be confirmed muted (' + JSON.stringify(env.muted) + ')');
    if (env.build && env.build.devServer) warnings.push('page looks like a dev server, not a production build');
    if (env.build && env.build.swVersion === null) warnings.push('service-worker build version unavailable: ' + (env.build.swVersionError || 'unknown'));
    if (env.webgl && /swiftshader|llvmpipe|software/i.test(String(env.webgl.renderer))) warnings.push('WebGL renderer looks software-based');
    if (env.webgl && env.webgl.renderer === null) warnings.push('WebGL vendor/renderer unavailable');
    if (env.errors && env.errors.length) warnings.push('environment probe issues: ' + env.errors.join('; '));
    if (pageErrors.length) failures.push(pageErrors.length + ' page error(s): ' + pageErrors.slice(0, 3).join(' | '));
    if (blockedRequests.length) warnings.push(blockedRequests.length + ' non-loopback request(s) aborted: ' + blockedRequests.slice(0, 3).join(', '));
    if (consoleErrors.length) warnings.push(consoleErrors.length + ' console error message(s)');
    if (failedRequests.length) warnings.push(failedRequests.length + ' failed request(s)');
    const nonFinite = [];
    const scan = (v, path) => {
      if (typeof v === 'number') { if (!Number.isFinite(v)) nonFinite.push(path); } else if (v && typeof v === 'object') {
        for (const k of Object.keys(v)) scan(v[k], path + '.' + k);
      }
    };
    raw.scenarios.forEach(s => {
      scan(s, s.id);
      s.valid = s.measured === true && s.problems.length === 0;
      for (const p of s.problems) failures.push(s.id + ': ' + p);
    });
    if (nonFinite.length) failures.push('non-finite numbers in results: ' + nonFinite.slice(0, 5).join(', '));
    raw.scenarios.forEach(s => { if (nonFinite.some(p => p.indexOf(s.id + '.') === 0)) s.valid = false; });

    result = {
      kind: 'ga-sustained-browser-benchmark', version: 1, valid: false, failures, warnings,
      timestamp: new Date().toISOString(), config: cfg,
      environment: Object.assign({ browserVersion: raw.browserVersion }, env),
      build: env.build || null,
      disclosures: [
        'Debug API dependency: uses window.__ga and the TypeScript-private game.spawnEnemy; not a public contract.',
        'Load is held constant by replenishing to the exact target population after every step; enemy HP/motion/damage are not frozen.',
        'CPU timings use performance.now() (see environment.timer for resolution and per-call overhead); zero-duration values are below timer resolution.',
        'Core step, refill and renderer.update CPU are timed separately; GPU time, composition and most Pixi draw work are NOT measured.',
        'Math.random is seeded in the fresh context only; frame/step timing remains non-deterministic.',
        'Fresh context: service workers blocked, non-loopback requests aborted, sound muted via existing hooks when possible.',
        'Not a hardware multi-touch, thermal, GPU-time, DPI or target-device benchmark. No pass/fail FPS threshold is applied.',
      ],
      scenarios: raw.scenarios, pageErrors, consoleErrors, failedRequests, blockedRequests, elapsedMs: 0,
    };
  } catch (e) {
    failure = e && e.kind ? e : fail('method-failure', 'benchmark method failure: ' + (e && e.message ? e.message : String(e)), e);
  } finally {
    if (timer !== null) clearTimeout(timer);
    // Separate cleanup budget: <= CLEANUP_MS total for waiting on a late context and closing it.
    cleanupDeadline = Date.now() + CLEANUP_MS;
    if (context) {
      closeError = await closeBounded(context, CLEANUP_MS);
    } else if (creationPending && creationRef) {
      abandoned = true;
      let waitTimer = null;
      await Promise.race([creationRef.then(() => null, () => null), new Promise(r => { waitTimer = setTimeout(r, CLEANUP_MS); })]);
      clearTimeout(waitTimer);
      if (lateClose) closeError = await lateClose;
      else if (creationPending) closeError = new Error('context creation still pending after ' + CLEANUP_MS + ' ms; it will be closed if it resolves later');
    }
  }
  if (failure) {
    if (closeError) failure.message += ' (additionally, context close failed: ' + (closeError.message || String(closeError)) + ')';
    throw failure;
  }
  if (closeError) result.failures.push('own browser context failed to close: ' + (closeError.message || String(closeError)));
  result.elapsedMs = Date.now() - startedAt;
  result.valid = result.failures.length === 0 && result.scenarios.length === cfg.mapIds.length;
  return result;
}
