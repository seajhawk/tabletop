import { describe, expect, it } from 'vitest';
import { loadData } from '../src/data';
import { computeHitDamage, lineIntersectsCircle, pickTarget, predictIntercept } from '../src/sim/combat';
import { Game } from '../src/sim/game';
import { FixedStepper } from '../src/sim/stepper';
import { formatWaveName } from '../src/theme';
import { WAVE_COUNTS } from '../src/types';
import { makeEnemy, newGame, run } from './helpers';

describe('economy', () => {
  it('splits bounty 70% owner / 30% across all active players, keeping fractions', () => {
    const g = newGame(4);
    g.awardBounty(10, 2);
    expect(g.credits[0]).toBeCloseTo(185 + 0.75, 10);
    expect(g.credits[2]).toBeCloseTo(185 + 7 + 0.75, 10);
    g.awardBounty(4, 1); // 0.3 * 4 / 4 = 0.3 each, never rounded per payout
    expect(g.credits[3]).toBeCloseTo(185 + 0.75 + 0.3, 10);
    expect(g.totalCredits()).toBeCloseTo(g.expectedCredits(), 9);
    expect(g.ledger.bounty).toBe(14);
  });

  it('rejects an unaffordable placement without changing anything', () => {
    const g = newGame(2);
    g.credits[0] = 50;
    const r = g.tryPlace(0, 'plasma', 3, 3);
    expect(r).toMatchObject({ ok: false, reason: 'funds' });
    expect(g.credits[0]).toBe(50);
    expect(g.towers.length).toBe(0);
    expect(g.ledger.spent).toBe(0);
  });

  it('serializes concurrent drops: same cell and shared funds each succeed at most once', () => {
    const g = newGame(2);
    g.credits = [80, 80];
    g.ledger.start = 160; // keep the accounting coherent with the directly set wallets
    expect(g.tryPlace(0, 'plasma', 3, 3).ok).toBe(true);
    expect(g.tryPlace(1, 'plasma', 3, 3).reason).toBe('occupied');
    expect(g.credits).toEqual([5, 80]);
    expect(g.tryPlace(0, 'pulse', 4, 3).reason).toBe('funds');
    expect(g.totalCredits()).toBeCloseTo(g.expectedCredits(), 9);
  });

  it('sell refunds 70% to the owner (not the seller) and frees the cell', () => {
    const g = newGame(2);
    g.tryPlace(1, 'pulse', 3, 3);
    expect(g.credits[1]).toBe(147);
    expect(g.sellAt(3, 3)).toBeCloseTo(26.6, 10);
    expect(g.credits[1]).toBeCloseTo(173.6, 10);
    expect(g.credits[0]).toBe(185);
    expect(g.towerAt[g.idx(3, 3)]).toBeNull();
    expect(g.blocked[g.idx(3, 3)]).toBe(0);
    expect(g.sellAt(3, 3)).toBeNull();
    expect(g.totalCredits()).toBeCloseTo(g.expectedCredits(), 9);
  });

  it('conserves money across a played wave with kills, purchases and sales', () => {
    const g = newGame(2);
    [[2, 5], [3, 5], [2, 10], [3, 10]].forEach(([x, y], i) => g.tryPlace(i % 2, 'pulse', x, y));
    g.tryPlace(0, 'stasis', 4, 5);
    g.tryPlace(1, 'plasma', 4, 10);
    g.launchWave();
    run(g, 40);
    expect(g.stats.kills).toBeGreaterThan(0);
    g.sellAt(2, 5);
    expect(g.totalCredits()).toBeCloseTo(g.expectedCredits(), 6);
  });
});

describe('simulation', () => {
  it('starts paused (planning) and pause freezes time', () => {
    const g = newGame(2);
    expect(g.phase).toBe('planning');
    run(g, 1);
    expect(g.time).toBe(0);
    g.launchWave();
    expect(g.phase).toBe('running');
    run(g, 1);
    const t = g.time;
    g.togglePause();
    run(g, 1);
    expect(g.time).toBe(t);
    expect(g.phase).toBe('paused');
  });

  it('weapons behave per role: pulse hitscan, plasma splash, stasis slow', () => {
    const g = newGame(2);
    g.tryPlace(0, 'stasis', 3, 3);
    g.tryPlace(1, 'plasma', 3, 5);
    g.tryPlace(0, 'pulse', 2, 3);
    g.launchWave();
    let slowed = false, beamSeen = false, projSeen = false;
    for (let i = 0; i < 60 * 8; i++) {
      g.step(1 / 60);
      if (g.enemies.some(e => e.slowT > 0 && e.slowF < 1)) slowed = true;
      if (g.beams.some(b => b.active)) beamSeen = true;
      if (g.projectiles.some(p => p.active)) projSeen = true;
    }
    expect(slowed && beamSeen && projSeen).toBe(true);
  });

  it('plasma splash damages multiple clustered enemies within splashRadius and spares distant ones', () => {
    const g = newGame(2);
    g.tryPlace(0, 'plasma', 4, 3);
    g.launchWave();
    g.spawners = [];
    const scout = g.enemyById.get('scout')!;
    const a = makeEnemy(g, 101, 'scout', 4.5, 4.5);
    const b = makeEnemy(g, 102, 'scout', 5.2, 4.5); // within 1.3-cell splash of target
    const c = makeEnemy(g, 103, 'scout', 8.0, 4.5); // outside splash
    g.enemies = [a, b, c];
    for (let i = 0; i < 120; i++) g.step(1 / 60);
    // Both a and b took at least one 24-damage splash hit; c took none
    expect(a.hp).toBeLessThan(scout.hp);
    expect(b.hp).toBeLessThan(scout.hp);
    expect(a.hp).toBe(b.hp);
    expect(c.hp).toBe(scout.hp);
  });

  it('stasis slow lasts slowDuration and expires back to full speed', () => {
    const g = newGame(2);
    g.tryPlace(0, 'stasis', 3, 3);
    g.launchWave();
    g.spawners = [];
    const e = g.enemies[0];
    // Step until stasis hits the enemy
    for (let i = 0; i < 120 && e.slowT <= 0; i++) g.step(1 / 60);
    expect(e.slowT).toBeGreaterThan(0);
    expect(e.slowF).toBe(0.62);
    // Sell the stasis tower so it cannot re-apply slow, then advance past slowDuration (1.35s)
    g.sellAt(3, 3);
    run(g, 1.6);
    expect(e.slowT).toBeLessThanOrEqual(0);
    expect(e.slowF).toBe(1);
  });

  it('depletes lives on leaks and transitions to lost state when lives reach zero', () => {
    const g = newGame(2);
    g.lives = 2;
    g.launchWave();
    g.spawners = [];
    const a = makeEnemy(g, 201, 'scout', 26.9, 7.5, { cx: 26, cy: 7, nx: 27, ny: 7, rem: 0.6 });
    const b = makeEnemy(g, 202, 'scout', 26.9, 7.5, { cx: 26, cy: 7, nx: 27, ny: 7, rem: 0.6 });
    g.enemies = [a, b];
    run(g, 0.5);
    expect(g.stats.leaks).toBe(2);
    expect(g.lives).toBe(0);
    expect(g.over).toBe('lost');
    expect(g.phase).toBe('lost');
    expect(g.canLaunch).toBe(false);
    const t = g.time;
    run(g, 1);
    expect(g.time).toBe(t); // simulation frozen once lost
  });

  it('transitions to won state when all ordinary waves are cleared', () => {
    const g = newGame(2);
    g.waveCursor = g.totalWaves;
    g.launched = true;
    g.paused = false;
    g.spawners = [];
    g.enemies = [];
    g.step(1 / 60);
    expect(g.over).toBe('won');
    expect(g.phase).toBe('won');
    expect(g.canLaunch).toBe(false);
  });

  it('stress scene: 150 swarmers + 20 legal, deterministic turrets, wallets intact', () => {
    const a = newGame(4), b = newGame(4);
    const ra = a.setupStress(), rb = b.setupStress();
    expect(ra).toEqual({ towers: 20, enemies: 150 });
    expect(a.enemies.length).toBe(150);
    expect(a.towers.length).toBe(20);
    expect(a.towers.map(t => [t.def.id, t.owner, t.x, t.y])).toEqual(b.towers.map(t => [t.def.id, t.owner, t.x, t.y]));
    // exactly the canonical shared-data fixture, owners = index mod players
    const fixture = a.data.map.stressTurrets;
    expect(fixture.length).toBe(20);
    expect(a.towers.map(t => [t.x, t.y, t.def.id])).toEqual(fixture);
    expect(a.towers.map(t => t.owner)).toEqual(fixture.map((_, i) => i % 4));
    for (const t of a.towers) {
      expect(a.asteroid[a.idx(t.x, t.y)]).toBe(0);
      expect(a.reserved[a.idx(t.x, t.y)]).toBe(0);
    }
    for (const [sx, sy] of a.data.map.spawns) expect(a.dist[a.idx(sx, sy)]).toBeGreaterThanOrEqual(0);
    expect(a.credits).toEqual([185, 185, 185, 185]);
    expect(rb.enemies).toBe(150);
    run(a, 5);
    expect(a.totalCredits()).toBeCloseTo(a.expectedCredits(), 6);
  });

  it('reset restores the match', () => {
    const g = newGame(2);
    g.tryPlace(0, 'pulse', 3, 3);
    g.launchWave();
    run(g, 2);
    g.reset(4);
    expect(g.playerCount).toBe(4);
    expect(g.credits).toEqual([185, 185, 185, 185]);
    expect(g.towers.length + g.enemies.length).toBe(0);
    expect(g.phase).toBe('planning');
    expect(g.lives).toBe(25);
  });
});

