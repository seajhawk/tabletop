import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const load = (name) => {
  const data = JSON.parse(readFileSync(new URL(`../shared-data/${name}.json`, import.meta.url), 'utf8'));
  assert.equal(data.schemaVersion, 1, `${name}: schemaVersion must be 1`);
  assert.ok(Array.isArray(data[name]) && data[name].length > 0, `${name}: non-empty array required`);
  return data[name];
};

const turrets = load('turrets');
const enemies = load('enemies');
const maps = load('maps');
const waves = load('waves');

for (const collection of [turrets, enemies, maps]) {
  assert.equal(new Set(collection.map((x) => x.id)).size, collection.length, 'Duplicate IDs');
}

// Validate turrets (5-turret roster, 2 upgrades each)
assert.equal(turrets.length, 5, 'Expected 5 turrets');
assert.deepEqual(
  turrets.slice(0, 3).map((t) => t.id),
  ['pulse', 'plasma', 'stasis'],
  'Starter turrets pulse, plasma, stasis must remain first'
);
for (const expectedId of ['railgun', 'swarm']) {
  assert.ok(turrets.some((t) => t.id === expectedId), `Missing turret ${expectedId}`);
}

const optionalUpgradeNumericKeys = [
  'fireRateMultiplier',
  'splashBonus',
  'slowFactor',
  'shieldMultiplier',
  'shieldStrip',
  'pierceCount',
  'missileBonus',
  'burnDps',
  'burnDuration',
];

for (const t of turrets) {
  assert.equal(typeof t.id, 'string');
  assert.equal(typeof t.name, 'string');
  assert.equal(typeof t.color, 'string');
  for (const key of [
    'cost',
    'range',
    'fireRate',
    'damage',
    'projectileSpeed',
    'splashRadius',
    'slowDuration',
    'pierceCount',
    'missileCount',
    'shieldMultiplier',
    'burnDps',
    'burnDuration',
  ]) {
    assert.ok(Number.isFinite(t[key]) && t[key] >= 0, `${t.id}.${key}`);
  }
  assert.ok(t.slowFactor > 0 && t.slowFactor <= 1, `${t.id}.slowFactor`);
  assert.ok(t.shieldMultiplier > 0, `${t.id}.shieldMultiplier`);
  assert.equal(typeof t.targetsAir, 'boolean', `${t.id}.targetsAir`);
  assert.equal(typeof t.armorPierce, 'boolean', `${t.id}.armorPierce`);

  assert.ok(Array.isArray(t.upgrades) && t.upgrades.length === 2, `${t.id}: expected exactly 2 upgrade tiers`);
  for (const [idx, u] of t.upgrades.entries()) {
    assert.equal(typeof u.name, 'string', `${t.id}.upgrades[${idx}].name`);
    assert.ok(Number.isFinite(u.cost) && u.cost > 0, `${t.id}.upgrades[${idx}].cost`);
    assert.ok(Number.isFinite(u.damageMultiplier) && u.damageMultiplier > 0, `${t.id}.upgrades[${idx}].damageMultiplier`);
    assert.ok(Number.isFinite(u.rangeBonus) && u.rangeBonus >= 0, `${t.id}.upgrades[${idx}].rangeBonus`);
    for (const optKey of optionalUpgradeNumericKeys) {
      if (u[optKey] !== undefined) {
        assert.ok(Number.isFinite(u[optKey]) && u[optKey] >= 0, `${t.id}.upgrades[${idx}].${optKey}`);
      }
    }
    if (u.slowFactor !== undefined) {
      assert.ok(u.slowFactor > 0 && u.slowFactor <= 1, `${t.id}.upgrades[${idx}].slowFactor`);
    }
  }
}

