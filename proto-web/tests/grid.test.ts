import { describe, expect, it } from 'vitest';
import { computeDist, followRoute, placementKeepsRoutes } from '../src/sim/grid';
import { loadData } from '../src/data';
import { Game } from '../src/sim/game';
import { laneData, makeEnemy, pocketData, run } from './helpers';

describe('reverse multi-source BFS', () => {
  it('computes distances from every exit', () => {
    const blocked = new Uint8Array(5 * 1);
    const d = computeDist(5, 1, blocked, [[0, 0], [4, 0]]);
    expect(Array.from(d)).toEqual([0, 1, 2, 1, 0]);
  });
  it('marks sealed cells unreachable', () => {
    const blocked = new Uint8Array(5);
    blocked[2] = 1;
    const d = computeDist(5, 1, blocked, [[4, 0]]);
    expect(Array.from(d)).toEqual([-1, -1, -1, 1, 0]);
  });
  it('followRoute walks downhill to an exit', () => {
    const d = computeDist(4, 1, new Uint8Array(4), [[3, 0]]);
    expect(followRoute(4, 1, d, 0)).toEqual([0, 1, 2, 3]);
  });
});

describe('placement anti-wall checks', () => {
  it('rejects a cell that strands a spawn and leaves state untouched', () => {
    const g = new Game(laneData(), 2);
    expect(g.tryPlace(0, 'pulse', 3, 0).ok).toBe(true);
    const before = { credits: [...g.credits], towers: g.towers.length, blocked: Array.from(g.blocked) };
    const r = g.tryPlace(1, 'pulse', 3, 2); // would complete the wall at x=3
    expect(r).toMatchObject({ ok: false, reason: 'blocks-path' });
    expect(g.credits).toEqual(before.credits);
    expect(g.towers.length).toBe(before.towers);
    expect(Array.from(g.blocked)).toEqual(before.blocked);
  });

  it('rejects a cell that strands a LIVE enemy in an isolated pocket although the spawn stays connected', () => {
    const g = new Game(pocketData(), 2);
    g.launchWave();
    g.spawners = [];
    g.enemies = [g.enemies[0]];
    const e = g.enemies[0];
    let guard = 0;
    while (e.nx < 4 && guard++ < 3000) g.step(1 / 60);
    expect(e.ny).toBe(2);
    expect(e.cx).toBeGreaterThanOrEqual(3);
    // control: while the corridor behind the enemy is open it can backtrack via the detour, so blocking ahead is legal
    expect(g.check(0, 'pulse', 6, 2).ok).toBe(true);
    // seal the corridor behind the enemy: legal, because the enemy still reaches the exit and the spawn uses the detour
    expect(g.tryPlace(0, 'pulse', 1, 2).ok).toBe(true);
    expect(g.dist[g.idx(0, 2)]).toBeGreaterThan(0);
    // now the enemy lives in a sealed pocket: any cell ahead of it on y=2 would strand it
    for (const x of [e.nx + 1, 6, 7]) {
      expect(g.check(0, 'pulse', x, 2)).toMatchObject({ ok: false, reason: 'blocks-path' });
    }
    // positive control: a fresh game with no live enemy may block the same cell (spawn alone stays connected)
    const fresh = new Game(pocketData(), 2);
    expect(fresh.tryPlace(0, 'pulse', 1, 2).ok).toBe(true);
    expect(fresh.check(0, 'pulse', 6, 2).ok).toBe(true);
    // the enemy's current and next waypoints are both protected
    const req = g.requiredCells();
    expect(req).toContain(g.idx(e.cx, e.cy));
    expect(req).toContain(g.idx(e.nx, e.ny));
  });

  it('a live enemy that can still backtrack does not forbid blocking ahead', () => {
    const g = new Game(laneData(), 2);
    g.launchWave();
    g.spawners = [];
    g.enemies = [g.enemies[0]];
    let guard = 0;
    while (g.enemies[0].nx !== 3 && guard++ < 1200) g.step(1 / 60);
    const lane = g.enemies[0].ny;
    expect(g.check(0, 'pulse', 4, lane).ok).toBe(true);
    expect(g.check(0, 'pulse', 4, lane === 0 ? 2 : 0).ok).toBe(true);
  });

  it('rejects enemy-occupied, reserved, asteroid, occupied and outside cells', () => {
    const g = new Game(loadData(), 2);
    expect(g.check(0, 'pulse', 0, 4).reason).toBe('reserved');   // spawn
    expect(g.check(0, 'pulse', 27, 7).reason).toBe('reserved');  // exit
    expect(g.check(0, 'pulse', 6, 2).reason).toBe('asteroid');
    expect(g.check(0, 'pulse', -1, 2).reason).toBe('outside');
    expect(g.check(0, 'pulse', 28, 2).reason).toBe('outside');
    expect(g.tryPlace(0, 'pulse', 3, 3).ok).toBe(true);
    expect(g.check(1, 'pulse', 3, 3).reason).toBe('occupied');
    g.launchWave();
    const e = g.enemies[0];
    expect(g.check(0, 'pulse', e.nx, e.ny).reason).toBe('enemy');
  });

  it('rebuilds routes after a sale so a blocked lane reopens', () => {
    const g = new Game(laneData(), 2);
    g.tryPlace(0, 'pulse', 3, 0);
    expect(g.check(0, 'pulse', 3, 2).reason).toBe('blocks-path');
    expect(g.sellAt(3, 0)).not.toBeNull();
    expect(g.check(0, 'pulse', 3, 2).ok).toBe(true);
  });

  it('never lets a long run of legal placements disconnect spawns on the real map', () => {
    const g = new Game(loadData(), 4);
    for (let p = 0; p < 4; p++) g.grant(p, 5000);
    for (let y = 0; y < 16; y++) for (let x = 1; x < 27; x++) g.tryPlace((x + y) % 4, 'pulse', x, y);
    for (const [sx, sy] of g.data.map.spawns) expect(g.dist[g.idx(sx, sy)]).toBeGreaterThanOrEqual(0);
    run(g, 0.1);
  });

  it('flying enemies do not count in requiredCells or block ground turret placement', () => {
    const g = new Game(loadData(), 2);
    const flyer = makeEnemy(g, 901, 'phase', 5.5, 5.5, { cx: 5, cy: 5, nx: 6, ny: 5 });
    g.enemies = [flyer];
    const req = g.requiredCells();
    expect(req).not.toContain(g.idx(5, 5));
    expect(req).not.toContain(g.idx(6, 5));
    expect(g.tryPlace(0, 'pulse', 5, 5).ok).toBe(true);
  });
});