describe('fixed 60 Hz stepper', () => {
  it('runs exact 1/60 steps regardless of frame time', () => {
    const s = new FixedStepper();
    const dts: number[] = [];
    expect(s.advance(1 / 30, dt => dts.push(dt))).toBe(2);
    expect(dts.every(d => d === 1 / 60)).toBe(true);
    let total = 0;
    for (let i = 0; i < 144; i++) total += s.advance(1 / 144, () => undefined);
    expect(total).toBeGreaterThanOrEqual(59);
    expect(total).toBeLessThanOrEqual(61);
  });
  it('clamps huge frames (spiral-of-death guard)', () => {
    const s = new FixedStepper();
    expect(s.advance(10, () => undefined)).toBeLessThanOrEqual(10);
  });
});

describe('combat helpers', () => {
  it('predictIntercept computes exact quadratic lead and falls back when target outruns shot', () => {
    // Target at (0, 5) moving right at 2 u/s, projectile speed 4 u/s from (0, 0)
    const lead = predictIntercept(0, 0, 4, 0, 5, 2, 0);
    const t = Math.hypot(lead.x, lead.y) / 4;
    expect(lead.x).toBeCloseTo(2 * t, 4);
    expect(lead.y).toBeCloseTo(5, 4);

    // Target faster than projectile moving directly away -> disc < 0 fallback to current target pos
    const fallback = predictIntercept(0, 0, 1, 5, 0, 5, 0);
    expect(fallback).toEqual({ x: 5, y: 0 });
  });

  it('computeHitDamage applies shieldStrip, shieldMultiplier, leftover bleed-through, and armor', () => {
    // 50 shield, 45 stripped -> 5 left; 20 * 1.0 = 20 vs 5 -> 15 leftover HP raw, minus 8 armor = 7 HP
    const r1 = computeHitDamage(20, 8, false, 50, 1.0, 45);
    expect(r1.shieldDamage).toBeCloseTo(50, 8);
    expect(r1.hpDamage).toBeCloseTo(7, 8);

    // Armor floor 25% when armor exceeds 75% of raw damage
    const r2 = computeHitDamage(10, 8, false, 0, 1.0, 0);
    expect(r2.hpDamage).toBeCloseTo(2.5, 8);

    // Armor pierce ignores armor
    const r3 = computeHitDamage(10, 8, true, 0, 1.0, 0);
    expect(r3.hpDamage).toBe(10);
  });

  it('lineIntersectsCircle detects ray hits and misses', () => {
    expect(lineIntersectsCircle(0, 0, 10, 0, 5, 0.3, 0.42)).toBe(true);
    expect(lineIntersectsCircle(0, 0, 10, 0, 5, 1.0, 0.42)).toBe(false);
    expect(lineIntersectsCircle(0, 0, 2, 0, 5, 0, 0.42)).toBe(false);
  });
});

