import { describe, expect, it } from 'vitest';
import { getTheater, THEMES, type ThemeId } from '../src/theme';

const THEME_IDS: ThemeId[] = ['space', 'military', 'naval', 'mars', 'medieval'];
const TURRET_IDS = ['pulse', 'plasma', 'stasis', 'railgun', 'swarm'] as const;
const ENEMY_IDS = ['scout', 'swarmer', 'cruiser', 'frigate', 'phase', 'dreadnought'] as const;

describe('theater themes', () => {
  it('returns space theme by default and resolves all 5 themes by id', () => {
    expect(getTheater(undefined).id).toBe('space');
    expect(getTheater('space').id).toBe('space');
    expect(getTheater('military').id).toBe('military');
    expect(getTheater('naval').id).toBe('naval');
    expect(getTheater('mars').id).toBe('mars');
    expect(getTheater('medieval').id).toBe('medieval');
    expect(Object.keys(THEMES)).toEqual(['space', 'military', 'naval', 'mars', 'medieval']);
  });

  it.each(THEME_IDS)('defines complete labels, colors, equipment, enemies, and waves for %s', (id) => {
    const t = getTheater(id);
    expect(t.spawnLabel.length).toBeGreaterThan(0);
    expect(t.objectiveLabel.length).toBeGreaterThan(0);
    expect(t.bossTitle.length).toBeGreaterThan(0);
    expect(t.victoryTitle.length).toBeGreaterThan(0);
    expect(t.defeatTitle.length).toBeGreaterThan(0);
    expect(t.helpText.length).toBeGreaterThan(0);
    expect(t.obstacleLabel.length).toBeGreaterThan(0);
    expect(t.roleTags).toBeDefined();

    for (const key of [
      t.spaceBg, t.boardBg, t.gridColor, t.borderColor,
      t.panelBg, t.slotBg, t.routeDotColor, t.routePulseColor,
    ]) {
      expect(typeof key).toBe('number');
      expect(key).toBeGreaterThanOrEqual(0);
    }

    for (const tid of TURRET_IDS) {
      const tv = t.turrets[tid];
      expect(tv).toBeDefined();
      expect(tv.shortName.length).toBeGreaterThan(0);
      expect(tv.fullName.length).toBeGreaterThan(0);
      expect(tv.upgrades).toHaveLength(2);
      expect(tv.upgrades[0].length).toBeGreaterThan(0);
      expect(tv.upgrades[1].length).toBeGreaterThan(0);
      expect(typeof tv.color).toBe('number');
      expect(t.roleTags?.[tid]?.length).toBeGreaterThan(0);
    }

    for (const eid of ENEMY_IDS) {
      const ev = t.enemies[eid];
      expect(ev).toBeDefined();
      expect(ev.name.length).toBeGreaterThan(0);
      expect(typeof ev.color).toBe('number');
    }

    for (let w = 1; w <= 10; w++) {
      expect(typeof t.waveNames[w]).toBe('string');
      expect(t.waveNames[w].length).toBeGreaterThan(0);
    }
  });

  it('uses NATO tactical Washington DC labels and matte palette in military theme', () => {
    const mil = getTheater('military');
    expect(mil.spawnLabel).toBe('INVASION');
    expect(mil.objectiveLabel).toBe('WASHINGTON DC');
    expect(mil.victoryTitle).toBe('WASHINGTON DC SAVED');
    expect(mil.defeatTitle).toBe('WASHINGTON DC FALLEN');
    expect(mil.obstacleLabel).toBe('Mountains');
    expect(mil.waveNames[10]).toBe('Siege of Washington');
    expect(mil.spaceBg).toBe(0x131714);
    expect(mil.panelBg).toBe(0x1a201c);
    expect(mil.turrets.pulse.shortName).toBe('Vulcan');
    expect(mil.turrets.swarm.shortName).toBe('Patriot');
    expect(mil.roleTags).toEqual({
      pulse: 'CIWS',
      plasma: 'ARTY',
      stasis: 'EW',
      railgun: 'TANK',
      swarm: 'SAM',
    });
  });

  it('defines Pacific Fleet labels, defenses, and wave progression in naval theme', () => {
    const naval = getTheater('naval');
    expect(naval.spawnLabel).toBe('HOSTILE FLEET');
    expect(naval.objectiveLabel).toBe('NAVAL BASE');
    expect(naval.bossTitle).toBe('TYPHOON CARRIER');
    expect(naval.victoryTitle).toBe('SEAS SECURED');
    expect(naval.defeatTitle).toBe('FLEET LOST');
    expect(naval.obstacleLabel).toBe('Islands');
    expect(naval.spaceBg).toBe(0x0b1620);
    expect(naval.boardBg).toBe(0x122636);

    expect(naval.turrets.pulse.shortName).toBe('Deck Gun');
    expect(naval.turrets.plasma.shortName).toBe('Minefield');
    expect(naval.turrets.stasis.shortName).toBe('Sonar Buoy');
    expect(naval.turrets.railgun.shortName).toBe('Destroyer');
    expect(naval.turrets.swarm.shortName).toBe('Aegis SAM');

    expect(naval.roleTags).toEqual({
      pulse: 'CIWS',
      plasma: 'MINE',
      stasis: 'SONAR',
      railgun: 'ASW',
      swarm: 'SAM',
    });

    expect(naval.enemies.scout.name).toBe('Patrol Boat');
    expect(naval.enemies.swarmer.name).toBe('Attack Craft');
    expect(naval.enemies.cruiser.name).toBe('Battleship');
    expect(naval.enemies.frigate.name).toBe('Attack Sub');
    expect(naval.enemies.phase.name).toBe('Strike Bomber');
    expect(naval.enemies.dreadnought.name).toBe('Typhoon Carrier');

    expect(naval.waveNames[1]).toBe('Torpedo Patrol');
    expect(naval.waveNames[4]).toBe('Silent Running [SUBS]');
    expect(naval.waveNames[10]).toBe('Typhoon Flagship');
  });

  it('defines Mars Outpost labels, defenses, boost label, and wave progression in mars theme', () => {
    const mars = getTheater('mars');
    expect(mars.spawnLabel).toBe('RED FRONT');
    expect(mars.objectiveLabel).toBe('ARES DOME');
    expect(mars.bossTitle).toBe('OLYMPUS BEHEMOTH');
    expect(mars.victoryTitle).toBe('COLONY SAVED');
    expect(mars.defeatTitle).toBe('COLONY LOST');
    expect(mars.obstacleLabel).toBe('Canyon Ridge');
    expect(mars.boostLabel).toBe('Geothermal Vent');
    expect(mars.spaceBg).toBe(0x1a100d);
    expect(mars.boardBg).toBe(0x351e16);

    expect(mars.turrets.pulse.shortName).toBe('Pulse Laser');
    expect(mars.turrets.plasma.shortName).toBe('Magma Mortar');
    expect(mars.turrets.stasis.shortName).toBe('Cryo Thump');
    expect(mars.turrets.railgun.shortName).toBe('Mass Driver');
    expect(mars.turrets.swarm.shortName).toBe('Drone Pod');

    expect(mars.roleTags).toEqual({
      pulse: 'LASER',
      plasma: 'MAGMA',
      stasis: 'CRYO',
      railgun: 'RAIL',
      swarm: 'DRONE',
    });

    expect(mars.enemies.scout.name).toBe('Sand Skimmer');
    expect(mars.enemies.swarmer.name).toBe('Burrow Mite');
    expect(mars.enemies.cruiser.name).toBe('Juggernaut');
    expect(mars.enemies.frigate.name).toBe('Crystal Crawler');
    expect(mars.enemies.phase.name).toBe('Dust Wasp');
    expect(mars.enemies.dreadnought.name).toBe('Olympus Behemoth');

    expect(mars.waveNames[1]).toBe('Dust Recon');
    expect(mars.waveNames[10]).toBe('Olympus Rising');
  });

  it('defines Ironhold Keep labels, defenses, boost label, and wave progression in medieval theme', () => {
    const med = getTheater('medieval');
    expect(med.spawnLabel).toBe('HORDE');
    expect(med.objectiveLabel).toBe('IRONHOLD KEEP');
    expect(med.bossTitle).toBe('SIEGE TROLL KING');
    expect(med.victoryTitle).toBe('CASTLE DEFENDED');
    expect(med.defeatTitle).toBe('CASTLE FALLEN');
    expect(med.obstacleLabel).toBe('Dark Forest');
    expect(med.boostLabel).toBe('Arcane Rune');
    expect(med.spaceBg).toBe(0x151411);
    expect(med.boardBg).toBe(0x243322);

    expect(med.turrets.pulse.shortName).toBe('Archers');
    expect(med.turrets.plasma.shortName).toBe('Trebuchet');
    expect(med.turrets.stasis.shortName).toBe('Frost Mage');
    expect(med.turrets.railgun.shortName).toBe('Ballista');
    expect(med.turrets.swarm.shortName).toBe('Arcane');

    expect(med.roleTags).toEqual({
      pulse: 'ARCH',
      plasma: 'CAT',
      stasis: 'FROST',
      railgun: 'BOLT',
      swarm: 'MAGIC',
    });

    expect(med.enemies.scout.name).toBe('Goblin Raider');
    expect(med.enemies.swarmer.name).toBe('Goblin Mob');
    expect(med.enemies.cruiser.name).toBe('Orc Brute');
    expect(med.enemies.frigate.name).toBe('Orc Shaman');
    expect(med.enemies.phase.name).toBe('Wyvern');
    expect(med.enemies.dreadnought.name).toBe('Siege Troll King');

    expect(med.waveNames[1]).toBe('Goblin Scouting');
    expect(med.waveNames[10]).toBe('Siege Troll King');
  });
});
