import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

// The harness is loaded exactly the way the parent tooling loads it: no module system, a bare function expression.
const SOURCE = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'scripts', 'benchmark-browser.js'), 'utf8');
const loadHarness = () => vm.runInNewContext('(' + SOURCE + ')', { URL, setTimeout, clearTimeout });
const SCORE_KEY = 'galactic-alliance:best-scores:v1';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const MAP_IDS = ['orbital-crossing', 'pacific-fleet', 'ironhold-keep'];

/** Fake game with the same observable contract as proto-web's Game (prototype methods, compaction, 150 stress swarmers). */
function makeWorld(o = {}) {
  const maps = MAP_IDS.map(id => ({ id, name: id.toUpperCase(), spawns: [[0, 3], [0, 9]] }));
  const store = new Map([[SCORE_KEY, '{"v":1}']]);
  const localStorage = {
    getItem: k => { if (o.storageThrows) throw new Error('denied'); return store.has(k) ? store.get(k) : null; },
    setItem: (k, v) => store.set(k, String(v)),
  };
  const swarmer = { id: 'swarmer', hp: 9 };
  class FakeGame {
    constructor() {
      this.data = { maps };
      this.enemyById = new Map([['swarmer', swarmer]]);
      this.stressWave = { stress: true, groups: [
        { enemyId: 'swarmer', count: 75, interval: 0, spawnIndex: 0 },
        { enemyId: 'swarmer', count: 75, interval: 0, spawnIndex: 1 }] };
      Object.assign(this, { paused: true, over: null, mode: 'normal', time: 0, lives: 20, speed: 2, autoWave: true,
        enemies: [], towers: [], spawners: [], projectiles: [], mines: [], currentMap: maps[0], spawned: [], steps: 0 });
    }
    setMap(i) { this.currentMap = maps[i]; }
    setupStress() {
      this.enemies = [];
      this.towers = Array.from({ length: 20 }, (_, i) => ({ i }));
      this.mode = 'stress'; this.paused = false; this.over = null; this.time = 0;
      for (const g of this.stressWave.groups) for (let i = 0; i < g.count; i++) this.enemies.push({ def: swarmer, dead: false });
      return { towers: 20, enemies: this.enemies.length };
    }
    spawnEnemy(def, cx, cy) {
      if (o.dropSpawns) return {};
      const e = { def, cx, cy, dead: false };
      this.enemies.push(e);
      this.spawned.push({ map: this.currentMap.id, def, cx, cy });
      return e;
    }
    step(dt) {
      if (this.paused || this.over) return;
      this.steps++;
      this.time += dt;
      for (let i = 0; i < 3 && i < this.enemies.length; i++) this.enemies[i].dead = true;
      this.enemies = this.enemies.filter(e => !e.dead);
      if (o.splitPerStep) for (let i = 0; i < 5; i++) this.enemies.push({ def: swarmer, dead: false });
      if (o.writeScoreOnStep) localStorage.setItem(SCORE_KEY, '{"v":2}');
      if (o.overAfterSteps && this.steps >= o.overAfterSteps) this.over = 'lost';
    }
  }
  const game = new FakeGame();
  if (o.noSpawnEnemy) game.spawnEnemy = undefined;
  let muted = false;
  const renderer = { update() {}, isMuted: () => muted, app: { renderer: { gl: null, type: 1 } } };
  const input = { hooks: { button: id => { if (id === 'sfx') muted = !muted; } } };
  const window = { __ga: { game, renderer, input, layout: () => ({ id: '2p-opposing' }) }, localStorage,
    innerWidth: 1920, innerHeight: 1080, devicePixelRatio: 1, location: { href: 'http://127.0.0.1:4173/' } };
  const listeners = new Set();
  const document = { visibilityState: o.hidden ? 'hidden' : 'visible', hidden: !!o.hidden,
    scripts: [{ src: 'http://127.0.0.1:4173/assets/index-abc123.js', type: 'module' }], createElement: () => ({ getContext: () => null }),
    addEventListener: (ev, fn) => { if (ev === 'visibilitychange') listeners.add(fn); },
    removeEventListener: (ev, fn) => { if (ev === 'visibilitychange') listeners.delete(fn); } };
  if (o.noVisListener) { document.addEventListener = undefined; document.removeEventListener = undefined; }
  const setVisibility = state => { document.visibilityState = state; document.hidden = state === 'hidden'; for (const fn of [...listeners]) fn(); };
  const ctx = vm.createContext({
    window, document, localStorage, performance, setTimeout, clearTimeout, innerWidth: 1920, innerHeight: 1080, devicePixelRatio: 1,
    navigator: { userAgent: 'FakeUA/1.0', hardwareConcurrency: 8, deviceMemory: 8 },
    fetch: async () => ({ ok: true, status: 200, text: async () => "const GA_VERSION = 'v-test-1';" }),
    requestAnimationFrame: cb => { if (o.rafThrows) throw new Error('raf boom'); if (o.noRaf) return 0; return setTimeout(() => cb(performance.now()), 16); },
    cancelAnimationFrame: id => clearTimeout(id),
  });
  if (o.activePools) {
    game.projectiles = [{ active: true }, { active: false }, { active: false }, { active: true }, { active: false }];
    game.mines = [{ active: false }, { active: false }, { active: true }];
  }
  let ticks = 0;
  const world = { game, renderer, ctx, setVisibility, ticker: { count: 0, min: Infinity, max: -Infinity }, origRandom: vm.runInContext('Math.random', ctx) };
  // App-like fixed ticker: calls game.step through the property (so wrappers apply) and independently watches the population.
  const timer = setInterval(() => {
    try { game.step(1 / 60); } catch (e) { /* app ticker swallows */ }
    if (!o.noRendererUpdate) renderer.update();
    if (o.hiddenBlipAtTick && ++ticks === o.hiddenBlipAtTick) { setVisibility('hidden'); setVisibility('visible'); }
    if (Object.prototype.hasOwnProperty.call(game, 'step') && game.mode === 'stress' && !game.paused && !game.over) {
      const n = game.enemies.length;
      world.ticker.count++; world.ticker.min = Math.min(world.ticker.min, n); world.ticker.max = Math.max(world.ticker.max, n);
    }
  }, 16);
  world.stop = () => clearInterval(timer);
  worlds.push(world);
  return world;
}
const worlds = [];
afterEach(() => { for (const w of worlds.splice(0)) w.stop(); });