describe('weapons, shields, armor, flying, and boss mechanics', () => {
  it('railgun pierces armor and hits multiple enemies along the ray', () => {
    const g = newGame(2);
    g.grant(0, 500);
    expect(g.tryPlace(0, 'railgun', 2, 4).ok).toBe(true);
    g.launchWave();
    g.spawners = [];
    const c1 = makeEnemy(g, 301, 'cruiser', 4.5, 4.5, { rem: 20 });
    const c2 = makeEnemy(g, 302, 'cruiser', 6.5, 4.5, { rem: 21 });
    const c3 = makeEnemy(g, 303, 'cruiser', 8.0, 4.5, { rem: 22 }); // 3rd in line, T0 pierceCount = 2
    g.enemies = [c1, c2, c3];
    run(g, 0.32);
    // T0 railgun deals 62 damage ignoring cruiser armor (9): 225 - 62 = 163
    expect(c1.hp).toBeCloseTo(163, 5);
    expect(c2.hp).toBeCloseTo(163, 5);
    expect(c3.hp).toBe(225);
    expect(g.beams.some(b => b.active && b.kind === 'rail')).toBe(true);
  });

  it('shields regenerate after shieldRegenDelay and Stasis T2 strips shields', () => {
    const g = newGame(2);
    g.grant(0, 500);
    const placed = g.tryPlace(0, 'stasis', 3, 3);
    expect(placed.ok).toBe(true);
    const tower = g.towers[0];
    expect(g.upgradeTower(tower.id).ok).toBe(true); // T1
    expect(g.upgradeTower(tower.id).ok).toBe(true); // T2 Shield strip (35)
    g.launchWave();
    g.spawners = [];
    const frig = makeEnemy(g, 401, 'frigate', 4.0, 4.5, { shieldDelay: 0 });
    g.enemies = [frig];
    run(g, 0.5);
    expect(frig.shield).toBeLessThan(155);
    expect(frig.shieldDelay).toBeGreaterThan(0);

    // Sell tower and wait past shieldRegenDelay (2.6s) to verify regen
    g.sellTower(tower.id);
    const afterHit = frig.shield;
    run(g, 3.2);
    expect(frig.shield).toBeGreaterThan(afterHit);
  });

  it('flying phase enemies ignore asteroids/towers and only air-capable turrets target them', () => {
    const g = newGame(2);
    g.grant(0, 500);
    expect(g.tryPlace(0, 'plasma', 4, 3).ok).toBe(true); // ground-only
    expect(g.tryPlace(0, 'stasis', 5, 3).ok).toBe(true); // ground-only
    g.launchWave();
    g.spawners = [];
    const flyer = makeEnemy(g, 501, 'phase', 5.5, 4.5);
    g.enemies = [flyer];
    run(g, 1.5);
    // Ground-only turrets never damaged the phase fighter, and it flew closer to exit (27, 7)
    expect(flyer.hp).toBe(flyer.maxHp);
    expect(flyer.shield).toBe(flyer.maxShield);
    expect(flyer.x).toBeGreaterThan(5.5);

    // Pulse targets air
    expect(g.tryPlace(0, 'pulse', 8, 5).ok).toBe(true);
    run(g, 0.6);
    expect(flyer.shield + flyer.hp).toBeLessThan(flyer.maxShield + flyer.maxHp);
  });

  it('plasma T2 applies Napalm burn DoT and credits kill to burnOwner', () => {
    const g = newGame(2);
    g.grant(1, 500);
    expect(g.tryPlace(1, 'plasma', 4, 3).ok).toBe(true);
    const t = g.towers[0];
    expect(g.upgradeTower(t.id).ok).toBe(true);
    expect(g.upgradeTower(t.id).ok).toBe(true);
    expect(g.towerStats(t).burnDps).toBe(10);
    g.launchWave();
    g.spawners = [];
    const e = makeEnemy(g, 601, 'cruiser', 4.5, 4.5);
    g.enemies = [e];
    run(g, 1.2);
    expect(e.burnT).toBeGreaterThan(0);
    expect(e.burnOwner).toBe(1);
    const hpAfterHit = e.hp;
    g.sellTower(t.id);
    run(g, 1.0);
    expect(e.hp).toBeLessThan(hpAfterHit);
  });

  it('swarm fires homing micro-missiles with T2 splash and re-acquires if target dies', () => {
    const g = newGame(2);
    g.grant(0, 500);
    expect(g.tryPlace(0, 'swarm', 3, 3).ok).toBe(true);
    const t = g.towers[0];
    expect(g.upgradeTower(t.id).ok).toBe(true);
    expect(g.upgradeTower(t.id).ok).toBe(true); // T2: 4 missiles + 0.75 splash
    expect(g.towerStats(t).missileCount).toBe(4);
    expect(g.towerStats(t).splashRadius).toBeCloseTo(0.75, 5);
    g.launchWave();
    g.spawners = [];
    const e1 = makeEnemy(g, 701, 'scout', 6.5, 4.5, { hp: 1, rem: 19 });
    const e2 = makeEnemy(g, 702, 'cruiser', 6.8, 4.5, { rem: 20 });
    g.enemies = [e1, e2];
    // Step until missiles spawn
    for (let i = 0; i < 30 && !g.projectiles.some(p => p.active && p.kind === 'missile'); i++) g.step(1 / 60);
    expect(g.projectiles.filter(p => p.active && p.kind === 'missile').length).toBe(4);
    // Kill original target e1 manually; missiles should re-acquire e2 and splash/damage it
    e1.dead = true;
    run(g, 1.5);
    expect(e2.hp).toBeLessThan(e2.maxHp);
  });

  it('supports upgrades (T0->T1->T2), 70% total invested sell refund, and target priorities', () => {
    const g = newGame(2);
    g.grant(0, 500);
    expect(g.tryPlace(0, 'pulse', 3, 3).ok).toBe(true);
    const t = g.towers[0];
    expect(t.invested).toBe(38);
    expect(g.canUpgrade(t.id).cost).toBe(50);
    expect(g.upgradeTower(t.id)).toMatchObject({ ok: true, tier: 1, cost: 50 });
    expect(g.upgradeTower(t.id)).toMatchObject({ ok: true, tier: 2, cost: 105 });
    expect(g.canUpgrade(t.id)).toMatchObject({ ok: false, reason: 'max-tier' });
    expect(t.invested).toBe(38 + 50 + 105);

    expect(g.cycleTowerPriority(t.id)).toBe('strong');
    expect(g.cycleTowerPriority(t.id)).toBe('close');
    expect(g.cycleTowerPriority(t.id)).toBe('air');
    expect(g.cycleTowerPriority(t.id)).toBe('first');
    expect(g.setTowerPriority(t.id, 'strong')).toBe(true);
    expect(t.priority).toBe('strong');

    const refund = g.sellAt(3, 3);
    expect(refund).toBeCloseTo(193 * 0.7, 6);
    expect(g.totalCredits()).toBeCloseTo(g.expectedCredits(), 6);
  });

  it('transfers credits between players while conserving totalCredits', () => {
    const g = newGame(3);
    expect(g.transferCredits(0, 0, 50).ok).toBe(false);
    expect(g.transferCredits(0, 5, 50).ok).toBe(false);
    expect(g.transferCredits(0, 1, 0).ok).toBe(false);
    expect(g.transferCredits(0, 1, 9999).ok).toBe(false);
    const ok = g.transferCredits(0, 2, 100);
    expect(ok).toEqual({ ok: true, transferred: 100 });
    expect(g.credits[0]).toBe(85);
    expect(g.credits[2]).toBe(285);
    expect(g.totalCredits()).toBeCloseTo(g.expectedCredits(), 9);
  });

  it('boss Dreadnought triggers phase transitions, spawns escorts, and leaks 5 lives', () => {
    const g = newGame(2);
    g.launchWave();
    g.spawners = [];
    const boss = makeEnemy(g, 801, 'dreadnought', 10.5, 7.5, { shield: 0, hp: 1730 });
    g.enemies = [boss];
    expect(g.activeBoss()?.id).toBe(boss.id);

    // Place a railgun to drop boss below 66% (1716 HP)
    g.grant(0, 500);
    g.tryPlace(0, 'railgun', 10, 6);
    run(g, 0.5);
    expect(boss.bossPhase).toBeGreaterThanOrEqual(1);
    expect(boss.shield).toBeGreaterThan(0); // +25% maxShield restored
    expect(g.enemies.some(e => e.def.id === 'swarmer')).toBe(true);
    expect(g.popups.some(p => p.active && p.text === 'PHASE 2')).toBe(true);

    // Leak boss costs 5 lives
    const g2 = newGame(2);
    g2.launchWave();
    g2.spawners = [];
    const leakingBoss = makeEnemy(g2, 802, 'dreadnought', 26.95, 7.5, { cx: 26, cy: 7, nx: 27, ny: 7, rem: 0.55 });
    g2.enemies = [leakingBoss];
    run(g2, 1.5);
    expect(g2.lives).toBe(20);
  });

  it('scales co-op waves by playerCount and switches maps cleanly', () => {
    const g2 = newGame(2);
    const g4 = newGame(4);
    expect(g2.waveCoopScale()).toBeCloseTo(1.0, 6);
    expect(g4.waveCoopScale()).toBeCloseTo(1.35, 6);
    expect(g4.totalWaves).toBe(10);

    g2.launchWave();
    g4.launchWave();
    expect(g4.enemies[0].maxHp).toBeCloseTo(g2.enemies[0].maxHp * 1.35, 5);

    const prevVer = g2.mapVersion;
    g2.setMap(1);
    expect(g2.mapIndex).toBe(1);
    expect(g2.currentMap.id).toBe('dc-defense');
    expect(g2.currentMap.name).toBe('Washington DC');
    expect(g2.currentMap.theme).toBe('military');
    expect(g2.mapVersion).toBeGreaterThan(prevVer);
    g2.setMap(2);
    expect(g2.currentMap.id).toBe('pacific-fleet');
    g2.setMap(7);
    expect(g2.currentMap.id).toBe('asteroid-belt');
    g2.setMap(9); // wraps modulo 9 -> 0
    expect(g2.mapIndex).toBe(0);
    expect(g2.currentMap.id).toBe('orbital-crossing');
  });

  it('dc-defense loads at mapIndex 1 with military theme, 3 reachable spawns to [23, 7], and clean stress mode', () => {
    const g = newGame(4);
    g.setMap(1);
    expect(g.mapIndex).toBe(1);
    expect(g.currentMap.id).toBe('dc-defense');
    expect(g.currentMap.name).toBe('Washington DC');
    expect(g.currentMap.theme).toBe('military');
    expect(g.currentMap.spawns.length).toBe(3);
    expect(g.currentMap.exits).toEqual([[23, 7]]);
    for (const [sx, sy] of g.currentMap.spawns) {
      expect(g.dist[g.idx(sx, sy)]).toBeGreaterThanOrEqual(0);
    }

    const res = g.setupStress();
    expect(res).toEqual({ towers: 20, enemies: 150 });
    expect(g.towers.length).toBe(20);
    expect(g.enemies.length).toBe(150);
    for (const [sx, sy] of g.currentMap.spawns) {
      expect(g.dist[g.idx(sx, sy)]).toBeGreaterThanOrEqual(0);
    }
    run(g, 5);
    expect(g.totalCredits()).toBeCloseTo(g.expectedCredits(), 6);
  });
});