// Validate enemies (6 archetypes)
assert.equal(enemies.length, 6, 'Expected 6 enemies');
for (const expectedId of ['scout', 'swarmer', 'cruiser', 'frigate', 'phase', 'dreadnought']) {
  assert.ok(enemies.some((e) => e.id === expectedId), `Missing enemy ${expectedId}`);
}
for (const e of enemies) {
  assert.equal(typeof e.id, 'string');
  assert.equal(typeof e.name, 'string');
  assert.equal(typeof e.color, 'string');
  assert.ok(Number.isFinite(e.hp) && e.hp > 0, `${e.id}.hp`);
  assert.ok(Number.isFinite(e.speed) && e.speed > 0, `${e.id}.speed`);
  assert.ok(Number.isFinite(e.bounty) && e.bounty >= 0, `${e.id}.bounty`);
  assert.ok(Number.isFinite(e.shield) && e.shield >= 0, `${e.id}.shield`);
  assert.ok(Number.isFinite(e.shieldRegen) && e.shieldRegen >= 0, `${e.id}.shieldRegen`);
  assert.ok(Number.isFinite(e.shieldRegenDelay) && e.shieldRegenDelay >= 0, `${e.id}.shieldRegenDelay`);
  assert.ok(Number.isFinite(e.armor) && e.armor >= 0, `${e.id}.armor`);
  assert.ok(Number.isInteger(e.lifeCost) && e.lifeCost >= 1, `${e.id}.lifeCost`);
  assert.equal(typeof e.flying, 'boolean', `${e.id}.flying`);
  assert.equal(typeof e.boss, 'boolean', `${e.id}.boss`);
}

// Helper for BFS reachability from exits to all spawns given a blocked set
const checkReachable = (w, h, spawns, exits, blocked, label) => {
  const key = ([x, y]) => y * w + x;
  const queue = exits.map(key);
  const seen = new Set(queue);
  for (let i = 0; i < queue.length; i++) {
    const at = queue[i];
    const x = at % w;
    const y = Math.floor(at / w);
    for (const [nx, ny] of [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
    ]) {
      const n = ny * w + nx;
      if (nx < 0 || nx >= w || ny < 0 || ny >= h || blocked.has(n) || seen.has(n)) continue;
      seen.add(n);
      queue.push(n);
    }
  }
  assert.ok(
    spawns.every((c) => seen.has(key(c))),
    `${label}: unreachable spawn`
  );
};

// Validate maps (7+ maps)
const validThemes = new Set(['space', 'military', 'naval', 'mars', 'medieval', 'kitchen', 'lawn']);
const validMechanics = new Set(['naval-subs-mines', 'mars-storms', 'medieval-frenzy', 'kitchen-rush', 'lawn-split-burrow']);
assert.ok(maps.length >= 7, `Expected at least 7 maps, got ${maps.length}`);
assert.equal(maps[0].id, 'orbital-crossing', 'First map must be orbital-crossing');
assert.equal(maps[1].id, 'dc-defense', 'Second map must be dc-defense');

