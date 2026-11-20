export type TargetPriority = 'first' | 'strong' | 'close' | 'air';
export type GameSpeed = 1 | 2;
export type Difficulty = 'easy' | 'medium' | 'hard';
export const WAVE_COUNTS = [5, 10, 15, 20, 30] as const;
export type WaveCount = typeof WAVE_COUNTS[number];
export type MapTheme = 'space' | 'military' | 'naval' | 'mars' | 'medieval' | 'kitchen' | 'lawn';
export type MapMechanic = 'naval-subs-mines' | 'mars-storms' | 'medieval-frenzy' | 'kitchen-rush' | 'lawn-split-burrow';

export interface DifficultyPreset {
  id: Difficulty;
  label: string;
  hpMultiplier: number;
  speedMultiplier: number;
  creditMultiplier: number;
  bountyMultiplier: number;
  lives: number;
}

export const DIFFICULTIES: Record<Difficulty, DifficultyPreset> = {
  easy: { id: 'easy', label: 'Easy', hpMultiplier: 0.78, speedMultiplier: 0.90, creditMultiplier: 1.20, bountyMultiplier: 1.15, lives: 30 },
  medium: { id: 'medium', label: 'Medium', hpMultiplier: 1.00, speedMultiplier: 1.00, creditMultiplier: 1.00, bountyMultiplier: 1.00, lives: 25 },
  hard: { id: 'hard', label: 'Hard', hpMultiplier: 1.35, speedMultiplier: 1.08, creditMultiplier: 0.88, bountyMultiplier: 0.92, lives: 18 },
};

export type SoundEvent =
  | 'shot-pulse'
  | 'shot-overcharge'
  | 'shot-plasma'
  | 'shot-stasis'
  | 'shot-rail'
  | 'shot-swarm'
  | 'shot-mine'
  | 'impact-plasma'
  | 'impact-missile'
  | 'impact-mine'
  | 'sonar-ping'
  | 'dust-storm'
  | 'enrage'
  | 'fridge-open'
  | 'centipede-split'
  | 'mole-flush'
  | 'meteor-warn'
  | 'meteor-impact'
  | 'dragon-breath'
  | 'knight-charge'
  | 'knight-clash'
  | 'roomba-deploy'
  | 'roomba-sweep'
  | 'kill'
  | 'boss-phase'
  | 'leak'
  | 'ui-place'
  | 'ui-upgrade'
  | 'ui-repair'
  | 'ui-sell'
  | 'ui-error'
  | 'ui-share'
  | 'ui-wave'
  | 'ui-win'
  | 'ui-lose';

/**
 * Upgrade tier definition for a turret.
 *
 * All multiplier and bonus values are TOTAL cumulative values relative to the
 * turret's base stats (not compounded on top of previous tiers):
 * - Tier 1 applies `upgrades[0]` directly to the base `TurretDef` stats.
 * - Tier 2 applies `upgrades[1]` directly to the base `TurretDef` stats.
 */
export interface TurretUpgrade {
  name: string;
  cost: number;
  /** Total cumulative damage multiplier relative to base `TurretDef.damage`. */
  damageMultiplier: number;
  /** Total cumulative range bonus (in grid cells) added to base `TurretDef.range`. */
  rangeBonus: number;
  /** Total cumulative fire-rate multiplier relative to base `TurretDef.fireRate`. */
  fireRateMultiplier?: number;
  /** Total cumulative splash radius bonus (in grid cells) added to base `TurretDef.splashRadius`. */
  splashBonus?: number;
  /** Override slow factor (lower = stronger slow, in `(0, 1]`). */
  slowFactor?: number;
  /** Override shield damage multiplier. */
  shieldMultiplier?: number;
  /** Flat shield damage stripped per pulse/hit. */
  shieldStrip?: number;
  /** Override total number of targets pierced by a railgun shot. */
  pierceCount?: number;
  /** Total cumulative bonus missiles added to base `TurretDef.missileCount`. */
  missileBonus?: number;
  /** Burn damage per second applied on hit. */
  burnDps?: number;
  /** Burn duration in seconds applied on hit. */
  burnDuration?: number;
}

export interface TurretDef {
  id: string;
  name: string;
  cost: number;
  range: number;
  fireRate: number;
  damage: number;
  projectileSpeed: number;
  splashRadius: number;
  slowFactor: number;
  slowDuration: number;
  targetsAir: boolean;
  armorPierce: boolean;
  pierceCount: number;
  missileCount: number;
  shieldMultiplier: number;
  burnDps: number;
  burnDuration: number;
  color: string;
  upgrades: TurretUpgrade[];
}

export interface EnemyDef {
  id: string;
  name: string;
  hp: number;
  shield: number;
  shieldRegen: number;
  shieldRegenDelay: number;
  armor: number;
  speed: number;
  bounty: number;
  flying: boolean;
  boss: boolean;
  lifeCost: number;
  color: string;
}

export interface MapDef {
  id: string;
  name: string;
  theme?: MapTheme;
  mechanic?: MapMechanic;
  width: number;
  height: number;
  spawns: [number, number][];
  exits: [number, number][];
  asteroids: [number, number][];
  boostCells?: [number, number][];
  wallCells?: [number, number][];
  startingCredits: number;
  startingLives: number;
  /** Canonical stress fixture: exactly 20 [x, y, turretId]; owner = index % players. */
  stressTurrets: [number, number, string][];
}

export interface WaveGroup {
  enemyId: string;
  count: number;
  interval: number;
  spawnIndex: number;
}

export interface WaveDef {
  index: number;
  name: string;
  groups: WaveGroup[];
  stress: boolean;
  templateIndex?: number;
  tierSuffix?: string;
  overtime?: boolean;
}

export interface GameData {
  turrets: TurretDef[];
  enemies: EnemyDef[];
  /** Default/first map (`maps[0]`), kept for backwards compatibility. */
  map: MapDef;
  maps: MapDef[];
  waves: WaveDef[];
}