describe('difficulty, early-send, auto-wave, stats & sound events', () => {
  it('applies Easy / Medium / Hard difficulty presets for lives, credits, HP, speed and bounty', () => {
    const data = loadData();
    const easy = new Game(data, 2, 'easy');
    const med = new Game(data, 2, 'medium');
    const hard = new Game(data, 2, 'hard');

    expect(easy.lives).toBe(30);
    expect(easy.credits).toEqual([222, 222]);
    expect(med.lives).toBe(25);
    expect(med.credits).toEqual([185, 185]);
    expect(hard.lives).toBe(18);
    expect(hard.credits).toEqual([163, 163]);

    easy.launchWave();
    med.launchWave();
    hard.launchWave();
    const baseScoutHp = easy.enemyById.get('scout')!.hp;
    expect(easy.enemies[0].maxHp).toBeCloseTo(baseScoutHp * 0.78, 5);
    expect(med.enemies[0].maxHp).toBeCloseTo(baseScoutHp * 1.00, 5);
    expect(hard.enemies[0].maxHp).toBeCloseTo(baseScoutHp * 1.35, 5);

    // Speed scaling: after 1s, hard scout advances further than medium, which advances further than easy
    run(easy, 1);
    run(med, 1);
    run(hard, 1);
    expect(hard.enemies[0].x).toBeGreaterThan(med.enemies[0].x);
    expect(med.enemies[0].x).toBeGreaterThan(easy.enemies[0].x);

    // Bounty scaling: killing a scout on hard vs easy
    const gEasy = new Game(data, 2, 'easy');
    const gHard = new Game(data, 2, 'hard');
    gEasy.launchWave();
    gHard.launchWave();
    gEasy.spawners = [];
    gHard.spawners = [];
    gEasy.enemies = [makeEnemy(gEasy, 910, 'scout', 4.5, 4.5, { hp: 1 })];
    gHard.enemies = [makeEnemy(gHard, 911, 'scout', 4.5, 4.5, { hp: 1 })];
    gEasy.tryPlace(0, 'pulse', 4, 3);
    gHard.tryPlace(0, 'pulse', 4, 3);
    run(gEasy, 0.5);
    run(gHard, 0.5);
    expect(gEasy.ledger.bounty).toBe(Math.round(9 * 1.15));
    expect(gHard.ledger.bounty).toBe(Math.round(9 * 0.92));

    // cycleDifficulty cycles easy -> medium -> hard -> easy
    expect(easy.cycleDifficulty()).toBe('medium');
    expect(easy.lives).toBe(25);
    expect(easy.cycleDifficulty()).toBe('hard');
    expect(easy.lives).toBe(18);
    expect(easy.cycleDifficulty()).toBe('easy');
    expect(easy.lives).toBe(30);
  });

  it('grants early-send wave bonus only while enemies/spawners remain and conserves ledger', () => {
    const g = newGame(2);
    // First wave launch gives 0 early bonus
    expect(g.launchWave()).toBe(true);
    expect(g.lastEarlyBonus).toBe(0);

    // Early-send wave 2 while wave 1 is still active -> bonus = 10 + 1 * 3 = 13 per player
    expect(g.launchWave()).toBe(true);
    expect(g.lastEarlyBonus).toBe(13);
    expect(g.credits).toEqual([198, 198]);
    expect(g.totalCredits()).toBeCloseTo(g.expectedCredits(), 9);

    // Clear all enemies & spawners, then launch wave 3 -> 0 early bonus
    g.spawners = [];
    g.enemies = [];
    expect(g.launchWave()).toBe(true);
    expect(g.lastEarlyBonus).toBe(0);
    expect(g.totalCredits()).toBeCloseTo(g.expectedCredits(), 9);
  });

  it('auto-wave counts down after wave clears and launches next wave automatically', () => {
    const g = newGame(2);
    expect(g.toggleAutoWave()).toBe(true);
    g.launchWave();
    expect(g.waveCursor).toBe(1);
    g.spawners = [];
    g.enemies = [];
    // Step 1 frame -> starts 2.5s countdown
    g.step(1 / 60);
    expect(g.autoWaveTimer).toBeCloseTo(2.5, 4);
    expect(g.waveCursor).toBe(1);
    // Run 2.6s -> should automatically launch wave 2
    run(g, 2.6);
    expect(g.waveCursor).toBe(2);
    expect(g.enemies.length + g.spawners.length).toBeGreaterThan(0);
  });

  it('tracks per-player kills in stats.playerKills and emits/drains SoundEvents', () => {
    const g = newGame(2);
    g.tryPlace(0, 'pulse', 4, 3);
    g.tryPlace(1, 'pulse', 4, 10);
    g.launchWave();
    const eventsAfterLaunch = g.drainEvents();
    expect(eventsAfterLaunch).toContain('ui-wave');
    expect(g.drainEvents()).toEqual([]); // drained

    g.spawners = [];
    g.enemies = [
      makeEnemy(g, 920, 'scout', 4.5, 4.5, { hp: 1 }),
      makeEnemy(g, 921, 'scout', 4.5, 11.5, { hp: 1 }),
    ];
    run(g, 0.5);
    expect(g.stats.kills).toBe(2);
    expect(g.stats.playerKills).toEqual([1, 1]);
    const combatEvents = g.drainEvents();
    expect(combatEvents).toContain('shot-pulse');
    expect(combatEvents).toContain('kill');
  });

  it('balance check: 1 un-upgraded Pulse Laser leaks on Wave 1 Medium', () => {
    const g = newGame(2);
    expect(g.difficulty).toBe('medium');
    expect(g.tryPlace(0, 'pulse', 4, 4).ok).toBe(true);
    g.launchWave();
    run(g, 35);
    expect(g.stats.leaks).toBeGreaterThan(0);
    expect(g.lives).toBeLessThan(25);
  });
});

