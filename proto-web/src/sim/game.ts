// Rendering-independent simulation: grid, routes, waves, weapons, economy.
import {
  DIFFICULTIES,
  WAVE_COUNTS,
  type Difficulty,
  type EnemyDef,
  type GameData,
  type GameSpeed,
  type MapDef,
  type SoundEvent,
  type TargetPriority,
  type TurretDef,
  type TurretUpgrade,
  type WaveCount,
  type WaveDef,
} from '../types';
import { hex } from '../data';
import { computeHitDamage, lineIntersectsCircle, pickTarget, predictIntercept } from './combat';
import { computeDist, DIRS, placementKeepsRoutes } from './grid';

export const OWNER_SHARE = 0.7;
export const SELL_RATE = 0.7;
export const STRESS_TOWERS = 20;

const PRIORITY_ORDER: ReadonlyArray<TargetPriority> = ['first', 'strong', 'close', 'air'];
const MAX_ACTIVE_PARTICLES = 120;

export type PlaceReason =
  | 'ok' | 'outside' | 'reserved' | 'asteroid' | 'occupied' | 'enemy'
  | 'funds' | 'blocks-path' | 'unknown-player' | 'unknown-turret' | 'over';
export interface PlaceResult { ok: boolean; reason: PlaceReason; cost?: number }

export interface Tower {
  id: number;
  def: TurretDef;
  owner: number;
  x: number;
  y: number;
  cooldown: number;
  tier: number;
  invested: number;
  priority: TargetPriority;
  aimAngle: number;
  kills: number;
  boosted: boolean;
  onWall: boolean;
  hp: number;
  maxHp: number;
  stableMaxCd?: number;
}

export interface Meteor {
  active: boolean;
  id: number;
  tx: number;
  ty: number;
  sx: number;
  sy: number;
  t: number;
  dur: number;
  radius: number;
  damage: number;
}

export interface TowerStats {
  damage: number;
  range: number;
  fireRate: number;
  splashRadius: number;
  slowFactor: number;
  slowDuration: number;
  shieldMultiplier: number;
  shieldStrip: number;
  pierceCount: number;
  missileCount: number;
  burnDps: number;
  burnDuration: number;
  targetsAir: boolean;
  armorPierce: boolean;
}

export interface Enemy {
  id: number;
  def: EnemyDef;
  x: number;
  y: number;
  vx: number;
  vy: number;
  cx: number;
  cy: number;
  nx: number;
  ny: number;
  hp: number;
  maxHp: number;
  shield: number;
  maxShield: number;
  shieldDelay: number;
  slowT: number;
  slowF: number;
  burnT: number;
  burnDps: number;
  burnOwner: number;
  bossPhase: number;
  ang: number;
  rem: number;
  ox: number;
  oy: number;
  dead: boolean;
  leaked: boolean;
  submerged: boolean;
  revealedT: number;
  enraged: boolean;
  isSplitChild: boolean;
  speedScale?: number;
  breathCooldown?: number;
  breathT?: number;
  breathTargetId?: number;
  breathTx?: number;
  breathTy?: number;
}

export interface SeaMine {
  active: boolean;
  x: number;
  y: number;
  damage: number;
  splash: number;
  burnDps: number;
  burnDuration: number;
  hitsSub: boolean;
  owner: number;
  towerId: number;
  ttl: number;
}

export interface Projectile {
  active: boolean;
  kind: 'plasma' | 'missile';
  x: number;
  y: number;
  vx: number;
  vy: number;
  tx: number;
  ty: number;
  targetId: number;
  speed: number;
  damage: number;
  splash: number;
  owner: number;
  color: number;
  burnDps: number;
  burnDuration: number;
  shieldMultiplier: number;
  towerId?: number;
  flaming?: boolean;
}

export interface Knight {
  active: boolean;
  kind: 'knight' | 'roomba';
  id: number;
  owner: number;
  towerId: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  damage: number;
  attackCd: number;
  speed: number;
  tier: number;
  life: number;
}

export interface FireZone {
  active: boolean;
  x: number;
  y: number;
  radius: number;
  dps: number;
  ttl: number;
  max: number;
  owner: number;
  towerId: number;
}

export interface Beam {
  active: boolean;
  kind: 'pulse' | 'rail' | 'overcharge';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;
  ttl: number;
  max: number;
  color: number;
}

export interface Ring {
  active: boolean;
  x: number;
  y: number;
  r: number;
  ttl: number;
  max: number;
  color: number;
}

export interface Particle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  ttl: number;
  max: number;
  size: number;
  color: number;
}

export interface Popup {
  active: boolean;
  x: number;
  y: number;
  vy: number;
  ttl: number;
  max: number;
  text: string;
  color: number;
}

interface Spawner {
  enemy: EnemyDef;
  remaining: number;
  interval: number;
  timer: number;
  spawnIndex: number;
  hpScale: number;
  speedScale: number;
}

interface HitOpts {
  armorPierce: boolean;
  shieldMultiplier: number;
  shieldStrip: number;
  burnDps: number;
  burnDuration: number;
}

function acquire<T extends { active: boolean }>(pool: T[], make: () => T): T {
  for (const p of pool) if (!p.active) return p;
  const p = make();
  pool.push(p);
  return p;
}

function turnToward(cur: number, target: number, maxDelta: number): number {
  let diff = target - cur;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  if (Math.abs(diff) <= maxDelta) return target;
  return cur + Math.sign(diff) * maxDelta;
}

export class Game {
  w: number;
  h: number;
  readonly turretById = new Map<string, TurretDef>();
  readonly enemyById = new Map<string, EnemyDef>();
  private readonly baseOrdinaryWaves: WaveDef[];
  ordinaryWaves: WaveDef[];
  readonly stressWave: WaveDef | undefined;
  waveCount: WaveCount = 10;
  overtimeStartWave = 10;
  overtimeWavesAdded = 0;
  playerCount: number;
  credits: number[] = [];
  lives = 0;
  asteroid: Uint8Array;
  reserved: Uint8Array;
  blocked: Uint8Array;
  boostMask: Uint8Array;
  wallMask: Uint8Array;
  towerAt: (Tower | null)[];
  towers: Tower[] = [];
  enemies: Enemy[] = [];
  spawners: Spawner[] = [];
  projectiles: Projectile[] = [];
  mines: SeaMine[] = [];
  knights: Knight[] = [];
  fireZones: FireZone[] = [];
  beams: Beam[] = [];
  rings: Ring[] = [];
  particles: Particle[] = [];
  popups: Popup[] = [];
  meteors: Meteor[] = [];
  dist: Int16Array;
  private queue: Int32Array;
  paused = true;
  over: 'won' | 'lost' | null = null;
  launched = false;
  mode: 'normal' | 'stress' = 'normal';
  waveCursor = 0;
  time = 0;
  speed: GameSpeed = 1;
  difficulty: Difficulty = 'medium';
  autoWave = false;
  autoWaveTimer = 0;
  lastEarlyBonus = 0;
  mapIndex = 0;
  currentMap: MapDef;
  mapVersion = 0;
  /** Monotonic id of the current match; bumped by every reset (restart, map, layout, difficulty). */
  runId = 0;
  stormActive = false;
  stormTimer = 22;
  meteorTimer = 3.2;
  private nextMeteorId = 1;
  private nextKnightId = 1;
  private recentMeteors: { x: number; y: number }[] = [];
  rushActive = false;
  rushTimer = 0;
  private nextId = 1;
  towerVersion = 0;
  pathVersion = 0;
  ledger = { start: 0, granted: 0, bounty: 0, refunded: 0, spent: 0 };
  stats = { kills: 0, leaks: 0, playerKills: [] as number[] };
  private soundQueue: SoundEvent[] = [];

  constructor(readonly data: GameData, playerCount = 2, difficulty: Difficulty = 'medium') {
    this.difficulty = difficulty;
    this.currentMap = this.resolveMap(0);
    this.w = this.currentMap.width;
    this.h = this.currentMap.height;
    for (const t of data.turrets) this.turretById.set(t.id, t);
    for (const e of data.enemies) this.enemyById.set(e.id, e);
    this.baseOrdinaryWaves = data.waves.filter(w => !w.stress).sort((a, b) => a.index - b.index);
    this.ordinaryWaves = this.buildWavePlan(this.baseOrdinaryWaves, this.waveCount);
    this.stressWave = data.waves.find(w => w.stress);
    this.playerCount = playerCount;
    const n = this.w * this.h;
    this.asteroid = new Uint8Array(n);
    this.reserved = new Uint8Array(n);
    this.blocked = new Uint8Array(n);
    this.boostMask = new Uint8Array(n);
    this.wallMask = new Uint8Array(n);
    this.towerAt = new Array(n).fill(null);
    this.dist = new Int16Array(n);
    this.queue = new Int32Array(n);
    this.reset(playerCount, 0);
  }

  private resolveMap(index: number): MapDef {
    if (index === 0) return this.data.map ?? this.data.maps[0];
    return this.data.maps?.[index] ?? this.data.map;
  }

  get totalWaves(): number { return this.ordinaryWaves.length; }
  get canLaunch(): boolean { return !this.over && this.waveCursor < this.ordinaryWaves.length; }
  get canAddWaves(): boolean { return this.over === 'won' && this.mode === 'normal'; }
  get phase(): 'planning' | 'running' | 'paused' | 'won' | 'lost' {
    if (this.over) return this.over;
    if (!this.paused) return 'running';
    return this.launched ? 'paused' : 'planning';
  }
  idx(x: number, y: number): number { return y * this.w + x; }

  setSpeed(s: GameSpeed): void { this.speed = s; }
  toggleSpeed(): GameSpeed {
    this.speed = this.speed === 1 ? 2 : 1;
    return this.speed;
  }

  setDifficulty(d: Difficulty): void {
    this.difficulty = d;
    this.reset();
  }

  cycleDifficulty(): Difficulty {
    const order: Difficulty[] = ['easy', 'medium', 'hard'];
    const next = order[(order.indexOf(this.difficulty) + 1) % order.length];
    this.setDifficulty(next);
    return next;
  }