for (const map of maps) {
  const { width: w, height: h, spawns, exits, asteroids } = map;
  assert.ok(validThemes.has(map.theme), `${map.id}: invalid theme ${map.theme}`);
  if (map.mechanic !== undefined) {
    assert.ok(validMechanics.has(map.mechanic), `${map.id}: invalid mechanic ${map.mechanic}`);
  }
  assert.equal(w, 28, `${map.id}: width must be 28`);
  assert.equal(h, 16, `${map.id}: height must be 16`);
  assert.ok(spawns.length >= 1, `${map.id}: needs >= 1 spawn`);
  assert.ok(exits.length >= 1, `${map.id}: needs >= 1 exit`);
  assert.ok(Number.isFinite(map.startingCredits) && map.startingCredits > 0, `${map.id}.startingCredits`);
  assert.ok(Number.isInteger(map.startingLives) && map.startingLives > 0, `${map.id}.startingLives`);

  const key = ([x, y]) => y * w + x;
  for (const c of [...spawns, ...exits, ...asteroids]) {
    assert.ok(c.length === 2 && c.every(Number.isInteger) && c[0] >= 0 && c[0] < w && c[1] >= 0 && c[1] < h, `${map.id}: invalid coord`);
  }
  const blocked = new Set(asteroids.map(key));
  assert.equal(blocked.size, asteroids.length, `${map.id}: duplicate asteroid`);
  assert.ok([...spawns, ...exits].every((c) => !blocked.has(key(c))), `${map.id}: portal on asteroid`);

  if (map.boostCells !== undefined) {
    assert.ok(Array.isArray(map.boostCells), `${map.id}: boostCells must be an array`);
    const boostSet = new Set();
    for (const c of map.boostCells) {
      assert.ok(c.length === 2 && c.every(Number.isInteger) && c[0] >= 0 && c[0] < w && c[1] >= 0 && c[1] < h, `${map.id}: invalid boostCell`);
      const k = key(c);
      assert.ok(!boostSet.has(k), `${map.id}: duplicate boostCell`);
      assert.ok(!blocked.has(k), `${map.id}: boostCell on asteroid`);
      assert.ok(![...spawns, ...exits].some((p) => key(p) === k), `${map.id}: boostCell on portal`);
      boostSet.add(k);
    }
  }
  if (map.wallCells !== undefined) {
    assert.ok(Array.isArray(map.wallCells), `${map.id}: wallCells must be an array`);
    const wallSet = new Set();
    for (const c of map.wallCells) {
      assert.ok(c.length === 2 && c.every(Number.isInteger) && c[0] >= 0 && c[0] < w && c[1] >= 0 && c[1] < h, `${map.id}: invalid wallCell`);
      const k = key(c);
      assert.ok(!wallSet.has(k), `${map.id}: duplicate wallCell`);
      assert.ok(!blocked.has(k), `${map.id}: wallCell on asteroid`);
      assert.ok(![...spawns, ...exits].some((p) => key(p) === k), `${map.id}: wallCell on portal`);
      wallSet.add(k);
    }
  }

  checkReachable(w, h, spawns, exits, blocked, `${map.id} (base)`);

  assert.equal(map.stressTurrets.length, 20, `${map.id}: stressTurrets needs 20 canonical towers`);
  const stressCells = new Set();
  for (const [x, y, id] of map.stressTurrets) {
    assert.ok(Number.isInteger(x) && Number.isInteger(y) && x >= 0 && x < w && y >= 0 && y < h, `${map.id}: invalid stressTurret coord`);
    assert.ok(turrets.some((t) => t.id === id), `${map.id}: unknown stress turret ${id}`);
    const at = key([x, y]);
    assert.ok(!blocked.has(at) && !stressCells.has(at), `${map.id}: invalid/duplicate stress placement at [${x},${y}]`);
    assert.ok(![...spawns, ...exits].some((c) => key(c) === at), `${map.id}: stress tower on portal`);
    stressCells.add(at);
  }

  // Verify placing all 20 stressTurrets keeps every spawn connected to exits
  const blockedWithStress = new Set([...blocked, ...stressCells]);
  checkReachable(w, h, spawns, exits, blockedWithStress, `${map.id} (with stressTurrets)`);
}

// Validate waves (10 ordinary waves 1..10 + stress wave 99)
const normalWaves = waves.filter((w) => !w.stress);
const stressWaves = waves.filter((w) => w.stress);
assert.equal(normalWaves.length, 10, 'Expected 10 ordinary campaign waves');
assert.deepEqual(
  normalWaves.map((w) => w.index),
  [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  'Ordinary waves must have indices 1..10'
);
assert.equal(stressWaves.length, 1, 'Expected 1 stress wave');
assert.equal(stressWaves[0].index, 99, 'Stress wave must have index 99');

for (const wave of waves) {
  assert.equal(typeof wave.name, 'string');
  assert.equal(typeof wave.stress, 'boolean');
  assert.ok(Array.isArray(wave.groups) && wave.groups.length > 0, `Wave ${wave.index}: empty groups`);
  for (const group of wave.groups) {
    assert.ok(enemies.some((e) => e.id === group.enemyId), `Wave ${wave.index}: unknown enemy ${group.enemyId}`);
    assert.ok(Number.isInteger(group.count) && group.count > 0 && group.interval >= 0, `Wave ${wave.index}: invalid count/interval`);
    assert.ok(Number.isInteger(group.spawnIndex) && group.spawnIndex >= 0, `Wave ${wave.index}: invalid spawnIndex`);
  }
}

assert.equal(
  stressWaves[0].groups.reduce((sum, g) => sum + g.count, 0),
  150,
  'Stress wave must total 150 ships'
);

console.log(
  `Shared data valid: ${turrets.length} turrets, ${enemies.length} enemies, ${maps.length} maps, ${waves.length} waves; all spawns reachable (base + stressTurrets).`
);