describe('1-Player Solo Mode balance', () => {
  it('scales wave HP to 0.80x and grants 1.55x starting credits with strict conservation', () => {
    const g1 = newGame(1);
    const g2 = newGame(2);
    expect(g1.playerCount).toBe(1);
    expect(g1.waveCoopScale()).toBeCloseTo(0.8, 6);
    expect(g1.credits.length).toBe(1);
    expect(g1.credits[0]).toBe(Math.round(185 * 1.55)); // 287 on Orbital Crossing Medium
    expect(g1.totalCredits()).toBeCloseTo(g1.expectedCredits(), 6);

    g1.launchWave();
    g2.launchWave();
    expect(g1.enemies[0].maxHp).toBeCloseTo(g2.enemies[0].maxHp * 0.8, 5);

    g1.setMap(1);
    expect(g1.currentMap.id).toBe('dc-defense');
    expect(g1.currentMap.asteroids.length).toBe(18);
    expect(g1.credits[0]).toBe(Math.round(195 * 1.55)); // 302 on Washington DC Medium
    expect(g1.totalCredits()).toBeCloseTo(g1.expectedCredits(), 6);
  });

  it('awards 100% of enemy bounty to P0 on kills and runs stress mode cleanly', () => {
    const g = newGame(1);
    expect(g.tryPlace(0, 'pulse', 4, 3).ok).toBe(true);
    const creditsBeforeKill = g.credits[0];
    g.launchWave();
    g.spawners = [];
    const scout = makeEnemy(g, 950, 'scout', 4.5, 4.5, { hp: 1 });
    const bounty = scout.def.bounty;
    g.enemies = [scout];

    run(g, 0.5);
    expect(g.stats.kills).toBe(1);
    expect(g.stats.playerKills).toEqual([1]);
    expect(g.credits[0]).toBeCloseTo(creditsBeforeKill + bounty, 6);
    expect(g.totalCredits()).toBeCloseTo(g.expectedCredits(), 6);

    g.setMap(1);
    const res = g.setupStress();
    expect(res).toEqual({ towers: 20, enemies: 150 });
    run(g, 5);
    expect(g.totalCredits()).toBeCloseTo(g.expectedCredits(), 6);
  });
});