  buildWavePlan(base: WaveDef[], count: WaveCount): WaveDef[] {
    if (base.length === 0) return [];
    const cloneGroups = (groups: WaveDef['groups'], scale = 1, trimBossEscorts = false) =>
      groups.map(g => {
        const isBoss = this.enemyById.get(g.enemyId)?.boss === true;
        if (isBoss) return { ...g, count: 1 };
        const factor = trimBossEscorts ? 0.7 : scale;
        return { ...g, count: factor === 1 ? g.count : Math.max(1, Math.round(g.count * factor)) };
      });

    if (count === 10) {
      return base.map(w => ({ ...w, groups: cloneGroups(w.groups), templateIndex: w.index }));
    }

    const byIndex = new Map(base.map(w => [w.index, w]));

    if (count === 5) {
      const picks = [1, 3, 4, 5, 10];
      return picks.map((targetIdx, i) => {
        const fallback = i === picks.length - 1 ? base[base.length - 1] : base[Math.min(i, base.length - 1)];
        const src = byIndex.get(targetIdx) ?? fallback;
        const isFinal = i === picks.length - 1;
        return {
          ...src,
          index: i + 1,
          templateIndex: src.index,
          groups: cloneGroups(src.groups, 1, isFinal),
        };
      });
    }

    const plan: WaveDef[] = base.map(w => ({ ...w, groups: cloneGroups(w.groups), templateIndex: w.index }));
    const cycle = [3, 4, 5, 6, 7, 8, 9];
    for (let i = base.length + 1; i <= count; i++) {
      const isBossWave = i === count || i % 10 === 0;
      const src = isBossWave
        ? (byIndex.get(10) ?? base[base.length - 1])
        : (byIndex.get(cycle[(i - 11) % cycle.length]) ?? base[(i - 1) % base.length]);
      const tier = Math.floor((i - 1) / 10) + 1;
      const tierSuffix = tier <= 1 ? undefined : tier === 2 ? ' II' : ' III';
      const scale = 1 + 0.15 * (tier - 1);
      plan.push({
        ...src,
        index: i,
        templateIndex: src.index,
        tierSuffix,
        groups: cloneGroups(src.groups, scale),
      });
    }
    return plan;
  }

  setWaveCount(count: WaveCount): void {
    this.waveCount = count;
    this.ordinaryWaves = this.buildWavePlan(this.baseOrdinaryWaves, count);
    this.reset();
  }

  cycleWaveCount(): WaveCount {
    const idx = WAVE_COUNTS.indexOf(this.waveCount);
    const next = WAVE_COUNTS[(idx + 1) % WAVE_COUNTS.length];
    this.setWaveCount(next);
    return next;
  }

  toggleAutoWave(): boolean {
    this.autoWave = !this.autoWave;
    if (!this.autoWave) this.autoWaveTimer = 0;
    return this.autoWave;
  }

  private emitSound(ev: SoundEvent): void {
    if (this.soundQueue.length < 32) this.soundQueue.push(ev);
  }

  drainEvents(): SoundEvent[] {
    if (this.soundQueue.length === 0) return [];
    const out = this.soundQueue.slice();
    this.soundQueue.length = 0;
    return out;
  }

  setMap(index: number): void {
    const len = this.data.maps?.length || 1;
    const idx = ((index % len) + len) % len;
    const prev = this.mapIndex;
    this.reset(this.playerCount, idx);
    if (idx === prev) this.mapVersion++;
  }

  /** Reset the whole match (also used by layout changes, map switches, and stress setup). */
  reset(playerCount = this.playerCount, mapIndex = this.mapIndex): void {
    this.playerCount = playerCount;
    this.runId++;
    const len = this.data.maps?.length || 1;
    const idx = ((mapIndex % len) + len) % len;
    if (idx !== this.mapIndex) {
      this.mapIndex = idx;
      this.mapVersion++;
    }
    const m = this.resolveMap(idx);
    this.currentMap = m;
    if (m.width !== this.w || m.height !== this.h) {
      this.w = m.width;
      this.h = m.height;
      const n = this.w * this.h;
      this.asteroid = new Uint8Array(n);
      this.reserved = new Uint8Array(n);
      this.blocked = new Uint8Array(n);
      this.boostMask = new Uint8Array(n);
      this.wallMask = new Uint8Array(n);
      this.towerAt = new Array(n).fill(null);
      this.dist = new Int16Array(n);
      this.queue = new Int32Array(n);
    } else {
      this.asteroid.fill(0);
      this.reserved.fill(0);
      this.blocked.fill(0);
      this.boostMask.fill(0);
      this.wallMask.fill(0);
      this.towerAt.fill(null);
    }

    for (const [x, y] of m.asteroids) {
      const i = this.idx(x, y);
      this.asteroid[i] = 1;
      this.blocked[i] = 1;
    }
    for (const [x, y] of m.spawns) this.reserved[this.idx(x, y)] = 1;
    for (const [x, y] of m.exits) this.reserved[this.idx(x, y)] = 1;
    for (const [x, y] of m.boostCells ?? []) {
      if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.boostMask[this.idx(x, y)] = 1;
    }
    for (const [x, y] of m.wallCells ?? []) {
      if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.wallMask[this.idx(x, y)] = 1;
    }

    this.towers = [];
    this.enemies = [];
    this.spawners = [];
    for (const p of this.projectiles) p.active = false;
    for (const mine of this.mines) mine.active = false;
    for (const k of this.knights) k.active = false;
    for (const fz of this.fireZones) fz.active = false;
    for (const b of this.beams) b.active = false;
    for (const r of this.rings) r.active = false;
    for (const pt of this.particles) pt.active = false;
    for (const pop of this.popups) pop.active = false;
    this.nextKnightId = 1;
    this.meteors = [];
    this.recentMeteors = [];
    this.stormActive = false;
    this.stormTimer = 22;
    this.meteorTimer = 3.2;
    this.rushActive = false;
    this.rushTimer = 0;

    const preset = DIFFICULTIES[this.difficulty];
    const soloMult = this.playerCount === 1 ? 1.55 : 1;
    const startCredits = Math.round(m.startingCredits * preset.creditMultiplier * soloMult);
    this.credits = Array.from({ length: playerCount }, () => startCredits);
    this.lives = preset.lives;
    this.paused = true;
    this.over = null;
    this.launched = false;
    this.mode = 'normal';
    this.waveCursor = 0;
    this.ordinaryWaves = this.buildWavePlan(this.baseOrdinaryWaves, this.waveCount);
    this.overtimeStartWave = this.ordinaryWaves.length;
    this.overtimeWavesAdded = 0;
    this.time = 0;
    this.lastEarlyBonus = 0;
    this.autoWaveTimer = 0;
    this.soundQueue.length = 0;
    this.ledger = { start: startCredits * playerCount, granted: 0, bounty: 0, refunded: 0, spent: 0 };
    this.stats = { kills: 0, leaks: 0, playerKills: Array(playerCount).fill(0) };
    this.rebuild();
  }

  private rebuild(): void {
    computeDist(this.w, this.h, this.blocked, this.currentMap.exits, this.dist, this.queue);
    this.towerVersion++;
    this.pathVersion++;
  }

  totalCredits(): number { return this.credits.reduce((a, b) => a + b, 0); }
  /** Money that must exist if no credits were created or destroyed outside the ledger. */
  expectedCredits(): number {
    const l = this.ledger;
    return l.start + l.granted + l.bounty + l.refunded - l.spent;
  }
  grant(owner: number, amount: number): void { this.credits[owner] += amount; this.ledger.granted += amount; }

  transferCredits(
    fromPlayer: number,
    toPlayer: number,
    amount: number,
  ): { ok: boolean; transferred: number; reason?: string } {
    if (this.over) return { ok: false, transferred: 0, reason: 'over' };
    if (
      !Number.isInteger(fromPlayer) || fromPlayer < 0 || fromPlayer >= this.playerCount ||
      !Number.isInteger(toPlayer) || toPlayer < 0 || toPlayer >= this.playerCount
    ) {
      return { ok: false, transferred: 0, reason: 'unknown-player' };
    }
    if (fromPlayer === toPlayer) return { ok: false, transferred: 0, reason: 'same-player' };
    if (!Number.isFinite(amount) || amount <= 0) return { ok: false, transferred: 0, reason: 'invalid-amount' };
    if (this.credits[fromPlayer] + 1e-9 < amount) return { ok: false, transferred: 0, reason: 'funds' };
    const actual = Math.min(amount, this.credits[fromPlayer]);
    this.credits[fromPlayer] -= actual;
    this.credits[toPlayer] += actual;
    return { ok: true, transferred: actual };
  }

  // ---------- placement / upgrades / economy ----------
  private enemyOccupies(x: number, y: number): boolean {
    for (const e of this.enemies) {
      if (e.dead || e.def.flying) continue;
      if ((e.cx === x && e.cy === y) || (e.nx === x && e.ny === y) ||
          (Math.floor(e.x) === x && Math.floor(e.y) === y)) return true;
    }
    return false;
  }

  /** Cells that must stay connected to an exit: every spawn and each live ground enemy's current and next waypoint. */
  requiredCells(): number[] {
    const req: number[] = [];
    for (const [x, y] of this.currentMap.spawns) req.push(this.idx(x, y));
    for (const e of this.enemies) {
      if (e.dead || e.def.flying) continue;
      req.push(this.idx(e.cx, e.cy), this.idx(e.nx, e.ny));
    }
    return req;
  }