function makeBrowser(world, o = {}) {
  const log = { contextsCreated: 0, contextsClosed: 0, contextOptions: null, gotos: [], evals: 0, existingTouched: 0 };
  const handlers = {};
  const run = fn => vm.runInContext('(' + fn.toString() + ')', world.ctx); // fresh source eval == page.evaluate isolation
  const page = {
    on(ev, h) { handlers[ev] = h; },
    async goto(url) {
      log.gotos.push(url);
      if (o.gotoDelayMs) await sleep(o.gotoDelayMs);
      if (o.gotoThrows) throw new Error('net::ERR_CONNECTION_REFUSED');
      if (o.pageError && handlers.pageerror) handlers.pageerror(new Error(o.pageError));
    },
    async waitForFunction(fn) { if (!run(fn)()) throw new Error('waitForFunction predicate false'); },
    async evaluate(fn, arg) {
      log.evals++;
      if (o.evalThrowsOnCall === log.evals) throw new Error('evaluate exploded');
      const r = await run(fn)(arg);
      return r === undefined ? undefined : JSON.parse(JSON.stringify(r));
    },
  };
  const context = {
    async route() {}, async newPage() { return page; },
    async close() {
      log.contextsClosed++;
      if (o.closeHangs) await new Promise(() => {});
      if (o.closeThrows) throw new Error('close boom');
    },
  };
  const browser = {
    version: () => 'Chromium 0.0.0-test',
    async newContext(opts) {
      log.contextsCreated++; log.contextOptions = opts;
      if (o.newContextDelayMs) await sleep(o.newContextDelayMs);
      return context;
    },
  };
  const touch = () => { log.existingTouched++; };
  const existingPage = {
    context: () => ({ browser: () => browser, newPage: touch }),
    goto: touch, evaluate: touch, close: touch, setViewportSize: touch, route: touch, reload: touch,
  };
  return { log, existingPage };
}