describe('new theater maps & mechanics', () => {
  it('loads all 9 maps and runs stress setup cleanly on the new theaters', () => {
    const d = loadData();
    expect(d.maps.length).toBe(9);
    expect(d.maps.map((m) => m.id)).toEqual([
      'orbital-crossing',
      'dc-defense',
      'pacific-fleet',
      'mars-outpost',
      'ironhold-keep',
      'kitchen-raid',
      'backyard-lawn',
      'asteroid-belt',
      'nebula-rift',
    ]);

    const g = newGame(2);
    for (const [idx, expectedId] of [
      [2, 'pacific-fleet'],
      [3, 'mars-outpost'],
      [4, 'ironhold-keep'],
      [5, 'kitchen-raid'],
      [6, 'backyard-lawn'],
    ] as const) {
      g.setMap(idx);
      expect(g.currentMap.id).toBe(expectedId);
      const res = g.setupStress();
      expect(res).toEqual({ towers: 20, enemies: 150 });
      for (const [sx, sy] of g.currentMap.spawns) {
        expect(g.dist[g.idx(sx, sy)]).toBeGreaterThan(0);
      }
      run(g, 1);
      expect(g.totalCredits()).toBeCloseTo(g.expectedCredits(), 6);
    }
  });

  it('naval: submerged subs evade Pulse until revealed by Sonar Buoy or hit by ASW Destroyer', () => {
    const g = newGame(2);
    g.setMap(2); // pacific-fleet
    expect(g.currentMap.mechanic).toBe('naval-subs-mines');

    g.tryPlace(0, 'pulse', 5, 3);
    g.launchWave();
    g.spawners = [];
    const sub = makeEnemy(g, 1001, 'frigate', 5.5, 4.5, { submerged: true, revealedT: 0, rem: 12 });
    const startPool = sub.hp + sub.shield;
    g.enemies = [sub];

    // Pulse cannot target unrevealed submerged sub
    run(g, 1);
    expect(sub.hp + sub.shield).toBe(startPool);

    // Sonar Buoy (stasis) reveals and slows submerged sub, allowing Pulse to hit it
    g.credits[1] = 500;
    expect(g.tryPlace(1, 'stasis', 6, 3).ok).toBe(true);
    run(g, 0.35);
    expect(sub.revealedT).toBeGreaterThan(0);
    expect(sub.hp + sub.shield).toBeLessThan(startPool);
    expect(g.drainEvents()).toContain('sonar-ping');

    // ASW Sub Destroyer (railgun) natively detects submerged subs and deals 1.4x damage
    const g2 = newGame(2);
    g2.setMap(2);
    g2.credits[0] = 500;
    expect(g2.tryPlace(0, 'railgun', 5, 3).ok).toBe(true);
    const railTower = g2.towers[0];
    const railDmg = g2.towerStats(railTower).damage;
    g2.launchWave();
    g2.spawners = [];
    const sub2 = makeEnemy(g2, 1002, 'frigate', 5.5, 5.5, { submerged: true, revealedT: 0, hp: 500, maxHp: 500, shield: 0, maxShield: 0, rem: 12 });
    g2.enemies = [sub2];
    run(g2, 0.35);
    expect(sub2.hp).toBeCloseTo(500 - railDmg * 1.4, 4);
    expect(sub2.revealedT).toBeGreaterThan(0);
  });

  it('naval: Naval Minefield deploys SeaMines, detonates on ships, and T2 hits submerged subs', () => {
    const g = newGame(2);
    g.setMap(2); // pacific-fleet
    g.credits[0] = 1000;
    expect(g.tryPlace(0, 'plasma', 5, 7).ok).toBe(true);
    const mineTower = g.towers[0];
    g.launchWave();
    g.spawners = [];

    // Deploy up to 3 mines at T0
    run(g, 8);
    const activeMines = g.mines.filter((m) => m.active);
    expect(activeMines.length).toBe(3);
    expect(g.drainEvents()).toContain('shot-mine');

    // Unrevealed submerged sub passes over T0 mine without triggering it
    const m0 = activeMines[0];
    const sub = makeEnemy(g, 1003, 'frigate', m0.x, m0.y, { submerged: true, revealedT: 0, rem: 12 });
    g.enemies = [sub];
    g.step(1 / 60);
    expect(m0.active).toBe(true);
    expect(sub.hp).toBe(sub.maxHp);

    // Surface ship triggers T0 mine
    const scout = makeEnemy(g, 1004, 'scout', m0.x, m0.y, { rem: 12 });
    g.enemies = [scout];
    g.step(1 / 60);
    expect(m0.active).toBe(false);
    expect(scout.hp).toBeLessThan(scout.maxHp);
    expect(g.drainEvents()).toContain('impact-mine');

    // Upgrade to T2 Deep-Charge Mines -> hitsSub = true
    expect(g.upgradeTower(mineTower.id).ok).toBe(true);
    expect(g.upgradeTower(mineTower.id).ok).toBe(true);
    run(g, 3);
    const t2Mine = g.mines.find((m) => m.active && m.hitsSub);
    expect(t2Mine).toBeDefined();
    sub.x = t2Mine!.x;
    sub.y = t2Mine!.y;
    g.enemies = [sub];
    g.step(1 / 60);
    expect(t2Mine!.active).toBe(false);
    expect(sub.hp + sub.shield).toBeLessThan(sub.maxHp + sub.maxShield);

    // Selling mine tower clears its remaining mines
    expect(g.sellTower(mineTower.id)).not.toBeNull();
    expect(g.mines.some((m) => m.active && m.towerId === mineTower.id)).toBe(false);
  });

  it('mars: Dust Storm reduces unboosted T0/T1 range by 20% while Geothermal Vents and T2 are immune', () => {
    const g = newGame(2);
    g.setMap(3); // mars-outpost
    expect(g.currentMap.mechanic).toBe('mars-storms');
    g.credits[0] = 1000;
    g.credits[1] = 1000;

    // [9, 4] is a Geothermal Vent boostCell; [9, 5] is unboosted; [10, 5] is unboosted T2
    expect(g.tryPlace(0, 'pulse', 9, 4).ok).toBe(true);
    expect(g.tryPlace(0, 'pulse', 9, 5).ok).toBe(true);
    expect(g.tryPlace(1, 'pulse', 10, 5).ok).toBe(true);

    const boosted = g.towers[0];
    const normal = g.towers[1];
    const t2Tower = g.towers[2];
    expect(boosted.boosted).toBe(true);
    expect(normal.boosted).toBe(false);
    expect(g.upgradeTower(t2Tower.id).ok).toBe(true);
    expect(g.upgradeTower(t2Tower.id).ok).toBe(true);

    const baseRange = normal.def.range;
    const baseRate = normal.def.fireRate;
    expect(g.towerStats(boosted).range).toBeCloseTo(baseRange * 1.2, 5);
    expect(g.towerStats(boosted).fireRate).toBeCloseTo(baseRate * 1.25, 5);
    expect(g.towerStats(normal).range).toBeCloseTo(baseRange, 5);

    const t2CalmRange = g.towerStats(t2Tower).range;

    // Launch wave and keep a live enemy on board for 22.1s to trigger Dust Storm
    g.launchWave();
    g.spawners = [];
    g.enemies = [makeEnemy(g, 1009, 'dreadnought', 0.5, 4.5, { hp: 1e6, maxHp: 1e6, shield: 0, maxShield: 0 })];
    run(g, 22.1);
    expect(g.stormActive).toBe(true);
    expect(g.drainEvents()).toContain('dust-storm');

    expect(g.towerStats(normal).range).toBeCloseTo(baseRange * 0.8, 5);
    expect(g.towerStats(boosted).range).toBeCloseTo(baseRange * 1.2, 5);
    expect(g.towerStats(t2Tower).range).toBeCloseTo(t2CalmRange, 5);
  });

  it('medieval: Orc Brute & Siege Troll King enrage below 40% HP (+35% speed) and Ancient Runes boost towers', () => {
    const g = newGame(2);
    g.setMap(4); // ironhold-keep
    expect(g.currentMap.mechanic).toBe('medieval-frenzy');
    g.credits[0] = 1000;

    // [10, 7] is an Ancient Rune boostCell
    expect(g.tryPlace(0, 'pulse', 10, 7).ok).toBe(true);
    const runeTower = g.towers[0];
    expect(runeTower.boosted).toBe(true);
    expect(g.towerStats(runeTower).fireRate).toBeCloseTo(runeTower.def.fireRate * 1.25, 5);
    expect(g.towerStats(runeTower).range).toBeCloseTo(runeTower.def.range * 1.2, 5);

    // Place Pulse towers near an Orc Brute ('cruiser') and a Siege Troll King ('dreadnought')
    expect(g.tryPlace(0, 'pulse', 5, 8).ok).toBe(true);
    expect(g.tryPlace(0, 'pulse', 15, 6).ok).toBe(true);
    g.launchWave();
    g.spawners = [];

    const orc = makeEnemy(g, 1010, 'cruiser', 5.5, 9.5, {
      hp: 100, maxHp: 240, shield: 0, maxShield: 0, cx: 5, cy: 9, nx: 6, ny: 9, rem: 15,
    });
    const king = makeEnemy(g, 1011, 'dreadnought', 15.5, 7.5, {
      hp: 965, maxHp: 2400, shield: 0, maxShield: 0, bossPhase: 2, cx: 15, cy: 7, nx: 16, ny: 7, rem: 6,
    });
    g.enemies = [orc, king];

    // Step enough for both Pulse towers to damage them below 40% HP
    run(g, 1.5);
    expect(orc.enraged).toBe(true);
    expect(king.enraged).toBe(true);
    expect(g.drainEvents()).toContain('enrage');
    expect(Math.hypot(orc.vx, orc.vy)).toBeCloseTo(orc.def.speed * 1.35, 3);
  });

  it('kitchen: stove burners grant burn DoT and Fridge Snack Rush speeds unslowed pests (+30%) while Honey Trap slows them extra (0.80x)', () => {
    const g = newGame(2);
    g.setMap(5); // kitchen-raid
    expect(g.currentMap.mechanic).toBe('kitchen-rush');
    g.credits[0] = 1000;

    // [9, 5] is a stove burner boostCell
    expect(g.tryPlace(0, 'pulse', 9, 5).ok).toBe(true);
    const burnerTower = g.towers[0];
    expect(burnerTower.boosted).toBe(true);
    expect(g.towerStats(burnerTower).burnDps).toBeGreaterThanOrEqual(10);
    expect(g.towerStats(burnerTower).burnDuration).toBeGreaterThanOrEqual(2.5);

    g.launchWave();
    g.spawners = [];
    const pest = makeEnemy(g, 2001, 'cruiser', 9.5, 6.5, {
      hp: 500, maxHp: 500, shield: 0, maxShield: 0, cx: 9, cy: 6, nx: 10, ny: 6, rem: 15,
    });
    g.enemies = [pest];
    run(g, 0.3);
    expect(pest.burnT).toBeGreaterThan(0);
    expect(pest.burnDps).toBeGreaterThanOrEqual(10);

    // Trigger Fridge Snack Rush at 20s
    g.enemies = [
      makeEnemy(g, 2002, 'scout', 2.5, 8.5, { cx: 2, cy: 8, nx: 3, ny: 8, rem: 20 }),
      makeEnemy(g, 2003, 'scout', 2.5, 8.5, { cx: 2, cy: 8, nx: 3, ny: 8, rem: 20, slowT: 5, slowF: 0.62 }),
    ];
    g.rushTimer = 19.9;
    g.rushActive = false;
    run(g, 0.2);
    expect(g.rushActive).toBe(true);
    expect(g.drainEvents()).toContain('fridge-open');

    const [fastPest, stickyPest] = g.enemies;
    expect(Math.hypot(fastPest.vx, fastPest.vy)).toBeCloseTo(fastPest.def.speed * 1.3, 3);
    expect(Math.hypot(stickyPest.vx, stickyPest.vy)).toBeCloseTo(stickyPest.def.speed * 0.62 * 0.8, 3);
  });

  it('lawn: burrowed moles evade Pulse until flushed by Lawn Thumper (stasis), struck by Mole Crusher (railgun) at 1.4x, or surfaced by T2 Firecracker Gnome', () => {
    const g = newGame(2);
    g.setMap(6); // backyard-lawn
    expect(g.currentMap.mechanic).toBe('lawn-split-burrow');
    g.credits[0] = 1000;
    g.credits[1] = 1000;

    expect(g.tryPlace(0, 'pulse', 3, 4).ok).toBe(true);
    g.launchWave();
    g.spawners = [];
    const mole = makeEnemy(g, 2101, 'frigate', 3.5, 5.5, { submerged: true, revealedT: 0, rem: 12 });
    const startPool = mole.hp + mole.shield;
    g.enemies = [mole];

    // Pulse cannot target unrevealed burrowed mole
    run(g, 1);
    expect(mole.hp + mole.shield).toBe(startPool);

    // Lawn Thumper (stasis) flushes mole and emits 'mole-flush', allowing Pulse to hit
    expect(g.tryPlace(1, 'stasis', 4, 4).ok).toBe(true);
    run(g, 0.35);
    expect(mole.revealedT).toBeGreaterThan(0);
    expect(mole.hp + mole.shield).toBeLessThan(startPool);
    expect(g.drainEvents()).toContain('mole-flush');

    // Mole Crusher (railgun) natively detects burrowed moles and deals 1.4x damage
    const g2 = newGame(2);
    g2.setMap(6);
    g2.credits[0] = 500;
    expect(g2.tryPlace(0, 'railgun', 3, 4).ok).toBe(true);
    const railDmg = g2.towerStats(g2.towers[0]).damage;
    g2.launchWave();
    g2.spawners = [];
    const mole2 = makeEnemy(g2, 2102, 'frigate', 3.5, 6.5, {
      submerged: true, revealedT: 0, hp: 500, maxHp: 500, shield: 0, maxShield: 0, rem: 12,
    });
    g2.enemies = [mole2];
    run(g2, 0.35);
    expect(mole2.hp).toBeCloseTo(500 - railDmg * 1.4, 4);
    expect(mole2.revealedT).toBeGreaterThan(0);
  });

  it('lawn: Giant Centipede (cruiser) splits into 2 non-recursive halves on death and emits centipede-split', () => {
    const g = newGame(2);
    g.setMap(6); // backyard-lawn
    expect(g.tryPlace(0, 'railgun', 3, 4).ok).toBe(true);
    g.launchWave();
    g.spawners = [];

    const centipede = makeEnemy(g, 2201, 'cruiser', 3.5, 5.5, {
      hp: 10, maxHp: 240, shield: 0, maxShield: 0, cx: 3, cy: 5, nx: 4, ny: 5, vx: 1.4, vy: 0, rem: 15,
    });
    g.enemies = [centipede];

    // Kill the parent centipede -> spawns 2 split children
    run(g, 0.35);
    expect(g.drainEvents()).toContain('centipede-split');
    expect(g.enemies.length).toBe(2);
    for (const child of g.enemies) {
      expect(child.isSplitChild).toBe(true);
      expect(child.maxHp).toBe(Math.round(240 * 0.38));
      expect(child.def.armor).toBe(0);
      expect(child.def.lifeCost).toBe(1);
    }

    // Kill both split children -> no infinite recursion, wave clears cleanly
    run(g, 8);
    expect(g.enemies.length).toBe(0);
    expect(g.totalCredits()).toBeCloseTo(g.expectedCredits(), 6);
  });
});