  /** Pure validation (no mutation). */
  check(owner: number, turretId: string, x: number, y: number, ignoreFunds = false): PlaceResult {
    const fail = (reason: PlaceReason): PlaceResult => ({ ok: false, reason });
    const def = this.turretById.get(turretId);
    if (!def) return fail('unknown-turret');
    if (!Number.isInteger(owner) || owner < 0 || owner >= this.playerCount) return fail('unknown-player');
    if (this.over) return fail('over');
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= this.w || y >= this.h) return fail('outside');
    const i = this.idx(x, y);
    if (this.reserved[i]) return fail('reserved');
    if (this.asteroid[i]) return fail('asteroid');
    if (this.towerAt[i]) return fail('occupied');
    if (this.enemyOccupies(x, y)) return fail('enemy');
    if (!ignoreFunds && this.credits[owner] + 1e-9 < def.cost) return fail('funds');
    if (!placementKeepsRoutes(this.w, this.h, this.blocked, i, this.currentMap.exits, this.requiredCells())) return fail('blocks-path');
    return { ok: true, reason: 'ok', cost: def.cost };
  }

  /** Atomic: validates against the current state and commits in one synchronous call. */
  tryPlace(owner: number, turretId: string, x: number, y: number): PlaceResult {
    const r = this.check(owner, turretId, x, y);
    if (!r.ok) return r;
    const def = this.turretById.get(turretId)!;
    const i = this.idx(x, y);
    const t: Tower = {
      id: this.nextId++,
      def,
      owner,
      x,
      y,
      cooldown: 0.25,
      tier: 0,
      invested: def.cost,
      priority: 'first',
      aimAngle: 0,
      kills: 0,
      boosted: this.boostMask[i] === 1,
      onWall: this.wallMask[i] === 1,
      hp: 100,
      maxHp: 100,
    };
    this.credits[owner] -= def.cost;
    this.ledger.spent += def.cost;
    this.towers.push(t);
    this.towerAt[i] = t;
    this.blocked[i] = 1;
    this.rebuild();
    return r;
  }

  towerById(id: number): Tower | null {
    for (const t of this.towers) if (t.id === id) return t;
    return null;
  }

  towerStats(t: Tower): TowerStats {
    const d = t.def;
    const u = t.tier > 0 ? d.upgrades[t.tier - 1] : undefined;
    const stats: TowerStats = !u
      ? {
          damage: d.damage,
          range: d.range,
          fireRate: d.fireRate,
          splashRadius: d.splashRadius,
          slowFactor: d.slowFactor,
          slowDuration: d.slowDuration,
          shieldMultiplier: d.shieldMultiplier,
          shieldStrip: 0,
          pierceCount: d.pierceCount,
          missileCount: d.missileCount,
          burnDps: d.burnDps,
          burnDuration: d.burnDuration,
          targetsAir: d.targetsAir,
          armorPierce: d.armorPierce,
        }
      : {
          damage: d.damage * u.damageMultiplier,
          range: d.range + u.rangeBonus,
          fireRate: d.fireRate * (u.fireRateMultiplier ?? 1),
          splashRadius: d.splashRadius + (u.splashBonus ?? 0),
          slowFactor: u.slowFactor ?? d.slowFactor,
          slowDuration: d.slowDuration,
          shieldMultiplier: u.shieldMultiplier ?? d.shieldMultiplier,
          shieldStrip: u.shieldStrip ?? 0,
          pierceCount: u.pierceCount ?? d.pierceCount,
          missileCount: d.missileCount + (u.missileBonus ?? 0),
          burnDps: u.burnDps ?? d.burnDps,
          burnDuration: u.burnDuration ?? d.burnDuration,
          targetsAir: d.targetsAir,
          armorPierce: d.armorPierce,
        };
    if (t.boosted) {
      stats.fireRate *= 1.25;
      stats.range *= 1.20;
      if (this.currentMap.mechanic === 'kitchen-rush') {
        stats.burnDps = Math.max(stats.burnDps, 10);
        stats.burnDuration = Math.max(stats.burnDuration, 2.5);
      }
    }
    if (t.onWall) {
      stats.range *= 1.15;
    }
    if (this.currentMap.mechanic === 'mars-storms' && this.stormActive && !t.boosted && t.tier < 2) {
      stats.range *= 0.80;
    }
    if (t.hp > 0 && t.hp < t.maxHp * 0.5) {
      stats.fireRate *= 0.80;
    }
    return stats;
  }

  nextUpgrade(t: Tower): TurretUpgrade | null {
    return t.def.upgrades[t.tier] ?? null;
  }

  canUpgrade(towerId: number): { ok: boolean; reason: string; cost?: number; upgrade?: TurretUpgrade } {
    if (this.over) return { ok: false, reason: 'over' };
    const t = this.towerById(towerId);
    if (!t) return { ok: false, reason: 'not-found' };
    const u = this.nextUpgrade(t);
    if (!u) return { ok: false, reason: 'max-tier' };
    if (this.credits[t.owner] + 1e-9 < u.cost) return { ok: false, reason: 'funds', cost: u.cost, upgrade: u };
    return { ok: true, reason: 'ok', cost: u.cost, upgrade: u };
  }

  upgradeTower(towerId: number): { ok: boolean; reason: string; cost?: number; tier?: number; name?: string } {
    const c = this.canUpgrade(towerId);
    if (!c.ok || !c.upgrade) return { ok: false, reason: c.reason, cost: c.cost };
    const t = this.towerById(towerId)!;
    const u = c.upgrade;
    this.credits[t.owner] -= u.cost;
    this.ledger.spent += u.cost;
    t.invested += u.cost;
    t.tier++;
    if (t.tier === 1) {
      t.maxHp = 130;
      t.hp = Math.min(t.maxHp, t.hp + 30);
    } else if (t.tier === 2) {
      t.maxHp = 165;
      t.hp = Math.min(t.maxHp, t.hp + 35);
    }
    this.towerVersion++;
    return { ok: true, reason: 'ok', cost: u.cost, tier: t.tier, name: u.name };
  }

  repairCost(t: Tower): number {
    if (t.hp >= t.maxHp) return 0;
    const miss = (t.maxHp - t.hp) / t.maxHp;
    return Math.max(8, Math.round(t.invested * 0.30 * miss));
  }

  canRepair(towerId: number, payer?: number): { ok: boolean; reason: string; cost?: number } {
    if (this.over) return { ok: false, reason: 'over' };
    const t = this.towerById(towerId);
    if (!t) return { ok: false, reason: 'not-found' };
    if (t.hp >= t.maxHp) return { ok: false, reason: 'full-hp' };
    const p = payer ?? t.owner;
    if (p < 0 || p >= this.credits.length) return { ok: false, reason: 'unknown-player' };
    const cost = this.repairCost(t);
    if (this.credits[p] + 1e-9 < cost) return { ok: false, reason: 'funds', cost };
    return { ok: true, reason: 'ok', cost };
  }

  repairTower(towerId: number, payer?: number): { ok: boolean; reason: string; cost?: number; healed?: number } {
    const c = this.canRepair(towerId, payer);
    if (!c.ok || c.cost === undefined) return { ok: false, reason: c.reason, cost: c.cost };
    const t = this.towerById(towerId)!;
    const p = payer ?? t.owner;
    const healed = Math.round(t.maxHp - t.hp);
    this.credits[p] -= c.cost;
    this.ledger.spent += c.cost;
    t.hp = t.maxHp;
    this.towerVersion++;
    this.emitSound('ui-repair');
    this.spawnParticles(t.x + 0.5, t.y + 0.5, 8, 0x82e3b4, 2.2, 2.4);
    this.spawnPopup(t.x + 0.5, t.y + 0.2, 'REPAIRED!', 0x82e3b4);
    return { ok: true, reason: 'ok', cost: c.cost, healed };
  }

  cycleTowerPriority(towerId: number): TargetPriority | null {
    const t = this.towerById(towerId);
    if (!t) return null;
    const next = PRIORITY_ORDER[(PRIORITY_ORDER.indexOf(t.priority) + 1) % PRIORITY_ORDER.length];
    t.priority = next;
    this.towerVersion++;
    return next;
  }

  setTowerPriority(towerId: number, priority: TargetPriority): boolean {
    const t = this.towerById(towerId);
    if (!t) return false;
    t.priority = priority;
    this.towerVersion++;
    return true;
  }

  sellTower(towerId: number): number | null {
    const t = this.towerById(towerId);
    if (!t) return null;
    const refund = t.invested * SELL_RATE;
    this.credits[t.owner] += refund;
    this.ledger.refunded += refund;
    const i = this.idx(t.x, t.y);
    this.towerAt[i] = null;
    this.blocked[i] = 0;
    this.towers.splice(this.towers.indexOf(t), 1);
    for (const m of this.mines) if (m.active && m.towerId === t.id) m.active = false;
    this.rebuild();
    return refund;
  }

  /** Sell for 70% of total invested to the tower's owner. Returns refund, or null if no tower. */
  sellAt(x: number, y: number): number | null {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return null;
    const t = this.towerAt[this.idx(x, y)];
    if (!t) return null;
    return this.sellTower(t.id);
  }

  /** Owner gets 70%; all active players (owner included) split the remaining 30%. Fractions are kept. */
  awardBounty(bounty: number, owner: number): void {
    if (owner >= 0 && owner < this.playerCount) {
      this.credits[owner] += bounty * OWNER_SHARE;
      const share = (bounty * (1 - OWNER_SHARE)) / this.playerCount;
      for (let p = 0; p < this.playerCount; p++) this.credits[p] += share;
    } else {
      const share = bounty / this.playerCount;
      for (let p = 0; p < this.playerCount; p++) this.credits[p] += share;
    }
    this.ledger.bounty += bounty;
  }

  // ---------- waves ----------
  nextWave(): WaveDef | null {
    return this.ordinaryWaves[this.waveCursor] ?? null;
  }

  waveCoopScale(): number {
    if (this.playerCount <= 1) return 0.8;
    return 1 + (this.playerCount - 2) * 0.175;
  }

  waveHealthScale(waveNum: number): number {
    let waveScale: number;
    if (waveNum <= this.overtimeStartWave) {
      waveScale = 1 + Math.max(0, waveNum - 1) * 0.05;
    } else {
      const ot = waveNum - this.overtimeStartWave;
      const baseScale = 1 + Math.max(0, this.overtimeStartWave - 1) * 0.05;
      waveScale = baseScale * Math.pow(1.16, ot);
    }
    return DIFFICULTIES[this.difficulty].hpMultiplier * this.waveCoopScale() * waveScale;
  }

  waveSpeedScale(waveNum: number): number {
    if (waveNum <= this.overtimeStartWave) return 1;
    const ot = waveNum - this.overtimeStartWave;
    return 1 + Math.min(0.45, ot * 0.035);
  }

  addMoreWaves(extra = 5): boolean {
    if (!this.canAddWaves || extra <= 0 || this.baseOrdinaryWaves.length === 0) return false;
    const startIndex = this.ordinaryWaves.length + 1;
    const batch = Math.floor(this.overtimeWavesAdded / extra) + 1;
    const byIndex = new Map(this.baseOrdinaryWaves.map(w => [w.index, w]));
    const picks = [6, 7, 8, 9, 10];
    const countScale = Math.pow(1.20, batch);
    const intervalScale = Math.max(0.55, 1 - 0.10 * batch);
    const tierSuffix = batch === 1 ? ' OT' : ` OT${batch}`;

    for (let k = 0; k < extra; k++) {
      const waveIdx = startIndex + k;
      const targetIdx = extra === 5 ? picks[k] : (k === extra - 1 ? 10 : picks[k % 4]);
      const fallback = k === extra - 1
        ? this.baseOrdinaryWaves[this.baseOrdinaryWaves.length - 1]
        : this.baseOrdinaryWaves[k % this.baseOrdinaryWaves.length];
      const src = byIndex.get(targetIdx) ?? fallback;
      const groups = src.groups.map(g => {
        const isBoss = this.enemyById.get(g.enemyId)?.boss === true;
        return {
          ...g,
          count: isBoss ? 1 : Math.max(1, Math.round(g.count * countScale)),
          interval: Math.max(0.10, Number((g.interval * intervalScale).toFixed(3))),
        };
      });
      this.ordinaryWaves.push({
        ...src,
        index: waveIdx,
        templateIndex: src.index,
        tierSuffix,
        overtime: true,
        stress: false,
        groups,
      });
    }

    this.overtimeWavesAdded += extra;
    this.over = null;
    this.paused = true;
    this.runId++;
    this.emitSound('ui-wave');
    return true;
  }

  activeBoss(): Enemy | null {
    for (const e of this.enemies) if (!e.dead && e.def.boss) return e;
    return null;
  }

  private startWave(w: WaveDef): void {
    const baseHpScale = w.stress ? 1 : this.waveHealthScale(w.index);
    const speedScale = w.stress ? 1 : this.waveSpeedScale(w.index);
    for (const g of w.groups) {
      const enemy = this.enemyById.get(g.enemyId);
      if (!enemy) continue;
      const hpScale = (!w.stress && !w.overtime && this.waveCount === 5 && w.index === 5 && enemy.boss)
        ? baseHpScale * 0.80
        : baseHpScale;
      this.spawners.push({ enemy, remaining: g.count, interval: g.interval, timer: 0, spawnIndex: g.spawnIndex, hpScale, speedScale });
    }
    this.launched = true;
    this.paused = false;
    this.runSpawners(0);
  }

  launchWave(): boolean {
    if (!this.canLaunch) return false;
    if (this.mode === 'normal' && this.launched && (this.enemies.length > 0 || this.spawners.length > 0)) {
      const bonus = 10 + this.waveCursor * 3;
      for (let p = 0; p < this.playerCount; p++) this.grant(p, bonus);
      this.lastEarlyBonus = bonus;
    } else {
      this.lastEarlyBonus = 0;
    }
    this.autoWaveTimer = 0;
    this.emitSound('ui-wave');
    this.startWave(this.ordinaryWaves[this.waveCursor++]);
    return true;
  }

  /**
   * Deterministic stress scene: reset, place the canonical currentMap.stressTurrets fixture in order (owner = index
   * mod players; each tower's cost is granted through the ledger so wallets stay at their starting value),
   * then spawn the 150-swarmer wave.
   */
  setupStress(): { towers: number; enemies: number } {
    this.reset(this.playerCount);
    this.mode = 'stress';
    let placed = 0;
    this.currentMap.stressTurrets.forEach(([x, y, id], i) => {
      const owner = i % this.playerCount;
      const def = this.turretById.get(id);
      if (!def || !this.check(owner, id, x, y, true).ok) return;
      this.grant(owner, def.cost);
      if (this.tryPlace(owner, id, x, y).ok) placed++;
    });
    if (this.stressWave) this.startWave(this.stressWave);
    return { towers: placed, enemies: this.enemies.length };
  }

  // ---------- simulation ----------
  step(dt: number): void {
    if (this.paused || this.over) return;
    this.time += dt;
    if (this.currentMap.mechanic === 'mars-storms' && this.launched && (this.enemies.length > 0 || this.spawners.length > 0)) {
      this.stormTimer -= dt;
      if (this.stormTimer <= 0) {
        if (!this.stormActive) {
          this.stormActive = true;
          this.stormTimer += 6;
          this.emitSound('dust-storm');
        } else {
          this.stormActive = false;
          this.stormTimer += 22;
        }
      }
      this.meteorTimer -= dt * (this.stormActive ? 1.25 : 1.0);
      if (this.meteorTimer <= 0) {
        this.meteorTimer = 3.3 + Math.random() * 1.4;
        this.spawnMeteor();
      }
    }
    if (this.currentMap.mechanic === 'kitchen-rush' && this.launched && (this.enemies.length > 0 || this.spawners.length > 0)) {
      this.rushTimer += dt;
      if (!this.rushActive && this.rushTimer >= 20) {
        this.rushActive = true;
        this.emitSound('fridge-open');
      } else if (this.rushActive && this.rushTimer >= 25.5) {
        this.rushActive = false;
        this.rushTimer -= 25.5;
      }
    }
    this.runSpawners(dt);
    this.updateEnemies(dt);
    this.fireTowers(dt);
    this.updateProjectiles(dt);
    this.updateMines(dt);
    this.updateKnights(dt);
    this.updateFireZones(dt);
    this.updateMeteors(dt);
    this.updateEffects(dt);
    this.compactEnemies();
    if (!this.over && this.mode === 'normal' && this.launched && this.spawners.length === 0 && this.enemies.length === 0) {
      if (this.waveCursor >= this.ordinaryWaves.length) {
        this.over = 'won';
        this.emitSound('ui-win');
      } else if (this.autoWave) {
        if (this.autoWaveTimer <= 0) {
          this.autoWaveTimer = 2.5;
        } else {
          this.autoWaveTimer -= dt;
          if (this.autoWaveTimer <= 0) {
            this.autoWaveTimer = 0;
            this.launchWave();
          }
        }
      }
    } else {
      this.autoWaveTimer = 0;
    }
  }

  private runSpawners(dt: number): void {
    for (const s of this.spawners) {
      s.timer -= dt;
      while (s.remaining > 0 && s.timer <= 1e-9) {
        const sp = this.currentMap.spawns[s.spawnIndex % this.currentMap.spawns.length];
        this.spawnEnemy(s.enemy, sp[0], sp[1], 0, 0, s.hpScale, s.speedScale);
        s.remaining--;
        s.timer += s.interval;
      }
    }
    this.spawners = this.spawners.filter(s => s.remaining > 0);
  }

  private spawnEnemy(def: EnemyDef, cx: number, cy: number, ox0 = 0, oy0 = 0, hpScale?: number, speedScale?: number): Enemy {
    const id = this.nextId++;
    const r = (Math.imul(id, 2654435761) >>> 0) / 4294967296;
    const scale = hpScale ?? (this.mode === 'normal' ? this.waveHealthScale(Math.max(1, this.waveCursor)) : 1);
    const spdScale = speedScale ?? (this.mode === 'normal' ? this.waveSpeedScale(Math.max(1, this.waveCursor)) : 1);
    const maxHp = def.hp * scale;
    const maxShield = def.shield * scale;
    const e: Enemy = {
      id,
      def,
      x: cx + 0.5 + ox0,
      y: cy + 0.5 + oy0,
      vx: 0,
      vy: 0,
      cx,
      cy,
      nx: cx,
      ny: cy,
      hp: maxHp,
      maxHp,
      shield: maxShield,
      maxShield,
      shieldDelay: 0,
      slowT: 0,
      slowF: 1,
      burnT: 0,
      burnDps: 0,
      burnOwner: 0,
      bossPhase: 0,
      ang: 0,
      rem: 0,
      ox: (r - 0.5) * 0.5,
      oy: ((r * 7.31) % 1 - 0.5) * 0.5,
      dead: false,
      leaked: false,
      submerged: (this.currentMap.mechanic === 'naval-subs-mines' || this.currentMap.mechanic === 'lawn-split-burrow') && def.id === 'frigate',
      revealedT: 0,
      enraged: false,
      isSplitChild: false,
      speedScale: spdScale,
      breathCooldown: 1.2,
      breathT: 0,
      breathTargetId: 0,
      breathTx: 0,
      breathTy: 0,
    };
    if (def.flying) this.pickNextFlying(e);
    else this.pickNext(e);
    this.enemies.push(e);
    return e;
  }

  private pickNextFlying(e: Enemy): void {
    let bestEx = this.currentMap.exits[0][0];
    let bestEy = this.currentMap.exits[0][1];
    let bestD = Infinity;
    for (const [ex, ey] of this.currentMap.exits) {
      const d = Math.hypot(ex + 0.5 - e.x, ey + 0.5 - e.y);
      if (d < bestD) { bestD = d; bestEx = ex; bestEy = ey; }
    }
    e.nx = bestEx;
    e.ny = bestEy;
    e.rem = bestD;
    e.ang = Math.atan2(bestEy + 0.5 - e.y, bestEx + 0.5 - e.x);
  }

  private pickNext(e: Enemy): void {
    const d = this.dist[this.idx(e.cx, e.cy)];
    e.nx = e.cx;
    e.ny = e.cy;
    if (d <= 0) return;
    for (const [dx, dy] of DIRS) {
      const nx = e.cx + dx;
      const ny = e.cy + dy;
      if (nx < 0 || ny < 0 || nx >= this.w || ny >= this.h) continue;
      if (this.dist[this.idx(nx, ny)] === d - 1) {
        e.nx = nx;
        e.ny = ny;
        e.ang = Math.atan2(dy, dx);
        return;
      }
    }
  }

  private leakEnemy(e: Enemy): void {
    e.dead = true;
    e.leaked = true;
    this.stats.leaks++;
    this.lives = Math.max(0, this.lives - e.def.lifeCost);
    this.emitSound('leak');
    if (this.lives <= 0) {
      this.over = 'lost';
      this.emitSound('ui-lose');
    }
  }

  private updateEnemies(dt: number): void {
    for (const e of this.enemies) {
      if (e.dead) continue;

      // Shield regen
      if (e.maxShield > 0 && e.shield < e.maxShield) {
        if (e.shieldDelay > 0) e.shieldDelay = Math.max(0, e.shieldDelay - dt);
        else e.shield = Math.min(e.maxShield, e.shield + e.def.shieldRegen * dt);
      }

      // Burn DoT
      if (e.burnT > 0) {
        const tick = e.burnDps * Math.min(dt, e.burnT);
        e.burnT = Math.max(0, e.burnT - dt);
        this.damageEnemy(e, tick, e.burnOwner, {
          armorPierce: true,
          shieldMultiplier: 1,
          shieldStrip: 0,
          burnDps: 0,
          burnDuration: 0,
        });
        if (e.dead) continue;
      }

      if (e.revealedT > 0) e.revealedT = Math.max(0, e.revealedT - dt);

      if (this.currentMap.mechanic === 'medieval-frenzy' && e.def.flying && e.def.id === 'phase') {
        const curBreathT = e.breathT ?? 0;
        if (curBreathT > 0) {
          const target = this.towerById(e.breathTargetId ?? 0);
          if (!target || target.hp <= 0 || Math.hypot(target.x + 0.5 - e.x, target.y + 0.5 - e.y) > 3.4) {
            e.breathT = 0;
            e.breathTargetId = 0;
          } else {
            e.breathT = Math.max(0, curBreathT - dt);
            e.breathTx = target.x + 0.5;
            e.breathTy = target.y + 0.5;
            const wasAlive = target.hp > 0;
            target.hp = Math.max(0, target.hp - 28 * dt);
            if (wasAlive && target.hp <= 0) {
              this.towerVersion++;
              this.spawnPopup(target.x + 0.5, target.y + 0.2, 'OFFLINE!', 0xff4d5a);
            } else if (Math.floor(curBreathT * 6) !== Math.floor(e.breathT * 6)) {
              this.towerVersion++;
              this.spawnParticles(target.x + 0.5, target.y + 0.5, 1, 0xff6b2b, 1.8, 2.0);
            }
          }
        } else {
          e.breathCooldown = (e.breathCooldown ?? 1.2) - dt;
          if (e.breathCooldown <= 0) {
            let best: Tower | null = null;
            let bestD = 2.8;
            for (const t of this.towers) {
              if (t.hp <= 0) continue;
              const d = Math.hypot(t.x + 0.5 - e.x, t.y + 0.5 - e.y);
              if (d <= bestD) {
                bestD = d;
                best = t;
              }
            }
            if (best) {
              e.breathTargetId = best.id;
              e.breathTx = best.x + 0.5;
              e.breathTy = best.y + 0.5;
              e.breathT = 1.35;
              e.breathCooldown = 3.6;
              this.emitSound('dragon-breath');
              this.spawnParticles(best.x + 0.5, best.y + 0.5, 6, 0xff6b2b, 2.5, 2.6);
              this.spawnPopup(e.x, e.y - 0.3, 'DRAGON FIRE!', 0xff6b2b, 0.9, -0.8);
            }
          }
        }
      }

      const speedMult = (this.mode === 'normal' ? DIFFICULTIES[this.difficulty].speedMultiplier : 1) * (e.speedScale ?? 1);
      const enragedMult = e.enraged ? 1.35 : 1;
      const rushMult =
        this.currentMap.mechanic === 'kitchen-rush' && this.rushActive
          ? (e.slowT > 0 ? 0.80 : 1.30)
          : 1;
      const dragonBreathMult = (e.breathT ?? 0) > 0 ? 0.38 : 1;
      const spd = e.def.speed * speedMult * enragedMult * rushMult * dragonBreathMult * (e.slowT > 0 ? e.slowF : 1);
      if (e.slowT > 0) {
        e.slowT -= dt;
        if (e.slowT <= 0) { e.slowT = 0; e.slowF = 1; }
      }

      if (e.def.flying) {
        this.pickNextFlying(e);
        const tx = e.nx + 0.5;
        const ty = e.ny + 0.5;
        const dx = tx - e.x;
        const dy = ty - e.y;
        const d = Math.hypot(dx, dy);
        const stepDist = spd * dt;
        if (d <= stepDist) {
          e.x = tx;
          e.y = ty;
          e.vx = 0;
          e.vy = 0;
          this.leakEnemy(e);
        } else {
          e.vx = (dx / d) * spd;
          e.vy = (dy / d) * spd;
          e.x += e.vx * dt;
          e.y += e.vy * dt;
          e.cx = Math.max(0, Math.min(this.w - 1, Math.floor(e.x)));
          e.cy = Math.max(0, Math.min(this.h - 1, Math.floor(e.y)));
          e.ang = turnToward(e.ang, Math.atan2(dy, dx), 10 * dt);
          e.rem = d - stepDist;
        }
        continue;
      }

      // Ground enemy movement along BFS waypoints
      let rem = spd * dt;
      if (e.nx === e.cx && e.ny === e.cy && this.dist[this.idx(e.cx, e.cy)] > 0) {
        this.pickNext(e);
      }
      for (let guard = 0; guard < 4 && rem > 1e-9 && !e.dead; guard++) {
        const tx = e.nx + 0.5;
        const ty = e.ny + 0.5;
        const dx = tx - e.x;
        const dy = ty - e.y;
        const d = Math.hypot(dx, dy);
        if (d <= rem) {
          e.x = tx;
          e.y = ty;
          rem -= d;
          e.cx = e.nx;
          e.cy = e.ny;
          if (this.dist[this.idx(e.cx, e.cy)] === 0) {
            this.leakEnemy(e);
          } else {
            this.pickNext(e);
            if (e.nx === e.cx && e.ny === e.cy) {
              e.vx = 0;
              e.vy = 0;
              break;
            }
          }
        } else {
          e.vx = (dx / d) * spd;
          e.vy = (dy / d) * spd;
          e.x += (dx / d) * rem;
          e.y += (dy / d) * rem;
          e.ang = turnToward(e.ang, Math.atan2(dy, dx), 12 * dt);
          rem = 0;
        }
      }
      if (!e.dead && e.nx === e.cx && e.ny === e.cy) {
        e.vx = 0;
        e.vy = 0;
      }
      e.rem = this.dist[this.idx(e.nx, e.ny)] + Math.hypot(e.nx + 0.5 - e.x, e.ny + 0.5 - e.y);
      if (e.submerged && e.revealedT <= 0 && e.rem <= 4.5) e.revealedT = 1.5;
    }
  }

  private activeParticleCount(): number {
    let n = 0;
    for (const p of this.particles) if (p.active) n++;
    return n;
  }

  private spawnParticles(x: number, y: number, count: number, color: number, speed = 2.4, size = 2.5): void {
    let active = this.activeParticleCount();
    if (active >= MAX_ACTIVE_PARTICLES) return;
    const n = Math.min(count, MAX_ACTIVE_PARTICLES - active);
    for (let i = 0; i < n; i++) {
      const ang = (Math.PI * 2 * i) / Math.max(1, n) + ((i * 1.618) % 1) * 0.5;
      const spd = speed * (0.45 + ((i * 0.37) % 0.7));
      const p = acquire(this.particles, () => ({
        active: false, x: 0, y: 0, vx: 0, vy: 0, ttl: 0, max: 0, size: 0, color: 0,
      }));
      Object.assign(p, {
        active: true,
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        ttl: 0.35,
        max: 0.35,
        size,
        color,
      });
      active++;
    }
  }

  private spawnPopup(x: number, y: number, text: string, color: number, ttl = 0.75, vy = -0.8): void {
    const pop = acquire(this.popups, () => ({
      active: false, x: 0, y: 0, vy: 0, ttl: 0, max: 0, text: '', color: 0,
    }));
    Object.assign(pop, { active: true, x, y, vy, ttl, max: ttl, text, color });
  }

  private triggerBossPhase(e: Enemy, nextPhase: number, label: string): void {
    e.bossPhase = nextPhase;
    e.shield = Math.min(e.maxShield, e.shield + e.maxShield * 0.25);
    this.emitSound('boss-phase');
    const swarmer = this.enemyById.get('swarmer');
    if (swarmer) {
      const hpScale = this.mode === 'normal' ? e.maxHp / e.def.hp : 1;
      const offsets: ReadonlyArray<readonly [number, number]> = [
        [-0.28, -0.28], [0.28, -0.28], [-0.28, 0.28], [0.28, 0.28],
      ];
      for (const [ox, oy] of offsets) {
        this.spawnEnemy(swarmer, e.cx, e.cy, ox, oy, hpScale);
      }
    }
    if (this.currentMap.mechanic === 'lawn-split-burrow') {
      const cruiser = this.enemyById.get('cruiser');
      if (cruiser) {
        const hpScale = this.mode === 'normal' ? e.maxHp / e.def.hp : 1;
        this.spawnSplitChildren(cruiser, e.x, e.y, e.vx, e.vy, e.ang, e.rem, cruiser.hp * hpScale);
      }
    }
    const color = hex(e.def.color);
    const ring = acquire(this.rings, () => ({ active: false, x: 0, y: 0, r: 0, ttl: 0, max: 0, color: 0 }));
    Object.assign(ring, { active: true, x: e.x, y: e.y, r: 2.2, ttl: 0.6, max: 0.6, color });
    this.spawnPopup(e.x, e.y - 0.35, label, 0xffd166, 1.2, -0.9);
    this.spawnParticles(e.x, e.y, 12, color, 3.2, 3.2);
  }

  private spawnSplitChildren(
    parentDef: EnemyDef,
    x: number,
    y: number,
    vx: number,
    vy: number,
    ang: number,
    rem: number,
    baseMaxHp: number,
  ): void {
    const childDef: EnemyDef = {
      ...parentDef,
      armor: 0,
      speed: parentDef.speed * 1.22,
      bounty: Math.max(1, Math.round(parentDef.bounty * 0.35)),
      lifeCost: 1,
    };
    const childHp = Math.max(1, Math.round(baseMaxHp * 0.38));
    const hLen = Math.hypot(vx, vy);
    const hx = hLen > 1e-6 ? vx / hLen : 1;
    const hy = hLen > 1e-6 ? vy / hLen : 0;
    const px = -hy;
    const py = hx;
    for (const sign of [-1, 1] as const) {
      const cxPos = Math.max(0.2, Math.min(this.w - 0.2, x + px * 0.18 * sign));
      const cyPos = Math.max(0.2, Math.min(this.h - 0.2, y + py * 0.18 * sign));
      let cx = Math.max(0, Math.min(this.w - 1, Math.floor(cxPos)));
      let cy = Math.max(0, Math.min(this.h - 1, Math.floor(cyPos)));
      if (this.blocked[this.idx(cx, cy)] !== 0 || this.dist[this.idx(cx, cy)] < 0) {
        cx = Math.max(0, Math.min(this.w - 1, Math.floor(x)));
        cy = Math.max(0, Math.min(this.h - 1, Math.floor(y)));
      }
      const id = this.nextId++;
      const child: Enemy = {
        id,
        def: childDef,
        x: cxPos,
        y: cyPos,
        vx,
        vy,
        cx,
        cy,
        nx: cx,
        ny: cy,
        hp: childHp,
        maxHp: childHp,
        shield: 0,
        maxShield: 0,
        shieldDelay: 0,
        slowT: 0,
        slowF: 1,
        burnT: 0,
        burnDps: 0,
        burnOwner: 0,
        bossPhase: 0,
        ang,
        rem,
        ox: 0,
        oy: 0,
        dead: false,
        leaked: false,
        submerged: false,
        revealedT: 0,
        enraged: false,
        isSplitChild: true,
      };
      if (this.dist[this.idx(cx, cy)] >= 0) this.pickNext(child);
      this.enemies.push(child);
    }
    this.emitSound('centipede-split');
    this.spawnPopup(x, y - 0.25, 'SPLIT!', 0xffa84c, 0.9, -0.9);
  }

  private damageEnemy(e: Enemy, rawDamage: number, owner: number, opts: HitOpts, tower?: Tower): void {
    if (e.dead) return;
    const { shieldDamage, hpDamage } = computeHitDamage(
      rawDamage,
      e.def.armor,
      opts.armorPierce,
      e.shield,
      opts.shieldMultiplier,
      opts.shieldStrip,
    );
    if (shieldDamage > 0 || rawDamage > 0) e.shieldDelay = e.def.shieldRegenDelay;
    e.shield = Math.max(0, e.shield - shieldDamage);
    e.hp -= hpDamage;

    if (opts.burnDps > 0 && opts.burnDuration > 0) {
      e.burnDps = Math.max(e.burnDps, opts.burnDps);
      e.burnT = Math.max(e.burnT, opts.burnDuration);
      e.burnOwner = owner;
    }

    if (e.hp > 0 && e.def.boss) {
      const frac = e.hp / e.maxHp;
      if (e.bossPhase === 0 && frac <= 0.66) this.triggerBossPhase(e, 1, 'PHASE 2');
      if (e.bossPhase === 1 && frac <= 0.33) this.triggerBossPhase(e, 2, 'PHASE 3');
    }

    if (
      this.currentMap.mechanic === 'medieval-frenzy' &&
      (e.def.id === 'cruiser' || e.def.id === 'dreadnought') &&
      !e.dead &&
      e.hp > 0 &&
      !e.enraged &&
      e.hp / e.maxHp <= 0.40
    ) {
      e.enraged = true;
      this.emitSound('enrage');
      this.spawnPopup(e.x, e.y - 0.3, 'ENRAGE!', 0xff3344, 1.0, -0.9);
      this.spawnParticles(e.x, e.y, 10, 0xff3344, 2.8, 2.8);
    }

    if (e.hp <= 0) {
      e.dead = true;
      this.stats.kills++;
      if (owner >= 0 && owner < this.playerCount) this.stats.playerKills[owner]++;
      if (tower) tower.kills++;
      const bountyMult = this.mode === 'normal' ? DIFFICULTIES[this.difficulty].bountyMultiplier : 1;
      const bounty = Math.round(e.def.bounty * bountyMult);
      this.awardBounty(bounty, owner);
      this.spawnPopup(e.x, e.y - 0.2, `+${bounty}`, 0xffe066);
      this.spawnParticles(e.x, e.y, 6, hex(e.def.color));
      this.emitSound('kill');
      if (
        this.currentMap.mechanic === 'lawn-split-burrow' &&
        e.def.id === 'cruiser' &&
        !e.isSplitChild
      ) {
        this.spawnSplitChildren(e.def, e.x, e.y, e.vx, e.vy, e.ang, e.rem, e.maxHp);
      }
    }
  }

  private fireTowers(dt: number): void {
    const isNaval = this.currentMap.mechanic === 'naval-subs-mines';
    const isLawn = this.currentMap.mechanic === 'lawn-split-burrow';
    const isMedieval = this.currentMap.mechanic === 'medieval-frenzy';
    const isKitchen = this.currentMap.mechanic === 'kitchen-rush';
    for (const t of this.towers) {
      if (t.hp <= 0) continue;
      if ((isMedieval || isKitchen) && t.def.id === 'swarm') {
        const baseCd = isKitchen
          ? (t.tier === 0 ? 7.5 : t.tier === 1 ? 7.0 : 6.5)
          : (t.tier === 0 ? 8.0 : t.tier === 1 ? 7.5 : 7.0);
        const cd = t.boosted ? baseCd / 1.25 : baseCd;
        t.stableMaxCd = cd;
        t.cooldown -= dt;
        if (t.cooldown > 0) continue;

        const unitCount = isKitchen
          ? (t.tier === 0 ? 1 : t.tier === 1 ? 2 : 3)
          : (t.tier === 0 ? 1 : t.tier === 1 ? 3 : 5);
        let owned = 0;
        for (const k of this.knights) {
          if (k.active && k.towerId === t.id) owned++;
        }
        const tx = t.x + 0.5;
        const ty = t.y + 0.5;
        const rangeLimit = isKitchen ? 10 : 9.5;
        let hasGroundEnemy = false;
        for (const e of this.enemies) {
          if (e.dead || e.def.flying || e.hp <= 0) continue;
          if (this.launched || Math.hypot(e.x - tx, e.y - ty) <= rangeLimit) {
            hasGroundEnemy = true;
            break;
          }
        }
        if (hasGroundEnemy && owned < unitCount * 2) {
          const maxHp = isKitchen ? 85 + t.tier * 30 : 75 + t.tier * 25;
          const damage = isKitchen ? 24 + t.tier * 10 : 28 + t.tier * 12;
          const speed = isKitchen ? 3.0 + t.tier * 0.35 : 3.2;
          const life = isKitchen ? 18 : 16;
          const kind: Knight['kind'] = isKitchen ? 'roomba' : 'knight';
          for (let i = 0; i < unitCount; i++) {
            const ox = unitCount === 1 ? 0 : ((i - (unitCount - 1) / 2) / ((unitCount - 1) / 2)) * 0.25;
            const oy = unitCount === 1 ? 0 : (i % 2 === 0 ? -0.15 : 0.15);
            const k = acquire<Knight>(this.knights, () => ({
              active: false, kind: 'knight', id: 0, owner: 0, towerId: 0, x: 0, y: 0, vx: 0, vy: 0,
              hp: 0, maxHp: 0, damage: 0, attackCd: 0, speed: 0, tier: 0, life: 0,
            }));
            Object.assign(k, {
              active: true,
              kind,
              id: this.nextKnightId++,
              owner: t.owner,
              towerId: t.id,
              x: tx + ox,
              y: ty + oy,
              vx: 0,
              vy: 0,
              hp: maxHp,
              maxHp,
              damage,
              attackCd: 0,
              speed,
              tier: t.tier,
              life,
            });
          }
          t.cooldown = cd;
          this.emitSound(isKitchen ? 'roomba-deploy' : 'knight-charge');
        } else {
          t.cooldown = 0;
        }
        continue;
      }
      t.cooldown -= dt;
      if (t.cooldown > 0) continue;

      const s = this.towerStats(t);
      const tx = t.x + 0.5;
      const ty = t.y + 0.5;
      const r2 = s.range * s.range;
      const color = hex(t.def.color);
      const interval = 1 / s.fireRate;

      // Stasis / Sonar Buoy / Lawn Thumper: radial ground/sea pulse
      if (s.slowDuration > 0) {
        let hit = 0;
        let flushedMole = false;
        for (const e of this.enemies) {
          if (e.dead || e.def.flying) continue;
          const dx = e.x - tx;
          const dy = e.y - ty;
          if (dx * dx + dy * dy > r2) continue;
          e.slowT = Math.max(e.slowT, s.slowDuration);
          e.slowF = Math.min(e.slowF, s.slowFactor);
          if (isNaval) e.revealedT = Math.max(e.revealedT, 3.5);
          if (isLawn && e.submerged) {
            if (e.revealedT <= 0) flushedMole = true;
            e.revealedT = Math.max(e.revealedT, 3.5);
          }
          this.damageEnemy(e, s.damage, t.owner, {
            armorPierce: s.armorPierce,
            shieldMultiplier: s.shieldMultiplier,
            shieldStrip: s.shieldStrip,
            burnDps: s.burnDps,
            burnDuration: s.burnDuration,
          }, t);
          hit++;
        }
        if (hit > 0) {
          const ring = acquire(this.rings, () => ({ active: false, x: 0, y: 0, r: 0, ttl: 0, max: 0, color: 0 }));
          Object.assign(ring, { active: true, x: tx, y: ty, r: s.range, ttl: 0.4, max: 0.4, color });
          t.cooldown = Math.max(0, t.cooldown + interval);
          this.emitSound(isNaval ? 'sonar-ping' : 'shot-stasis');
          if (flushedMole) this.emitSound('mole-flush');
        } else {
          t.cooldown = 0;
        }
        continue;
      }

      // Naval Minefield: deploy floating SeaMine instead of firing mortar projectiles
      if (isNaval && t.def.id === 'plasma') {
        this.deploySeaMine(t, s, interval);
        continue;
      }

      const canDetectSub = (isNaval || isLawn) && (s.pierceCount > 0 || s.armorPierce);
      const best = pickTarget(this.enemies, tx, ty, s.range, s.targetsAir, t.priority, canDetectSub);
      if (!best) { t.cooldown = 0; continue; }

      t.cooldown = Math.max(0, t.cooldown + interval);
      t.aimAngle = Math.atan2(best.y - ty, best.x - tx);

      // Railgun / ASW Sub Destroyer: piercing ray along aim vector
      if (s.pierceCount > 0 || s.armorPierce) {
        const dx = best.x - tx;
        const dy = best.y - ty;
        const len = Math.max(1e-6, Math.hypot(dx, dy));
        const ux = dx / len;
        const uy = dy / len;
        const rayLen = s.range + 1.5;
        const x2 = tx + ux * rayLen;
        const y2 = ty + uy * rayLen;

        const beam = acquire<Beam>(this.beams, () => ({
          active: false, kind: 'rail', x1: 0, y1: 0, x2: 0, y2: 0, width: 3, ttl: 0, max: 0, color: 0,
        }));
        Object.assign(beam, {
          active: true, kind: 'rail' as const, x1: tx, y1: ty, x2, y2,
          width: t.tier >= 2 ? 4 : 3, ttl: 0.18, max: 0.18, color,
        });

        const hits: { e: Enemy; along: number }[] = [];
        for (const e of this.enemies) {
          if (e.dead) continue;
          if (!s.targetsAir && e.def.flying) continue;
          if (lineIntersectsCircle(tx, ty, x2, y2, e.x, e.y, 0.42)) {
            hits.push({ e, along: (e.x - tx) * ux + (e.y - ty) * uy });
          }
        }
        hits.sort((a, b) => a.along - b.along);
        const cap = Math.max(1, s.pierceCount);
        for (let i = 0; i < hits.length && i < cap; i++) {
          const target = hits[i].e;
          const dmg = (isNaval || isLawn) && target.submerged ? s.damage * 1.4 : s.damage;
          if ((isNaval || isLawn) && target.submerged) target.revealedT = Math.max(target.revealedT, 2.5);
          this.damageEnemy(target, dmg, t.owner, {
            armorPierce: s.armorPierce,
            shieldMultiplier: s.shieldMultiplier,
            shieldStrip: s.shieldStrip,
            burnDps: s.burnDps,
            burnDuration: s.burnDuration,
          }, t);
          this.spawnParticles(target.x, target.y, 3, color, 2.0, 2.0);
        }
        this.emitSound('shot-rail');
        continue;
      }

      // Swarm: homing micro-missiles
      if (s.missileCount > 0) {
        this.emitSound('shot-swarm');
        const count = s.missileCount;
        for (let m = 0; m < count; m++) {
          const spread = (m - (count - 1) / 2) * 0.45;
          const ang = t.aimAngle + spread;
          const p = acquire<Projectile>(this.projectiles, () => ({
            active: false, kind: 'missile', x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0,
            targetId: 0, speed: 0, damage: 0, splash: 0, owner: 0, color: 0,
            burnDps: 0, burnDuration: 0, shieldMultiplier: 1,
          }));
          Object.assign(p, {
            active: true,
            kind: 'missile' as const,
            x: tx,
            y: ty,
            vx: Math.cos(ang) * t.def.projectileSpeed,
            vy: Math.sin(ang) * t.def.projectileSpeed,
            tx: best.x,
            ty: best.y,
            targetId: best.id,
            speed: t.def.projectileSpeed,
            damage: s.damage,
            splash: s.splashRadius,
            owner: t.owner,
            color,
            burnDps: s.burnDps,
            burnDuration: s.burnDuration,
            shieldMultiplier: s.shieldMultiplier,
            towerId: t.id,
          });
        }
        continue;
      }

      // Pulse: hitscan beam
      if (t.def.projectileSpeed <= 0) {
        const kind = t.tier >= 2 ? ('overcharge' as const) : ('pulse' as const);
        const width = t.tier >= 2 ? 3.5 : 2;
        if (t.tier === 1) {
          const dx = best.x - tx;
          const dy = best.y - ty;
          const len = Math.max(1e-6, Math.hypot(dx, dy));
          const px = (-dy / len) * 0.08;
          const py = (dx / len) * 0.08;
          for (const sign of [-1, 1]) {
            const beam = acquire<Beam>(this.beams, () => ({
              active: false, kind: 'pulse', x1: 0, y1: 0, x2: 0, y2: 0, width: 2, ttl: 0, max: 0, color: 0,
            }));
            Object.assign(beam, {
              active: true, kind, x1: tx + px * sign, y1: ty + py * sign,
              x2: best.x + px * sign, y2: best.y + py * sign, width, ttl: 0.08, max: 0.08, color,
            });
          }
        } else {
          const beam = acquire<Beam>(this.beams, () => ({
            active: false, kind: 'pulse', x1: 0, y1: 0, x2: 0, y2: 0, width: 2, ttl: 0, max: 0, color: 0,
          }));
          Object.assign(beam, {
            active: true, kind, x1: tx, y1: ty, x2: best.x, y2: best.y, width, ttl: 0.08, max: 0.08, color,
          });
        }
        this.emitSound(t.tier >= 2 ? 'shot-overcharge' : 'shot-pulse');
        this.damageEnemy(best, s.damage, t.owner, {
          armorPierce: s.armorPierce,
          shieldMultiplier: s.shieldMultiplier,
          shieldStrip: s.shieldStrip,
          burnDps: s.burnDps,
          burnDuration: s.burnDuration,
        }, t);
        continue;
      }

      // Plasma: predictive lead splash mortar
      this.emitSound('shot-plasma');
      const lead = predictIntercept(tx, ty, t.def.projectileSpeed, best.x, best.y, best.vx, best.vy);
      t.aimAngle = Math.atan2(lead.y - ty, lead.x - tx);
      const ldx = lead.x - tx;
      const ldy = lead.y - ty;
      const lLen = Math.max(1e-6, Math.hypot(ldx, ldy));
      const p = acquire<Projectile>(this.projectiles, () => ({
        active: false, kind: 'plasma', x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0,
        targetId: 0, speed: 0, damage: 0, splash: 0, owner: 0, color: 0,
        burnDps: 0, burnDuration: 0, shieldMultiplier: 1,
      }));
      Object.assign(p, {
        active: true,
        kind: 'plasma' as const,
        x: tx,
        y: ty,
        vx: (ldx / lLen) * t.def.projectileSpeed,
        vy: (ldy / lLen) * t.def.projectileSpeed,
        tx: lead.x,
        ty: lead.y,
        targetId: best.id,
        speed: t.def.projectileSpeed,
        damage: s.damage,
        splash: s.splashRadius,
        owner: t.owner,
        color,
        burnDps: s.burnDps,
        burnDuration: s.burnDuration,
        shieldMultiplier: s.shieldMultiplier,
        towerId: t.id,
        flaming: isMedieval && t.tier >= 2,
      });
    }
  }

  private findEnemyById(id: number): Enemy | null {
    for (const e of this.enemies) if (!e.dead && e.id === id) return e;
    return null;
  }

  private nearestEnemy(x: number, y: number): Enemy | null {
    let best: Enemy | null = null;
    let bestD2 = Infinity;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const dx = e.x - x;
      const dy = e.y - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) { bestD2 = d2; best = e; }
    }
    return best;
  }

  private updateProjectiles(dt: number): void {
    for (const p of this.projectiles) {
      if (!p.active) continue;
      const tower = p.towerId !== undefined ? (this.towerById(p.towerId) ?? undefined) : undefined;
      const hitOpts: HitOpts = {
        armorPierce: false,
        shieldMultiplier: p.shieldMultiplier,
        shieldStrip: 0,
        burnDps: p.burnDps,
        burnDuration: p.burnDuration,
      };

      if (p.kind === 'missile') {
        let target = this.findEnemyById(p.targetId);
        if (!target) {
          target = this.nearestEnemy(p.x, p.y);
          if (target) p.targetId = target.id;
        }
        if (target) {
          p.tx = target.x;
          p.ty = target.y;
          const curAng = Math.atan2(p.vy, p.vx);
          const wantAng = Math.atan2(p.ty - p.y, p.tx - p.x);
          const nextAng = turnToward(curAng, wantAng, 8 * dt);
          p.vx = Math.cos(nextAng) * p.speed;
          p.vy = Math.sin(nextAng) * p.speed;
        }
        const dx = p.tx - p.x;
        const dy = p.ty - p.y;
        const d = Math.hypot(dx, dy);
        const stepDist = p.speed * dt;
        if (d > stepDist && d > 0.25) {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          continue;
        }
        p.active = false;
        if (p.splash > 0) {
          const r2 = p.splash * p.splash;
          for (const e of this.enemies) {
            if (e.dead) continue;
            const ex = e.x - p.tx;
            const ey = e.y - p.ty;
            if (ex * ex + ey * ey <= r2) this.damageEnemy(e, p.damage, p.owner, hitOpts, tower);
          }
        } else if (target && !target.dead) {
          this.damageEnemy(target, p.damage, p.owner, hitOpts, tower);
        } else {
          const near = this.nearestEnemy(p.tx, p.ty);
          if (near && Math.hypot(near.x - p.tx, near.y - p.ty) <= 0.5) {
            this.damageEnemy(near, p.damage, p.owner, hitOpts, tower);
          }
        }
        const ring = acquire(this.rings, () => ({ active: false, x: 0, y: 0, r: 0, ttl: 0, max: 0, color: 0 }));
        Object.assign(ring, {
          active: true, x: p.tx, y: p.ty, r: p.splash > 0 ? p.splash : 0.35, ttl: 0.2, max: 0.2, color: p.color,
        });
        this.emitSound('impact-missile');
        continue;
      }

      // Plasma mortar
      const dx = p.tx - p.x;
      const dy = p.ty - p.y;
      const d = Math.hypot(dx, dy);
      const stepDist = p.speed * dt;
      if (d > stepDist) {
        p.x += (dx / d) * stepDist;
        p.y += (dy / d) * stepDist;
        continue;
      }
      p.active = false;
      const r2 = p.splash * p.splash;
      const isLawn = this.currentMap.mechanic === 'lawn-split-burrow';
      const isT2Plasma = isLawn && tower !== undefined && tower.def.id === 'plasma' && tower.tier >= 2;
      for (const e of this.enemies) {
        if (e.dead || e.def.flying) continue;
        if (isLawn && e.submerged && e.revealedT <= 0 && !isT2Plasma) continue;
        const ex = e.x - p.tx;
        const ey = e.y - p.ty;
        if (ex * ex + ey * ey <= r2) {
          if (isT2Plasma && e.submerged) e.revealedT = Math.max(e.revealedT, 2.5);
          this.damageEnemy(e, p.damage, p.owner, hitOpts, tower);
        }
      }
      const ring = acquire(this.rings, () => ({ active: false, x: 0, y: 0, r: 0, ttl: 0, max: 0, color: 0 }));
      Object.assign(ring, { active: true, x: p.tx, y: p.ty, r: p.splash, ttl: 0.25, max: 0.25, color: p.color });
      this.spawnParticles(p.tx, p.ty, 5, p.color, 2.2, 2.4);
      this.emitSound('impact-plasma');
      if (p.flaming) {
        const fz = acquire<FireZone>(this.fireZones, () => ({
          active: false, x: 0, y: 0, radius: 0, dps: 0, ttl: 0, max: 0, owner: 0, towerId: 0,
        }));
        Object.assign(fz, {
          active: true,
          x: p.tx,
          y: p.ty,
          radius: 1.35,
          dps: 22,
          ttl: 4.5,
          max: 4.5,
          owner: p.owner,
          towerId: p.towerId ?? 0,
        });
      }
    }
  }

  private deploySeaMine(t: Tower, s: TowerStats, interval: number): void {
    let ownedActive = 0;
    for (const m of this.mines) {
      if (m.active && m.towerId === t.id) ownedActive++;
    }
    if (ownedActive >= 3 + t.tier) {
      t.cooldown = 0;
      return;
    }

    const tx = t.x + 0.5;
    const ty = t.y + 0.5;
    const r2 = s.range * s.range;
    const minX = Math.max(0, Math.floor(t.x - s.range));
    const maxX = Math.min(this.w - 1, Math.ceil(t.x + s.range));
    const minY = Math.max(0, Math.floor(t.y - s.range));
    const maxY = Math.min(this.h - 1, Math.ceil(t.y + s.range));

    let bestX = -1;
    let bestY = -1;
    let bestDist = Infinity;
    let bestTowerD2 = Infinity;

    for (let cy = minY; cy <= maxY; cy++) {
      for (let cx = minX; cx <= maxX; cx++) {
        const mx = cx + 0.5;
        const my = cy + 0.5;
        const d2 = (mx - tx) * (mx - tx) + (my - ty) * (my - ty);
        if (d2 > r2) continue;
        const idx = this.idx(cx, cy);
        if (this.blocked[idx] || this.reserved[idx] || this.dist[idx] < 0) continue;

        let tooClose = false;
        for (const m of this.mines) {
          if (!m.active) continue;
          const mdx = m.x - mx;
          const mdy = m.y - my;
          if (mdx * mdx + mdy * mdy < 0.7 * 0.7) {
            tooClose = true;
            break;
          }
        }
        if (tooClose) continue;

        const routeDist = this.dist[idx];
        if (routeDist < bestDist || (routeDist === bestDist && d2 < bestTowerD2)) {
          bestDist = routeDist;
          bestTowerD2 = d2;
          bestX = mx;
          bestY = my;
        }
      }
    }

    if (bestX < 0) {
      t.cooldown = 0;
      return;
    }

    const mine = acquire<SeaMine>(this.mines, () => ({
      active: false, x: 0, y: 0, damage: 0, splash: 0, burnDps: 0, burnDuration: 0,
      hitsSub: false, owner: 0, towerId: 0, ttl: 0,
    }));
    Object.assign(mine, {
      active: true,
      x: bestX,
      y: bestY,
      damage: s.damage,
      splash: s.splashRadius,
      burnDps: s.burnDps,
      burnDuration: s.burnDuration,
      hitsSub: t.tier >= 2,
      owner: t.owner,
      towerId: t.id,
      ttl: 45,
    });
    t.cooldown = Math.max(0, t.cooldown + interval);
    t.aimAngle = Math.atan2(bestY - ty, bestX - tx);
    this.emitSound('shot-mine');
  }

  private updateMines(dt: number): void {
    const trigR2 = 0.65 * 0.65;
    for (const m of this.mines) {
      if (!m.active) continue;
      m.ttl -= dt;
      if (m.ttl <= 0) {
        m.active = false;
        continue;
      }

      let triggered = false;
      for (const e of this.enemies) {
        if (e.dead || e.def.flying) continue;
        if (e.submerged && !m.hitsSub && e.revealedT <= 0) continue;
        const dx = e.x - m.x;
        const dy = e.y - m.y;
        if (dx * dx + dy * dy <= trigR2) {
          triggered = true;
          break;
        }
      }
      if (!triggered) continue;

      const tower = this.towerById(m.towerId) ?? undefined;
      const splashR2 = m.splash * m.splash;
      const hitOpts: HitOpts = {
        armorPierce: false,
        shieldMultiplier: 1,
        shieldStrip: 0,
        burnDps: m.burnDps,
        burnDuration: m.burnDuration,
      };
      for (const e of this.enemies) {
        if (e.dead || e.def.flying) continue;
        if (e.submerged && !m.hitsSub && e.revealedT <= 0) continue;
        const dx = e.x - m.x;
        const dy = e.y - m.y;
        if (dx * dx + dy * dy <= splashR2) {
          this.damageEnemy(e, m.damage, m.owner, hitOpts, tower);
        }
      }
      const ring = acquire(this.rings, () => ({ active: false, x: 0, y: 0, r: 0, ttl: 0, max: 0, color: 0 }));
      Object.assign(ring, { active: true, x: m.x, y: m.y, r: m.splash, ttl: 0.28, max: 0.28, color: 0xff8844 });
      this.spawnParticles(m.x, m.y, 8, 0xff8844, 2.6, 2.5);
      this.emitSound('impact-mine');
      m.active = false;
    }
  }

  private spawnMeteor(): void {
    const minX = 1.5;
    const maxX = Math.max(minX, this.w - 2.5);
    const minY = 1.5;
    const maxY = Math.max(minY, this.h - 2.5);
    const clampX = (x: number) => Math.max(minX, Math.min(maxX, x));
    const clampY = (y: number) => Math.max(minY, Math.min(maxY, y));
    const validTarget = (cx: number, cy: number): boolean => {
      for (const [ex, ey] of this.currentMap.exits) {
        if (Math.hypot(cx - (ex + 0.5), cy - (ey + 0.5)) <= 2.2) return false;
      }
      for (const [sx, sy] of this.currentMap.spawns) {
        if (Math.hypot(cx - (sx + 0.5), cy - (sy + 0.5)) <= 1.8) return false;
      }
      return true;
    };

    const candidates: { x: number; y: number; minDist: number }[] = [];
    for (let attempt = 0; attempt < 42 && candidates.length < 14; attempt++) {
      let cx: number;
      let cy: number;
      if (this.towers.length > 0 && Math.random() < 0.55) {
        const t = this.towers[Math.floor(Math.random() * this.towers.length)];
        cx = clampX(t.x + 0.5 + (Math.random() - 0.5) * 1.8);
        cy = clampY(t.y + 0.5 + (Math.random() - 0.5) * 1.8);
      } else {
        cx = clampX(minX + Math.random() * (maxX - minX));
        cy = clampY(minY + Math.random() * (maxY - minY));
      }
      if (!validTarget(cx, cy)) continue;
      let minDist = Infinity;
      for (const prev of this.recentMeteors) {
        const d = Math.hypot(cx - prev.x, cy - prev.y);
        if (d < minDist) minDist = d;
      }
      candidates.push({ x: cx, y: cy, minDist });
    }

    let chosen = { x: (minX + maxX) * 0.5, y: (minY + maxY) * 0.5 };
    if (candidates.length > 0) {
      const qualifying = candidates.filter(c => c.minDist >= 4.0);
      if (qualifying.length > 0) {
        chosen = qualifying[Math.floor(Math.random() * qualifying.length)];
      } else {
        let best = candidates[0];
        for (const c of candidates) {
          if (c.minDist > best.minDist) best = c;
        }
        chosen = best;
      }
    }

    if (this.recentMeteors.length >= 5) this.recentMeteors.shift();
    this.recentMeteors.push({ x: chosen.x, y: chosen.y });

    const meteor = acquire(this.meteors, () => ({
      active: false,
      id: 0,
      tx: 0,
      ty: 0,
      sx: 0,
      sy: 0,
      t: 0,
      dur: 1.35,
      radius: 1.65,
      damage: 40,
    }));
    Object.assign(meteor, {
      active: true,
      id: this.nextMeteorId++,
      tx: chosen.x,
      ty: chosen.y,
      sx: chosen.x - 4.5,
      sy: chosen.y - 5.5,
      t: 0,
      dur: 1.35,
      radius: 1.65,
      damage: 40,
    });
    this.emitSound('meteor-warn');
  }

  private updateMeteors(dt: number): void {
    for (const m of this.meteors) {
      if (!m.active) continue;
      m.t += dt;
      if (m.t < m.dur) continue;
      m.active = false;
      this.emitSound('meteor-impact');

      const ring = acquire(this.rings, () => ({ active: false, x: 0, y: 0, r: 0, ttl: 0, max: 0, color: 0 }));
      Object.assign(ring, { active: true, x: m.tx, y: m.ty, r: m.radius, ttl: 0.45, max: 0.45, color: 0xff6b2b });
      this.spawnParticles(m.tx, m.ty, 7, 0xff8c42, 3.2, 3.0);
      this.spawnParticles(m.tx, m.ty, 7, 0xffd166, 2.6, 2.5);

      for (const t of this.towers) {
        const d = Math.hypot((t.x + 0.5) - m.tx, (t.y + 0.5) - m.ty);
        if (d <= m.radius) {
          const dmg = d <= 0.75 ? m.damage : Math.max(18, Math.round(m.damage * (1 - (d - 0.75) / 1.15)));
          const wasAlive = t.hp > 0;
          t.hp = Math.max(0, t.hp - dmg);
          this.towerVersion++;
          if (wasAlive && t.hp === 0) {
            this.spawnPopup(t.x + 0.5, t.y + 0.2, 'OFFLINE!', 0xff4d5a);
          } else {
            this.spawnPopup(t.x + 0.5, t.y + 0.2, `-${dmg}`, 0xff9f43);
          }
          this.spawnParticles(t.x + 0.5, t.y + 0.5, 4, 0xff9f43, 2.2, 2.2);
        }
      }

      for (const e of this.enemies) {
        if (e.dead || e.def.flying) continue;
        if (Math.hypot(e.x - m.tx, e.y - m.ty) <= m.radius) {
          this.damageEnemy(e, 25, -1, {
            armorPierce: false,
            shieldMultiplier: 1,
            shieldStrip: 0,
            burnDps: 0,
            burnDuration: 0,
          });
        }
      }
    }
  }

  private updateKnights(dt: number): void {
    for (const k of this.knights) {
      if (!k.active) continue;
      k.life -= dt;
      if (k.life <= 0 || k.hp <= 0) {
        k.active = false;
        continue;
      }

      let enemy: Enemy | null = null;
      let bestD2 = Infinity;
      for (const e of this.enemies) {
        if (e.dead || e.def.flying || e.hp <= 0) continue;
        const dx = e.x - k.x;
        const dy = e.y - k.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestD2) {
          bestD2 = d2;
          enemy = e;
        }
      }

      if (!enemy) {
        k.vx = 0;
        k.vy = 0;
        continue;
      }

      const dx = enemy.x - k.x;
      const dy = enemy.y - k.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 0.58) {
        const ux = dx / dist;
        const uy = dy / dist;
        const move = Math.min(k.speed * dt, dist - 0.58);
        k.vx = ux * k.speed;
        k.vy = uy * k.speed;
        k.x += ux * move;
        k.y += uy * move;
      } else if (dist > 1e-6) {
        k.vx = (dx / dist) * 0.01;
        k.vy = (dy / dist) * 0.01;
      }

      k.attackCd = Math.max(0, k.attackCd - dt);
      if (k.kind === 'roomba') {
        if (dist <= 0.75 && k.attackCd <= 0) {
          const tower = this.towerById(k.towerId) ?? undefined;
          const sweepRadius = 0.85 + k.tier * 0.15;
          const sweepR2 = sweepRadius * sweepRadius;
          const boostedBurn = Boolean(tower?.boosted && this.currentMap.mechanic === 'kitchen-rush');
          for (const e of this.enemies) {
            if (e.dead || e.def.flying || e.hp <= 0) continue;
            const edx = e.x - k.x;
            const edy = e.y - k.y;
            if (edx * edx + edy * edy > sweepR2) continue;
            this.damageEnemy(e, k.damage, k.owner, {
              armorPierce: k.tier >= 2,
              shieldMultiplier: 1,
              shieldStrip: 0,
              burnDps: boostedBurn ? 10 : 0,
              burnDuration: boostedBurn ? 2.5 : 0,
            }, tower);
            e.slowT = Math.max(e.slowT, 0.40);
            e.slowF = Math.min(e.slowF, 0.50);
          }
          k.attackCd = 0.60;
          this.emitSound('roomba-sweep');
          this.spawnParticles(k.x, k.y, 5, 0x38bdf8, 2.2, 2.0);
          const counterDmg = enemy.def.boss ? 22 : enemy.def.id === 'cruiser' ? 14 : 9;
          k.hp = Math.max(0, k.hp - counterDmg);
          if (k.hp <= 0) k.active = false;
        }
      } else if (dist <= 0.68 && k.attackCd <= 0) {
        const tower = this.towerById(k.towerId) ?? undefined;
        this.damageEnemy(enemy, k.damage, k.owner, {
          armorPierce: k.tier >= 2,
          shieldMultiplier: 1,
          shieldStrip: 0,
          burnDps: 0,
          burnDuration: 0,
        }, tower);
        k.attackCd = 0.65;
        this.emitSound('knight-clash');
        this.spawnParticles(enemy.x, enemy.y, 4, 0xe2e8f0, 2.2, 2.0);
        enemy.slowT = Math.max(enemy.slowT, 0.45);
        enemy.slowF = Math.min(enemy.slowF, 0.45);
        const counterDmg = enemy.def.boss ? 28 : enemy.def.id === 'cruiser' ? 18 : 11;
        k.hp = Math.max(0, k.hp - counterDmg);
        if (k.hp <= 0) k.active = false;
      }
    }
  }

  private updateFireZones(dt: number): void {
    for (const fz of this.fireZones) {
      if (!fz.active) continue;
      fz.ttl -= dt;
      if (fz.ttl <= 0) {
        fz.active = false;
        continue;
      }
      const r2 = fz.radius * fz.radius;
      const tower = fz.towerId ? (this.towerById(fz.towerId) ?? undefined) : undefined;
      for (const e of this.enemies) {
        if (e.dead || e.def.flying || e.hp <= 0) continue;
        const dx = e.x - fz.x;
        const dy = e.y - fz.y;
        if (dx * dx + dy * dy <= r2) {
          this.damageEnemy(e, fz.dps * dt, fz.owner, {
            armorPierce: false,
            shieldMultiplier: 1,
            shieldStrip: 0,
            burnDps: 8,
            burnDuration: 1.5,
          }, tower);
        }
      }
    }
  }

  private updateEffects(dt: number): void {
    for (const b of this.beams) if (b.active && (b.ttl -= dt) <= 0) b.active = false;
    for (const r of this.rings) if (r.active && (r.ttl -= dt) <= 0) r.active = false;
    for (const p of this.particles) {
      if (!p.active) continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.94;
      p.vy *= 0.94;
      if ((p.ttl -= dt) <= 0) p.active = false;
    }
    for (const pop of this.popups) {
      if (!pop.active) continue;
      pop.y += pop.vy * dt;
      if ((pop.ttl -= dt) <= 0) pop.active = false;
    }
  }

  private compactEnemies(): void {
    let j = 0;
    for (const e of this.enemies) if (!e.dead) this.enemies[j++] = e;
    this.enemies.length = j;
  }

  setPaused(p: boolean): void { if (!this.over) this.paused = p; }
  togglePause(): void { this.setPaused(!this.paused); }
}