const rejection = async promise => { try { await promise; } catch (e) { return e; } throw new Error('expected rejection'); };
const FAST = { mapIds: ['orbital-crossing'], warmupMs: 0, sampleMs: 1000 };

describe('benchmark option validation', () => {
  const bad = {
    'external https url': { url: 'https://example.com/' },
    'external http url': { url: 'http://example.com:4173/' },
    'lookalike host': { url: 'http://127.0.0.1.evil.com/' },
    'credentials': { url: 'http://user:pw@127.0.0.1:4173/' },
    'file url': { url: 'file:///etc/passwd' },
    'query string': { url: 'http://127.0.0.1:4173/?x=1' },
    'non-string url': { url: 42 },
    'no maps': { mapIds: [] },
    'ten maps': { mapIds: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'], sampleMs: 1000 },
    'duplicate maps': { mapIds: ['a', 'a'] },
    'non-id map': { mapIds: ['../etc'] },
    'warmup too long': { warmupMs: 2001 },
    'warmup fractional': { warmupMs: 10.5 },
    'sample too short': { sampleMs: 999 },
    'sample too long': { sampleMs: 10001 },
    'target below canonical': { targetEnemies: 149 },
    'target above cap': { targetEnemies: 501 },
    'negative seed': { seed: -1 },
    'timeout above 45s': { timeoutMs: 45001 },
    'total duration above 40s': { mapIds: ['a', 'b', 'c', 'd', 'e'], warmupMs: 2000, sampleMs: 8000 },
    'nine maps at 5s': { mapIds: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'], warmupMs: 0, sampleMs: 5000 },
    'viewport width too small': { viewport: { width: 319, height: 915 } },
    'viewport width too large': { viewport: { width: 3841, height: 915 } },
    'viewport height too small': { viewport: { width: 412, height: 479 } },
    'viewport height too large': { viewport: { width: 412, height: 2161 } },
    'viewport fractional': { viewport: { width: 412.5, height: 915 } },
    'viewport extra key': { viewport: { width: 412, height: 915, x: 1 } },
    'viewport not an object': { viewport: '412x915' },
    'dpr below 1': { deviceScaleFactor: 0.5 },
    'dpr above 3': { deviceScaleFactor: 3.5 },
    'dpr NaN': { deviceScaleFactor: NaN },
    'dpr Infinity': { deviceScaleFactor: Infinity },
    'dpr string': { deviceScaleFactor: '2' },
    'unknown key': { sampleMS: 2000 },
    'array options': [],
  };
  it.each(Object.entries(bad))('rejects %s without creating a context or touching the page', async (_name, opts) => {
    const { log, existingPage } = makeBrowser(makeWorld());
    const err = await rejection(loadHarness()(existingPage, opts));
    expect(err.kind).toBe('invalid-options');
    expect(log.contextsCreated).toBe(0);
    expect(log.existingTouched).toBe(0);
  });

  it('accepts loopback urls (normalised to a directory base) and boundary budgets', async () => {
    const accepted = [
      ['http://localhost:5173/sub', 'http://localhost:5173/sub/'],
      ['http://[::1]:4173/', 'http://[::1]:4173/'],
      ['http://127.0.0.1:4173/TTDefense/', 'http://127.0.0.1:4173/TTDefense/'],
    ];
    for (const [url, expected] of accepted) {
      const { log, existingPage } = makeBrowser(makeWorld(), { gotoThrows: true });
      const err = await rejection(loadHarness()(existingPage, { url, ...FAST }));
      expect(err.kind).toBe('method-failure'); // got past validation, failed at navigation
      expect(log.gotos).toEqual([expected]);
    }
    const { log, existingPage } = makeBrowser(makeWorld(), { gotoThrows: true });
    await rejection(loadHarness()(existingPage, { mapIds: ['a', 'b', 'c', 'd'], warmupMs: 0, sampleMs: 10000, targetEnemies: 500 }));
    expect(log.contextsCreated).toBe(1); // exactly 40000 ms is allowed
  });

  it('rejects a non-page argument before creating anything', async () => {
    const err = await rejection(loadHarness()(null, {}));
    expect(err.kind).toBe('method-failure');
  });
});

describe('benchmark run lifecycle and cleanup', () => {
  it('opens only its own 1920x1080 DPR1 context, leaves the existing page alone, and closes exactly once', async () => {
    const world = makeWorld();
    const { log, existingPage } = makeBrowser(world);
    await loadHarness()(existingPage, { ...FAST });
    expect(log.contextsCreated).toBe(1);
    expect(log.contextsClosed).toBe(1);
    expect(log.contextOptions).toMatchObject({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
    expect(log.existingTouched).toBe(0);
  });

  it('closes the context when navigation throws', async () => {
    const { log, existingPage } = makeBrowser(makeWorld(), { gotoThrows: true });
    const err = await rejection(loadHarness()(existingPage, FAST));
    expect(err.kind).toBe('method-failure');
    expect(err.message).toMatch(/ERR_CONNECTION_REFUSED/);
    expect([log.contextsCreated, log.contextsClosed]).toEqual([1, 1]);
  });

  it('closes the context when evaluate throws, and reports a close failure alongside', async () => {
    const { log, existingPage } = makeBrowser(makeWorld(), { evalThrowsOnCall: 2, closeThrows: true });
    const err = await rejection(loadHarness()(existingPage, FAST));
    expect(err.kind).toBe('method-failure');
    expect(err.message).toMatch(/evaluate exploded/);
    expect(err.message).toMatch(/close failed/);
    expect([log.contextsCreated, log.contextsClosed]).toEqual([1, 1]);
  });

  it('restores page instrumentation and rejects when the page throws mid-measurement', async () => {
    const world = makeWorld({ rafThrows: true });
    const { log, existingPage } = makeBrowser(world);
    const err = await rejection(loadHarness()(existingPage, FAST));
    expect(err.message).toMatch(/raf boom/);
    expect(Object.prototype.hasOwnProperty.call(world.game, 'step')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(world.renderer, 'update')).toBe(false);
    expect(vm.runInContext('Math.random', world.ctx)).toBe(world.origRandom);
    expect(log.contextsClosed).toBe(1);
  });

  it('times out distinctly, closes its context, and does not leave an unhandled rejection', async () => {
    const unhandled = [];
    const onUnhandled = e => unhandled.push(e);
    process.on('unhandledRejection', onUnhandled);
    try {
      const { log, existingPage } = makeBrowser(makeWorld(), { gotoDelayMs: 1800, gotoThrows: true });
      const started = Date.now();
      const err = await rejection(loadHarness()(existingPage, { ...FAST, timeoutMs: 1000 }));
      expect(err.kind).toBe('timeout');
      expect(Date.now() - started).toBeLessThan(1700);
      expect([log.contextsCreated, log.contextsClosed]).toEqual([1, 1]);
      await sleep(1000); // let the abandoned navigation reject
      expect(unhandled).toEqual([]);
    } finally { process.off('unhandledRejection', onUnhandled); }
  }, 10000);

  it('passes a configured phone viewport/DPR to the context and checks the environment against it, not 1920@1', async () => {
    const world = makeWorld();
    world.ctx.window.innerWidth = 412; world.ctx.window.innerHeight = 915; world.ctx.window.devicePixelRatio = 2;
    const { log, existingPage } = makeBrowser(world);
    const r = await loadHarness()(existingPage, { ...FAST, viewport: { width: 412, height: 915 }, deviceScaleFactor: 2 });
    expect(log.contextOptions).toMatchObject({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2 });
    expect(r.config).toMatchObject({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2 });
    expect(r.failures.join('\n')).not.toMatch(/viewport\/DPR/);
    // a page that does not honour the configured viewport/DPR is flagged
    const w2 = makeWorld();
    const b2 = makeBrowser(w2);
    const r2 = await loadHarness()(b2.existingPage, { ...FAST, viewport: { width: 412, height: 915 }, deviceScaleFactor: 2 });
    expect(r2.valid).toBe(false);
    expect(r2.failures.join('\n')).toMatch(/viewport\/DPR is not 412x915 @2/);
  });

  it('creation still pending at the timeout: rejects as timeout, then closes the late context (own only)', async () => {
    const unhandled = [];
    const onUnhandled = e => unhandled.push(e);
    process.on('unhandledRejection', onUnhandled);
    try {
      const { log, existingPage } = makeBrowser(makeWorld(), { newContextDelayMs: 1500 });
      const started = Date.now();
      const err = await rejection(loadHarness()(existingPage, { ...FAST, timeoutMs: 1000 }));
      expect(err.kind).toBe('timeout');
      expect(Date.now() - started).toBeLessThan(5500); // 1 s workload + bounded cleanup
      expect([log.contextsCreated, log.contextsClosed]).toEqual([1, 1]);
      expect(log.gotos).toEqual([]);
      expect(log.existingTouched).toBe(0);
      await sleep(300);
      expect(unhandled).toEqual([]);
    } finally { process.off('unhandledRejection', onUnhandled); }
  }, 15000);

  it('creation that outlives the 5 s cleanup budget is reported, and the late context is still closed', async () => {
    const { log, existingPage } = makeBrowser(makeWorld(), { newContextDelayMs: 6600 });
    const err = await rejection(loadHarness()(existingPage, { ...FAST, timeoutMs: 1000 }));
    expect(err.kind).toBe('timeout');
    expect(err.message).toMatch(/still pending/);
    expect(log.contextsClosed).toBe(0);
    await sleep(1500);
    expect(log.contextsClosed).toBe(1);
  }, 20000);

  it('a hanging context.close() is bounded to 5 s and reported', async () => {
    const { log, existingPage } = makeBrowser(makeWorld(), { closeHangs: true });
    const started = Date.now();
    const r = await loadHarness()(existingPage, FAST);
    expect(Date.now() - started).toBeLessThan(FAST.sampleMs + 5000 + 2500);
    expect(log.contextsClosed).toBe(1);
    expect(r.valid).toBe(false);
    expect(r.failures.join('\n')).toMatch(/failed to close.*timed out/);
  }, 20000);

  it('marks the result invalid (but resolves) when the own context fails to close after success', async () => {
    const { existingPage } = makeBrowser(makeWorld(), { closeThrows: true });
    const r = await loadHarness()(existingPage, FAST);
    expect(r.valid).toBe(false);
    expect(r.failures.join('\n')).toMatch(/failed to close/);
  });
});

describe('sustained-load invariants', () => {
  it('holds the population exactly at target after every step, replenishing with the canonical def and spawn ports', async () => {
    const world = makeWorld();
    const { existingPage } = makeBrowser(world);
    const original = Object.getPrototypeOf(world.game).step;
    const r = await loadHarness()(existingPage, { mapIds: ['orbital-crossing', 'pacific-fleet'], warmupMs: 200, sampleMs: 1000, seed: 777 });

    expect(r.failures).toEqual([]);
    expect(r.valid).toBe(true);
    expect(r.scenarios.map(s => s.id)).toEqual(['orbital-crossing', 'pacific-fleet']);
    for (const s of r.scenarios) {
      expect(s.valid).toBe(true);
      expect(s.setup).toEqual({ towers: 20, enemies: 150 });
      expect(s.towersAtStart).toBe(20);
      expect(s.towersAtEnd).toBe(20);
      expect(s.stressEnemyId).toBe('swarmer');
      expect(s.seed).toBe(777);
      expect(Number.isFinite(s.fixtureLives) && s.fixtureLives > 1e6).toBe(true);
      const p = s.population;
      expect([p.preStepMin, p.preStepMax, p.postRefillMin, p.postRefillMax]).toEqual([150, 150, 150, 150]);
      expect(p.postCombatMax).toBeLessThan(150); // combat really removed enemies...
      expect(p.sampleReplacements).toBeGreaterThan(20); // ...and each loss was replenished
      expect(p.warmupReplacements).toBeGreaterThan(0); // warmup is sustained too
      expect(p.initialReplacements).toBe(0);
      expect(p.endEnemies).toBe(150);
      expect(s.steps.sample).toBeGreaterThan(20);
      expect(s.steps.blocked).toBe(0);
      expect(s.coreStepCpu.count).toBe(s.steps.sample);
      expect(s.refillCpu.count).toBe(s.steps.sample);
      expect(s.raf.callbacks).toBeGreaterThan(10);
      expect(s.raf.intervals.medianMs).toBeGreaterThan(0);
      expect(Number.isFinite(s.simToWallRatio) && s.simToWallRatio > 0).toBe(true);
      expect(s.scores.unchanged).toBe(true);
      expect(s.muted).toBe(true);
      // alternating canonical spawn ports, per scenario, always the canonical stress def
      const mine = world.game.spawned.filter(e => e.map === s.id);
      expect(mine.length).toBe(p.warmupReplacements + p.sampleReplacements);
      mine.forEach((e, i) => { expect(e.def).toBe(world.game.enemyById.get('swarmer')); expect(e.cy).toBe(i % 2 === 0 ? 3 : 9); });
    }
    // Independent observer (the app ticker) never saw a short or long population after a step.
    expect(world.ticker.count).toBeGreaterThan(40);
    expect([world.ticker.min, world.ticker.max]).toEqual([150, 150]);
    // Everything patched on the page is restored.
    expect(world.game.step).toBe(original);
    expect(Object.prototype.hasOwnProperty.call(world.game, 'step')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(world.renderer, 'update')).toBe(false);
    expect(vm.runInContext('Math.random', world.ctx)).toBe(world.origRandom);
  }, 20000);

  it('reports environment/build metadata from the page, with honest nulls and warnings', async () => {
    const { existingPage } = makeBrowser(makeWorld());
    const r = await loadHarness()(existingPage, FAST);
    expect(r.environment).toMatchObject({ browserVersion: 'Chromium 0.0.0-test', userAgent: 'FakeUA/1.0', dpr: 1, visibility: 'visible' });
    expect(r.environment.viewport).toEqual({ width: 1920, height: 1080 });
    expect(r.build).toMatchObject({ mainScriptUrl: 'http://127.0.0.1:4173/assets/index-abc123.js', swVersion: 'v-test-1', devServer: false });
    expect(r.environment.muted).toMatchObject({ before: false, after: true, toggled: true });
    expect(r.environment.webgl.renderer).toBeNull(); // not faked
    expect(r.warnings.join('\n')).toMatch(/WebGL vendor\/renderer unavailable/);
    expect(r.config).toMatchObject({ targetEnemies: 150, seed: 12345, mapIds: ['orbital-crossing'] });
    expect(r.disclosures.join(' ')).toMatch(/Not a hardware/);
  });

  const invalidCases = [
    ['page hidden', { hidden: true }, /not visible/],
    ['game over during run', { overAfterSteps: 5 }, /ended or paused/],
    ['best-score storage mutated', { writeScoreOnStep: true }, /best-score/],
    ['replenishment silently missing', { dropSpawns: true }, /missed replenishment|!= target/],
    ['combat pushes population over target', { splitPerStep: true }, /exceeds target/],
    ['page error', { pageError: 'boom' }, /page error/],
  ];
  it.each(invalidCases)('marks the run invalid (never a false success): %s', async (_name, worldOpts, pattern) => {
    const world = makeWorld(worldOpts);
    const { existingPage } = makeBrowser(world, worldOpts.pageError ? { pageError: worldOpts.pageError } : {});
    const r = await loadHarness()(existingPage, FAST);
    expect(r.valid).toBe(false);
    expect(r.failures.join('\n')).toMatch(pattern);
    expect(Object.prototype.hasOwnProperty.call(world.game, 'step')).toBe(false); // still restored
  }, 10000);

  it('counts only active=true projectiles/mines, and reports pool capacity separately', async () => {
    const { existingPage } = makeBrowser(makeWorld({ activePools: true }));
    const r = await loadHarness()(existingPage, FAST);
    expect(r.failures).toEqual([]);
    expect(r.scenarios[0].activeMax).toEqual({ projectiles: 2, mines: 1 });
    expect(r.scenarios[0].poolCapacity).toEqual({ projectiles: 5, mines: 3 });
  });

  it('inactive pooled entries are not counted as active', async () => {
    const world = makeWorld({ activePools: true });
    world.game.projectiles.forEach(p => { p.active = false; });
    world.game.mines.forEach(m => { m.active = false; });
    const { existingPage } = makeBrowser(world);
    const r = await loadHarness()(existingPage, FAST);
    expect(r.scenarios[0].activeMax).toEqual({ projectiles: 0, mines: 0 });
    expect(r.scenarios[0].poolCapacity).toEqual({ projectiles: 5, mines: 3 });
  });

  it('a transient hidden->visible blip during the sample invalidates the run, and the listener is removed', async () => {
    const world = makeWorld({ hiddenBlipAtTick: 30 });
    const { existingPage } = makeBrowser(world);
    const r = await loadHarness()(existingPage, FAST);
    expect(r.valid).toBe(false);
    expect(r.failures.join('\n')).toMatch(/became hidden/);
    expect(r.scenarios[0].visibilityEnd).toBe('visible'); // both endpoints visible, still invalid
    expect(r.scenarios[0].visibilityEvents.some(v => v.state === 'hidden')).toBe(true);
    world.setVisibility('hidden'); world.setVisibility('visible'); // listeners must be gone: nothing throws, nothing recorded
  }, 10000);

  it('zero renderer.update calls make the scenario invalid', async () => {
    const { existingPage } = makeBrowser(makeWorld({ noRendererUpdate: true }));
    const r = await loadHarness()(existingPage, FAST);
    expect(r.valid).toBe(false);
    expect(r.failures.join('\n')).toMatch(/renderer\.update was never called/);
  });

  it('fewer than 2 rAF callbacks / no interval samples make the scenario invalid', async () => {
    const { existingPage } = makeBrowser(makeWorld({ noRaf: true }));
    const r = await loadHarness()(existingPage, FAST);
    expect(r.valid).toBe(false);
    expect(r.failures.join('\n')).toMatch(/fewer than 2 requestAnimationFrame/);
    expect(r.failures.join('\n')).toMatch(/no requestAnimationFrame interval samples/);
  });

  it('cannot observe visibilitychange -> invalid, not silently trusted', async () => {
    const { existingPage } = makeBrowser(makeWorld({ noVisListener: true }));
    const r = await loadHarness()(existingPage, FAST);
    expect(r.valid).toBe(false);
    expect(r.failures.join('\n')).toMatch(/cannot observe visibilitychange/);
  });

  it('unreadable best-score storage is never reported as verified-unchanged', async () => {
    const { existingPage } = makeBrowser(makeWorld({ storageThrows: true }));
    const r = await loadHarness()(existingPage, FAST);
    expect(r.valid).toBe(false);
    expect(r.scenarios[0].scores.readable).toBe(false);
    expect(r.scenarios[0].scores.unchanged).toBeNull();
    expect(r.failures.join('\n')).toMatch(/unreadable.*NOT verified/);
    expect(r.failures.join('\n')).not.toMatch(/entry changed/);
  });

  it('refuses to measure when required internals are missing', async () => {
    const world = makeWorld({ noSpawnEnemy: true });
    const { existingPage } = makeBrowser(world);
    const r = await loadHarness()(existingPage, FAST);
    expect(r.valid).toBe(false);
    expect(r.failures.join('\n')).toMatch(/spawnEnemy/);
    expect(r.scenarios[0].measured).toBe(false);
    expect(r.scenarios[0].steps).toBeUndefined();
    expect(world.game.steps).toBe(0); // never even set up a stress scene
    expect(world.game.mode).toBe('normal');
  });

  it('flags unknown map ids as an invalid scenario rather than measuring something else', async () => {
    const { existingPage } = makeBrowser(makeWorld());
    const r = await loadHarness()(existingPage, { ...FAST, mapIds: ['no-such-map'] });
    expect(r.valid).toBe(false);
    expect(r.failures.join('\n')).toMatch(/no-such-map.*not found/);
  });

  it('supports a larger target by replenishing the canonical shortfall up front', async () => {
    const world = makeWorld();
    const { existingPage } = makeBrowser(world);
    const r = await loadHarness()(existingPage, { ...FAST, targetEnemies: 200 });
    expect(r.failures).toEqual([]);
    const p = r.scenarios[0].population;
    expect(p.initialReplacements).toBe(50);
    expect([p.postRefillMin, p.postRefillMax]).toEqual([200, 200]);
    expect([world.ticker.min, world.ticker.max]).toEqual([200, 200]);
  });
});