describe('configurable wave count', () => {
  it('cycles wave counts 10 -> 15 -> 20 -> 30 -> 5 -> 10 and updates totalWaves', () => {
    const g = newGame(2);
    expect(g.waveCount).toBe(10);
    expect(g.totalWaves).toBe(10);

    const seen: number[] = [];
    for (let i = 0; i < WAVE_COUNTS.length; i++) {
      seen.push(g.cycleWaveCount());
      expect(g.totalWaves).toBe(g.waveCount);
    }
    expect(seen).toEqual([15, 20, 30, 5, 10]);
  });

  it('places boss waves on wave 5 (5-wave) and waves 10/15/20/30 for extended counts', () => {
    const g = newGame(2);

    const hasBoss = (w: typeof g.ordinaryWaves[number], count?: number) =>
      w.groups.some(gr => g.enemyById.get(gr.enemyId)?.boss === true && (count === undefined || gr.count === count));

    g.setWaveCount(5);
    expect(g.ordinaryWaves.map(w => w.templateIndex)).toEqual([1, 3, 4, 5, 10]);
    expect(hasBoss(g.ordinaryWaves[4], 1)).toBe(true);

    g.setWaveCount(15);
    expect(hasBoss(g.ordinaryWaves[9])).toBe(true);
    expect(hasBoss(g.ordinaryWaves[14], 1)).toBe(true);
    expect(g.ordinaryWaves[10].tierSuffix).toBe(' II');

    g.setWaveCount(20);
    expect(hasBoss(g.ordinaryWaves[19])).toBe(true);

    g.setWaveCount(30);
    expect(hasBoss(g.ordinaryWaves[19])).toBe(true);
    expect(hasBoss(g.ordinaryWaves[29])).toBe(true);
    expect(g.ordinaryWaves[20].tierSuffix).toBe(' III');
  });

  it('applies 0.80 boss HP scale on wave 5 of a 5-wave match and wins after clearing wave 5', () => {
    const g5 = newGame(2);
    g5.setWaveCount(5);
    // Advance to wave 5 (index 5)
    g5.waveCursor = 4;
    g5.launchWave();
    const boss5 = g5.enemies.find(e => e.def.boss) ?? (() => {
      run(g5, 2);
      return g5.enemies.find(e => e.def.boss);
    })();
    expect(boss5).toBeDefined();
    const expectedBossHp = Math.round(boss5!.def.hp * g5.waveHealthScale(5) * 0.80);
    expect(boss5!.maxHp).toBe(expectedBossHp);

    // Clear all enemies & spawners on wave 5 -> triggers victory
    g5.spawners = [];
    g5.enemies = [];
    g5.step(1 / 60);
    expect(g5.over).toBe('won');
  });

  it('formats themed wave names with templateIndex and tierSuffix', () => {
    const g = newGame(2);
    g.setWaveCount(30);
    const w11 = g.ordinaryWaves[10]; // tier 2
    const w21 = g.ordinaryWaves[20]; // tier 3
    expect(formatWaveName('space', w11)).toMatch(/ II$/);
    expect(formatWaveName('space', w21)).toMatch(/ III$/);
    expect(formatWaveName('space', g.ordinaryWaves[0])).not.toMatch(/ II$| III$/);
  });
});

