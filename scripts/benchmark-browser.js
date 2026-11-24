/*
 * Galactic Defense - bounded SUSTAINED-load browser benchmark (single self-contained async function expression).
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
 *   profile      'sustained' (default) | 'theater'. 'sustained' = the fixed 150-Swarmer baseline described below (unchanged).
 *                'theater' = OPT-IN variable-workload profile: mixed canonical non-boss enemies, population FLOOR (not exact),
 *                natural splits/overflow kept (cap 3*target), real tower damage allowed, per-window effect + sound-cue evidence.
 *                Theater numbers are NOT comparable to the fixed sustained baseline.
 *   towerTier    0 | 2, default 0 (canonical base-tier towers; nothing changes). 2 is OPT-IN, theater ONLY (tier 2 + sustained is rejected
 *                before any context is created; every other value is rejected). Tier 2 labels the scenario "theater + tier-2 towers":
 *                after setupStress's canonical 20 base-tier towers are validated, and BEFORE any simulation step or mixed-enemy fixture,
 *                all 20 are upgraded twice (40 calls max) through the REAL game.upgradeTower. Each upgrade's exact canonical cost
 *                (tower.def.upgrades[tier].cost) is first granted with game.grant(owner, cost) (credits + ledger.granted), so the net
 *                wallet is unchanged and ledger granted/spent both rise by the total cost; no stat/tier/credit is written directly.
 *                Any setup failure => scenario measured:false with a reason (no silent fallback). Towers are NOT repaired or frozen
 *                afterwards. upgradeTower raises maxHp (130/165), so initial aggregate HP is ~3300 not 2000 (recorded, never hardcoded).
 *                Audit: scenario.towerUpgrade {before/after tierCounts + hp/maxHp, upgrade/grant counts, totalCost/totalGranted, wallet
 *                and ledger before/after}. Tier choice alone proves NOTHING about ability coverage: split children, fireZones and cue
 *                counts remain observed evidence. Tier-2 numbers are NOT comparable to tier-0 theater or sustained.
 *                Reproduce one-map 25 s samples: { profile:'theater', towerTier:2, mapIds:['backyard-lawn'] (or 'ironhold-keep'),
 *                warmupMs:1000, sampleMs:25000, viewport:{width:412,height:915}, deviceScaleFactor:2 }.
 *   bossHealer   boolean, default false (nothing changes). OPT-IN, ONLY with profile:'theater' + towerTier:2 and mapIds drawn from
 *                ['mars-outpost','ironhold-keep'] (canonical ids whose mechanic is mars-storms / medieval-frenzy; any other combination
 *                is rejected before a context is created; the page re-checks currentMap.mechanic). A SEPARATE boss+Healer workload, NOT
 *                comparable to tier-2 theater, tier-0 theater or sustained. After the 20 towers are upgraded and before any step, exactly 2
 *                base-tier Healer stations (one per player, 22 towers) are added by game.grant(owner, cost) + game.tryPlace only, at
 *                deterministically searched legal empty cells near that owner's defenses (game.check is used read-only as the legality
 *                filter; no path/HP/stat/credit is written). Failure => measured:false with a reason, no fallback. The extra 2 healers are a
 *                declared fixture difference (scenario.bossHealerFixture audit). Enemies: the usual five-type replenishment PLUS one unmodified
 *                canonical dreadnought boss, re-spawned only once no live boss remains, counted WITHIN the floor and the 3*target cap; natural
 *                escorts/splits are kept. The harness never forces boss HP/phase/death or damages/repairs/freezes towers (real Healer units
 *                CAN repair/revive towers). Exactly one live canonical boss is audited at step ENTRY and AFTERREFILL (foreign/duplicate boss,
 *                bad id or bossPhase not integer 0..2 => violation; zero right after combat is allowed). scenario.bossHealer carries
 *                per-window boss presence, unique bosses, max bossPhase, boss-phase cue count, active healers/owners/assigned targets,
 *                duplicate-owner/target invariant counts and NET tower HP recovery (per-step before/after, outside the timed core; damage in
 *                the same step can mask healing, so this is NOT total healing; healer repair needs an active healer unit on that step) plus
 *                warmupCoverage and sampleCoverage verdicts (`coverage` aliases sampleCoverage); absent boss phase or healer recovery in the
 *                sample window is reported as coverage missing, never as success from fixture presence or warmup-only evidence.
 *   bossPriority 'first' | 'strong', default 'first' (nothing changes, zero setTowerPriority calls). Valid ONLY with bossHealer:true (any
 *                supplied value without it, or an unsupported value, is rejected before a context is created). 'strong' makes a DISTINCT
 *                workload: after the Healer fixture and before any step, the REQUESTED procedure calls the real game.setTowerPriority(id,'strong')
 *                once on each of the 20 canonical towers (never the Healer stations; no direct priority/stat write). This is NOT universal boss
 *                focus (RadialStasis and KeepKnightStable bypass pickTarget). Audit scenario.bossPriority: requested priority, effective (null until
 *                observed), call/success counts, final priorities, and unchanged wallet/all scalar ledger fields/tier/HP/tower objects+ids+count;
 *                any failure => measured:false. Targeting alone is NOT boss-phase coverage: per-window bossHealer coverage stays authoritative.
 *   (mechanics)  theater on a map whose REAL mechanic is cyber-emp-chain / volcano-lava-geyser / biolab-mutate-regen adds scenario.mechanics:
 *                per-window observed state (empActive / mutationActive steps+entries, pulse chain damageEnemy-call groups, meteors/fire zones/
 *                meteor-impact cues, split children, NET per-enemy HP recovery by id+identity) and sampleCoverage/missing. Observation only; no
 *                new options. Warmup-only never counts; Cyber's damageEnemy wrapper overhead is inside the timed core step.
 *   sampleMs     int 1000..10000 default 4000 (sustained); int 1000..30000 (theater, same default)
 *   targetEnemies int 150..500  default 150; sustained: population held EXACTLY at this value after every step;
 *                theater: minimum floor (replenished before/after every step), natural extras allowed up to 3*target
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
  const TOWER_TIERS = [0, 2];
  const TIER2_MAX_UPGRADES = 40; // 20 towers x 2 upgrades
  const BOSS_HEALER_MAPS = ['mars-outpost', 'ironhold-keep']; // canonical shared-data ids with mechanic mars-storms / medieval-frenzy
  const BOSS_HEALER_MECHANICS = ['mars-storms', 'medieval-frenzy'];
  const BOSS_ENEMY_ID = 'dreadnought';
  const HEALER_TURRET_ID = 'healer';
  const HEALER_COUNT = 2; // one per player
  const HEALER_SEARCH_RADIUS = 4; // cells from the owner's nearest existing defense
  const ALLOWED_OPTIONS = ['url', 'mapIds', 'profile', 'towerTier', 'bossHealer', 'bossPriority', 'warmupMs', 'sampleMs', 'targetEnemies', 'seed', 'timeoutMs', 'viewport', 'deviceScaleFactor'];
  const BOSS_PRIORITIES = ['first', 'strong']; // subset of the game's TargetPriority; 'first' = untouched default
  const PROFILES = ['sustained', 'theater'];
  const SUSTAINED_MAX_SAMPLE_MS = 10000;
  const THEATER_MAX_SAMPLE_MS = 30000;
  const THEATER_ENEMY_IDS = ['scout', 'swarmer', 'cruiser', 'frigate', 'phase']; // canonical non-boss defs, cycled evenly
  const THEATER_OVERFLOW_FACTOR = 3;
  // Every SoundEvent key in proto-web/src/types.ts; anything else is counted under "other" (bounded set).
  const KNOWN_CUES = ['shot-pulse', 'shot-overcharge', 'shot-plasma', 'shot-stasis', 'shot-rail', 'shot-swarm', 'shot-mine',
    'impact-plasma', 'impact-missile', 'impact-mine', 'sonar-ping', 'dust-storm', 'enrage', 'fridge-open', 'centipede-split',
    'mole-flush', 'meteor-warn', 'meteor-impact', 'dragon-breath', 'knight-charge', 'knight-clash', 'roomba-deploy', 'roomba-sweep',
    'kill', 'boss-phase', 'leak', 'ui-place', 'ui-upgrade', 'ui-repair', 'ui-sell', 'ui-error', 'ui-share', 'ui-wave', 'ui-win', 'ui-lose'];
  const CLEANUP_MS = 5000;
  const MAX_TOTAL_MS = 40000;
  const FIXTURE_LIVES = 1000000000;
  const EXPECTED_TOWERS = 20;
  const SCORE_KEY = 'galactic-defense:best-scores:v1';

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
    const profile = opts.profile === undefined ? 'sustained' : opts.profile;
    if (!PROFILES.includes(profile)) throw optionError('profile must be one of ' + PROFILES.join(' | '));
    const towerTier = opts.towerTier === undefined ? 0 : opts.towerTier;
    if (typeof towerTier !== 'number' || !TOWER_TIERS.includes(towerTier)) throw optionError('towerTier must be 0 or 2');
    if (towerTier === 2 && profile !== 'theater') throw optionError('towerTier 2 requires profile "theater"');
    const bossHealer = opts.bossHealer === undefined ? false : opts.bossHealer;
    if (typeof bossHealer !== 'boolean') throw optionError('bossHealer must be a boolean');
    if (bossHealer) {
      if (profile !== 'theater') throw optionError('bossHealer requires profile "theater"');
      if (towerTier !== 2) throw optionError('bossHealer requires towerTier 2');
      const wrong = mapIds.filter(id => !BOSS_HEALER_MAPS.includes(id));
      if (wrong.length) throw optionError('bossHealer supports only map ids ' + BOSS_HEALER_MAPS.join(', ') + ' (got ' + wrong.join(', ') + ')');
    }
    // bossPriority is valid ONLY with bossHealer:true; any supplied value (even 'first') without it is an incompatible combination.
    if (opts.bossPriority !== undefined && !bossHealer) throw optionError('bossPriority requires bossHealer true');
    const bossPriority = opts.bossPriority === undefined ? 'first' : opts.bossPriority;
    if (typeof bossPriority !== 'string' || !BOSS_PRIORITIES.includes(bossPriority)) throw optionError('bossPriority must be one of ' + BOSS_PRIORITIES.join(' | '));
    const warmupMs = intOpt('warmupMs', 1000, 0, 2000);
    const sampleMs = intOpt('sampleMs', 4000, 1000, profile === 'theater' ? THEATER_MAX_SAMPLE_MS : SUSTAINED_MAX_SAMPLE_MS);
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
      url, mapIds: mapIds.slice(), profile, towerTier, bossHealer, bossPriority, warmupMs, sampleMs, targetEnemies, seed, timeoutMs,
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
    // Every page-side patch registers an undo here; they all run on EVERY exit (early return, throw, success).
    const undo = [];
    try { return await scenarioBody(c, undo); } finally {
      for (let i = undo.length - 1; i >= 0; i--) { try { undo[i](); } catch (e) { /* best effort */ } }
    }
    async function scenarioBody(c, undo) {
    const w = window;
    const theater = c.profile === 'theater';
    const tier2 = c.towerTier === 2;
    const out = { id: c.mapId, profile: c.profile, towerTier: c.towerTier, measured: false, problems: [], warnings: [] };
    const bossHealer = c.bossHealer === true;
    if (tier2) out.scenarioLabel = 'theater + tier-2 towers (NOT canonical tier-0 theater)';
    if (bossHealer) out.scenarioLabel = 'theater + tier-2 towers + 2 Healer stations + canonical dreadnought boss (SEPARATE boss+Healer workload; NOT comparable to tier-2 theater, tier-0 theater or sustained)';
    out.bossHealerRequested = bossHealer;
    const strongBoss = bossHealer && c.bossPriority === 'strong';
    if (strongBoss) out.scenarioLabel += ' + 20 canonical towers requested set to Strong priority (DISTINCT workload; see scenario.bossPriority.ok)';
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
    let theaterDefs = [];
    if (tier2) {
      need(typeof game.canUpgrade === 'function', 'game.canUpgrade is not a function (tier-2 towers unavailable)');
      need(typeof game.grant === 'function', 'game.grant is not a function (tier-2 towers unavailable)');
      need(typeof game.upgradeTower === 'function', 'game.upgradeTower is not a function (tier-2 towers unavailable)');
      need(Array.isArray(game.credits), 'game.credits is not an array (tier-2 wallet audit unavailable)');
      need(game.ledger && typeof game.ledger === 'object', 'game.ledger is missing (tier-2 ledger audit unavailable)');
    }
    if (theater) {
      need(typeof game.emitSound === 'function', 'game.emitSound (TS-private runtime method) is missing: sound-cue evidence unavailable, theater profile invalid');
      need(Array.isArray(game.meteors) && Array.isArray(game.knights) && Array.isArray(game.fireZones), 'game.meteors / game.knights / game.fireZones are not arrays: effect evidence unavailable');
      if (game.enemyById && typeof game.enemyById.get === 'function') {
        theaterDefs = c.theaterEnemyIds.map(id => game.enemyById.get(id));
        c.theaterEnemyIds.forEach((id, i) => {
          const d = theaterDefs[i];
          if (!d) problems.push('theater enemy def "' + id + '" not found');
          else if (d.boss === true) problems.push('theater enemy def "' + id + '" is a boss (bosses are excluded)');
        });
      }
    }
    let bossDef = null, healerDef = null;
    if (bossHealer) {
      need(tier2 && theater, 'bossHealer requires the theater profile with tier-2 towers');
      need(typeof game.tryPlace === 'function', 'game.tryPlace is not a function (boss+Healer fixture unavailable)');
      need(typeof game.grant === 'function', 'game.grant is not a function (boss+Healer fixture unavailable)');
      need(typeof game.check === 'function', 'game.check is not a function (legal Healer cell search unavailable)');
      need(game.turretById && typeof game.turretById.get === 'function', 'game.turretById lookup missing (Healer def unavailable)');
      if (strongBoss) need(typeof game.setTowerPriority === 'function', 'game.setTowerPriority is not a function (strong boss priority unavailable)');
      need(Array.isArray(game.credits) && game.ledger && typeof game.ledger === 'object', 'game.credits / game.ledger missing (boss+Healer audit unavailable)');
      need(Number.isInteger(game.playerCount) && game.playerCount === c.healerCount, 'boss+Healer needs exactly ' + c.healerCount + ' players, found ' + game.playerCount);
      need(Number.isInteger(game.w) && Number.isInteger(game.h) && game.w > 0 && game.h > 0, 'game.w / game.h grid size unavailable (Healer cell search impossible)');
      if (game.enemyById && typeof game.enemyById.get === 'function') {
        bossDef = game.enemyById.get(c.bossEnemyId) || null;
        if (!bossDef) problems.push('canonical boss def "' + c.bossEnemyId + '" not found');
        else if (bossDef.boss !== true) problems.push('boss def "' + c.bossEnemyId + '" is not marked boss');
        else if (typeof bossDef.hp !== 'number' || !Number.isFinite(bossDef.hp) || bossDef.hp <= 0) problems.push('boss def "' + c.bossEnemyId + '" has no finite positive hp');
      }
      if (game.turretById && typeof game.turretById.get === 'function') {
        healerDef = game.turretById.get(c.healerTurretId) || null;
        if (!healerDef) problems.push('Healer turret def "' + c.healerTurretId + '" not found');
        else if (typeof healerDef.cost !== 'number' || !Number.isFinite(healerDef.cost) || healerDef.cost <= 0) problems.push('Healer def has no finite positive cost');
      }
    }
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
    // Seed BEFORE setMap/setupStress/fixture so scenario construction is reproducible too; restored on every exit via `undo`.
    const origRandom = Math.random;
    let rs = c.seed >>> 0;
    Math.random = () => {
      rs = (rs + 0x6D2B79F5) | 0;
      let t = Math.imul(rs ^ (rs >>> 15), 1 | rs);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    undo.push(() => { Math.random = origRandom; });
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
    need(typeof game.lives === 'number' && Number.isFinite(game.lives), 'game.lives is non-finite at fixture start');
    need(typeof game.time === 'number' && Number.isFinite(game.time), 'game.time is non-finite at fixture start');
    if (theater) {
      // Real tower state must be inspectable: finite hp on every tower, all operational (hp > 0) before any step.
      const t0 = (function () {
        const ts = game.towers; let bad = 0, dead = 0;
        for (let i = 0; i < ts.length; i++) { const h = ts[i] && ts[i].hp; if (typeof h !== 'number' || !Number.isFinite(h)) bad++; else if (h <= 0) dead++; }
        return { bad, dead };
      })();
      need(t0.bad === 0, 'theater requires finite hp on every tower; ' + t0.bad + ' tower(s) have missing/non-finite hp (operational count would be unavailable)');
      need(t0.dead === 0, t0.dead + ' tower(s) already have hp <= 0 at fixture start');
    }
    if (problems.length) return out;
    if (tier2) {
      // Real upgrades through the game API, before any step or mixed-enemy fixture. A failure leaves measured:false (never a fallback).
      out.towerUpgrade = (function () {
        const fin = v => typeof v === 'number' && Number.isFinite(v);
        const ts = game.towers.slice();
        const credits = game.credits, ledger = game.ledger;
        const aud = {
          requestedTier: c.towerTier, canonicalFixture: { setup: setup, towers: ts.length, enemies: game.enemies.length },
          attemptedUpgrades: 0, succeededUpgrades: 0, canUpgradeCalls: 0, grantCalls: 0, upgradeCalls: 0,
          totalCost: 0, totalGranted: 0, before: null, after: null, wallet: null, ledger: null, ok: false,
          note: 'costs granted exactly via game.grant then spent by game.upgradeTower; no stat, tier or credit written directly; the harness does not repair towers afterwards',
        };
        const snap = () => {
          const tierCounts = {}; let hp = 0, maxHp = 0, bad = 0;
          for (const t of ts) {
            const k = t && fin(t.tier) ? String(t.tier) : 'unknown';
            tierCounts[k] = (tierCounts[k] || 0) + 1;
            if (t && fin(t.hp) && fin(t.maxHp)) { hp += t.hp; maxHp += t.maxHp; } else bad++;
          }
          return { tierCounts, hp: bad ? null : hp, maxHp: bad ? null : maxHp, badTowers: bad };
        };
        const stop = msg => { problems.push('tier-2 setup: ' + msg + ' (scenario not measured; no fallback)'); return aud; };
        const walletBefore = Array.prototype.slice.call(credits);
        if (!walletBefore.every(fin) || !fin(ledger.granted) || !fin(ledger.spent)) return stop('wallet/ledger values are missing or non-finite');
        const ledgerBefore = { granted: ledger.granted, spent: ledger.spent };
        aud.before = snap();
        aud.wallet = { before: walletBefore, after: null };
        aud.ledger = { before: ledgerBefore, after: null, grantedDelta: null, spentDelta: null };
        if (ts.length !== c.expectedTowers) return stop('expected ' + c.expectedTowers + ' canonical towers, found ' + ts.length);
        if (ts.length * 2 > c.maxTierUpgrades) return stop(ts.length * 2 + ' upgrades exceeds the bound of ' + c.maxTierUpgrades);
        if (aud.before.badTowers > 0) return stop(aud.before.badTowers + ' tower(s) have missing/non-finite hp or maxHp');
        let planned = 0;
        const bad = [];
        for (let i = 0; i < ts.length; i++) {
          const t = ts[i];
          if (!t || typeof t !== 'object') { bad.push('tower ' + i + ' missing'); continue; }
          if (!fin(t.id)) bad.push('tower ' + i + ' has no finite id');
          if (!Number.isInteger(t.owner) || t.owner < 0 || t.owner >= credits.length) bad.push('tower ' + i + ' has an invalid owner');
          if (t.tier !== 0) bad.push('tower ' + i + ' is not base tier (tier ' + t.tier + ')');
          const ups = t.def && t.def.upgrades;
          if (!Array.isArray(ups) || ups.length < 2 || !ups[0] || !ups[1] || !fin(ups[0].cost) || !fin(ups[1].cost) || ups[0].cost <= 0 || ups[1].cost <= 0) bad.push('tower ' + i + ' lacks two canonical upgrades with finite positive costs');
          else planned += ups[0].cost + ups[1].cost;
        }
        if (bad.length) return stop(bad.slice(0, 5).join('; '));
        if (!fin(planned)) return stop('total upgrade cost is non-finite');
        for (const t of ts) {
          for (let step = 1; step <= 2; step++) {
            const cost = t.def.upgrades[step - 1].cost;
            try {
            game.grant(t.owner, cost); aud.grantCalls++; aud.totalGranted += cost;
            const can = game.canUpgrade(t.id); aud.canUpgradeCalls++;
            if (!can || can.ok !== true || can.cost !== cost) return stop('canUpgrade refused tower ' + t.id + ' step ' + step + ' after an exact grant (' + (can && can.reason) + '); wallet/ledger keep the unspent grant');
            aud.attemptedUpgrades++;
            const r = game.upgradeTower(t.id); aud.upgradeCalls++;
            if (!r || r.ok !== true || r.tier !== step || r.cost !== cost || t.tier !== step) return stop('upgradeTower did not advance tower ' + t.id + ' to tier ' + step + ' (' + JSON.stringify(r) + ', tower tier ' + t.tier + ')');
            aud.succeededUpgrades++; aud.totalCost += cost;
            } catch (e) {
              return stop('upgrade API threw for tower ' + t.id + ' step ' + step + ': ' + (e && e.message ? e.message : String(e)));
            }
          }
        }
        aud.after = snap();
        if (aud.after.badTowers > 0) return stop('upgraded tower hp/maxHp became missing or non-finite');
        aud.wallet.after = Array.prototype.slice.call(game.credits);
        aud.ledger.after = { granted: ledger.granted, spent: ledger.spent };
        if (!aud.wallet.after.every(fin) || !fin(ledger.granted) || !fin(ledger.spent)) return stop('wallet/ledger became non-finite');
        aud.ledger.grantedDelta = ledger.granted - ledgerBefore.granted;
        aud.ledger.spentDelta = ledger.spent - ledgerBefore.spent;
        const near = (a, b) => Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b));
        if (aud.after.tierCounts['2'] !== ts.length || Object.keys(aud.after.tierCounts).length !== 1) return stop('not every tower reached tier 2 (' + JSON.stringify(aud.after.tierCounts) + ')');
        if (aud.succeededUpgrades !== ts.length * 2 || aud.upgradeCalls !== ts.length * 2) return stop('upgrade count ' + aud.succeededUpgrades + ' != ' + ts.length * 2);
        if (!near(aud.totalCost, planned) || !near(aud.totalGranted, aud.totalCost)) return stop('granted/spent cost does not match the canonical total ' + planned);
        if (!near(aud.ledger.grantedDelta, aud.totalCost) || !near(aud.ledger.spentDelta, aud.totalCost)) return stop('ledger granted/spent deltas do not reconcile with total cost ' + aud.totalCost);
        for (let i = 0; i < walletBefore.length; i++) if (!near(aud.wallet.after[i], walletBefore[i])) return stop('owner ' + i + ' wallet changed net (' + walletBefore[i] + ' -> ' + aud.wallet.after[i] + ')');
        if (game.towers.length !== ts.length) return stop('tower count changed during upgrades');
        aud.ok = true;
        return aud;
      })();
      if (problems.length) return out;
    }
    if (bossHealer) {
      // Exactly 2 base-tier Healer stations (one per player) via game.grant(cost) + game.tryPlace ONLY, after the tier-2 upgrades and before any step.
      // game.check (pure validation, no mutation) filters legal cells; nothing else is written. A failure leaves measured:false (no fallback).
      out.bossHealerFixture = (function () {
        const fin = v => typeof v === 'number' && Number.isFinite(v);
        const near = (a, b) => Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b));
        const credits = game.credits, ledger = game.ledger;
        const cost = healerDef.cost;
        const aud = {
          healerTurretId: c.healerTurretId, cost, expectedHealers: c.healerCount, mechanic: game.currentMap && game.currentMap.mechanic,
          searchRadius: c.healerSearchRadius, placements: [], grantCalls: 0, tryPlaceCalls: 0, checkCalls: 0, totalGranted: 0, totalCost: 0,
          towersBefore: game.towers.length, towersAfter: null, wallet: null, ledger: null, ok: false,
          declaredFixtureDifference: 'the 2 extra Healer stations make 22 towers (20 canonical tier-2 + 2 base-tier Healers); not the canonical 20-tower fixture',
          note: 'placed only through game.grant(cost) + game.tryPlace; game.check is read-only; no path, HP, stat or credit written directly',
        };
        const stop = msg => { problems.push('boss+Healer setup: ' + msg + ' (scenario not measured; no fallback)'); return aud; };
        if (c.bossHealerMechanics.indexOf(aud.mechanic) < 0) return stop('map mechanic "' + aud.mechanic + '" is not one of ' + c.bossHealerMechanics.join(', '));
        const base = game.towers.slice();
        if (base.length !== c.expectedTowers) return stop('expected ' + c.expectedTowers + ' upgraded canonical towers before Healers, found ' + base.length);
        for (let i = 0; i < base.length; i++) {
          const t = base[i];
          if (!t || !fin(t.x) || !fin(t.y) || !fin(t.id) || !Number.isInteger(t.owner)) return stop('tower ' + i + ' has no finite id/x/y or integer owner');
          if (t.tier !== 2) return stop('tower ' + i + ' is not tier 2 before Healers (tier ' + t.tier + ')');
        }
        const walletBefore = Array.prototype.slice.call(credits);
        if (!walletBefore.every(fin) || !fin(ledger.granted) || !fin(ledger.spent)) return stop('wallet/ledger values are missing or non-finite');
        const ledgerBefore = { granted: ledger.granted, spent: ledger.spent };
        aud.wallet = { before: walletBefore, after: null };
        aud.ledger = { before: ledgerBefore, after: null, grantedDelta: null, spentDelta: null };
        const r2 = c.healerSearchRadius * c.healerSearchRadius;
        try {
          for (let owner = 0; owner < c.healerCount; owner++) {
            const mine = base.filter(t => t.owner === owner);
            if (mine.length === 0) return stop('owner ' + owner + ' has no canonical defense to place a Healer near');
            const cands = [];
            for (let y = 0; y < game.h; y++) for (let x = 0; x < game.w; x++) {
              let d2 = Infinity;
              for (const t of mine) { const dd = (t.x - x) * (t.x - x) + (t.y - y) * (t.y - y); if (dd < d2) d2 = dd; }
              if (d2 > 0 && d2 <= r2) cands.push({ x, y, d2 });
            }
            cands.sort((a, b) => a.d2 - b.d2 || a.y - b.y || a.x - b.x);
            let pick = null;
            for (const cd of cands) {
              aud.checkCalls++;
              const ck = game.check(owner, c.healerTurretId, cd.x, cd.y, true);
              if (ck && ck.ok === true) { pick = cd; break; }
            }
            if (!pick) return stop('no legal empty cell within ' + c.healerSearchRadius + ' cells of owner ' + owner + ' defenses (' + cands.length + ' candidates checked)');
            game.grant(owner, cost); aud.grantCalls++; aud.totalGranted += cost;
            const before = game.towers.length;
            const res = game.tryPlace(owner, c.healerTurretId, pick.x, pick.y); aud.tryPlaceCalls++;
            if (!res || res.ok !== true || res.cost !== cost) return stop('tryPlace refused Healer for owner ' + owner + ' at ' + pick.x + ',' + pick.y + ' (' + JSON.stringify(res) + '); wallet/ledger keep the unspent grant');
            if (game.towers.length !== before + 1) return stop('tryPlace reported ok for owner ' + owner + ' but the tower count did not grow by exactly 1');
            const nt = game.towers[game.towers.length - 1];
            if (!nt || !nt.def || nt.def.id !== c.healerTurretId || nt.owner !== owner || nt.x !== pick.x || nt.y !== pick.y || nt.tier !== 0 || !fin(nt.hp) || !fin(nt.maxHp) || nt.hp <= 0) return stop('placed Healer for owner ' + owner + ' is missing or malformed');
            aud.totalCost += cost;
            aud.placements.push({ owner, x: pick.x, y: pick.y, towerId: nt.id, cost: res.cost, distSq: pick.d2, hp: nt.hp, maxHp: nt.maxHp });
          }
        } catch (e) {
          return stop('placement API threw: ' + (e && e.message ? e.message : String(e)));
        }
        aud.towersAfter = game.towers.length;
        aud.wallet.after = Array.prototype.slice.call(game.credits);
        aud.ledger.after = { granted: ledger.granted, spent: ledger.spent };
        if (!aud.wallet.after.every(fin) || !fin(ledger.granted) || !fin(ledger.spent)) return stop('wallet/ledger became non-finite');
        aud.ledger.grantedDelta = ledger.granted - ledgerBefore.granted;
        aud.ledger.spentDelta = ledger.spent - ledgerBefore.spent;
        const healers = game.towers.filter(t => t && t.def && t.def.id === c.healerTurretId);
        if (game.towers.length !== c.expectedTowers + c.healerCount) return stop('expected ' + (c.expectedTowers + c.healerCount) + ' towers, found ' + game.towers.length);
        if (healers.length !== c.healerCount || new Set(healers.map(t => t.owner)).size !== c.healerCount) return stop('expected exactly ' + c.healerCount + ' Healers with distinct owners, found ' + healers.length);
        if (aud.grantCalls !== c.healerCount || aud.tryPlaceCalls !== c.healerCount) return stop('grant/tryPlace call counts ' + aud.grantCalls + '/' + aud.tryPlaceCalls + ' != ' + c.healerCount);
        if (!near(aud.totalCost, cost * c.healerCount) || !near(aud.totalGranted, aud.totalCost)) return stop('granted/spent cost does not match ' + c.healerCount + ' x ' + cost);
        if (!near(aud.ledger.grantedDelta, aud.totalCost) || !near(aud.ledger.spentDelta, aud.totalCost)) return stop('ledger granted/spent deltas do not reconcile with total cost ' + aud.totalCost);
        for (let i = 0; i < walletBefore.length; i++) if (!near(aud.wallet.after[i], walletBefore[i])) return stop('owner ' + i + ' wallet changed net (' + walletBefore[i] + ' -> ' + aud.wallet.after[i] + ')');
        if (base.some(t => game.towers.indexOf(t) < 0 || t.tier !== 2)) return stop('a canonical tier-2 tower changed or disappeared during Healer placement');
        aud.ok = true;
        return aud;
      })();
      if (problems.length) return out;
      // Priority audit (after the Healer fixture, before any step). 'first' = untouched default: recorded, zero calls.
      out.bossPriority = (function () {
        const fin = v => typeof v === 'number' && Number.isFinite(v);
        // effective stays null until the requested priority is OBSERVED on the live towers; any failure leaves it null.
        const aud = {
          requested: c.bossPriority, effective: null, setCalls: 0, succeededCalls: 0, targetTowerIds: [], finalPriorities: [], healerPriorities: null,
          unchanged: null, ok: false,
          note: strongBoss
            ? 'REQUESTED procedure: real game.setTowerPriority(id, "strong") on the 20 canonical towers (not Healer stations) before any step; priority setting is NOT universal boss focus (RadialStasis/KeepKnightStable bypass pickTarget) and is NOT boss-phase coverage (see scenario.bossHealer coverage); trust setCalls/succeededCalls/ok for what actually ran'
            : 'default: zero setTowerPriority calls; the 20 canonical towers and 2 Healers were inspected and must all be "first"',
        };
        const stop = msg => { problems.push('boss priority setup: ' + msg + ' (scenario not measured; no fallback)'); return aud; };
        const ts = game.towers.slice(); // original tower objects, order preserved; compared against the LIVE array after the setters
        const targets = ts.filter(t => t && t.def && t.def.id !== c.healerTurretId);
        const healers = ts.filter(t => t && t.def && t.def.id === c.healerTurretId);
        if (targets.length !== c.expectedTowers || healers.length !== c.healerCount || ts.length !== targets.length + healers.length) return stop('expected ' + c.expectedTowers + ' attack towers + ' + c.healerCount + ' Healers, found ' + targets.length + ' + ' + healers.length + ' of ' + ts.length);
        const ids = ts.map(t => t.id);
        if (ids.some(id => !fin(id)) || new Set(ids).size !== ids.length) return stop('tower ids are not all finite and unique');
        if (strongBoss && targets.some(t => t.tier !== 2)) return stop('an attack tower is not tier 2');
        const ledgerScalars = l => { const o = {}; for (const k of Object.keys(l)) { const v = l[k]; if (v === null || ['number', 'string', 'boolean'].includes(typeof v)) o[k] = v; } return o; };
        const snap = () => {
          const live = game.towers;
          return {
            wallet: Array.prototype.slice.call(game.credits), ledger: ledgerScalars(game.ledger), count: live.length,
            tiers: live.map(t => t && t.tier), hp: live.map(t => t && t.hp), maxHp: live.map(t => t && t.maxHp), healerPriorities: healers.map(t => t.priority),
          };
        };
        const same = (a, b) => a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
        const sameObj = (a, b) => { const ks = new Set([...Object.keys(a), ...Object.keys(b)]); return [...ks].every(k => Object.is(a[k], b[k])); };
        const before = snap();
        if (!before.wallet.every(fin) || !fin(before.ledger.granted) || !fin(before.ledger.spent)) return stop('wallet/ledger values are missing or non-finite');
        if (strongBoss) {
          try {
            for (const t of targets) {
              aud.setCalls++;
              const ok = game.setTowerPriority(t.id, 'strong');
              if (ok !== true) return stop('setTowerPriority did not return true for tower ' + t.id + ' (' + String(ok) + ')');
              aud.succeededCalls++; aud.targetTowerIds.push(t.id);
            }
          } catch (e) {
            return stop('setTowerPriority threw: ' + (e && e.message ? e.message : String(e)));
          }
        }
        const live = game.towers;
        const identity = live.length === ts.length && ts.every((t, i) => live[i] === t && t.id === ids[i]);
        if (!identity) return stop('live game.towers no longer holds the original tower objects/ids in order (a tower was replaced, removed or reordered)');
        const after = snap();
        aud.finalPriorities = targets.map(t => t.priority);
        aud.healerPriorities = { before: before.healerPriorities, after: after.healerPriorities };
        const want = strongBoss ? 'strong' : 'first';
        if (aud.finalPriorities.some(p => p !== want)) return stop('an attack tower did not end on priority "' + want + '" (' + aud.finalPriorities.join(',') + ')');
        aud.unchanged = {
          wallet: same(before.wallet, after.wallet), ledger: sameObj(before.ledger, after.ledger), tiers: same(before.tiers, after.tiers),
          hp: same(before.hp, after.hp) && same(before.maxHp, after.maxHp), towerCount: before.count === after.count && identity,
          healerPriorities: same(before.healerPriorities, after.healerPriorities),
        };
        const bad = Object.keys(aud.unchanged).filter(k => !aud.unchanged[k]);
        if (bad.length) return stop('setup changed ' + bad.join(', ') + ' (priority setting must not alter wallet, ledger scalar fields, tier, HP, tower count or Healer priority)');
        if (after.healerPriorities.some(p => p !== 'first')) return stop('a Healer is not on priority "first" (' + after.healerPriorities.join(',') + ')');
        const wantCalls = strongBoss ? c.expectedTowers : 0;
        if (aud.setCalls !== wantCalls || aud.succeededCalls !== wantCalls) return stop('priority call count ' + aud.setCalls + '/' + aud.succeededCalls + ' != ' + wantCalls);
        aud.effective = want;
        aud.ok = true;
        return aud;
      })();
      if (problems.length) return out;
    }
    out.measured = true;
    const expectedNow = c.expectedTowers + (bossHealer ? c.healerCount : 0);

    const spawns = game.currentMap.spawns;
    let cursor = 0;
    const st = {
      violations: 0, first: [], steps: 0, warmupSteps: 0, sampleSteps: 0, blockedSteps: 0, stepErrors: 0,
      initialReplacements: 0, warmupReplacements: 0, sampleReplacements: 0, preStepReplacements: 0, overTargetSteps: 0,
      preMin: null, preMax: null, postCombatMin: null, postCombatMax: null, postRefillMin: null, postRefillMax: null,
      projMax: 0, minesMax: 0, projCap: 0, minesCap: 0, bossSpawns: 0,
    };
    const violate = msg => { st.violations++; if (st.first.length < 8) st.first.push(msg); };
    // ---- theater-only state (never touched by the sustained profile) ----
    const cap = target * c.overflowFactor;
    const tcomp = { canonicalInitial: {}, initial: { types: {}, ports: [] }, warmup: { types: {}, ports: [] }, sample: { types: {}, ports: [] } };
    for (const b of [tcomp.initial, tcomp.warmup, tcomp.sample]) for (let i = 0; i < spawns.length; i++) b.ports.push(0);
    const KNOWN_CUES_SET = {};
    for (const k of c.knownCues || []) KNOWN_CUES_SET[k] = true;
    let bucket = tcomp.initial, typeCursor = 0, halted = false;
    const th = { overflowMax: 0, overflowSteps: 0, extraMax: 0, hpMismatch: 0, invalidSpawns: 0, badTowerHpSteps: 0 };
    // Placed towers stay in game.towers after destruction (hp <= 0, disabled); operational = placed with finite hp > 0.
    // ok:false when any tower hp is missing/non-finite: operational/hp are then unavailable (null), never silently 0.
    const towerState = () => {
      const ts = game.towers;
      let hp = 0, operational = 0, bad = 0;
      for (let i = 0; i < ts.length; i++) {
        const h = ts[i] && ts[i].hp;
        if (typeof h === 'number' && Number.isFinite(h)) { hp += h; if (h > 0) operational++; } else bad++;
      }
      return { placed: ts.length, ok: bad === 0, bad, operational: bad === 0 ? operational : null, hp: bad === 0 ? hp : null };
    };
    const newWin = () => ({
      steps: 0, typeMin: {}, typeMax: {}, splitChildMax: 0, meteorsMax: 0, knightsMax: 0, roombasMax: 0, fireZonesMax: 0, geyserZonesMax: 0, towerZonesMax: 0,
      meteorPool: 0, knightPool: 0, fireZonePool: 0, towerMin: null, towerMax: null, towerHpMin: null, towerHpMax: null,
      towerOperationalMin: null, towerOperationalMax: null, towerOperationalEnd: null, towerHpEnd: null, towerHpUnavailableSteps: 0,
      cues: {}, cueCalls: 0,
    });
    const win = { warmup: newWin(), sample: newWin() };
    // boss+Healer evidence (only when requested). Sets stay page-side; windows export finite counts only.
    const newBh = () => ({
      steps: 0, bossPresentMin: null, bossPresentMax: null, stepsWithoutBoss: 0, uniqueBossesObserved: 0, bossPhaseMax: 0,
      entryBossViolations: 0, afterRefillBossViolations: 0, postCombatNoBossSteps: 0,
      healersActiveMax: 0, healerOwnersMax: 0, healerTargetsMax: 0, duplicateOwnerSteps: 0, duplicateTargetSteps: 0,
      netRecoveryHp: 0, netRecoverySteps: 0, affectedTowersMax: 0, affectedTowersDistinct: 0, hpStepsUnobserved: 0,
      healerGainHp: 0, healerGainSteps: 0, gainWithoutHealerHp: 0, gainWithoutHealerSteps: 0,
    });
    const bh = bossHealer ? { warmup: newBh(), sample: newBh() } : null;
    const bhSets = { warmup: { boss: new Set(), healed: new Set() }, sample: { boss: new Set(), healed: new Set() } };
    // Tower hp snapshots (stable tower ids) taken untimed: pre = just before the original step (after the pre-refill), post = just after it
    // (before the post-refill). Deltas are computed later, outside every timer; refill/fixture hp writes can never be counted.
    const newSnap = () => ({ ids: [], vals: [], healers: 0 });
    const snapPre = newSnap(), snapPost = newSnap();
    const countHealers = () => { let n = 0; const ks = game.knights; if (Array.isArray(ks)) for (let i = 0; i < ks.length; i++) if (ks[i] && ks[i].active === true && ks[i].kind === 'healer') n++; return n; };
    const snapTowerHp = s => {
      const ts = game.towers;
      s.ids.length = ts.length; s.vals.length = ts.length;
      for (let i = 0; i < ts.length; i++) { s.ids[i] = ts[i] ? ts[i].id : undefined; s.vals[i] = ts[i] ? ts[i].hp : undefined; }
      s.healers = countHealers();
    };
    // A "boss" is anything live whose def is boss-flagged or carries the canonical boss id (so a foreign/duplicate boss is never invisible).
    const isLiveBoss = e => !!e && e.dead !== true && !!e.def && (e.def.boss === true || e.def.id === c.bossEnemyId);
    const liveBosses = () => { let n = 0; const es = game.enemies; for (let i = 0; i < es.length; i++) if (isLiveBoss(es[i])) n++; return n; };
    // Audit of every live boss-like enemy. ok === exactly ONE live canonical boss (def is the canonical object), finite unique id, integer bossPhase 0..2.
    const bossAudit = () => {
      const r = { live: 0, canonical: 0, foreign: 0, badId: 0, dupId: 0, badPhase: 0, maxPhase: 0, ids: [], ok: false };
      const seen = new Set();
      const es = game.enemies;
      for (let i = 0; i < es.length; i++) {
        const e = es[i];
        if (!isLiveBoss(e)) continue;
        r.live++;
        if (e.def === bossDef) r.canonical++; else r.foreign++;
        if (!finNum(e.id)) r.badId++; else if (seen.has(e.id)) r.dupId++; else { seen.add(e.id); r.ids.push(e.id); }
        if (Number.isInteger(e.bossPhase) && e.bossPhase >= 0 && e.bossPhase <= 2) r.maxPhase = Math.max(r.maxPhase, e.bossPhase); else r.badPhase++;
      }
      r.ok = r.live === 1 && r.canonical === 1 && r.foreign === 0 && r.badId === 0 && r.dupId === 0 && r.badPhase === 0;
      return r;
    };
    const checkBoss = (stage, a, b) => {
      if (a.ok) return;
      b[stage + 'BossViolations']++;
      violate('boss audit at step ' + stage + ': expected exactly 1 live canonical ' + c.bossEnemyId + ' with a finite unique id and integer bossPhase 0..2; saw live=' + a.live + ' canonical=' + a.canonical + ' foreign=' + a.foreign + ' badId=' + a.badId + ' dupId=' + a.dupId + ' badPhase=' + a.badPhase);
    };
    // One canonical spawn through the existing game.spawnEnemy; returns false (after recording a violation) if it did not add exactly one enemy.
    const spawnOne = d => {
      {
        const before = game.enemies.length;
        const portIdx = cursor++ % spawns.length;
        const sp = spawns[portIdx];
        const e = game.spawnEnemy(d, sp[0], sp[1]);
        if (theater) {
          bucket.types[d.id] = (bucket.types[d.id] || 0) + 1;
          bucket.ports[portIdx]++;
        }
        if (e && typeof e === 'object') {
          // Finite check FIRST (Math.abs(NaN - x) > eps is false, so NaN would otherwise pass the canonical comparison).
          // game.spawnEnemy always sets maxHp and maxShield (shield may be 0); speedScale is checked only if present.
          const bad = [];
          for (const k of ['maxHp', 'maxShield']) {
            if (e[k] === undefined) { if (theater) bad.push(k + ' missing/unavailable'); } else if (typeof e[k] !== 'number' || !Number.isFinite(e[k])) bad.push(k + ' non-finite');
          }
          if (e.speedScale !== undefined && (typeof e.speedScale !== 'number' || !Number.isFinite(e.speedScale))) bad.push('speedScale non-finite');
          if (bad.length) {
            th.invalidSpawns++;
            violate('spawned ' + d.id + ' has invalid numeric state: ' + bad.join(', '));
          } else if (theater && (Math.abs(e.maxHp - d.hp) > 1e-9 || Math.abs(e.maxShield - (d.shield || 0)) > 1e-9 || (e.speedScale !== undefined && e.speedScale !== 1))) {
            // canonical stats / hpScale 1: spawned HP/shield/speedScale must equal the unmodified def values
            th.hpMismatch++;
            violate('spawned ' + d.id + ' has non-canonical hp/shield/speedScale (hpScale must be 1)');
          }
        }
        if (game.enemies.length !== before + 1) { violate('game.spawnEnemy did not add exactly one enemy (missed replenishment)'); return false; }
        return true;
      }
    };
    const refill = () => {
      let n = 0;
      if (halted) return 0;
      // Keep a live canonical boss: re-spawn ONLY once none is alive. It counts within the population floor like any enemy.
      if (bossHealer && liveBosses() === 0) {
        n++; st.bossSpawns++;
        if (!spawnOne(bossDef)) return n;
      }
      while (game.enemies.length < target) {
        const d = theater ? theaterDefs[typeCursor++ % theaterDefs.length] : def;
        n++;
        if (!spawnOne(d)) break;
      }
      return n;
    };
    const countKind = (a, kind) => { let n = 0; if (Array.isArray(a)) for (const x of a) if (x && x.active === true && x.kind === kind) n++; return n; };
    const observeTheater = wn => {
      // post-refill observation of ONE step (counted outside the timed core/refill/update segments)
      wn.steps++;
      const counts = {};
      let split = 0;
      const es = game.enemies;
      for (let i = 0; i < es.length; i++) {
        const e = es[i];
        const id = e && e.def && e.def.id ? e.def.id : 'unknown';
        counts[id] = (counts[id] || 0) + 1;
        if (e && e.isSplitChild === true) split++;
      }
      for (const id of Object.keys(counts)) wn.typeMax[id] = Math.max(wn.typeMax[id] === undefined ? 0 : wn.typeMax[id], counts[id]);
      if (wn.steps === 1) { for (const id of Object.keys(counts)) wn.typeMin[id] = counts[id]; }
      for (const id of Object.keys(wn.typeMin)) if ((counts[id] || 0) < wn.typeMin[id]) wn.typeMin[id] = counts[id] || 0;
      for (const id of Object.keys(counts)) if (wn.typeMin[id] === undefined) wn.typeMin[id] = 0; // first seen after step 1
      wn.splitChildMax = Math.max(wn.splitChildMax, split);
      wn.meteorsMax = Math.max(wn.meteorsMax, countActive(game.meteors));
      wn.knightsMax = Math.max(wn.knightsMax, countKind(game.knights, 'knight'));
      wn.roombasMax = Math.max(wn.roombasMax, countKind(game.knights, 'roomba'));
      wn.fireZonesMax = Math.max(wn.fireZonesMax, countActive(game.fireZones));
      // Environmental geyser zones (owner -1, towerId 0) vs tower-owned zones (e.g. plasma): only the former is volcano geyser evidence.
      let gz = 0, tz = 0;
      if (Array.isArray(game.fireZones)) for (const z of game.fireZones) if (z && z.active === true) { if (z.owner === -1 && z.towerId === 0) gz++; else tz++; }
      wn.geyserZonesMax = Math.max(wn.geyserZonesMax, gz);
      wn.towerZonesMax = Math.max(wn.towerZonesMax, tz);
      if (Array.isArray(game.meteors)) wn.meteorPool = Math.max(wn.meteorPool, game.meteors.length);
      if (Array.isArray(game.knights)) wn.knightPool = Math.max(wn.knightPool, game.knights.length);
      if (Array.isArray(game.fireZones)) wn.fireZonePool = Math.max(wn.fireZonePool, game.fireZones.length);
      const ts = towerState();
      wn.towerMin = wn.towerMin === null ? ts.placed : Math.min(wn.towerMin, ts.placed);
      wn.towerMax = wn.towerMax === null ? ts.placed : Math.max(wn.towerMax, ts.placed);
      wn.towerOperationalEnd = ts.operational;
      wn.towerHpEnd = ts.hp;
      if (ts.ok) {
        wn.towerOperationalMin = lo(wn.towerOperationalMin, ts.operational);
        wn.towerOperationalMax = hi(wn.towerOperationalMax, ts.operational);
        wn.towerHpMin = lo(wn.towerHpMin, ts.hp);
        wn.towerHpMax = hi(wn.towerHpMax, ts.hp);
      } else {
        wn.towerHpUnavailableSteps++;
        th.badTowerHpSteps++;
        violate('theater tower hp missing or non-finite on ' + ts.bad + ' tower(s); operational tower count unavailable');
      }
      return counts;
    };
    const lo = (a, v) => (a === null || v < a ? v : a);
    const hi = (a, v) => (a === null || v > a ? v : a);
    const finNum = v => typeof v === 'number' && Number.isFinite(v);
    // Per-step boss/Healer observation, run AFTER the timed segments. hpSnap* holds tower hp captured BEFORE the step (also untimed).
    // Recovery is NET per tower per step (hp after - hp before when positive): same-step damage can mask healing, so it is not total healing.
    // entryAudit = boss audit at step ENTRY (before the pre-refill); pcLive = live boss count right after combat (zero is allowed: natural death/leak,
    // refilled afterwards, reported as postCombatNoBossSteps); the audit here is AFTERREFILL. All run untimed.
    const observeBossHealer = (wname, entryAudit, pcLive) => {
      const b = bh[wname], sets = bhSets[wname];
      b.steps++;
      checkBoss('entry', entryAudit, b);
      if (pcLive === 0) b.postCombatNoBossSteps++;
      const au = bossAudit();
      checkBoss('afterRefill', au, b);
      const live = au.live, phase = au.maxPhase;
      for (let i = 0; i < au.ids.length; i++) sets.boss.add(au.ids[i]);
      b.bossPresentMin = lo(b.bossPresentMin, live); b.bossPresentMax = hi(b.bossPresentMax, live);
      if (live === 0) b.stepsWithoutBoss++;
      b.bossPhaseMax = Math.max(b.bossPhaseMax, phase);
      b.uniqueBossesObserved = sets.boss.size;
      const owners = {}, targets = {};
      let healers = 0;
      const ks = game.knights;
      for (let i = 0; i < ks.length; i++) {
        const k = ks[i];
        if (!k || k.active !== true || k.kind !== 'healer') continue; // healer units are never counted as knights
        healers++;
        owners[String(k.owner)] = (owners[String(k.owner)] || 0) + 1;
        if (finNum(k.targetTowerId) && k.targetTowerId !== 0) targets[String(k.targetTowerId)] = (targets[String(k.targetTowerId)] || 0) + 1;
      }
      const ownerKeys = Object.keys(owners), targetKeys = Object.keys(targets);
      b.healersActiveMax = Math.max(b.healersActiveMax, healers);
      b.healerOwnersMax = Math.max(b.healerOwnersMax, ownerKeys.length);
      b.healerTargetsMax = Math.max(b.healerTargetsMax, targetKeys.length);
      if (ownerKeys.some(k => owners[k] > 1)) { b.duplicateOwnerSteps++; violate('duplicate live healer owner (' + ownerKeys.filter(k => owners[k] > 1).join(',') + ')'); }
      if (targetKeys.some(k => targets[k] > 1)) { b.duplicateTargetSteps++; violate('duplicate nonzero healer target claim (tower ' + targetKeys.filter(k => targets[k] > 1).join(',') + ')'); }
      // Net per-tower hp change across the ORIGINAL step only (pre snapshot after the pre-refill, post snapshot before the post-refill), matched by
      // stable tower id: reordered, removed or newly added towers are never counted as recovery.
      const postById = new Map();
      for (let i = 0; i < snapPost.ids.length; i++) if (finNum(snapPost.ids[i]) && finNum(snapPost.vals[i])) postById.set(snapPost.ids[i], snapPost.vals[i]);
      let rec = 0, affected = 0, unobserved = 0;
      for (let i = 0; i < snapPre.ids.length; i++) {
        const id = snapPre.ids[i];
        if (!finNum(id) || !finNum(snapPre.vals[i]) || !postById.has(id)) { unobserved++; continue; }
        const diff = postById.get(id) - snapPre.vals[i];
        if (diff > 0) { rec += diff; affected++; sets.healed.add(id); }
      }
      b.netRecoveryHp += rec;
      if (rec > 0) {
        b.netRecoverySteps++;
        // Healer evidence: the gain only counts as healer repair when a real active healer unit existed before or after that same step.
        if (snapPre.healers > 0 || snapPost.healers > 0) { b.healerGainHp += rec; b.healerGainSteps++; } else { b.gainWithoutHealerHp += rec; b.gainWithoutHealerSteps++; }
      }
      b.affectedTowersMax = Math.max(b.affectedTowersMax, affected);
      b.affectedTowersDistinct = sets.healed.size;
      b.hpStepsUnobserved += unobserved;
    };
    // ---- actual-mechanic observation (theater only; Cyber/Volcano/Bio by the REAL currentMap.mechanic). Observation only: no forcing, no actor mutation. ----
    const mech = game.currentMap && game.currentMap.mechanic;
    const mkind = !theater ? null : mech === 'cyber-emp-chain' ? 'cyber' : mech === 'volcano-lava-geyser' ? 'volcano' : mech === 'biolab-mutate-regen' ? 'bio' : null;
    const mflag = mkind === 'cyber' ? 'empActive' : mkind === 'bio' ? 'mutationActive' : null;
    const mtimer = mkind === 'cyber' ? 'empTimer' : 'mutationTimer';
    const newMw = () => {
      const m = { steps: 0 };
      if (mflag) Object.assign(m, { stateValidSteps: 0, stateInvalidSteps: 0, activeSteps: 0, activeEntries: 0 });
      if (mkind === 'cyber') Object.assign(m, { pulseDamageCalls: 0, pulseTowerSteps: 0, multiHitTowerSteps: 0, maxDistinctEnemiesPerTower: 0, unattributedCalls: 0 });
      if (mkind === 'bio') Object.assign(m, { netRegenHp: 0, netRegenSteps: 0, netRegenEnemiesDistinct: 0, netRegenDistinctCapped: false, eligibleEnemySteps: 0, slowOrBurnSuppressedEnemySteps: 0, eligibilityUnavailableEnemySteps: 0, unobservedEnemies: 0 });
      return m;
    };
    const mw = mkind ? { warmup: newMw(), sample: newMw() } : null;
    const mSets = { warmup: new Set(), sample: new Set() }; // bounded (512) distinct-enemy sets
    let mprev = null, stepActive = false, damageObserved = false, observerErrors = 0;
    const chain = new Map(); // pulse tower id -> Set of distinct enemy ids hit inside the CURRENT original step (bounded; cleared every step)
    const cc = { calls: 0, unattr: 0 };
    const newEs = () => ({ ids: [], objs: [], hp: [], slow: [], burn: [], dead: [], maxHp: [] });
    const ePre = newEs(), ePost = newEs();
    const snapEnemies = s => {
      const es = game.enemies;
      s.ids.length = s.objs.length = s.hp.length = s.slow.length = s.burn.length = s.dead.length = s.maxHp.length = es.length;
      // dead/maxHp are copied BY VALUE: the enemy object is mutable and may die or change during the step
      for (let i = 0; i < es.length; i++) { const e = es[i]; s.objs[i] = e; s.ids[i] = e ? e.id : undefined; s.hp[i] = e ? e.hp : undefined; s.slow[i] = e ? e.slowT : undefined; s.burn[i] = e ? e.burnT : undefined; s.dead[i] = e ? e.dead === true : false; s.maxHp[i] = e ? e.maxHp : undefined; }
    };
    const countIds = s => { const m = new Map(); for (let i = 0; i < s.ids.length; i++) if (finNum(s.ids[i])) m.set(s.ids[i], (m.get(s.ids[i]) || 0) + 1); return m; };
    const observeMechanic = wname => {
      const m = mw[wname];
      m.steps++;
      if (mflag) {
        const on = game[mflag], tm = game[mtimer];
        if (typeof on === 'boolean' && finNum(tm)) {
          m.stateValidSteps++;
          if (on) { m.activeSteps++; if (mprev === false) m.activeEntries++; }
          mprev = on;
        } else { m.stateInvalidSteps++; mprev = null; }
      }
      if (mkind === 'cyber') {
        // Distinct enemy ids per canonical pulse tower, original step only: >= 2 is multi-hit damageEnemy CALL evidence, not proof of applied damage.
        m.pulseDamageCalls += cc.calls; m.unattributedCalls += cc.unattr; cc.calls = 0; cc.unattr = 0;
        chain.forEach(set => { m.pulseTowerSteps++; if (set.size >= 2) m.multiHitTowerSteps++; m.maxDistinctEnemiesPerTower = Math.max(m.maxDistinctEnemiesPerTower, set.size); });
      }
      if (mkind === 'bio') {
        // Net per-enemy HP change across the ORIGINAL step only, matched by finite unique id AND object identity (a replaced/reused id is never growth).
        // Refills, new ids, dead or removed enemies are excluded; this is NET (damage masks regen), not gross regen and not slow-suppression proof.
        const preN = countIds(ePre), postN = countIds(ePost), postIdx = new Map();
        for (let i = 0; i < ePost.ids.length; i++) if (postN.get(ePost.ids[i]) === 1) postIdx.set(ePost.ids[i], i);
        let rec = 0;
        for (let i = 0; i < ePre.ids.length; i++) {
          const id = ePre.ids[i], e = ePre.objs[i], hp = ePre.hp[i], maxHp = ePre.maxHp[i];
          if (!e || ePre.dead[i]) continue; // PRE-step by-value state; an enemy that dies during the step is still eligibility-counted (never regen)
          if (!finNum(id) || !finNum(hp) || !finNum(maxHp) || preN.get(id) !== 1) { m.unobservedEnemies++; continue; }
          if (hp > 0 && hp < maxHp) {
            if (finNum(ePre.slow[i]) && finNum(ePre.burn[i])) { if (ePre.slow[i] <= 0 && ePre.burn[i] <= 0) m.eligibleEnemySteps++; else m.slowOrBurnSuppressedEnemySteps++; } else m.eligibilityUnavailableEnemySteps++;
          }
          if (!postN.has(id)) continue; // removed/dead: not counted
          const j = postIdx.get(id);
          if (j === undefined || ePost.objs[j] !== e || e.dead === true || !finNum(ePost.hp[j])) { m.unobservedEnemies++; continue; }
          const diff = ePost.hp[j] - hp;
          if (diff > 1e-9) { rec += diff; const ds = mSets[wname]; if (ds.has(id) || ds.size < 512) ds.add(id); else m.netRegenDistinctCapped = true; }
        }
        m.netRegenHp += rec;
        if (rec > 0) m.netRegenSteps++;
        m.netRegenEnemiesDistinct = mSets[wname].size;
      }
    };
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
    const hadOwnEmit = Object.prototype.hasOwnProperty.call(game, 'emitSound');
    const origEmit = game.emitSound;
    let emitPatched = false;
    const coreTimes = [], refillTimes = [], updateTimes = [], intervals = [];
    let phase = 'warmup', measure = false, sampling = false, raf = 0, frames = 0, last = null;
    let wallMs = 0, simSeconds = 0, visibilityEnd = null;
    const restoreEmit = () => {
      if (!emitPatched) return;
      emitPatched = false;
      if (hadOwnEmit) game.emitSound = origEmit; else delete game.emitSound;
    };
    // Cyber only: counts pulse-tower damageEnemy CALLS inside the original step (wrapper cost lands inside the timed core step).
    const hadOwnDamage = Object.prototype.hasOwnProperty.call(game, 'damageEnemy');
    const origDamage = game.damageEnemy;
    let damagePatched = false;
    const restoreDamage = () => {
      if (!damagePatched) return;
      damagePatched = false;
      if (hadOwnDamage) game.damageEnemy = origDamage; else delete game.damageEnemy;
    };
    // Registered before the first patch so a throw anywhere below still restores every patch.
    undo.push(restoreDamage);
    undo.push(restoreEmit);
    undo.push(() => { if (hadOwnStep) game.step = origStep; else delete game.step; });
    undo.push(() => { if (hadOwnUpdate) renderer.update = origUpdate; else delete renderer.update; });
    undo.push(() => { if (visListening) { try { document.removeEventListener('visibilitychange', onVis); } catch (e) { /* best effort */ } visListening = false; } });
    try {
      if (typeof document.addEventListener === 'function') {
        document.addEventListener('visibilitychange', onVis);
        visListening = true;
      }
      if (theater) {
        // Mixed canonical fixture, built BEFORE any simulation step: record the canonical swarmer baseline, replace it.
        for (const e of game.enemies) { const id = e && e.def && e.def.id ? e.def.id : 'unknown'; tcomp.canonicalInitial[id] = (tcomp.canonicalInitial[id] || 0) + 1; }
        game.enemies.splice(0, game.enemies.length);
        bucket = tcomp.initial;
        st.initialReplacements = refill();
        bucket = tcomp.warmup;
        if (game.enemies.length !== target) violate('theater fixture population ' + game.enemies.length + ' != target ' + target);
        // Count (do not drain/alter) every emitSound call; the original always runs unmodified.
        game.emitSound = function (ev) {
          const wn = measure ? win.sample : win.warmup;
          const key = KNOWN_CUES_SET[ev] === true ? ev : 'other';
          wn.cues[key] = (wn.cues[key] || 0) + 1;
          wn.cueCalls++;
          return origEmit.apply(this, arguments);
        };
        emitPatched = true;
        if (mflag) mprev = typeof game[mflag] === 'boolean' ? game[mflag] : null;
        if (mkind === 'cyber' && typeof origDamage === 'function') {
          game.damageEnemy = function (e, dmg, owner, opts, tower) {
            if (stepActive && tower && tower.def && tower.def.id === 'pulse') {
              try {
                cc.calls++;
                if (finNum(tower.id) && e && finNum(e.id)) {
                  let set = chain.get(tower.id);
                  if (!set) { set = new Set(); chain.set(tower.id, set); }
                  if (set.has(e.id) || set.size < 16) set.add(e.id);
                } else cc.unattr++;
              } catch (err) { observerErrors++; }
            }
            return origDamage.apply(this, arguments);
          };
          damagePatched = true;
          damageObserved = true;
        }
      } else {
        st.initialReplacements = refill();
      }
      game.step = function (...args) {
        if (game.paused || game.over) {
          st.blockedSteps++;
          return origStep.apply(this, args);
        }
        const inSample = measure;
        const entryAudit = bossHealer ? bossAudit() : null; // untimed boss audit at step ENTRY
        const a = performance.now();
        const r1 = refill();
        const b = performance.now();
        const pre = game.enemies.length;
        const timeBefore = game.time;
        if (bossHealer) snapTowerHp(snapPre); // untimed: immediately before the original step, after the pre-refill
        if (mkind === 'bio') snapEnemies(ePre); // untimed (outside the core timer; still consumes wall time)
        if (mkind === 'cyber') { chain.clear(); cc.calls = 0; cc.unattr = 0; }
        let ret;
        const c0 = performance.now();
        stepActive = true;
        try { ret = origStep.apply(this, args); } catch (e) { st.stepErrors++; if (st.first.length < 8) st.first.push('step threw: ' + (e && e.message)); throw e; } finally { stepActive = false; }
        const c1 = performance.now();
        const post = game.enemies.length;
        let pcLive = null;
        if (bossHealer) { snapTowerHp(snapPost); pcLive = liveBosses(); } // untimed: right after the original step, before the post-refill
        if (mkind === 'bio') snapEnemies(ePost);
        const c2 = performance.now(); // post-refill timer starts AFTER the observer work, so observer cost is never billed as refill CPU
        const r2 = refill();
        const d = performance.now();
        const fin = game.enemies.length;
        st.steps++;
        if (theater) {
          // Floor invariant only: natural splits/extras are kept (never trimmed) up to the overflow cap.
          if (pre < target) violate('pre-step population ' + pre + ' below floor ' + target);
          if (fin < target) violate('post-refill population ' + fin + ' below floor ' + target);
          if (post > target) { st.overTargetSteps++; th.overflowSteps++; }
          th.overflowMax = Math.max(th.overflowMax, post, fin);
          th.extraMax = Math.max(th.extraMax, fin - target);
          if (post > cap || fin > cap) {
            violate('population ' + Math.max(post, fin) + ' exceeded natural overflow cap ' + cap + ' (' + c.overflowFactor + 'x target); fixture halted');
            halted = true;
            game.paused = true; // stop unbounded growth; the scenario is already invalid
          }
        } else {
          if (pre !== target) violate('pre-step population ' + pre + ' != target ' + target);
          if (fin !== target) violate('post-refill population ' + fin + ' != target ' + target);
          if (post > target) { st.overTargetSteps++; violate('post-combat population ' + post + ' exceeds target ' + target + ' (cannot trim)'); }
        }
        if (typeof game.time !== 'number' || !Number.isFinite(game.time)) violate('simulation time is non-finite (' + game.time + ')');
        else if (!(game.time > timeBefore)) violate('simulation time did not advance during step');
        if (typeof game.lives !== 'number' || !Number.isFinite(game.lives)) violate('game.lives is non-finite (' + game.lives + ')');
        if (theater) observeTheater(inSample ? win.sample : win.warmup);
        if (bossHealer) observeBossHealer(inSample ? 'sample' : 'warmup', entryAudit, pcLive);
        if (mkind) observeMechanic(inSample ? 'sample' : 'warmup');
        if (r1 > 0) st.preStepReplacements += r1;
        if (inSample) {
          st.sampleSteps++;
          st.sampleReplacements += r1 + r2;
          coreTimes.push(c1 - c0);
          refillTimes.push((b - a) + (d - c2));
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
      bucket = tcomp.sample;
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
      restoreEmit();
      restoreDamage();
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
    if (theater) {
      const endTypes = {};
      for (const e of game.enemies) { const id = e && e.def && e.def.id ? e.def.id : 'unknown'; endTypes[id] = (endTypes[id] || 0) + 1; }
      out.comparability = tier2
        ? 'variable-workload with UPGRADED tier-2 towers: NOT comparable to canonical tier-0 theater or the fixed 150-Swarmer sustained baseline'
        : 'variable-workload: NOT comparable to the fixed 150-Swarmer sustained baseline';
      if (tier2) out.warnings.push('TIER-2 towers (upgraded via game.upgradeTower before the run; initial aggregate HP ' + (out.towerUpgrade && out.towerUpgrade.after ? out.towerUpgrade.after.hp : 'unknown') + '): separate from canonical tier-0 theater; ability coverage must be read from observed cues/fireZones/split children only');
      out.population.floor = target;
      out.population.overflowCap = cap;
      out.population.overflowMax = th.overflowMax;
      out.population.overflowSteps = th.overflowSteps;
      out.population.naturalExtraMax = th.extraMax;
      out.population.fixtureHalted = halted;
      out.population.endTypeCounts = endTypes;
      out.composition = {
        theaterEnemyIds: c.theaterEnemyIds, spawnPorts: spawns.length, bossesIncluded: bossHealer,
        canonicalInitial: tcomp.canonicalInitial, initialMixed: tcomp.initial, warmupReplacements: tcomp.warmup, sampleReplacements: tcomp.sample,
        nonCanonicalSpawns: th.hpMismatch, invalidSpawns: th.invalidSpawns,
      };
      // Active counts are entries with active === true; pool* are array capacities (high-water marks), not active counts.
      out.effects = { warmup: win.warmup, sample: win.sample, cueNote: 'emitSound CALL counts (emission only; not proof of damage or an audible sound)' };
      // "placed" = entries in game.towers (destroyed/disabled towers stay there with hp <= 0); "operational" = placed with finite hp > 0.
      const endTs = towerState();
      out.towers = {
        tier: c.towerTier, initial: expectedNow, end: game.towers.length, sampleMin: win.sample.towerMin, sampleMax: win.sample.towerMax,
        warmupMin: win.warmup.towerMin, warmupMax: win.warmup.towerMax,
        sampleHpMin: win.sample.towerHpMin, sampleHpMax: win.sample.towerHpMax, environmentalLossAllowed: true,
        placed: { end: endTs.placed },
        operational: {
          end: endTs.operational,
          warmup: { min: win.warmup.towerOperationalMin, max: win.warmup.towerOperationalMax, end: win.warmup.towerOperationalEnd },
          sample: { min: win.sample.towerOperationalMin, max: win.sample.towerOperationalMax, end: win.sample.towerOperationalEnd },
        },
        hp: {
          end: endTs.hp,
          warmup: { min: win.warmup.towerHpMin, max: win.warmup.towerHpMax, end: win.warmup.towerHpEnd },
          sample: { min: win.sample.towerHpMin, max: win.sample.towerHpMax, end: win.sample.towerHpEnd },
        },
        hpUnavailableSteps: win.warmup.towerHpUnavailableSteps + win.sample.towerHpUnavailableSteps,
        note: (bossHealer ? 'the harness never repairs or freezes towers (real Healer units may repair/revive them)' : 'towers are never repaired') + '; operational excludes hp <= 0; null = unavailable (missing/non-finite hp), never reported as 0',
      };
      const opMins = [win.warmup.towerOperationalMin, win.sample.towerOperationalMin].filter(v => v !== null);
      const minOp = opMins.length ? Math.min.apply(null, opMins) : null;
      if (win.warmup.towerMin !== null && win.warmup.towerMin < expectedNow || win.sample.towerMin !== null && win.sample.towerMin < expectedNow) {
        out.warnings.push('towers were lost (removed from game.towers) during the run (min placed ' + Math.min(win.warmup.towerMin === null ? Infinity : win.warmup.towerMin, win.sample.towerMin === null ? Infinity : win.sample.towerMin) + ' of ' + expectedNow + '); ' + (bossHealer ? 'the harness does not repair towers (real Healers may), so the defence was not a constant ' : 'environmental damage is not repaired, so the defence was not a constant ') + expectedNow + ' towers');
      }
      if (minOp !== null && minOp < expectedNow) {
        out.warnings.push('operational towers (hp > 0) dropped during the run (min ' + minOp + ' of ' + expectedNow + ', end ' + endTs.operational + '); disabled towers stay placed' + (bossHealer ? '; the harness does not repair or revive them (real Healers may)' : ' and are not repaired'));
      }
      if (minOp === 0 || endTs.operational === 0 || game.towers.length === 0) out.warnings.push('ALL towers were destroyed/disabled (operational count reached 0); later load is no longer representative of a defended map');
      if (win.sample.cueCalls === 0) out.warnings.push('no sound cues were emitted during the sample window');
      if (bossHealer) {
        // Coverage is per window. `coverage` is an alias of sampleCoverage (the measured window); warmup-only evidence never claims sampled coverage.
        const mkCoverage = w => {
          const b = bh[w];
          const cues = win[w].cues['boss-phase'] || 0;
          const cov = {
            window: w, bossPhaseObserved: b.bossPhaseMax >= 1 || cues > 0, maxBossPhase: b.bossPhaseMax, bossPhaseCues: cues,
            healerRepairObserved: b.healerGainHp > 0, healerAttributedRecoveryHp: b.healerGainHp, netRecoveryHp: b.netRecoveryHp,
            gainWithoutHealerHp: b.gainWithoutHealerHp, activeHealerUnitsObserved: b.healersActiveMax > 0, missing: [],
            note: 'presence of the boss or Healer stations is not coverage: a boss phase (bossPhase >= 1 or boss-phase cue) and positive per-tower net HP recovery on a step with an actual active healer unit must be observed in THIS window; HP gain with no active healer is not healer coverage',
          };
          if (!cov.bossPhaseObserved) cov.missing.push('boss phase');
          if (!cov.healerRepairObserved) cov.missing.push('healer repair (net tower HP recovery)');
          cov.complete = cov.missing.length === 0;
          return cov;
        };
        const warmupCoverage = mkCoverage('warmup'), sampleCoverage = mkCoverage('sample');
        const coverage = sampleCoverage;
        for (const m of sampleCoverage.missing) out.warnings.push('COVERAGE MISSING: no ' + m + ' was observed in the SAMPLE window of this boss+Healer run (fixture presence and warmup-only evidence are not sampled coverage)');
        const healerMax = Math.max(bh.warmup.healersActiveMax, bh.sample.healersActiveMax);
        if (healerMax === 0) out.warnings.push('no active Healer unit was observed (Healer stations only spawn units when a defense is damaged)');
        const bossViol = bh.warmup.entryBossViolations + bh.warmup.afterRefillBossViolations + bh.sample.entryBossViolations + bh.sample.afterRefillBossViolations;
        out.bossHealer = {
          label: 'SEPARATE boss+Healer workload (22 towers: 20 tier-2 + 2 base-tier Healer stations; one canonical dreadnought boss always live): NOT comparable to tier-2 theater, tier-0 theater or sustained',
          bossEnemyId: c.bossEnemyId, bossSpawnsByHarness: st.bossSpawns, populationNote: 'the boss counts within the floor and the overflow cap; natural escorts/splits are kept',
          recoveryNote: 'netRecoveryHp = sum of positive per-tower hp change (matched by tower id) across the original step only, observed outside the timed segments and excluding refill; damage in the same step masks healing, so this is NET recovery, not total healing; healerAttributedRecoveryHp counts only steps with an actual active healer unit; active healers alone are not healing proof',
          singleCanonicalBoss: bh.warmup.steps + bh.sample.steps > 0 && bossViol === 0, bossAuditViolations: bossViol,
          bossAuditNote: 'exactly one live canonical dreadnought (finite unique id, integer bossPhase 0..2, no other boss def) is required at step entry and after refill; zero right after combat is allowed (natural death/leak) and counted as postCombatNoBossSteps',
          warmup: bh.warmup, sample: bh.sample, bossPhaseCues: { warmup: win.warmup.cues['boss-phase'] || 0, sample: win.sample.cues['boss-phase'] || 0 },
          warmupCoverage, sampleCoverage, coverage, coverageNote: 'coverage is an alias of sampleCoverage (the sample window); warmupCoverage is reported separately and never counts as sampled coverage',
        };
        out.bossHealer.priority = out.bossPriority;
        if (strongBoss) out.warnings.push('BOSS PRIORITY strong: 20 canonical towers set to Strong (distinct workload; RadialStasis/KeepKnightStable bypass pickTarget, so not universal boss focus). Targeting alone is not boss-phase coverage (see sampleCoverage)');
        out.towers.healerStations = c.healerCount;
        out.warnings.push('BOSS+HEALER fixture: 2 extra Healer stations (22 towers) and a live canonical dreadnought boss; separate workload, not comparable to any other profile');
      }
      if (mkind) {
        // Per-window coverage for the ACTUAL currentMap.mechanic. Warmup-only evidence is never sampled coverage; missing is a finding, not invalid timing.
        const mwarn = [];
        const mkCov = w => {
          const m = mw[w], wn = win[w], cov = { window: w, missing: [] };
          if (mflag) {
            if (m.stateValidSteps === 0) { m.activeSteps = null; m.activeEntries = null; }
            if (m.stateInvalidSteps > 0) {
              const reason = w + ': ' + mflag + '/' + mtimer + ' missing or non-finite on ' + m.stateInvalidSteps + ' step(s); those steps are unobserved, not counted as inactive';
              mwarn.push(reason); problems.push('mechanic observation invalid: ' + reason);
              cov.missing.push('valid ' + mflag + '/' + mtimer + ' observations on every step');
            }
          }
          if (mkind === 'cyber') {
            cov.empActiveObserved = m.activeSteps > 0; cov.empActiveEntries = m.activeEntries;
            cov.pulseChainMultiHitCallsObserved = damageObserved && m.multiHitTowerSteps > 0; cov.pulseChainObserverAvailable = damageObserved;
            if (!cov.empActiveObserved) cov.missing.push('EMP active state (empActive true with finite empTimer)');
            if (!damageObserved) cov.missing.push('pulse chain damage-call observer (game.damageEnemy unavailable)');
            else if (m.multiHitTowerSteps === 0) cov.missing.push('multi-enemy pulse chain damage calls (>= 2 distinct enemy ids from one pulse tower in one original step)');
          } else if (mkind === 'volcano') {
            cov.meteorActiveObserved = wn.meteorsMax > 0; cov.meteorImpactCues = wn.cues['meteor-impact'] || 0;
            cov.fireZoneActiveObserved = wn.fireZonesMax > 0; // generic, informational only (may be tower-owned, e.g. plasma)
            cov.geyserZoneActiveObserved = wn.geyserZonesMax > 0; cov.geyserZonesMax = wn.geyserZonesMax; cov.towerFireZonesMax = wn.towerZonesMax;
            if (!cov.meteorActiveObserved) cov.missing.push('active meteor');
            if (cov.meteorImpactCues === 0) cov.missing.push('meteor-impact cue');
            if (!cov.geyserZoneActiveObserved) cov.missing.push('active geyser fire zone (environmental: owner -1, towerId 0)');
          } else {
            cov.mutationActiveObserved = m.activeSteps > 0; cov.mutationActiveEntries = m.activeEntries;
            cov.splitCues = wn.cues['centipede-split'] || 0; cov.splitChildMax = wn.splitChildMax;
            cov.splitChildObserved = cov.splitCues > 0 && wn.splitChildMax > 0; // warmup children persisting into the sample are not a sample split event
            cov.netRegenObserved = m.netRegenHp > 0; cov.netRegenHp = m.netRegenHp;
            if (!cov.mutationActiveObserved) cov.missing.push('mutation active state (mutationActive true with finite mutationTimer)');
            if (!cov.splitChildObserved) cov.missing.push('natural split (centipede-split cue plus active isSplitChild enemy in the same window)');
            if (!cov.netRegenObserved) cov.missing.push('positive net per-enemy HP recovery (matched by id + identity across one original step)');
          }
          if (mkind === 'cyber' && observerErrors > 0) cov.missing.push('error-free pulse observer');
          cov.complete = cov.missing.length === 0;
          return cov;
        };
        const warmupCoverage = mkCov('warmup'), sampleCoverage = mkCov('sample');
        for (const x of sampleCoverage.missing) out.warnings.push('MECHANIC COVERAGE MISSING (' + mech + '): no ' + x + ' observed in the SAMPLE window (warmup-only evidence is not sampled coverage)');
        if (mkind === 'cyber' && !damageObserved) problems.push('mechanic observation invalid: game.damageEnemy observer unavailable');
        if (observerErrors > 0) {
          mwarn.push('pulse observer caught ' + observerErrors + ' internal error(s)');
          problems.push('mechanic observation invalid: pulse observer errors (' + observerErrors + ')');
        }
        out.mechanics = {
          kind: mech,
          scope: 'observed only on the actual currentMap.mechanic; mechanic observers do not force abilities or mutate actors',
          warmup: mw.warmup, sample: mw.sample, warmupCoverage, sampleCoverage, coverage: sampleCoverage, missing: sampleCoverage.missing, warnings: mwarn,
          notes: [].concat(
            mkind === 'cyber' ? ['pulse chain evidence = damageEnemy CALLS (>= 2 distinct enemy ids from one canonical pulse tower within one original step); it is not proof damage was applied. The wrapper runs INSIDE the timed core step, so coreStepCpu includes its overhead.']
              : mkind === 'volcano' ? ['meteor/meteor-impact evidence is scoped to the actual volcano-lava-geyser mechanic; geyser coverage requires an active ENVIRONMENTAL fire zone (owner -1, towerId 0), tower-owned (e.g. plasma) zones are reported separately as towerFireZonesMax and never satisfy it; Forge Drone presence is NOT observed or claimed; cue counts are emission only, not damage proof.']
                : ['regen evidence = positive NET per-enemy HP change across one original step (finite unique id + same object; refills, new ids, dead/removed enemies excluded); damage masks regen, so it is not gross regen and not slow-suppression proof. eligibleEnemySteps / slowOrBurnSuppressedEnemySteps are informational and never count as coverage.'],
            ['Per-step snapshots and state reads run outside the timed segments but still consume wall-clock time.']),
        };
        if (mkind === 'cyber') out.warnings.push('CYBER pulse-chain observer wraps game.damageEnemy inside the timed core step; coreStepCpu includes that overhead (not comparable to un-observed runs)');
      }
    }

    if (st.sampleSteps === 0) problems.push('no simulation steps ran during the sample window');
    if (frames < 2) problems.push('fewer than 2 requestAnimationFrame callbacks during the sample window (' + frames + '; hidden/throttled page?)');
    if (intervals.length === 0) problems.push('no requestAnimationFrame interval samples');
    if (updateTimes.length === 0) problems.push('renderer.update was never called during the sample window');
    if (!visListening) problems.push('cannot observe visibilitychange events (document.addEventListener missing)');
    if (visEvents.some(v => v.state !== 'visible')) problems.push('page became hidden during warmup/sample (' + visEvents.map(v => v.phase + ':' + v.state).join(', ') + ')');
    if (!(simSeconds > 0)) problems.push('simulation time did not advance during the sample');
    if (typeof game.lives !== 'number' || !Number.isFinite(game.lives)) problems.push('game.lives is non-finite at end (' + game.lives + ')');
    if (typeof game.time !== 'number' || !Number.isFinite(game.time)) problems.push('game.time is non-finite at end (' + game.time + ')');
    if (theater && out.towers && out.towers.hpUnavailableSteps > 0) problems.push('theater tower hp was missing/non-finite on ' + out.towers.hpUnavailableSteps + ' observed step(s)');
    if (out.simToWallRatio === null || !Number.isFinite(out.simToWallRatio)) problems.push('simulation/wall ratio is not finite');
    if (out.visibilityStart !== 'visible' || visibilityEnd !== 'visible') problems.push('page was not visible throughout (' + out.visibilityStart + ' -> ' + visibilityEnd + ')');
    if (game.paused || game.over) problems.push('game ended or paused during the run (paused=' + game.paused + ', over=' + game.over + ')');
    if (st.blockedSteps > 0) problems.push('game.step was invoked ' + st.blockedSteps + ' time(s) while paused/over');
    if (st.stepErrors > 0) problems.push(st.stepErrors + ' step error(s) thrown');
    if (!theater && game.towers.length !== c.expectedTowers) problems.push('tower count changed: ' + game.towers.length + ' != ' + c.expectedTowers);
    if (!theater && game.enemies.length !== target) problems.push('end population ' + game.enemies.length + ' != target ' + target);
    if (theater && game.enemies.length < target) problems.push('end population ' + game.enemies.length + ' below floor ' + target);
    if (theater && halted) problems.push('population exceeded the natural overflow cap ' + cap + '; fixture halted (unbounded growth)');
    if (!scoresReadable) problems.push('best-score localStorage unreadable (' + (scoresBefore.error || scoresAfter.error) + '); unchanged-ness NOT verified');
    else if (!out.scores.unchanged) problems.push('best-score localStorage entry changed during the run');
    if (st.violations > 0) problems.push(st.violations + ' population/step invariant violation(s): ' + st.first.join('; '));
    return out;
    }
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
          mapId, profile: cfg.profile, towerTier: cfg.towerTier, bossHealer: cfg.bossHealer, bossPriority: cfg.bossPriority, bossEnemyId: BOSS_ENEMY_ID, healerTurretId: HEALER_TURRET_ID,
          healerCount: HEALER_COUNT, healerSearchRadius: HEALER_SEARCH_RADIUS, bossHealerMechanics: BOSS_HEALER_MECHANICS, maxTierUpgrades: TIER2_MAX_UPGRADES, warmupMs: cfg.warmupMs, sampleMs: cfg.sampleMs, targetEnemies: cfg.targetEnemies, seed: cfg.seed,
          fixtureLives: cfg.fixtureLives, expectedTowers: cfg.expectedTowers, scoreKey: cfg.scoreKey,
          theaterEnemyIds: THEATER_ENEMY_IDS, knownCues: KNOWN_CUES, overflowFactor: THEATER_OVERFLOW_FACTOR,
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
      for (const wmsg of s.warnings || []) warnings.push(s.id + ': ' + wmsg);
    });
    if (nonFinite.length) failures.push('non-finite numbers in results: ' + nonFinite.slice(0, 5).join(', '));
    raw.scenarios.forEach(s => { if (nonFinite.some(p => p.indexOf(s.id + '.') === 0)) s.valid = false; });

    result = {
      kind: 'ga-sustained-browser-benchmark', version: 1, profile: cfg.profile, towerTier: cfg.towerTier,
      comparability: cfg.bossHealer
        ? 'SEPARATE boss+Healer theater workload (tier-2 towers + 2 Healer stations + live dreadnought boss' + (cfg.bossPriority === 'strong' ? ', 20 canonical towers requested on Strong priority: a further DISTINCT workload, not comparable to first-priority boss+Healer runs' : '') + '): NOT comparable to tier-2 theater, canonical tier-0 theater or the fixed 150-Swarmer sustained baseline'
        : cfg.towerTier === 2
        ? 'variable-workload theater profile with UPGRADED tier-2 towers: NOT comparable to canonical tier-0 theater or the fixed 150-Swarmer sustained baseline'
        : cfg.profile === 'theater'
          ? 'variable-workload theater profile: NOT comparable to the fixed 150-Swarmer sustained baseline'
          : 'fixed sustained baseline',
      valid: false, failures, warnings,
      timestamp: new Date().toISOString(), config: cfg,
      environment: Object.assign({ browserVersion: raw.browserVersion }, env),
      build: env.build || null,
      disclosures: [
        'Debug API dependency: uses window.__ga and the TypeScript-private game.spawnEnemy; not a public contract.',
        cfg.profile === 'theater'
          ? 'Population is replenished to a minimum floor after every step; natural extras and real tower damage vary the workload.'
          : 'Load is held constant by replenishing to the exact target population after every step; enemy HP/motion/damage are not frozen.',
        'CPU timings use performance.now() (see environment.timer for resolution and per-call overhead); zero-duration values are below timer resolution.',
        'Core step, refill and renderer.update CPU are timed separately; GPU time, composition and most Pixi draw work are NOT measured.',
        'Math.random is seeded in the fresh context only; frame/step timing remains non-deterministic.',
        'Fresh context: service workers blocked, non-loopback requests aborted, sound muted via existing hooks when possible.',
        'Not a hardware multi-touch, thermal, GPU-time, DPI or target-device benchmark. No pass/fail FPS threshold is applied.',
      ].concat(cfg.profile === 'theater' ? [
        'THEATER profile: variable workload (mixed canonical non-boss enemies, natural splits/overflow up to 3x target, real tower damage); NOT comparable to the fixed sustained baseline.',
        cfg.bossHealer
          ? 'Theater population is a floor (replenished before/after each step), not an exact count; one canonical boss is kept live and counts within it; the harness never repairs or freezes towers (real Healer units can repair/revive them), so net tower loss is reported, not hidden.'
          : 'Theater population is a floor (replenished before/after each step), not an exact count; no boss is covered; towers are never repaired, so environmental tower loss is reported, not hidden.',
        'Sound-cue counts are game.emitSound CALL counts per window (emission only, not damage proof); effect maxima are observed after each step.',
        'Per-step theater observation (type counts, transients, towers) runs outside the timed core/refill/update segments but still consumes wall-clock time.',
        'Maps whose real mechanic is cyber-emp-chain, volcano-lava-geyser or biolab-mutate-regen add scenario.mechanics (observed state/evidence per window plus sampleCoverage/missing; warmup-only never counts). Nothing is forced; Cyber wraps game.damageEnemy INSIDE the timed core step (overhead included in coreStepCpu); missing coverage is a finding, not invalid timing.',
      ] : []).concat(cfg.towerTier === 2 ? [
        'TIER-2 requested: the harness requires 40 upgrades through game.upgradeTower, funded by exact canonical game.grant calls before measurement. Check each scenario towerUpgrade.ok, wallet/ledger reconciliation, and HP audit for actual setup outcomes; failures remain unmeasured.',
        'TIER-2 results are a separate labelled fixture, NOT comparable to canonical tier-0 theater; the tier choice does not prove ability coverage: only observed cues, fireZones and split children count as evidence.',
      ] : []).concat(cfg.bossHealer ? [
        'BOSS+HEALER requested: a SEPARATE workload. After the tier-2 upgrades, 2 base-tier Healer stations (one per player, 22 towers) are added via game.grant + game.tryPlace only; the extra Healers are a declared fixture difference. Check scenario.bossHealerFixture.ok and its wallet/ledger reconciliation; failures remain unmeasured.',
        'BOSS+HEALER enemies: the usual five canonical types plus one unmodified canonical dreadnought, re-spawned only when none is live, counted within the population floor; boss HP/phases/damage/death and tower HP are never forced by the harness, and it never repairs or freezes towers (real Healer units can repair/revive them). Exactly one live canonical boss is audited at step entry and after refill.',
        'BOSS+HEALER evidence is observed only: scenario.bossHealer.sampleCoverage (alias coverage) and warmupCoverage report whether a boss phase and positive NET tower HP recovery on a step with an actual active healer occurred (net per real step; same-step damage can mask healing, so it is not total healing). Warmup-only evidence is not sampled coverage; missing coverage is not success.',
        cfg.bossPriority === 'strong'
          ? 'BOSS PRIORITY strong REQUESTED: the procedure is real game.setTowerPriority once on each of the 20 canonical towers (not the Healers) after the Healer fixture; a distinct workload, not universal boss focus (RadialStasis/KeepKnightStable bypass pickTarget). Completion is NOT assumed: check scenario.bossPriority.ok/effective/setCalls and its unchanged audit (failures leave effective null). Targeting is NOT boss-phase coverage: only per-window observed boss phases count.'
          : 'BOSS priority: default "first" (no setTowerPriority calls).',
        'BOSS+HEALER per-step observation (tower hp snapshot before/after, enemy/knight scans) runs outside the timed core step but consumes wall-clock time.',
      ] : []),
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
