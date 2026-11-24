import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

// The harness is loaded exactly the way the parent tooling loads it: no module system, a bare function expression.
const SOURCE = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'scripts', 'benchmark-browser.js'), 'utf8');
const loadHarness = () => vm.runInNewContext('(' + SOURCE + ')', { URL, setTimeout, clearTimeout });
const SCORE_KEY = 'galactic-defense:best-scores:v1';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const MAP_IDS = ['orbital-crossing', 'pacific-fleet', 'ironhold-keep'];

/** Fake game with the same observable contract as proto-web's Game (prototype methods, compaction, 150 stress swarmers). */
function makeWorld(o = {}) {
  const maps = MAP_IDS.map(id => ({ id, name: id.toUpperCase(), spawns: [[0, 3], [0, 9]], ...(id === 'ironhold-keep' ? { mechanic: 'medieval-frenzy' } : {}), ...(o.mechanic && id === 'orbital-crossing' ? { mechanic: o.mechanic } : {}) }));
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
        enemies: [], towers: [], spawners: [], projectiles: [], mines: [], currentMap: maps[0], spawned: [], steps: 0,
        calls: { grant: 0, canUpgrade: 0, upgradeTower: 0 }, directTierWrites: 0, _upgrading: false,
        credits: [500, 750.5], ledger: { granted: 1000, spent: 20 },
        // boss+Healer surface: 2 players, a 10x8 grid, the healer def, placement counters (kept out of `calls` so tier-2 expectations stay exact)
        playerCount: 2, w: 10, h: 8, turretById: new Map([['healer', { id: 'healer', cost: 125 }]]), placeCalls: 0, nextTowerId: 100, nextEnemyId: 1 });
    }
    setMap(i) { if (o.setMapThrows) throw new Error('setMap boom'); this.currentMap = maps[i]; }
    setupStress() {
      this.enemies = [];
      this.towers = Array.from({ length: 20 }, (_, i) => (o.noTowerHp ? { i } : { i, hp: 10 }));
      if (o.tier2) {
        // actual-style towers: id/owner/def.upgrades/tier/maxHp/invested; tier is guarded so direct writes are detectable
        this.towers = Array.from({ length: 20 }, (_, i) => {
          const def = { id: 'pulse', upgrades: [{ name: 'u1', cost: 100 + i }, { name: 'u2', cost: o.nanCost && i === 3 ? NaN : 200 + i }] };
          const t = { id: i + 1, owner: i % 2, def, hp: 100, maxHp: 100, invested: 50, priority: o.towerInitPrio && i === 4 ? o.towerInitPrio : 'first', x: i % 10, y: 1 + 2 * Math.floor(i / 10) };
          let tier = o.badBaseTier && i === 5 ? 1 : 0;
          Object.defineProperty(t, 'tier', { enumerable: true, get: () => tier, set: v => { if (!this._upgrading) this.directTierWrites++; tier = v; } });
          return t;
        });
        this.credits = [500, 750.5];
        this.ledger = { granted: 1000, spent: 20 };
      }
      this.mode = 'stress'; this.paused = false; this.over = null; this.time = 0;
      for (const g of this.stressWave.groups) for (let i = 0; i < g.count; i++) this.enemies.push({ def: swarmer, dead: false });
      return { towers: 20, enemies: this.enemies.length };
    }
    towerById(id) { return this.towers.find(t => t.id === id); }
    grant(owner, amount) {
      this.calls.grant++;
      if (o.grantNoopAfter !== undefined && this.calls.grant > o.grantNoopAfter) return; // a grant that silently does nothing
      this.credits[owner] += amount; this.ledger.granted += amount;
    }
    check(owner, id, x, y, ignoreFunds) {
      const def = this.turretById.get(id);
      if (!def) return { ok: false, reason: 'unknown-turret' };
      if (o.noLegalCells) return { ok: false, reason: 'reserved' };
      if (x < 0 || y < 0 || x >= this.w || y >= this.h) return { ok: false, reason: 'outside' };
      if (this.towers.some(t => t.x === x && t.y === y)) return { ok: false, reason: 'occupied' };
      if (id === 'healer' && this.towers.some(t => t.owner === owner && t.def.id === 'healer')) return { ok: false, reason: 'healer-limit' };
      if (!ignoreFunds && this.credits[owner] + 1e-9 < def.cost) return { ok: false, reason: 'funds' };
      return { ok: true, reason: 'ok', cost: def.cost };
    }
    tryPlace(owner, id, x, y) {
      this.placeCalls++;
      const r = this.check(owner, id, x, y);
      if (!r.ok) return r;
      if (o.placeNoop) return r; // reports ok but places nothing
      const def = this.turretById.get(id);
      this.credits[owner] -= def.cost; this.ledger.spent += def.cost;
      this.towers.push({ id: this.nextTowerId++, def, owner, x, y, tier: 0, hp: 100, maxHp: 100, priority: o.healerInitPrio || 'first' });
      return r;
    }
    // Real contract: returns false for an unknown id, otherwise sets t.priority and returns true. Counted outside `calls` so tier-2 expectations stay exact.
    setTowerPriority(id, priority) {
      this.prioCalls = (this.prioCalls || 0) + 1;
      if (o.prioThrows) throw new Error('priority boom');
      const t = this.towerById(id);
      if (!t || (o.prioFalseAt && this.prioCalls === o.prioFalseAt)) return false;
      if (!o.prioNoop) t.priority = priority;
      if (o.prioMutate === 'wallet') this.credits[0] += 1;
      if (o.prioMutate === 'hp') t.hp += 1;
      if (o.prioMutate === 'healer') this.towers.filter(h => h.def.id === 'healer').forEach(h => { h.priority = priority; });
      if (o.prioMutate === 'ledger') this.ledger.refunded = (this.ledger.refunded || 0) + 1; // a scalar ledger field other than granted/spent
      if (o.prioMutate === 'swap' && this.prioCalls === 3) { // replace one live tower with a same-id clone: count, id and priority all look right
        const i = this.towers.indexOf(t);
        this.towers[i] = Object.assign(Object.create(Object.getPrototypeOf(t)), t, { priority });
      }
      return true;
    }
    canUpgrade(id) {
      this.calls.canUpgrade++;
      const t = this.towerById(id);
      if (!t) return { ok: false, reason: 'not-found' };
      const u = t.def.upgrades[t.tier];
      if (!u) return { ok: false, reason: 'max-tier' };
      if (o.refuseUpgrade) return { ok: false, reason: 'funds', cost: u.cost };
      if (this.credits[t.owner] + 1e-9 < u.cost) return { ok: false, reason: 'funds', cost: u.cost, upgrade: u };
      return { ok: true, reason: 'ok', cost: u.cost, upgrade: u };
    }
    upgradeTower(id) {
      this.calls.upgradeTower++;
      if (o.upgradeThrowsAt && this.calls.upgradeTower === o.upgradeThrowsAt) throw new Error('upgrade boom');
      const c = this.canUpgrade(id);
      if (!c.ok) return { ok: false, reason: c.reason, cost: c.cost };
      const t = this.towerById(id);
      this.credits[t.owner] -= c.cost; this.ledger.spent += c.cost; t.invested += c.cost;
      if (o.noAdvance) return { ok: true, reason: 'ok', cost: c.cost, tier: t.tier + 1, name: c.upgrade.name };
      this._upgrading = true; t.tier++; this._upgrading = false;
      if (t.tier === 1) { t.maxHp = 130; t.hp = Math.min(t.maxHp, t.hp + 30); } else if (t.tier === 2) { t.maxHp = 165; t.hp = Math.min(t.maxHp, t.hp + 35); }
      return { ok: true, reason: 'ok', cost: c.cost, tier: t.tier, name: c.upgrade.name };
    }
    spawnEnemy(def, cx, cy) {
      if (o.dropSpawns) return {};
      // refill-time fixture hp write (outside the original step): must never be counted as recovery
      if (o.refillHpBump && this.towers[0] && Number.isFinite(this.towers[0].hp)) this.towers[0].hp += 1;
      const e = { id: o.nanBossId && def.boss ? NaN : this.nextEnemyId++, bossPhase: 0, def, cx, cy, dead: false, maxHp: o.nanSpawnHp ? NaN : def.hp * (def.boss && o.bossHpScale ? o.bossHpScale : (o.hpScale || 1)), maxShield: o.nanSpawnShield ? NaN : def.shield || 0, speedScale: o.nanSpeedScale ? NaN : 1, isSplitChild: false };
      if (o.mechanic === 'biolab-mutate-regen') { e.hp = def.hp / 2; e.slowT = 0; e.burnT = 0; } // damaged, regen-eligible pathogens
      if (o.bioRefillBump && this.enemies[10] && Number.isFinite(this.enemies[10].hp)) this.enemies[10].hp += 1; // refill-time hp write: outside the original step
      this.enemies.push(e);
      this.spawned.push({ map: this.currentMap.id, def, cx, cy });
      return e;
    }
    // Real Game.damageEnemy contract (private prototype method): records this/args, returns a value, may throw.
    damageEnemy(e, dmg, owner, opts, tower) {
      this.dmgThis = this; this.lastDamageArgs = [e, dmg, owner, opts, tower];
      if (o.damageThrows && tower) throw new Error('damage boom');
      return 'dmg:' + dmg;
    }
    step(dt) {
      if (this.paused || this.over) return;
      this.steps++;
      this.time += dt;
      // actual-mechanic scripts (only when o.mechanic is set); mechUntilStep limits evidence to the first N steps (warmup-only)
      const on = o.mechUntilStep === undefined || this.steps <= o.mechUntilStep, phase = o.mechUntilStep !== undefined || this.steps % 10 < 3;
      if (o.mechanic === 'cyber-emp-chain') {
        this.empActive = o.badState ? 'yes' : on && phase; this.empTimer = o.badState ? NaN : 1;
        if (on && o.chain !== 'none') {
          const es = this.enemies, pulse = { id: 7, def: { id: 'pulse' } };
          this.lastRet = this.damageEnemy(es[0], 1, 0, {}, pulse);
          if (o.chain !== 'single') this.damageEnemy(es[1], 1, 0, {}, pulse);
          this.damageEnemy(es[0], 1, 0, {}, pulse); // same enemy again: deduplicated
          this.damageEnemy(es[2], 1, 0, {}, { id: 8, def: { id: 'plasma' } }); // other tower: ignored
          this.damageEnemy(es[3], 1, 0, {}); // no tower (burn tick style): ignored
        }
      }
      if (o.mechanic === 'volcano-lava-geyser') {
        if (!o.noActiveFx) { this.meteors[0].active = on; this.fireZones[0].active = on; }
        if (on && this.steps % 10 === 0) this.emitSound('meteor-impact');
      }
      if (o.mechanic === 'biolab-mutate-regen') {
        this.mutationActive = o.badState ? undefined : on && phase; this.mutationTimer = 1;
        if (o.bio === 'removedGain') this.enemies.slice(0, 3).forEach(e => { if (!e.def.boss) e.hp += 1; }); // gain on enemies the step then removes
      }
      for (let i = 0, k = 0; i < this.enemies.length && k < 3; i++) if (!this.enemies[i].def.boss) { this.enemies[i].dead = true; k++; } // combat never kills the boss on its own
      this.enemies = this.enemies.filter(e => !e.dead);
      if (o.mechanic === 'biolab-mutate-regen') {
        if (on && o.bio === 'regen') this.enemies.slice(10, 15).forEach(e => { e.hp = Math.min(e.maxHp, e.hp + 0.5); });
        if (o.bio === 'replace') { const e = this.enemies[10]; this.enemies[10] = { ...e, hp: e.hp + 2 }; } // same id, different object
        if (o.bio === 'dies') { const e = this.enemies[10]; e.hp += 2; e.dead = true; } // regen-eligible before the step, dead (still listed) after it
        if (this.steps <= (o.splitCueUntilStep === undefined ? Infinity : o.splitCueUntilStep) && o.splitPerStep) this.emitSound('centipede-split');
      }
      if (o.bossKillEvery && this.steps % o.bossKillEvery === 0) this.enemies = this.enemies.filter(e => !e.def.boss);
      if (o.bossPhaseAtStep && this.steps === o.bossPhaseAtStep) {
        const b = this.enemies.find(e => e.def.boss);
        if (b) { b.bossPhase = 1; this.emitSound('boss-phase'); }
      }
      if (o.dupBoss || o.foreignBoss || o.badPhase !== undefined) {
        const b = this.enemies.find(e => e.def.boss);
        if (b && !this.malformDone) {
          this.malformDone = true;
          if (o.dupBoss) this.enemies.push({ ...b, id: this.nextEnemyId++ }); // second canonical dreadnought
          if (o.foreignBoss) {
            const foreign = { id: this.nextEnemyId++, bossPhase: 0, def: { id: 'other-boss', hp: 50, shield: 0, boss: true }, dead: false, maxHp: 50, maxShield: 0, speedScale: 1, isSplitChild: false };
            if (o.foreignBoss === 'replace') this.enemies = this.enemies.filter(e => e !== b);
            this.enemies.push(foreign);
          }
          if (o.badPhase !== undefined) b.bossPhase = o.badPhase;
        }
      }
      if (o.hpGain && this.towers[0]) this.towers[0].hp += this.steps % 2 ? 4 : -4; // hp rises with NO healer unit anywhere
      if (o.reverseTowers) this.towers.reverse(); // reorder only: no hp change
      if (o.swapTower && this.towers.length > 3 && this.steps > 1) {
        const old = this.towers[3]; // different tower (new id, higher hp) at the same index every step
        this.towers[3] = { id: this.nextTowerId++, def: old.def, owner: old.owner, x: old.x, y: old.y, tier: 0, hp: old.hp + 500, maxHp: old.maxHp + 500 };
      }
      if (o.healer) {
        // Healer units appear once the Healer stations exist (the real game spawns them when a defense is damaged); activity is scripted per mode.
        const hs = this.towers.filter(t => t.def && t.def.id === 'healer');
        if (hs.length) this.hsteps = (this.hsteps || 0) + 1; // steps since the Healer stations exist
        const abil = !o.abilityUntilStep || this.hsteps <= o.abilityUntilStep; // warmup-only ability when set (hp/phase evidence stops afterwards)
        if (o.flashPhaseAt && hs.length) {
          const b = this.enemies.find(e => e.def.boss);
          if (b && this.hsteps === o.flashPhaseAt) { b.bossPhase = 1; this.emitSound('boss-phase'); }
          if (b && this.hsteps === o.flashPhaseAt + 1) b.bossPhase = 0;
        }
        if (hs.length && !this.healerUnits) {
          this.healerUnits = hs.map((h, i) => ({ active: true, kind: 'healer', owner: h.owner, towerId: h.id, id: 900 + i, targetTowerId: this.towers[i].id }));
          if (o.healer === 'dupTarget') this.healerUnits[1].targetTowerId = this.healerUnits[0].targetTowerId;
          if (o.healer === 'dupOwner') this.healerUnits.push({ active: true, kind: 'healer', owner: hs[0].owner, towerId: hs[0].id, id: 950, targetTowerId: this.towers[2].id });
          this.knights.push(...this.healerUnits);
        }
        const t0 = this.towers[0];
        // 'masked': damage and healing land in the SAME step (net change <= 0); otherwise alternate -4 / +4 (net recovery 4 on odd steps)
        if (!abil) { /* no more hp evidence */ } else if (o.healer === 'masked') t0.hp = Math.min(t0.maxHp, t0.hp - 5 + 4);
        else t0.hp = this.steps % 2 === 0 ? t0.hp - 4 : Math.min(t0.maxHp, t0.hp + 4);
      }
      const splits = o.splitPerStep === true ? 5 : (o.splitPerStep || 0);
      for (let i = 0; i < splits; i++) this.enemies.push({ def: swarmer, dead: false, isSplitChild: true });
      if (o.theater) {
        this.emitSound('roomba-sweep');
        if (this.steps % 5 === 0) this.emitSound('meteor-warn');
        if (this.steps % 10 === 0) this.emitSound('weird-new-cue');
      }
      if (o.towerLoss && this.steps % 10 === 0 && this.towers.length > 0) this.towers.pop();
      if (o.towerLoss) this.towers.forEach(t => { t.hp -= 0.01; });
      // destroyed towers REMAIN in game.towers with hp 0 (real Mars/medieval behaviour)
      if (o.disableAllAtStep && this.steps >= o.disableAllAtStep) this.towers.forEach(t => { t.hp = 0; });
      if (o.nanLivesAtStep && this.steps >= o.nanLivesAtStep) this.lives = NaN;
      if (o.nanTowerHpAtStep && this.steps >= o.nanTowerHpAtStep && this.towers.length > 0) this.towers[0].hp = NaN;
      if (o.writeScoreOnStep) localStorage.setItem(SCORE_KEY, '{"v":2}');
      if (o.overAfterSteps && this.steps >= o.overAfterSteps) this.over = 'lost';
    }
  }
  const game = new FakeGame();
  if (o.theater) {
    // canonical-style enemy defs (+ a boss that must never be used) and the effect arrays/sound hook the real Game has
    for (const [id, hp] of [['scout', 5], ['swarmer', 9], ['cruiser', 40], ['frigate', 60], ['phase', 25]]) game.enemyById.set(id, { id, hp, shield: id === 'phase' ? 8 : 0, boss: false });
    game.enemyById.set('dreadnought', { id: 'dreadnought', hp: 900, shield: 0, boss: true });
    game.meteors = [{ active: true }, { active: false }, { active: false }];
    game.knights = [{ active: true, kind: 'knight' }, { active: true, kind: 'roomba' }, { active: false, kind: 'roomba' }, { active: false, kind: 'knight' }];
    game.fireZones = [{ active: true }, { active: false }];
    if (o.mechanic === 'volcano-lava-geyser') Object.assign(game.fireZones[0], o.fz === 'plasma' ? { owner: 0, towerId: 5 } : { owner: -1, towerId: 0 }); // geyser (environmental) vs tower-owned plasma
    game.soundQueue = [];
    if (!o.noEmitSound) FakeGame.prototype.emitSound = function (ev) { this.soundQueue.push(ev); };
    if (o.noActiveFx) { game.meteors.forEach(m => { m.active = false; }); game.fireZones.forEach(z => { z.active = false; }); }
  }
  if (o.noDamage) game.damageEnemy = undefined;
  if (o.noSpawnEnemy) game.spawnEnemy = undefined;
  if (o.noUpgradeTower) game.upgradeTower = undefined;
  if (o.noTryPlace) game.tryPlace = undefined;
  if (o.noSetPriority) game.setTowerPriority = undefined;
  let muted = false;
  const renderer = Object.assign(Object.create({ update() {} }), { isMuted: () => muted, app: { renderer: { gl: null, type: 1 } } });
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
    'unknown profile': { profile: 'raid' },
    'non-string profile': { profile: 1 },
    'explicit sustained keeps the 10s sample cap': { profile: 'sustained', sampleMs: 10001 },
    'theater sample above 30s': { profile: 'theater', sampleMs: 30001 },
    'theater two maps at 25s': { profile: 'theater', mapIds: ['a', 'b'], warmupMs: 1000, sampleMs: 25000 },
    'towerTier 2 with the default (sustained) profile': { towerTier: 2 },
    'towerTier 2 with explicit sustained': { profile: 'sustained', towerTier: 2 },
    'towerTier 1': { profile: 'theater', towerTier: 1 },
    'towerTier -1': { profile: 'theater', towerTier: -1 },
    'towerTier 2.5': { profile: 'theater', towerTier: 2.5 },
    'towerTier string': { profile: 'theater', towerTier: '2' },
    'towerTier NaN': { profile: 'theater', towerTier: NaN },
    'towerTier null': { profile: 'theater', towerTier: null },
    'towerTier 3': { profile: 'theater', towerTier: 3 },
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
    // theater: 25 s sample + 1 s warm-up on one map, and the 30 s per-map maximum, pass validation
    for (const o of [{ warmupMs: 1000, sampleMs: 25000 }, { warmupMs: 0, sampleMs: 30000 }]) {
      const b = makeBrowser(makeWorld(), { gotoThrows: true });
      const e = await rejection(loadHarness()(b.existingPage, { profile: 'theater', mapIds: ['orbital-crossing'], ...o }));
      expect(e.kind).toBe('method-failure');
      expect(b.log.contextsCreated).toBe(1);
    }
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

  it('default profile adds no theater evidence and restores Math.random even if setMap throws (seeded before setMap)', async () => {
    const world = makeWorld({ setMapThrows: true });
    const { log, existingPage } = makeBrowser(world);
    const err = await rejection(loadHarness()(existingPage, FAST));
    expect(err.kind).toBe('method-failure');
    expect(vm.runInContext('Math.random', world.ctx)).toBe(world.origRandom);
    expect(log.contextsClosed).toBe(1);
    const ok = await loadHarness()(makeBrowser(makeWorld()).existingPage, FAST);
    expect(ok.profile).toBe('sustained');
    expect(ok.scenarios[0].effects).toBeUndefined();
    expect(ok.scenarios[0].composition).toBeUndefined();
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

describe('theater tier-2 towers (opt-in towerTier: 2)', () => {
  const T2 = { mapIds: ['orbital-crossing'], profile: 'theater', towerTier: 2, warmupMs: 300, sampleMs: 1000 };
  const T0 = { ...T2, towerTier: 0 };
  const noOwn = (world, key) => expect(Object.prototype.hasOwnProperty.call(world.game, key)).toBe(false);
  const untouched = world => { expect(world.game.steps).toBe(0); expect(world.game.mode).not.toBe('stress'); };

  it('default towerTier 0 (explicit or omitted) never calls the upgrade API and records no upgrade audit', async () => {
    for (const opts of [{ ...T0 }, (({ towerTier, ...rest }) => rest)(T2)]) {
      const world = makeWorld({ theater: true, tier2: true });
      const r = await loadHarness()(makeBrowser(world).existingPage, opts);
      expect(r.failures).toEqual([]);
      expect(r.config.towerTier).toBe(0);
      expect(r.towerTier).toBe(0);
      expect(r.comparability).not.toMatch(/tier-2/i);
      const s = r.scenarios[0];
      expect(s.towerTier).toBe(0);
      expect(s.towerUpgrade).toBeUndefined();
      expect(s.scenarioLabel).toBeUndefined();
      expect(s.towers.tier).toBe(0);
      expect(world.game.calls).toEqual({ grant: 0, canUpgrade: 0, upgradeTower: 0 });
      expect(world.game.towers.every(t => t.tier === 0)).toBe(true);
      expect(world.game.credits).toEqual([500, 750.5]);
    }
  }, 20000);

  it('upgrades all 20 towers to tier 2 through exactly 40 real upgradeTower calls with exact grants (wallet net unchanged, ledger reconciles)', async () => {
    const world = makeWorld({ theater: true, tier2: true });
    const r = await loadHarness()(makeBrowser(world).existingPage, T2);
    expect(r.failures).toEqual([]);
    expect(r.valid).toBe(true);
    expect(r.config.towerTier).toBe(2);
    expect(r.towerTier).toBe(2);
    expect(r.comparability).toMatch(/tier-2.*NOT comparable to canonical tier-0/i);
    expect(r.disclosures.join(' ')).toMatch(/TIER-2/);
    const s = r.scenarios[0];
    expect(s.towerTier).toBe(2);
    expect(s.scenarioLabel).toMatch(/tier-2/);
    expect(s.towers.tier).toBe(2);
    expect(r.warnings.join('\n')).toMatch(/TIER-2 towers/);
    const u = s.towerUpgrade;
    const total = 20 * 300 + 2 * 190; // sum of (100+i)+(200+i) over 20 towers
    expect(u.ok).toBe(true);
    expect(u.canonicalFixture).toEqual({ setup: { towers: 20, enemies: 150 }, towers: 20, enemies: 150 });
    expect([u.attemptedUpgrades, u.succeededUpgrades, u.upgradeCalls, u.grantCalls, u.canUpgradeCalls]).toEqual([40, 40, 40, 40, 40]);
    expect(u.totalCost).toBe(total);
    expect(u.totalGranted).toBe(total);
    expect(u.before.tierCounts).toEqual({ 0: 20 });
    expect(u.after.tierCounts).toEqual({ 2: 20 });
    expect([u.before.hp, u.before.maxHp]).toEqual([2000, 2000]);
    expect([u.after.hp, u.after.maxHp]).toEqual([3300, 3300]); // upgradeTower raised maxHp to 165 each
    expect(u.wallet.before).toEqual([500, 750.5]);
    expect(u.wallet.after).toEqual([500, 750.5]);
    expect(u.ledger.before).toEqual({ granted: 1000, spent: 20 });
    expect(u.ledger.grantedDelta).toBe(total);
    expect(u.ledger.spentDelta).toBe(total);
    // the game really did it: API call counts, no direct tier writes, net wallet unchanged
    expect(world.game.calls).toEqual({ grant: 40, canUpgrade: 80, upgradeTower: 40 });
    expect(world.game.directTierWrites).toBe(0);
    expect(world.game.towers.every(t => t.tier === 2 && t.maxHp === 165)).toBe(true);
    expect(world.game.credits).toEqual([500, 750.5]);
    expect(world.game.ledger).toEqual({ granted: 1000 + total, spent: 20 + total });
    // cue evidence is still the harness's own observation, unaffected by the tier choice
    expect(s.effects.sample.cues['roomba-sweep']).toBe(s.effects.sample.steps);
    expect(s.composition.initialMixed.types).toEqual({ scout: 30, swarmer: 30, cruiser: 30, frigate: 30, phase: 30 });
    noOwn(world, 'emitSound'); noOwn(world, 'step');
    expect(vm.runInContext('Math.random', world.ctx)).toBe(world.origRandom);
  }, 20000);

  it.each([
    ['missing upgradeTower method', { noUpgradeTower: true }, /upgradeTower is not a function/, 0],
    ['non-finite canonical upgrade cost', { nanCost: true }, /finite positive costs/, 0],
    ['a tower that is not base tier', { badBaseTier: true }, /not base tier/, 0],
    ['canUpgrade refusing after an exact grant', { refuseUpgrade: true }, /canUpgrade refused/, 0],
    ['upgradeTower reporting ok without advancing the tier', { noAdvance: true }, /did not advance/, 1],
  ])('is an explicit invalid, unmeasured scenario for %s (no fallback, no simulation)', async (_name, w, re, upgradeCalls) => {
    const world = makeWorld({ theater: true, tier2: true, ...w });
    const r = await loadHarness()(makeBrowser(world).existingPage, T2);
    expect(r.valid).toBe(false);
    expect(r.failures.join('\n')).toMatch(re);
    expect(r.scenarios[0].measured).toBe(false);
    expect(r.scenarios[0].valid).toBe(false);
    expect(r.scenarios[0].effects).toBeUndefined();
    expect(world.game.calls.upgradeTower).toBe(upgradeCalls); // (the fake app ticker may step after setupStress; the harness measured nothing)
    expect(world.game.directTierWrites).toBe(0);
    noOwn(world, 'emitSound'); noOwn(world, 'step');
    expect(vm.runInContext('Math.random', world.ctx)).toBe(world.origRandom);
    if (w.noUpgradeTower) untouched(world); // method checks run before setMap/setupStress
  }, 20000);

  it('restores Math.random and every patch when upgradeTower throws part-way', async () => {
    const world = makeWorld({ theater: true, tier2: true, upgradeThrowsAt: 7 });
    const { existingPage, log } = makeBrowser(world);
    const r = await loadHarness()(existingPage, T2);
    expect(r.valid).toBe(false);
    expect(r.failures.join('\n')).toMatch(/upgrade API threw.*upgrade boom/);
    expect(r.scenarios[0].measured).toBe(false);
    expect(r.scenarios[0].towerUpgrade.ok).toBe(false);
    expect(r.scenarios[0].towerUpgrade.succeededUpgrades).toBe(6);
    expect(r.disclosures.join('\n')).not.toContain('all 20 canonical towers were upgraded');
    expect(log.contextsClosed).toBe(1);
    expect(world.game.calls.upgradeTower).toBe(7);
    noOwn(world, 'emitSound'); noOwn(world, 'step');
    expect(Object.prototype.hasOwnProperty.call(world.renderer, 'update')).toBe(false);
    expect(vm.runInContext('Math.random', world.ctx)).toBe(world.origRandom);
  }, 20000);
});

describe('theater profile (opt-in variable workload)', () => {
  const THEATER = { mapIds: ['orbital-crossing'], profile: 'theater', warmupMs: 300, sampleMs: 1000 };
  const FIVE = ['scout', 'swarmer', 'cruiser', 'frigate', 'phase'];
  const noOwn = (world, key) => expect(Object.prototype.hasOwnProperty.call(world.game, key)).toBe(false);

  it('replaces the canonical swarmer fixture with an even canonical non-boss mix and keeps a floor, never exact', async () => {
    const world = makeWorld({ theater: true });
    const protoEmit = Object.getPrototypeOf(world.game).emitSound;
    const r = await loadHarness()(makeBrowser(world).existingPage, THEATER);
    expect(r.failures).toEqual([]);
    expect(r.valid).toBe(true);
    expect(r.profile).toBe('theater');
    expect(r.comparability).toMatch(/NOT comparable/);
    expect(r.disclosures.join(' ')).toMatch(/THEATER/);
    const s = r.scenarios[0];
    expect(s.setup).toEqual({ towers: 20, enemies: 150 }); // canonical baseline validated first
    expect(s.composition.canonicalInitial).toEqual({ swarmer: 150 });
    expect(s.composition.initialMixed.types).toEqual({ scout: 30, swarmer: 30, cruiser: 30, frigate: 30, phase: 30 });
    expect(s.composition.initialMixed.ports).toEqual([75, 75]);
    expect(s.composition.bossesIncluded).toBe(false);
    expect(s.composition.nonCanonicalSpawns).toBe(0);
    expect(Object.keys(s.composition.sampleReplacements.types).every(id => FIVE.includes(id))).toBe(true);
    expect(s.composition.sampleReplacements.ports.every(n => n > 0)).toBe(true);
    expect(world.game.spawned.every(e => FIVE.includes(e.def.id))).toBe(true);
    expect(Object.keys(s.population.endTypeCounts).sort()).toEqual([...FIVE].sort());
    expect([s.population.postRefillMin, s.population.preStepMin]).toEqual([150, 150]);
    expect(s.population.floor).toBe(150);
    expect(s.population.overflowCap).toBe(450);
    expect(s.population.fixtureHalted).toBe(false);
    // window evidence: active vs pool capacity, per-window cues counted from emitSound calls
    for (const w of [s.effects.warmup, s.effects.sample]) {
      expect(w.steps).toBeGreaterThan(5);
      expect([w.meteorsMax, w.knightsMax, w.roombasMax, w.fireZonesMax]).toEqual([1, 1, 1, 1]);
      expect([w.meteorPool, w.knightPool, w.fireZonePool]).toEqual([3, 4, 2]);
      expect(w.cues['roomba-sweep']).toBe(w.steps);
      expect(w.cues['meteor-warn']).toBeGreaterThan(0);
      expect(w.cues.other).toBeGreaterThan(0); // unknown keys are bucketed, never dropped
      expect(w.typeMin.scout).toBeGreaterThan(0);
      expect(w.typeMax.scout).toBeGreaterThanOrEqual(w.typeMin.scout);
    }
    expect(s.effects.cueNote).toMatch(/not proof of damage/);
    // original emitSound ran unaltered (queue untouched; ticker may add more after restore), then everything is restored
    const counted = [s.effects.warmup, s.effects.sample].reduce((a, w) => a + w.cueCalls, 0);
    expect(world.game.soundQueue.length).toBeGreaterThanOrEqual(counted);
    expect(world.game.soundQueue).toContain('roomba-sweep');
    noOwn(world, 'emitSound'); noOwn(world, 'step');
    expect(world.game.emitSound).toBe(protoEmit);
    expect(vm.runInContext('Math.random', world.ctx)).toBe(world.origRandom);
    expect(s.scores.unchanged).toBe(true);
  }, 20000);

  it('keeps natural split children (never trims them) below the 3x overflow cap and reports them', async () => {
    const world = makeWorld({ theater: true, splitPerStep: 4 }); // +1 net per step
    const r = await loadHarness()(makeBrowser(world).existingPage, THEATER);
    expect(r.failures).toEqual([]);
    const s = r.scenarios[0];
    expect(s.valid).toBe(true);
    expect(s.population.endEnemies).toBeGreaterThan(150);
    expect(s.population.naturalExtraMax).toBeGreaterThan(0);
    expect(s.population.postCombatMax).toBeGreaterThan(150);
    expect(s.population.overflowSteps).toBeGreaterThan(0);
    expect(s.population.overflowMax).toBeLessThanOrEqual(450);
    expect(s.effects.sample.splitChildMax).toBeGreaterThan(0);
    expect(s.population.postRefillMin).toBeGreaterThanOrEqual(150);
  }, 20000);

  it('overflow beyond 3x target marks the run invalid and halts the fixture instead of growing unbounded', async () => {
    const world = makeWorld({ theater: true, splitPerStep: 304 }); // +301 once: cross 450 on the first step, independent of host timer cadence
    const r = await loadHarness()(makeBrowser(world).existingPage, THEATER);
    expect(r.valid).toBe(false);
    expect(r.failures.join('\n')).toMatch(/overflow cap 450/);
    expect(r.scenarios[0].population.fixtureHalted).toBe(true);
    expect(world.game.paused).toBe(true);
    expect(world.game.enemies.length).toBeLessThan(480);
    noOwn(world, 'emitSound'); noOwn(world, 'step');
  }, 20000);

  it('allows and reports real tower loss in theater only (sustained still demands the constant 20)', async () => {
    const t = await loadHarness()(makeBrowser(makeWorld({ theater: true, towerLoss: true })).existingPage, THEATER);
    expect(t.failures).toEqual([]);
    const s = t.scenarios[0];
    expect(s.towers.initial).toBe(20);
    expect(s.towers.end).toBeLessThan(20);
    expect(s.towers.sampleMin).toBeLessThan(s.towers.sampleMax);
    expect(Number.isFinite(s.towers.sampleHpMin) && s.towers.sampleHpMin > 0).toBe(true);
    expect(s.towers.environmentalLossAllowed).toBe(true);
    expect(t.warnings.join('\n')).toMatch(/towers were lost/);
    const u = await loadHarness()(makeBrowser(makeWorld({ towerLoss: true })).existingPage, FAST);
    expect(u.valid).toBe(false);
    expect(u.failures.join('\n')).toMatch(/tower count changed/);
  }, 20000);

  it('reports operational (hp > 0) towers: all 20 objects stay placed with hp 0 yet the run warns and reports 0 operational', async () => {
    const world = makeWorld({ theater: true, disableAllAtStep: 20 });
    const r = await loadHarness()(makeBrowser(world).existingPage, THEATER);
    expect(r.failures).toEqual([]);
    const s = r.scenarios[0];
    expect(s.towers.end).toBe(20); // placed count unchanged
    expect(s.towers.placed.end).toBe(20);
    expect(s.towers.sampleMin).toBe(20);
    expect(s.towers.operational.end).toBe(0);
    expect(s.towers.operational.warmup.max).toBe(20);
    expect(s.towers.operational.sample.min).toBe(0);
    expect(s.towers.operational.sample.end).toBe(0);
    expect(s.towers.hp.end).toBe(0);
    expect(s.towers.hp.warmup.max).toBeGreaterThan(0);
    const w = r.warnings.join('\n');
    expect(w).toMatch(/operational towers \(hp > 0\) dropped/);
    expect(w).toMatch(/ALL towers were destroyed\/disabled/);
    expect(w).not.toMatch(/towers were lost \(removed/); // nothing was removed from the array
    for (const k of ['towerOperationalMin', 'towerOperationalMax', 'towerOperationalEnd']) expect(s.effects.sample[k]).not.toBeUndefined();
  }, 20000);

  it('missing tower hp is unavailable (invalid), never silently 0 operational', async () => {
    const r = await loadHarness()(makeBrowser(makeWorld({ theater: true, noTowerHp: true })).existingPage, THEATER);
    expect(r.valid).toBe(false);
    expect(r.failures.join('\n')).toMatch(/finite hp on every tower/);
    expect(r.scenarios[0].measured).toBe(false);
  }, 20000);

  it('non-finite state invalidates the run: NaN spawned hp/shield/speedScale, NaN lives, NaN tower hp', async () => {
    for (const o of [{ nanSpawnHp: true }, { nanSpawnShield: true }, { nanSpeedScale: true }]) {
      const t = await loadHarness()(makeBrowser(makeWorld({ theater: true, ...o })).existingPage, THEATER);
      expect(t.valid, JSON.stringify(o)).toBe(false);
      expect(t.failures.join('\n')).toMatch(/invalid numeric state/);
      expect(t.scenarios[0].composition.invalidSpawns).toBeGreaterThan(0);
    }
    // finiteness is also enforced by the sustained profile (NaN would otherwise slip past canonical comparisons)
    const s = await loadHarness()(makeBrowser(makeWorld({ nanSpawnHp: true })).existingPage, FAST);
    expect(s.valid).toBe(false);
    expect(s.failures.join('\n')).toMatch(/invalid numeric state/);

    const lives = await loadHarness()(makeBrowser(makeWorld({ theater: true, nanLivesAtStep: 3 })).existingPage, THEATER);
    expect(lives.valid).toBe(false);
    expect(lives.failures.join('\n')).toMatch(/lives is non-finite/);
    const sl = await loadHarness()(makeBrowser(makeWorld({ nanLivesAtStep: 3 })).existingPage, FAST);
    expect(sl.valid).toBe(false);
    expect(sl.failures.join('\n')).toMatch(/lives is non-finite/);

    const hp = await loadHarness()(makeBrowser(makeWorld({ theater: true, nanTowerHpAtStep: 3 })).existingPage, THEATER);
    expect(hp.valid).toBe(false);
    expect(hp.failures.join('\n')).toMatch(/tower hp missing or non-finite/);
    expect(hp.scenarios[0].towers.hpUnavailableSteps).toBeGreaterThan(0);
    expect(hp.scenarios[0].towers.operational.sample.end).toBeNull();
    expect(hp.scenarios[0].towers.hp.sample.end).toBeNull();
  }, 40000);

  it('hp scaling, boss defs and missing emitSound are explicit invalid results, not silent claims', async () => {
    const scaled = await loadHarness()(makeBrowser(makeWorld({ theater: true, hpScale: 2 })).existingPage, THEATER);
    expect(scaled.valid).toBe(false);
    expect(scaled.failures.join('\n')).toMatch(/non-canonical/);

    const bossWorld = makeWorld({ theater: true });
    bossWorld.game.enemyById.get('scout').boss = true;
    const boss = await loadHarness()(makeBrowser(bossWorld).existingPage, THEATER);
    expect(boss.valid).toBe(false);
    expect(boss.failures.join('\n')).toMatch(/scout.*boss/);
    expect(bossWorld.game.steps).toBe(0);

    const mute = makeWorld({ theater: true, noEmitSound: true });
    const r = await loadHarness()(makeBrowser(mute).existingPage, THEATER);
    expect(r.valid).toBe(false);
    expect(r.failures.join('\n')).toMatch(/emitSound.*missing/);
    expect(r.scenarios[0].measured).toBe(false);
    expect(r.scenarios[0].effects).toBeUndefined();
    expect(mute.game.mode).toBe('normal');
  }, 20000);

  it('protects best scores and restores emitSound/step/random when the page throws mid-measurement', async () => {
    const written = await loadHarness()(makeBrowser(makeWorld({ theater: true, writeScoreOnStep: true })).existingPage, THEATER);
    expect(written.valid).toBe(false);
    expect(written.failures.join('\n')).toMatch(/best-score/);

    const world = makeWorld({ theater: true, rafThrows: true });
    const err = await rejection(loadHarness()(makeBrowser(world).existingPage, THEATER));
    expect(err.message).toMatch(/raf boom/);
    noOwn(world, 'emitSound'); noOwn(world, 'step');
    expect(Object.prototype.hasOwnProperty.call(world.renderer, 'update')).toBe(false);
    expect(vm.runInContext('Math.random', world.ctx)).toBe(world.origRandom);

    const early = makeWorld({ theater: true, setMapThrows: true });
    await rejection(loadHarness()(makeBrowser(early).existingPage, THEATER));
    expect(vm.runInContext('Math.random', early.ctx)).toBe(early.origRandom);
    noOwn(early, 'emitSound');
  }, 20000);
});

describe('theater boss+Healer fixture (opt-in bossHealer)', () => {
  const BH = { mapIds: ['ironhold-keep'], profile: 'theater', towerTier: 2, bossHealer: true, warmupMs: 300, sampleMs: 1000 };
  const noOwn = (world, key) => expect(Object.prototype.hasOwnProperty.call(world.game, key)).toBe(false);
  const world0 = o => makeWorld({ theater: true, tier2: true, ...o });
  const restored = world => {
    noOwn(world, 'emitSound'); noOwn(world, 'step');
    expect(Object.prototype.hasOwnProperty.call(world.renderer, 'update')).toBe(false);
    expect(vm.runInContext('Math.random', world.ctx)).toBe(world.origRandom);
  };

  const badCombos = {
    'non-boolean string': { ...BH, bossHealer: 'true' },
    'non-boolean number': { ...BH, bossHealer: 1 },
    'null': { ...BH, bossHealer: null },
    'default (sustained) profile': { mapIds: ['ironhold-keep'], bossHealer: true },
    'explicit sustained profile': { profile: 'sustained', mapIds: ['ironhold-keep'], bossHealer: true, towerTier: 2 },
    'theater without tier-2 towers': { ...BH, towerTier: undefined },
    'theater with explicit tier 0': { ...BH, towerTier: 0 },
    'a non-Mars/Keep map': { ...BH, mapIds: ['orbital-crossing'] },
    'a naval map': { ...BH, mapIds: ['pacific-fleet'] },
    'one good and one wrong map': { ...BH, mapIds: ['mars-outpost', 'kitchen-raid'], warmupMs: 0, sampleMs: 5000 },
    'an unknown map id': { ...BH, mapIds: ['no-such-map'] },
  };
  it.each(Object.entries(badCombos))('rejects bossHealer with %s before creating a context or touching the page', async (_name, opts) => {
    const { log, existingPage } = makeBrowser(world0());
    const err = await rejection(loadHarness()(existingPage, opts));
    expect(err.kind).toBe('invalid-options');
    expect(log.contextsCreated).toBe(0);
    expect(log.existingTouched).toBe(0);
  });

  it('accepts bossHealer on both canonical maps (Mars, Keep) and defaults it to false', async () => {
    for (const mapIds of [['mars-outpost'], ['ironhold-keep']]) {
      const b = makeBrowser(world0(), { gotoThrows: true });
      const e = await rejection(loadHarness()(b.existingPage, { ...BH, mapIds }));
      expect(e.kind).toBe('method-failure'); // got past validation
      expect(b.log.contextsCreated).toBe(1);
    }
    const r = await loadHarness()(makeBrowser(makeWorld()).existingPage, FAST);
    expect(r.config.bossHealer).toBe(false);
  });

  it('leaves default sustained and tier-2 theater untouched when bossHealer is omitted or false', async () => {
    for (const extra of [{}, { bossHealer: false }]) {
      const world = world0();
      const r = await loadHarness()(makeBrowser(world).existingPage, { ...BH, ...extra, bossHealer: extra.bossHealer === undefined ? undefined : false });
      expect(r.failures).toEqual([]);
      expect(r.config.bossHealer).toBe(false);
      const s = r.scenarios[0];
      expect(s.bossHealer).toBeUndefined();
      expect(s.bossHealerFixture).toBeUndefined();
      expect(s.composition.bossesIncluded).toBe(false);
      expect(s.towers.initial).toBe(20);
      expect(s.towers.end).toBe(20);
      expect(world.game.placeCalls).toBe(0);
      expect(world.game.spawned.some(e => e.def.id === 'dreadnought')).toBe(false);
      expect(r.comparability).not.toMatch(/boss\+Healer/i);
      expect(r.disclosures.join(' ')).not.toMatch(/BOSS\+HEALER/);
      expect(r.disclosures.join(' ')).toMatch(/no boss is covered/);
    }
    const sustained = await loadHarness()(makeBrowser(makeWorld()).existingPage, FAST);
    expect(sustained.failures).toEqual([]);
    expect(sustained.scenarios[0].bossHealer).toBeUndefined();
  }, 20000);

  it('adds exactly 2 Healers via grant + tryPlace (22 towers, reconciled), keeps one live boss in the floor, and records observed evidence', async () => {
    const world = world0({ healer: 'net', bossPhaseAtStep: 5 });
    const r = await loadHarness()(makeBrowser(world).existingPage, BH);
    expect(r.failures).toEqual([]);
    expect(r.valid).toBe(true);
    expect(r.config.bossHealer).toBe(true);
    expect(r.comparability).toMatch(/SEPARATE boss\+Healer.*NOT comparable/);
    expect(r.disclosures.join(' ')).toMatch(/BOSS\+HEALER/);
    expect(r.warnings.join('\n')).toMatch(/BOSS\+HEALER fixture/);
    const s = r.scenarios[0];
    expect(s.scenarioLabel).toMatch(/boss\+Healer workload/i);
    expect(s.towerUpgrade.ok).toBe(true);
    // fixture audit: the 20 tier-2 upgrades happened first (40 grants), then exactly 2 grants + 2 tryPlace calls
    const f = s.bossHealerFixture;
    expect(f.ok).toBe(true);
    expect(f.cost).toBe(125);
    expect([f.grantCalls, f.tryPlaceCalls, f.totalGranted, f.totalCost]).toEqual([2, 2, 250, 250]);
    expect([f.towersBefore, f.towersAfter]).toEqual([20, 22]);
    expect(f.placements.map(p => [p.owner, p.x, p.y, p.cost])).toEqual([[0, 0, 0, 125], [1, 1, 0, 125]]); // deterministic: nearest free cell, then row, then column
    expect(f.wallet.before).toEqual([500, 750.5]);
    expect(f.wallet.after).toEqual([500, 750.5]);
    expect([f.ledger.grantedDelta, f.ledger.spentDelta]).toEqual([250, 250]);
    expect(f.declaredFixtureDifference).toMatch(/22 towers/);
    expect(world.game.calls.grant).toBe(42);
    expect(world.game.placeCalls).toBe(2);
    expect(world.game.directTierWrites).toBe(0);
    expect(world.game.towers.filter(t => t.def.id === 'healer').map(t => t.owner)).toEqual([0, 1]);
    // tower accounting is for 22 towers; healer units are never counted as knights
    expect(s.towers.initial).toBe(22);
    expect(s.towers.placed.end).toBe(22);
    expect(s.towers.operational.end).toBe(22);
    expect(s.towers.sampleMin).toBe(22);
    expect(s.towers.healerStations).toBe(2);
    expect(s.effects.sample.knightsMax).toBe(1);
    // boss counts within the floor; composition = 1 boss + 149 cycling mixed enemies
    expect(s.composition.bossesIncluded).toBe(true);
    expect(s.composition.initialMixed.types).toEqual({ dreadnought: 1, scout: 30, swarmer: 30, cruiser: 30, frigate: 30, phase: 29 });
    expect(s.composition.nonCanonicalSpawns).toBe(0);
    expect(s.population.postRefillMin).toBeGreaterThanOrEqual(150);
    expect(s.population.endTypeCounts.dreadnought).toBe(1);
    // observed evidence
    const b = s.bossHealer;
    expect(b.label).toMatch(/NOT comparable/);
    expect(b.bossSpawnsByHarness).toBe(1);
    for (const w of [b.warmup, b.sample]) {
      expect([w.bossPresentMin, w.bossPresentMax, w.uniqueBossesObserved, w.stepsWithoutBoss]).toEqual([1, 1, 1, 0]);
      expect([w.healersActiveMax, w.healerOwnersMax, w.healerTargetsMax]).toEqual([2, 2, 2]);
      expect([w.duplicateOwnerSteps, w.duplicateTargetSteps]).toEqual([0, 0]);
      expect(w.netRecoveryHp % 4).toBe(0);
      expect(w.netRecoveryHp).toBeGreaterThan(0);
      expect([w.affectedTowersMax, w.affectedTowersDistinct]).toEqual([1, 1]);
    }
    // `coverage` is an alias of the SAMPLE window verdict; the single boss-phase cue lands in warmup or sample
    expect(b.coverage).toEqual(b.sampleCoverage);
    expect(b.coverage.window).toBe('sample');
    expect(b.coverage).toMatchObject({ bossPhaseObserved: true, maxBossPhase: 1, healerRepairObserved: true, activeHealerUnitsObserved: true, complete: true, missing: [] });
    expect(b.warmupCoverage.bossPhaseCues + b.sampleCoverage.bossPhaseCues).toBe(1);
    expect(b.coverage.netRecoveryHp).toBeGreaterThan(0);
    expect(b.coverage.healerAttributedRecoveryHp).toBe(b.coverage.netRecoveryHp); // healers existed on every gain step
    expect(b.coverage.gainWithoutHealerHp).toBe(0);
    expect(b.singleCanonicalBoss).toBe(true);
    expect(b.bossAuditViolations).toBe(0);
    expect(s.scores.unchanged).toBe(true);
    restored(world);
  }, 20000);

  it('re-spawns the boss only once none is live, counts it in the floor, and stays within the 3x overflow cap with natural extras', async () => {
    const world = world0({ bossKillEvery: 7, splitPerStep: 4 }); // boss removed every 7th step; +1 natural extra per step
    const r = await loadHarness()(makeBrowser(world).existingPage, BH);
    expect(r.failures).toEqual([]);
    const s = r.scenarios[0];
    const b = s.bossHealer;
    const bossSpawns = world.game.spawned.filter(e => e.def.boss).length;
    expect(bossSpawns).toBeGreaterThan(2);
    expect(b.bossSpawnsByHarness).toBe(bossSpawns); // never more than one replacement per absence
    expect(b.warmup.uniqueBossesObserved + b.sample.uniqueBossesObserved).toBeGreaterThan(2);
    for (const w of [b.warmup, b.sample]) expect([w.bossPresentMin, w.bossPresentMax, w.stepsWithoutBoss]).toEqual([1, 1, 0]);
    expect(s.population.endTypeCounts.dreadnought).toBe(1); // recorded inside the run (the app ticker keeps stepping afterwards)
    expect(s.population.postRefillMin).toBeGreaterThanOrEqual(150);
    expect(s.population.naturalExtraMax).toBeGreaterThan(0);
    expect(s.population.overflowMax).toBeLessThanOrEqual(450);
    expect(s.population.fixtureHalted).toBe(false);
    // missing phases / healing are reported as missing coverage, not as success
    expect(b.coverage.complete).toBe(false);
    expect(b.coverage.missing).toEqual(['boss phase', 'healer repair (net tower HP recovery)']);
    expect(r.warnings.join('\n')).toMatch(/COVERAGE MISSING: no boss phase/);
    expect(r.warnings.join('\n')).toMatch(/COVERAGE MISSING: no healer repair/);
    restored(world);
  }, 20000);

  it.each([
    ['a duplicate canonical boss', { dupBoss: true }, /boss audit at step afterRefill.*live=2 canonical=2 foreign=0/, true],
    ['an extra foreign boss def', { foreignBoss: true }, /boss audit at step afterRefill.*live=2 canonical=1 foreign=1/, true],
    ['a foreign boss replacing the canonical one', { foreignBoss: 'replace' }, /boss audit at step entry.*live=1 canonical=0 foreign=1/, true],
    ['a non-finite boss id', { nanBossId: true }, /badId=1/, false],
    ['bossPhase 3 (outside 0..2)', { badPhase: 3 }, /badPhase=1/, false],
    ['a fractional bossPhase', { badPhase: 1.5 }, /badPhase=1/, false],
    ['a negative bossPhase', { badPhase: -1 }, /badPhase=1/, false],
  ])('never claims a single canonical boss with %s', async (_name, w, re, _both) => {
    const world = world0(w);
    const r = await loadHarness()(makeBrowser(world).existingPage, BH);
    expect(r.valid).toBe(false);
    expect(r.failures.join('\n')).toMatch(re);
    const b = r.scenarios[0].bossHealer;
    expect(b.singleCanonicalBoss).toBe(false);
    expect(b.bossAuditViolations).toBeGreaterThan(0);
    // an invalid bossPhase is never counted as observed phase coverage
    if (w.badPhase !== undefined) { expect(b.sampleCoverage.bossPhaseObserved).toBe(false); expect(b.sampleCoverage.maxBossPhase).toBe(0); }
    restored(world);
  }, 20000);

  it('allows a momentary zero boss right after combat (refilled to exactly one) without a violation, counted separately', async () => {
    const world = world0({ bossKillEvery: 7 });
    const r = await loadHarness()(makeBrowser(world).existingPage, BH);
    expect(r.failures).toEqual([]);
    const b = r.scenarios[0].bossHealer;
    expect(b.warmup.postCombatNoBossSteps + b.sample.postCombatNoBossSteps).toBeGreaterThan(0);
    expect(b.singleCanonicalBoss).toBe(true);
    expect(b.bossAuditViolations).toBe(0);
    for (const w of [b.warmup, b.sample]) expect([w.entryBossViolations, w.afterRefillBossViolations, w.stepsWithoutBoss]).toEqual([0, 0, 0]);
    restored(world);
  }, 20000);

  it('warmup-only boss phase and healer repair never claim SAMPLED coverage (coverage aliases the sample window)', async () => {
    // phase flashes at healer-step 2 and hp evidence stops after healer-step 5: both fall inside the ~300 ms warmup, none in the sample
    const world = world0({ healer: 'net', flashPhaseAt: 2, abilityUntilStep: 5 });
    const r = await loadHarness()(makeBrowser(world).existingPage, BH);
    expect(r.failures).toEqual([]); // missing coverage is a warning, not an unreliable-timing failure
    expect(r.valid).toBe(true);
    const b = r.scenarios[0].bossHealer;
    expect(b.warmupCoverage).toMatchObject({ window: 'warmup', bossPhaseObserved: true, healerRepairObserved: true, complete: true, missing: [] });
    expect(b.sampleCoverage).toMatchObject({ window: 'sample', bossPhaseObserved: false, healerRepairObserved: false, complete: false, missing: ['boss phase', 'healer repair (net tower HP recovery)'] });
    expect(b.sampleCoverage.activeHealerUnitsObserved).toBe(true); // healers present, but no repair in the sample
    expect(b.coverage).toEqual(b.sampleCoverage);
    expect(r.warnings.join('\n')).toMatch(/COVERAGE MISSING: no boss phase was observed in the SAMPLE window/);
    expect(r.warnings.join('\n')).toMatch(/COVERAGE MISSING: no healer repair .* SAMPLE window/);
    restored(world);
  }, 20000);

  it('positive tower HP with NO active healer is not healer coverage (reported separately)', async () => {
    const world = world0({ hpGain: true, bossPhaseAtStep: 3 });
    const r = await loadHarness()(makeBrowser(world).existingPage, BH);
    expect(r.failures).toEqual([]);
    const b = r.scenarios[0].bossHealer;
    expect(b.sample.healersActiveMax).toBe(0);
    expect(b.sample.netRecoveryHp).toBeGreaterThan(0);
    expect(b.sample.healerGainHp).toBe(0);
    expect(b.sample.gainWithoutHealerHp).toBe(b.sample.netRecoveryHp);
    expect(b.sampleCoverage.healerRepairObserved).toBe(false);
    expect(b.sampleCoverage.gainWithoutHealerHp).toBeGreaterThan(0);
    expect(b.coverage.missing).toContain('healer repair (net tower HP recovery)');
    expect(r.warnings.join('\n')).toMatch(/COVERAGE MISSING: no healer repair/);
    restored(world);
  }, 20000);

  it('does not count HP written during the pre/post refill (spawnEnemy mock mutates tower HP) as recovery', async () => {
    const world = world0({ refillHpBump: true });
    const r = await loadHarness()(makeBrowser(world).existingPage, BH);
    expect(r.failures).toEqual([]);
    const b = r.scenarios[0].bossHealer;
    expect(world.game.towers[0].hp).toBeGreaterThan(100); // the mutations really happened
    for (const w of [b.warmup, b.sample]) expect([w.netRecoveryHp, w.healerGainHp, w.gainWithoutHealerHp, w.affectedTowersMax]).toEqual([0, 0, 0, 0]);
    expect(b.sampleCoverage.healerRepairObserved).toBe(false);
    restored(world);
  }, 20000);

  it('matches towers by stable id: reordering counts nothing; a replaced tower (new id, higher hp) is unobserved, not recovery', async () => {
    const reordered = world0({ reverseTowers: true });
    const r1 = await loadHarness()(makeBrowser(reordered).existingPage, BH);
    expect(r1.failures).toEqual([]);
    const b1 = r1.scenarios[0].bossHealer;
    for (const w of [b1.warmup, b1.sample]) expect([w.netRecoveryHp, w.hpStepsUnobserved]).toEqual([0, 0]);
    restored(reordered);

    const swapped = world0({ swapTower: true });
    const r2 = await loadHarness()(makeBrowser(swapped).existingPage, BH);
    const b2 = r2.scenarios[0].bossHealer;
    for (const w of [b2.warmup, b2.sample]) expect(w.netRecoveryHp).toBe(0);
    expect(b2.warmup.hpStepsUnobserved + b2.sample.hpStepsUnobserved).toBeGreaterThan(0);
    restored(swapped);
  }, 30000);

  it('says the harness never repairs towers (real Healers can) for bossHealer, and keeps the plain wording otherwise', async () => {
    const world = world0({ towerLoss: true });
    const r = await loadHarness()(makeBrowser(world).existingPage, BH);
    const all = JSON.stringify([r.disclosures, r.warnings, r.scenarios[0].towers.note, r.scenarios[0].towerUpgrade.note]);
    expect(all).not.toMatch(/never repaired|not repaired|are not repaired|towers not repaired/);
    expect(r.disclosures.join(' ')).toMatch(/never repairs or freezes towers \(real Healer units can repair\/revive them\)/);
    expect(r.scenarios[0].towers.note).toMatch(/harness never repairs or freezes towers \(real Healer units may repair\/revive them\)/);
    restored(world);

    const plain = makeWorld({ theater: true, tier2: true });
    const r2 = await loadHarness()(makeBrowser(plain).existingPage, { ...BH, bossHealer: false });
    expect(r2.scenarios[0].towers.note).toMatch(/towers are never repaired/);
  }, 30000);

  it('overflow beyond the 3x cap with a boss still halts the fixture and marks the run invalid', async () => {
    const world = world0({ splitPerStep: 304 });
    const r = await loadHarness()(makeBrowser(world).existingPage, BH);
    expect(r.valid).toBe(false);
    expect(r.failures.join('\n')).toMatch(/overflow cap 450/);
    expect(r.scenarios[0].population.fixtureHalted).toBe(true);
    restored(world);
  }, 20000);

  it('reports NET recovery only: active healers alone, or damage masking healing in the same step, are not healing proof', async () => {
    const world = world0({ healer: 'masked' });
    const r = await loadHarness()(makeBrowser(world).existingPage, BH);
    expect(r.failures).toEqual([]); // missing coverage is a finding, not an invalid measurement
    const b = r.scenarios[0].bossHealer;
    expect(b.sample.healersActiveMax).toBe(2);
    expect(b.warmup.netRecoveryHp + b.sample.netRecoveryHp).toBe(0);
    expect(b.coverage.healerRepairObserved).toBe(false);
    expect(b.coverage.activeHealerUnitsObserved).toBe(true);
    expect(b.coverage.missing).toContain('healer repair (net tower HP recovery)');
    expect(b.recoveryNote).toMatch(/NET recovery, not total healing/);
    expect(r.warnings.join('\n')).toMatch(/COVERAGE MISSING: no healer repair/);
  }, 20000);

  it.each([
    ['a duplicate live healer owner', { healer: 'dupOwner' }, /duplicate live healer owner/, 'duplicateOwnerSteps'],
    ['a duplicate nonzero healer target claim', { healer: 'dupTarget' }, /duplicate nonzero healer target claim/, 'duplicateTargetSteps'],
  ])('flags %s as an explicit invariant problem', async (_name, w, re, counter) => {
    const world = world0(w);
    const r = await loadHarness()(makeBrowser(world).existingPage, BH);
    expect(r.valid).toBe(false);
    expect(r.failures.join('\n')).toMatch(re);
    const b = r.scenarios[0].bossHealer;
    expect(b.warmup[counter] + b.sample[counter]).toBeGreaterThan(0);
    restored(world);
  }, 20000);

  it('fails a non-canonical boss (hp scaled) explicitly, naming the boss', async () => {
    const world = world0({ bossHpScale: 2 });
    const r = await loadHarness()(makeBrowser(world).existingPage, BH);
    expect(r.valid).toBe(false);
    expect(r.failures.join('\n')).toMatch(/spawned dreadnought has non-canonical hp/);
    expect(r.scenarios[0].composition.nonCanonicalSpawns).toBeGreaterThan(0);
    restored(world);
  }, 20000);

  const setupFailures = [
    ['no legal empty Healer cell', { noLegalCells: true }, /no legal empty cell/, 0, 40],
    ['tryPlace reporting ok without placing', { placeNoop: true }, /did not grow by exactly 1/, 1, 41],
    ['a grant that does nothing (ledger does not reconcile)', { grantNoopAfter: 40 }, /ledger granted\/spent deltas do not reconcile/, 2, 42],
    ['a failed tier-2 upgrade (Healers never attempted)', { refuseUpgrade: true }, /canUpgrade refused/, 0, 1],
  ];
  it.each(setupFailures)('is an unmeasured scenario with a reason for %s (no fallback)', async (_name, w, re, placeCalls, grantCalls) => {
    const world = world0(w);
    const r = await loadHarness()(makeBrowser(world).existingPage, BH);
    expect(r.valid).toBe(false);
    expect(r.failures.join('\n')).toMatch(re);
    const s = r.scenarios[0];
    expect(s.measured).toBe(false);
    expect(s.valid).toBe(false);
    expect(s.effects).toBeUndefined();
    expect(s.bossHealer).toBeUndefined();
    expect(world.game.placeCalls).toBe(placeCalls);
    expect(world.game.calls.grant).toBe(grantCalls);
    expect(world.game.spawned.some(e => e.def.boss)).toBe(false); // no boss fixture without the Healer fixture
    restored(world);
  }, 20000);

  it('refuses a map whose mechanic is not Mars/Keep, and missing internals, before simulating', async () => {
    const wrong = world0();
    wrong.game.data.maps[2].mechanic = 'kitchen-rush';
    const r = await loadHarness()(makeBrowser(wrong).existingPage, BH);
    expect(r.valid).toBe(false);
    expect(r.failures.join('\n')).toMatch(/map mechanic "kitchen-rush"/);
    expect(r.scenarios[0].measured).toBe(false);
    expect(wrong.game.placeCalls).toBe(0);
    restored(wrong);

    const noPlace = world0({ noTryPlace: true });
    const r2 = await loadHarness()(makeBrowser(noPlace).existingPage, BH);
    expect(r2.valid).toBe(false);
    expect(r2.failures.join('\n')).toMatch(/tryPlace is not a function/);
    expect(noPlace.game.mode).toBe('normal'); // method checks run before setMap/setupStress
    expect(noPlace.game.steps).toBe(0);

    const noBoss = world0();
    noBoss.game.enemyById.delete('dreadnought');
    const r3 = await loadHarness()(makeBrowser(noBoss).existingPage, BH);
    expect(r3.valid).toBe(false);
    expect(r3.failures.join('\n')).toMatch(/canonical boss def "dreadnought" not found/);
    expect(noBoss.game.mode).toBe('normal');
  }, 30000);

  it('restores every patch and Math.random when the page throws mid-measurement', async () => {
    const world = world0({ rafThrows: true });
    const err = await rejection(loadHarness()(makeBrowser(world).existingPage, BH));
    expect(err.message).toMatch(/raf boom/);
    restored(world);
  }, 20000);

  describe('bossPriority (opt-in focused-boss targeting)', () => {
    const badPriority = {
      'an unsupported value': { ...BH, bossPriority: 'weak' },
      'an unsupported TargetPriority (close)': { ...BH, bossPriority: 'close' },
      'a non-string': { ...BH, bossPriority: 1 },
      'null': { ...BH, bossPriority: null },
      'bossHealer omitted (even "first")': { ...BH, bossHealer: undefined, bossPriority: 'first' },
      'bossHealer false': { ...BH, bossHealer: false, bossPriority: 'strong' },
      'default sustained profile': { mapIds: ['ironhold-keep'], bossPriority: 'strong' },
    };
    it.each(Object.entries(badPriority))('rejects bossPriority with %s before creating a context or touching the page', async (_name, opts) => {
      const { log, existingPage } = makeBrowser(world0());
      const err = await rejection(loadHarness()(existingPage, opts));
      expect(err.kind).toBe('invalid-options');
      expect(err.message).toMatch(/bossPriority|bossHealer/);
      expect(log.contextsCreated).toBe(0);
      expect(log.existingTouched).toBe(0);
    });

    it('defaults to "first" with zero setTowerPriority calls, for omitted and explicit "first"', async () => {
      for (const extra of [{}, { bossPriority: 'first' }]) {
        const world = world0({ healer: 'net' });
        const r = await loadHarness()(makeBrowser(world).existingPage, { ...BH, ...extra });
        expect(r.failures).toEqual([]);
        expect(r.config.bossPriority).toBe('first');
        expect(world.game.prioCalls || 0).toBe(0);
        const p = r.scenarios[0].bossPriority;
        expect([p.requested, p.effective, p.setCalls, p.succeededCalls, p.ok]).toEqual(['first', 'first', 0, 0, true]);
        expect(world.game.towers.every(t => t.priority === 'first')).toBe(true);
        expect(r.comparability).not.toMatch(/strong/);
        expect(r.scenarios[0].scenarioLabel).not.toMatch(/strong/);
      }
      const plain = await loadHarness()(makeBrowser(makeWorld()).existingPage, FAST);
      expect(plain.config.bossPriority).toBe('first');
      expect(plain.scenarios[0].bossPriority).toBeUndefined();
    }, 20000);

    it('strong calls the real setTowerPriority once per upgraded attack tower (never Healers) and reports a distinct workload without claiming coverage', async () => {
      const world = world0({ healer: 'net' });
      const r = await loadHarness()(makeBrowser(world).existingPage, { ...BH, bossPriority: 'strong' });
      expect(r.failures).toEqual([]);
      expect(r.valid).toBe(true);
      expect(r.config.bossPriority).toBe('strong');
      const s = r.scenarios[0];
      const p = s.bossPriority;
      expect([p.requested, p.effective, p.setCalls, p.succeededCalls, p.ok]).toEqual(['strong', 'strong', 20, 20, true]);
      expect(world.game.prioCalls).toBe(20);
      expect(p.targetTowerIds).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
      expect(p.finalPriorities).toEqual(Array(20).fill('strong'));
      expect(p.healerPriorities).toEqual({ before: ['first', 'first'], after: ['first', 'first'] });
      expect(Object.values(p.unchanged).every(Boolean)).toBe(true);
      expect(world.game.towers.filter(t => t.def.id === 'healer').every(t => t.priority === 'first')).toBe(true);
      expect(world.game.towers.filter(t => t.def.id !== 'healer').every(t => t.priority === 'strong')).toBe(true);
      expect(world.game.calls).toEqual({ grant: 42, canUpgrade: 80, upgradeTower: 40 }); // priority setup spends/grants nothing
      expect(world.game.directTierWrites).toBe(0);
      expect(s.bossHealer.priority).toEqual(p);
      expect(s.scenarioLabel).toMatch(/20 canonical towers requested set to Strong priority \(DISTINCT workload/);
      expect(s.scenarioLabel + r.comparability + r.warnings.join(' ')).not.toMatch(/20 (boss-focused|attack)/);
      expect(r.comparability).toMatch(/DISTINCT workload.*NOT comparable/);
      expect(p.note).toMatch(/REQUESTED procedure.*RadialStasis\/KeepKnightStable bypass pickTarget/);
      expect(r.disclosures.join(' ')).toMatch(/NOT boss-phase coverage/);
      expect(r.warnings.join('\n')).toMatch(/BOSS PRIORITY strong/);
      // coverage stays driven only by observed phases: this world never reaches a boss phase
      expect(s.bossHealer.sampleCoverage.bossPhaseObserved).toBe(false);
      expect(s.bossHealer.sampleCoverage.missing).toContain('boss phase');
      restored(world);
    }, 20000);

    it.each([
      ['an attack tower not on first', { towerInitPrio: 'strong' }, /did not end on priority "first"/],
      ['a Healer not on first', { healerInitPrio: 'weak' }, /a Healer is not on priority "first"/],
    ])('default "first" inspects all 22 priorities and is unmeasured with effective null for %s (zero setter calls)', async (_name, w, re) => {
      const world = world0(w);
      const r = await loadHarness()(makeBrowser(world).existingPage, BH);
      expect(r.valid).toBe(false);
      expect(r.failures.join('\n')).toMatch(re);
      expect(world.game.prioCalls || 0).toBe(0);
      const s = r.scenarios[0];
      expect(s.measured).toBe(false);
      expect(s.bossPriority.effective).toBeNull();
      expect(s.bossPriority.ok).toBe(false);
      restored(world);
    }, 20000);

    it('default "first" populates finalPriorities (20) and healerPriorities (2) from inspection', async () => {
      const r = await loadHarness()(makeBrowser(world0({ healer: 'net' })).existingPage, BH);
      const p = r.scenarios[0].bossPriority;
      expect(p.finalPriorities).toEqual(Array(20).fill('first'));
      expect(p.healerPriorities).toEqual({ before: ['first', 'first'], after: ['first', 'first'] });
      expect(p.effective).toBe('first');
    }, 20000);

    const prioFailures = [
      ['a missing setTowerPriority method', { noSetPriority: true }, /setTowerPriority is not a function/, 0, 0], // method checks run before any fixture work (no Healer placement)
      ['a setter returning false part-way', { prioFalseAt: 7 }, /did not return true for tower 7/, 7, 2],
      ['a setter that throws', { prioThrows: true }, /setTowerPriority threw: priority boom/, 1, 2],
      ['a setter that does not apply the priority', { prioNoop: true }, /did not end on priority "strong"/, 20, 2],
      ['a setter that mutates the wallet', { prioMutate: 'wallet' }, /setup changed wallet/, 20, 2],
      ['a setter that mutates tower HP', { prioMutate: 'hp' }, /setup changed hp/, 20, 2],
      ['a setter that also retargets the Healers', { prioMutate: 'healer' }, /setup changed healerPriorities/, 20, 2],
      ['a Healer initially on a different priority', { healerInitPrio: 'weak' }, /a Healer is not on priority "first"/, 20, 2],
      ['a setter that changes a non-granted/spent ledger field', { prioMutate: 'ledger' }, /setup changed ledger/, 20, 2],
      ['a live tower replaced by a same-id clone (same count)', { prioMutate: 'swap' }, /no longer holds the original tower objects/, 20, 2],
    ];
    it.each(prioFailures)('is an unmeasured scenario with a reason for %s (no fallback)', async (_name, w, re, calls, placeCalls) => {
      const world = world0(w);
      const r = await loadHarness()(makeBrowser(world).existingPage, { ...BH, bossPriority: 'strong' });
      expect(r.valid).toBe(false);
      expect(r.failures.join('\n')).toMatch(re);
      const s = r.scenarios[0];
      expect(s.measured).toBe(false);
      expect(s.valid).toBe(false);
      expect(s.effects).toBeUndefined();
      expect(s.bossHealer).toBeUndefined();
      if (s.bossPriority) { expect(s.bossPriority.effective).toBeNull(); expect(s.bossPriority.ok).toBe(false); } // never "strong" on failure
      expect(world.game.prioCalls || 0).toBe(calls);
      expect(world.game.placeCalls).toBe(placeCalls);
      expect(world.game.spawned.some(e => e.def.boss)).toBe(false);
      restored(world);
    }, 20000);
  });
});

describe('theater actual-mechanic observation (cyber / volcano / bio)', () => {
  const T = { mapIds: ['orbital-crossing'], profile: 'theater', warmupMs: 500, sampleMs: 1000 };
  const go = async o => {
    const world = makeWorld({ theater: true, ...o });
    const r = await loadHarness()(makeBrowser(world).existingPage, T);
    return { world, r, s: r.scenarios[0] };
  };
  const noOwn = (world, key) => expect(Object.prototype.hasOwnProperty.call(world.game, key)).toBe(false);
  const CYBER = 'cyber-emp-chain', VOLCANO = 'volcano-lava-geyser', BIO = 'biolab-mutate-regen';

  it('adds nothing on default and other-mechanic theater maps and never wraps damageEnemy there', async () => {
    const { world, r, s } = await go({});
    expect(r.failures).toEqual([]);
    expect(s.mechanics).toBeUndefined();
    noOwn(world, 'damageEnemy');
    const keep = makeWorld({ theater: true });
    const rk = await loadHarness()(makeBrowser(keep).existingPage, { ...T, mapIds: ['ironhold-keep'] });
    expect(rk.scenarios[0].mechanics).toBeUndefined(); // medieval-frenzy is not an observed mechanic
    const sus = await loadHarness()(makeBrowser(makeWorld()).existingPage, FAST);
    expect(sus.scenarios[0].mechanics).toBeUndefined(); // sustained profile untouched
  }, 20000);

  it('cyber: observes real EMP state and pulse chain damageEnemy calls per canonical pulse tower, preserving this/args/return', async () => {
    const { world, r, s } = await go({ mechanic: CYBER });
    expect(r.failures).toEqual([]);
    expect(r.valid).toBe(true);
    const m = s.mechanics, w = m.sample;
    expect(m.kind).toBe(CYBER);
    expect(w.stateInvalidSteps).toBe(0);
    expect(w.activeSteps).toBeGreaterThan(0);
    expect(w.activeSteps).toBeLessThan(w.steps);
    expect(w.activeEntries).toBeGreaterThan(0);
    // 3 pulse-tower calls per step (2 distinct enemies + a repeat); the plasma tower and the tower-less call are ignored
    expect(w.pulseDamageCalls).toBe(3 * w.steps);
    expect(w.pulseTowerSteps).toBe(w.steps);
    expect(w.multiHitTowerSteps).toBe(w.steps);
    expect(w.maxDistinctEnemiesPerTower).toBe(2);
    expect(m.sampleCoverage.complete).toBe(true);
    expect(m.missing).toEqual([]);
    expect(m.notes.join(' ')).toMatch(/not proof damage was applied/);
    expect(s.warnings.join(' ')).toMatch(/inside the timed core step/i);
    expect(world.game.dmgThis).toBe(world.game);
    expect(world.game.lastRet).toBe('dmg:1');
    expect(world.game.lastDamageArgs.length).toBe(5);
    noOwn(world, 'damageEnemy'); noOwn(world, 'emitSound'); noOwn(world, 'step');
    expect(world.game.damageEnemy).toBe(Object.getPrototypeOf(world.game).damageEnemy); // the prototype method again, not the wrapper
  }, 20000);

  it('cyber: a single distinct enemy per tower is not multi-hit; missing coverage is a finding, not invalid timing', async () => {
    const { r, s } = await go({ mechanic: CYBER, chain: 'single' });
    expect(r.failures).toEqual([]);
    expect(s.valid).toBe(true);
    expect(s.mechanics.sample.multiHitTowerSteps).toBe(0);
    expect(s.mechanics.sample.maxDistinctEnemiesPerTower).toBe(1);
    expect(s.mechanics.sampleCoverage.empActiveObserved).toBe(true);
    expect(s.mechanics.missing.join(' ')).toMatch(/multi-enemy pulse chain/);
    expect(s.warnings.join(' ')).toMatch(/MECHANIC COVERAGE MISSING \(cyber-emp-chain\)/);
  }, 20000);

  it('cyber: damage calls outside the original step are ignored', async () => {
    const world = makeWorld({ theater: true, mechanic: CYBER, chain: 'none' });
    const pulse = { id: 7, def: { id: 'pulse' } };
    const poke = setInterval(() => { const es = world.game.enemies; if (es.length > 2) { world.game.damageEnemy(es[0], 1, 0, {}, pulse); world.game.damageEnemy(es[1], 1, 0, {}, pulse); } }, 5);
    let r;
    try { r = await loadHarness()(makeBrowser(world).existingPage, T); } finally { clearInterval(poke); }
    const w = r.scenarios[0].mechanics.sample;
    expect(w.pulseDamageCalls).toBe(0);
    expect(w.multiHitTowerSteps).toBe(0);
    expect(r.scenarios[0].mechanics.missing.join(' ')).toMatch(/multi-enemy pulse chain/);
  }, 20000);

  it('cyber: warmup-only EMP/chain evidence is never sampled coverage', async () => {
    const { s } = await go({ mechanic: CYBER, mechUntilStep: 5 });
    const m = s.mechanics;
    expect(m.warmupCoverage.complete).toBe(true);
    expect(m.sampleCoverage.complete).toBe(false);
    expect(m.sampleCoverage.empActiveObserved).toBe(false);
    expect(m.missing.length).toBe(2);
    expect(m.coverage).toEqual(m.sampleCoverage);
  }, 20000);

  it('cyber: missing/invalid state is null + missing (never 0 or active) and an absent observer is reported', async () => {
    const failed = await go({ mechanic: CYBER, badState: true });
    expect(failed.r.valid).toBe(false);
    expect(failed.r.failures.join(' ')).toMatch(/mechanic observation invalid/);
    const bad = failed.s.mechanics;
    expect(bad.sample.stateValidSteps).toBe(0);
    expect(bad.sample.stateInvalidSteps).toBe(bad.sample.steps);
    expect(bad.sample.activeSteps).toBeNull();
    expect(bad.sample.activeEntries).toBeNull();
    expect(bad.missing.join(' ')).toMatch(/EMP active state/);
    expect(bad.warnings.join(' ')).toMatch(/missing or non-finite/);
    const none = await go({ mechanic: CYBER, noDamage: true, chain: 'none' });
    expect(none.r.valid).toBe(false);
    expect(none.r.failures.join(' ')).toMatch(/game\.damageEnemy observer unavailable/);
    expect(none.s.mechanics.sampleCoverage.pulseChainObserverAvailable).toBe(false);
    expect(none.s.mechanics.missing.join(' ')).toMatch(/game\.damageEnemy unavailable/);
  }, 30000);

  it('cyber: restores damageEnemy (and the other patches) even when the wrapped call throws in every step', async () => {
    const { world, s } = await go({ mechanic: CYBER, damageThrows: true });
    expect(s.valid).toBe(false); // step errors are real invalid timing
    noOwn(world, 'damageEnemy'); noOwn(world, 'emitSound'); noOwn(world, 'step');
    expect(vm.runInContext('Math.random', world.ctx)).toBe(world.origRandom);
  }, 20000);

  it('volcano: scopes meteors/fire zones/meteor-impact cues to the actual mechanic and does not claim Forge Drones', async () => {
    const { r, s } = await go({ mechanic: VOLCANO });
    expect(r.failures).toEqual([]);
    const c = s.mechanics.sampleCoverage;
    expect(s.mechanics.kind).toBe(VOLCANO);
    expect(c.meteorActiveObserved && c.fireZoneActiveObserved).toBe(true);
    expect(c.meteorImpactCues).toBeGreaterThan(0);
    expect(c.complete).toBe(true);
    expect(JSON.stringify(s.mechanics)).not.toMatch(/forgeDrone/i);
    expect(s.mechanics.notes.join(' ')).toMatch(/Forge Drone presence is NOT observed or claimed/);
  }, 20000);

  it('volcano: cue-only (no active meteor / fire zone) and warmup-only evidence do not count as sampled coverage', async () => {
    const cues = (await go({ mechanic: VOLCANO, noActiveFx: true })).s.mechanics;
    expect(cues.sampleCoverage.meteorImpactCues).toBeGreaterThan(0); // emission alone ...
    expect(cues.missing).toEqual(['active meteor', 'active geyser fire zone (environmental: owner -1, towerId 0)']); // ... is not actual meteor/fire-zone evidence
    const warm = (await go({ mechanic: VOLCANO, mechUntilStep: 5 })).s.mechanics;
    expect(warm.warmupCoverage.meteorActiveObserved).toBe(true);
    expect(warm.sampleCoverage.complete).toBe(false);
    expect(warm.missing).toContain('active meteor');
  }, 30000);

  it('volcano: plasma (tower-owned) fire zones plus a meteor-impact cue cannot claim geyser fire-zone coverage; an environmental zone can', async () => {
    const plasma = (await go({ mechanic: VOLCANO, fz: 'plasma' })).s.mechanics;
    expect(plasma.sampleCoverage.fireZoneActiveObserved).toBe(true); // generic zone exists ...
    expect(plasma.sampleCoverage.geyserZoneActiveObserved).toBe(false); // ... but it is tower-owned
    expect(plasma.sampleCoverage.towerFireZonesMax).toBeGreaterThan(0);
    expect(plasma.sampleCoverage.meteorImpactCues).toBeGreaterThan(0);
    expect(plasma.sampleCoverage.complete).toBe(false);
    expect(plasma.missing.join(' ')).toMatch(/active geyser fire zone/);
    const geyser = (await go({ mechanic: VOLCANO })).s.mechanics.sampleCoverage;
    expect(geyser.geyserZoneActiveObserved).toBe(true);
    expect(geyser.geyserZonesMax).toBeGreaterThan(0);
    expect(geyser.towerFireZonesMax).toBe(0);
    expect(geyser.complete).toBe(true);
  }, 30000);

  it('bio: observes mutation state, natural splits and positive NET per-enemy HP recovery', async () => {
    const { world, r, s } = await go({ mechanic: BIO, bio: 'regen', splitPerStep: 4 });
    expect(r.failures).toEqual([]);
    const m = s.mechanics, w = m.sample;
    expect(m.kind).toBe(BIO);
    expect(w.activeSteps).toBeGreaterThan(0);
    expect(w.activeEntries).toBeGreaterThan(0);
    expect(w.netRegenHp).toBeGreaterThan(0);
    expect(w.netRegenSteps).toBeGreaterThan(0);
    expect(w.netRegenEnemiesDistinct).toBeGreaterThan(0);
    expect(w.eligibleEnemySteps).toBeGreaterThan(0);
    expect(m.sampleCoverage.splitChildObserved).toBe(true);
    expect(m.sampleCoverage.complete).toBe(true);
    expect(m.notes.join(' ')).toMatch(/not gross regen and not slow-suppression proof/);
    noOwn(world, 'damageEnemy');
  }, 20000);

  it.each([
    ['replaced enemy object reusing an id', { bio: 'replace' }],
    ['gain on enemies the step removes', { bio: 'removedGain' }],
    ['refill-time hp write outside the original step', { bio: 'none', bioRefillBump: true }],
  ])('bio: %s is never counted as regen even though enemies are regen-eligible', async (_n, o) => {
    const { r, s } = await go({ mechanic: BIO, ...o });
    expect(r.failures).toEqual([]);
    const w = s.mechanics.sample;
    expect(w.netRegenHp).toBe(0);
    expect(w.eligibleEnemySteps).toBeGreaterThan(0); // eligibility alone is never regen coverage
    expect(s.mechanics.sampleCoverage.netRegenObserved).toBe(false);
    expect(s.mechanics.missing.join(' ')).toMatch(/positive net per-enemy HP recovery/);
    if (o.bio === 'replace') expect(w.unobservedEnemies).toBeGreaterThan(0);
  }, 20000);

  it('bio: a warmup-only split cue with children persisting into the sample is missing sampled split; a genuine cue + child passes', async () => {
    const m = (await go({ mechanic: BIO, bio: 'regen', splitPerStep: 4, splitCueUntilStep: 5 })).s.mechanics;
    expect(m.sample.netRegenHp).toBeGreaterThan(0);
    expect(m.sampleCoverage.splitChildMax).toBeGreaterThan(0); // child persists in the sample ...
    expect(m.sampleCoverage.splitCues).toBe(0); // ... but no split EVENT happened there
    expect(m.sampleCoverage.splitChildObserved).toBe(false);
    expect(m.missing.join(' ')).toMatch(/natural split/);
    expect(m.warmupCoverage.splitChildObserved).toBe(true);
    const ok = (await go({ mechanic: BIO, bio: 'regen', splitPerStep: 4 })).s.mechanics.sampleCoverage;
    expect(ok.splitCues).toBeGreaterThan(0);
    expect(ok.splitChildObserved).toBe(true);
  }, 30000);

  it('bio: a regen-eligible enemy that dies during the step still counts as eligible (unobserved) but yields no regen', async () => {
    const { r, s } = await go({ mechanic: BIO, bio: 'dies' });
    expect(r.failures).toEqual([]);
    const w = s.mechanics.sample;
    expect(w.eligibleEnemySteps).toBeGreaterThan(0);
    expect(w.unobservedEnemies).toBeGreaterThan(0); // the by-value pre snapshot saw it; the dead post state makes it unobserved
    expect(w.netRegenHp).toBe(0);
    expect(s.mechanics.sampleCoverage.netRegenObserved).toBe(false);
  }, 20000);

  it('bio: warmup-only regen and missing mutation state are not sampled coverage', async () => {
    const warm = (await go({ mechanic: BIO, bio: 'regen', splitPerStep: 4, mechUntilStep: 5 })).s.mechanics;
    expect(warm.warmup.netRegenHp).toBeGreaterThan(0);
    expect(warm.sample.netRegenHp).toBe(0);
    expect(warm.sampleCoverage.complete).toBe(false);
    const failed = await go({ mechanic: BIO, badState: true });
    expect(failed.r.valid).toBe(false);
    expect(failed.r.failures.join(' ')).toMatch(/mechanic observation invalid/);
    const bad = failed.s.mechanics;
    expect(bad.sample.activeSteps).toBeNull();
    expect(bad.sample.stateInvalidSteps).toBe(bad.sample.steps);
    expect(bad.missing.join(' ')).toMatch(/mutation active state/);
  }, 30000);
});