describe('mars meteors, turret durability & repair', () => {
  it('spawns spread-out meteors with warn/impact sounds on mars-outpost and none on orbital-crossing', () => {
    const g = newGame(2);
    g.setMap(3); // mars-outpost
    expect(g.currentMap.mechanic).toBe('mars-storms');
    g.tryPlace(0, 'pulse', 8, 6);
    g.tryPlace(1, 'pulse', 16, 10);
    g.launchWave();

    const sounds: string[] = [];
    const impacts: { x: number; y: number }[] = [];
    const seenMeteorIds = new Set<number>();
    for (let i = 0; i < 60 * 24; i++) {
      g.step(1 / 60);
      for (const s of g.drainEvents()) sounds.push(s);
      for (const m of g.meteors) {
        if (m.active && !seenMeteorIds.has(m.id)) {
          seenMeteorIds.add(m.id);
          impacts.push({ x: m.tx, y: m.ty });
        }
      }
      if (impacts.length >= 4 && sounds.includes('meteor-impact')) break;
    }

    expect(impacts.length).toBeGreaterThanOrEqual(4);
    expect(sounds).toContain('meteor-warn');
    expect(sounds).toContain('meteor-impact');

    // Consecutive meteors should not hit the exact same spot
    let minPairDist = Infinity;
    for (let i = 0; i < impacts.length; i++) {
      for (let j = i + 1; j < impacts.length; j++) {
        const d = Math.hypot(impacts[i].x - impacts[j].x, impacts[i].y - impacts[j].y);
        if (d < minPairDist) minPairDist = d;
      }
    }
    expect(minPairDist).toBeGreaterThan(1.0);

    // Non-Mars map (orbital-crossing) should never spawn meteors
    const g0 = newGame(2);
    g0.setMap(0);
    expect(g0.currentMap.id).toBe('orbital-crossing');
    g0.launchWave();
    run(g0, 12);
    expect(g0.meteors.length).toBe(0);
    expect(g0.drainEvents()).not.toContain('meteor-warn');
  });

  it('meteor impact damages nearby towers, disables at 0 HP while preserving maze, and degrades fire rate below 50% HP', () => {
    const g = newGame(2);
    g.setMap(3); // mars-outpost
    expect(g.tryPlace(0, 'pulse', 10, 6).ok).toBe(true);
    const t = g.towers[0];
    expect(t.hp).toBe(100);
    expect(t.maxHp).toBe(100);

    const baseFireRate = g.towerStats(t).fireRate;
    t.hp = 40; // < 50% HP -> 0.80x fireRate
    expect(g.towerStats(t).fireRate).toBeCloseTo(baseFireRate * 0.80, 6);

    // Upgrade scales maxHp: 100 -> 130 -> 165
    t.hp = 100;
    expect(g.upgradeTower(t.id).ok).toBe(true);
    expect(t.maxHp).toBe(130);
    expect(t.hp).toBe(130);
    expect(g.upgradeTower(t.id).ok).toBe(true);
    expect(t.maxHp).toBe(165);
    expect(t.hp).toBe(165);

    // Launch wave and inject a direct-hit meteor onto the tower
    g.launchWave();
    g.spawners = [];
    const enemy = makeEnemy(g, 9901, 'scout', 10.5, 7.5);
    g.enemies = [enemy];

    t.hp = 30;
    g.meteors.push({
      active: true,
      id: 999,
      tx: t.x + 0.5,
      ty: t.y + 0.5,
      sx: t.x - 4,
      sy: t.y - 5,
      t: 1.34,
      dur: 1.35,
      radius: 1.65,
      damage: 40,
    });
    g.step(1 / 60);

    expect(t.hp).toBe(0);
    expect(g.towerAt[g.idx(t.x, t.y)]).toBe(t);
    expect(g.blocked[g.idx(t.x, t.y)]).toBe(1);

    // Disabled tower at 0 HP must not fire
    const hpAfterImpact = enemy.hp;
    run(g, 1.5);
    expect(enemy.hp).toBe(hpAfterImpact);
    expect(g.beams.some(b => b.active)).toBe(false);
  });

  it('repairCost / canRepair / repairTower conserve credits, restore HP, re-enable firing, and reject invalid cases', () => {
    const g = newGame(2);
    g.setMap(3);
    expect(g.tryPlace(0, 'pulse', 10, 6).ok).toBe(true);
    const t = g.towers[0];

    // Full HP -> rejected
    expect(g.repairCost(t)).toBe(0);
    expect(g.canRepair(t.id)).toMatchObject({ ok: false, reason: 'full-hp' });
    expect(g.repairTower(t.id)).toMatchObject({ ok: false, reason: 'full-hp' });

    // Damage to 0 HP
    t.hp = 0;
    const cost = g.repairCost(t);
    expect(cost).toBeGreaterThanOrEqual(8);

    // Insufficient funds -> rejected
    const savedCredits = g.credits[0];
    g.credits[0] = cost - 1;
    expect(g.canRepair(t.id)).toMatchObject({ ok: false, reason: 'funds', cost });
    expect(g.repairTower(t.id)).toMatchObject({ ok: false, reason: 'funds', cost });
    expect(t.hp).toBe(0);

    // Restore funds and repair
    g.credits[0] = savedCredits;
    g.drainEvents();
    const res = g.repairTower(t.id);
    expect(res).toEqual({ ok: true, reason: 'ok', cost, healed: 100 });
    expect(t.hp).toBe(t.maxHp);
    expect(g.credits[0]).toBe(savedCredits - cost);
    expect(g.totalCredits()).toBeCloseTo(g.expectedCredits(), 9);
    expect(g.drainEvents()).toContain('ui-repair');

    // Re-enabled tower fires again
    g.launchWave();
    g.spawners = [];
    const enemy = makeEnemy(g, 9902, 'scout', 10.5, 7.5);
    g.enemies = [enemy];
    const startHp = enemy.hp;
    run(g, 1.0);
    expect(enemy.hp).toBeLessThan(startHp);
  });
});
