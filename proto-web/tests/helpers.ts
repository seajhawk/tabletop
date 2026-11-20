import { loadData } from '../src/data';
import type { GameData, MapDef } from '../src/types';
import { Game, type Enemy } from '../src/sim/game';

export function dataWithMap(map: Partial<MapDef>): GameData {
  const d = loadData();
  return { ...d, map: { ...d.map, ...map } };
}

/** 6x3 map with two sealed lanes (top row y=0, bottom row y=2) joined only at both ends. */
export function laneData(): GameData {
  return dataWithMap({
    id: 'lanes', width: 6, height: 3, spawns: [[0, 1]], exits: [[5, 1]],
    asteroids: [[1, 1], [2, 1], [3, 1], [4, 1]], startingCredits: 1000, startingLives: 30,
  });
}

/**
 * 9x3 map: short corridor on y=2 (spawn (0,2) -> exit (8,2)) walled off by asteroids at y=1 from a longer
 * detour along y=0 that rejoins through columns 0 and 8. Towers dropped behind an enemy seal the corridor
 * into an isolated pocket while the spawn stays connected through the detour.
 */
export function pocketData(): GameData {
  return dataWithMap({
    id: 'pocket', width: 9, height: 3, spawns: [[0, 2]], exits: [[8, 2]],
    asteroids: [[1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [7, 1]], startingCredits: 1000, startingLives: 30,
  });
}

export function makeEnemy(
  game: Game,
  id: number,
  enemyId: string,
  x: number,
  y: number,
  overrides: Partial<Enemy> = {},
): Enemy {
  const def = game.enemyById.get(enemyId)!;
  return {
    id,
    def,
    x,
    y,
    vx: 0,
    vy: 0,
    cx: Math.floor(x),
    cy: Math.floor(y),
    nx: Math.floor(x) + 1,
    ny: Math.floor(y),
    hp: def.hp,
    maxHp: def.hp,
    shield: def.shield,
    maxShield: def.shield,
    shieldDelay: 0,
    slowT: 0,
    slowF: 1,
    burnT: 0,
    burnDps: 0,
    burnOwner: 0,
    bossPhase: 0,
    ang: 0,
    rem: 27 - x,
    ox: 0,
    oy: 0,
    dead: false,
    leaked: false,
    submerged: false,
    revealedT: 0,
    enraged: false,
    isSplitChild: false,
    ...overrides,
  };
}

export function newGame(players = 2): Game { return new Game(loadData(), players); }
export function run(game: Game, seconds: number): void {
  for (let i = 0; i < Math.round(seconds * 60); i++) game.step(1 / 60);
}
