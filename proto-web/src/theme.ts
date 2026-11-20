import type { MapTheme } from './types';

export type ThemeId = MapTheme;

export interface TurretVisualTheme {
  shortName: string;
  fullName: string;
  upgrades: [string, string];
  color: number;
}

export interface EnemyVisualTheme {
  name: string;
  color: number;
}

export interface TheaterTheme {
  id: ThemeId;
  spaceBg: number;
  boardBg: number;
  gridColor: number;
  borderColor: number;
  panelBg: number;
  slotBg: number;
  routeDotColor: number;
  routePulseColor: number;
  spawnLabel: string;
  objectiveLabel: string;
  bossTitle: string;
  victoryTitle: string;
  defeatTitle: string;
  helpText: string;
  obstacleLabel: string;
  boostLabel?: string;
  roleTags?: Record<string, string>;
  turrets: Record<string, TurretVisualTheme>;
  enemies: Record<string, EnemyVisualTheme>;
  waveNames: Record<number, string>;
}

const SPACE_THEME: TheaterTheme = {
  id: 'space',
  spaceBg: 0x081321,
  boardBg: 0x0b1a2d,
  gridColor: 0x20354b,
  borderColor: 0xc5e4ed,
  panelBg: 0x0d2036,
  slotBg: 0x13304c,
  routeDotColor: 0xc5e4ed,
  routePulseColor: 0x7ac7d9,
  spawnLabel: 'INCOMING',
  objectiveLabel: 'EARTH',
  bossTitle: 'DREADNOUGHT',
  victoryTitle: 'EARTH IS SAFE',
  defeatTitle: 'EARTH LOST',
  helpText:
    'Drag a turret from YOUR dock onto the grid (touch: ghost floats above finger). ' +
    'Tap a placed turret for radial Upgrade / Priority / Sell. ' +
    'Drag or flick ◆ credits to share with teammates. Start paused: plan, then Launch wave.',
  obstacleLabel: 'Asteroid',
  roleTags: {
    pulse: 'PULSE',
    plasma: 'PLASMA',
    stasis: 'SLOW',
    railgun: 'RAIL',
    swarm: 'SWARM',
  },
  turrets: {
    pulse: { shortName: 'Pulse', fullName: 'Pulse Laser', upgrades: ['Twin barrels', 'Overcharged beam'], color: 0x4cd9ef },
    plasma: { shortName: 'Plasma', fullName: 'Plasma Mortar', upgrades: ['Larger radius', 'Napalm burn'], color: 0xffc16e },
    stasis: { shortName: 'Stasis', fullName: 'Stasis Projector', upgrades: ['Stronger field', 'Shield strip'], color: 0x82e3b4 },
    railgun: { shortName: 'Railgun', fullName: 'Railgun', upgrades: ['Faster charge', 'Multi-target pierce'], color: 0xa89bff },
    swarm: { shortName: 'Swarm', fullName: 'Swarm Pod', upgrades: ['More missiles', 'Splash warheads'], color: 0xff84c8 },
  },
  enemies: {
    scout: { name: 'Scout', color: 0xff7f87 },
    swarmer: { name: 'Swarmer', color: 0xffbd77 },
    cruiser: { name: 'Cruiser', color: 0xc5a1f0 },
    frigate: { name: 'Shielded Frigate', color: 0x52e0ff },
    phase: { name: 'Phase Fighter', color: 0xff64b4 },
    dreadnought: { name: 'Dreadnought', color: 0xff4d5a },
  },
  waveNames: {
    1: 'First Contact',
    2: 'Hive Signal',
    3: 'Armored Column',
    4: 'Shield Wall',
    5: 'Orbital Raid',
    6: 'Combined Arms',
    7: 'Swarm Surge',
    8: 'Heavy Phalanx',
    9: 'Vanguard Blitz',
    10: 'Dreadnought Assault',
  },
};

const MILITARY_THEME: TheaterTheme = {
  id: 'military',
  spaceBg: 0x131714,
  boardBg: 0x1b241d,
  gridColor: 0xe8efe2,
  borderColor: 0x546359,
  panelBg: 0x1a201c,
  slotBg: 0x242c27,
  routeDotColor: 0xf2e2ad,
  routePulseColor: 0xf5cf6b,
  spawnLabel: 'INVASION',
  objectiveLabel: 'WASHINGTON DC',
  bossTitle: 'KIROV SIEGE TANK',
  victoryTitle: 'WASHINGTON DC SAVED',
  defeatTitle: 'WASHINGTON DC FALLEN',
  helpText:
    'Drag defenses from YOUR dock onto the map (touch: ghost floats above finger). ' +
    'Tap unit for radial Upgrade / Priority / Sell. ' +
    'Drag or flick ◆ credits to share with teammates. Start paused: plan, then Launch wave.',
  obstacleLabel: 'Mountains',
  roleTags: {
    pulse: 'CIWS',
    plasma: 'ARTY',
    stasis: 'EW',
    railgun: 'TANK',
    swarm: 'SAM',
  },
  turrets: {
    pulse: { shortName: 'Vulcan', fullName: 'Vulcan CIWS', upgrades: ['Dual Barrels', 'DU Rounds'], color: 0xf0cc60 },
    plasma: { shortName: 'Howitzer', fullName: 'M777 Howitzer', upgrades: ['HE Shells', 'Incendiary WP'], color: 0xeb8138 },
    stasis: { shortName: 'EW Jammer', fullName: 'EW Radar Jammer', upgrades: ['EMP Pulse', 'APS Disruptor'], color: 0x4ae895 },
    railgun: { shortName: 'Abrams AT', fullName: 'M1 Abrams AT', upgrades: ['Autoloader', 'Sabot Pierce'], color: 0xe2cb92 },
    swarm: { shortName: 'Patriot', fullName: 'Patriot SAM', upgrades: ['Quad Pod', 'Cluster Warheads'], color: 0xf06565 },
  },
  enemies: {
    scout: { name: 'BTR-82 Recon', color: 0x8da372 },
    swarmer: { name: 'Tigr Assault', color: 0xb5aa76 },
    cruiser: { name: 'T-90M Tank', color: 0x637d57 },
    frigate: { name: 'T-14 Armata', color: 0x5c9684 },
    phase: { name: 'Su-57 Strike Jet', color: 0x9aaec0 },
    dreadnought: { name: 'Kirov Siege Tank', color: 0xb04848 },
  },
  waveNames: {
    1: 'Coastal Recon',
    2: 'Motorized Rush',
    3: 'Tank Column',
    4: 'Armata Spearhead',
    5: 'Air Strike',
    6: 'Combined Battalion',
    7: 'Blitzkrieg Surge',
    8: 'Heavy Armor Division',
    9: 'Full-Scale Assault',
    10: 'Siege of Washington',
  },
};

const NAVAL_THEME: TheaterTheme = {
  id: 'naval',
  spaceBg: 0x0b1620,
  boardBg: 0x122636,
  gridColor: 0xcbe8f5,
  borderColor: 0x4b748a,
  panelBg: 0x10202e,
  slotBg: 0x172d40,
  routeDotColor: 0x99d9f0,
  routePulseColor: 0x5be0ff,
  spawnLabel: 'HOSTILE FLEET',
  objectiveLabel: 'NAVAL BASE',
  bossTitle: 'TYPHOON CARRIER',
  victoryTitle: 'SEAS SECURED',
  defeatTitle: 'FLEET LOST',
  helpText:
    'Deploy naval defenses from YOUR dock to protect the naval base. ' +
    'Tap unit for radial Upgrade / Priority / Sell. ' +
    'Drag or flick ◆ credits to share with teammates. Start paused: plan, then Launch wave.',
  obstacleLabel: 'Islands',
  roleTags: {
    pulse: 'CIWS',
    plasma: 'MINE',
    stasis: 'SONAR',
    railgun: 'ASW',
    swarm: 'SAM',
  },
  turrets: {
    pulse: { shortName: 'Deck Gun', fullName: 'Phalanx CIWS', upgrades: ['Twin Mounts', 'Radar CIWS'], color: 0xf0cc60 },
    plasma: { shortName: 'Minefield', fullName: 'Naval Minefield', upgrades: ['Magnetic Mines', 'Deep-Charge Mines'], color: 0xf59e3d },
    stasis: { shortName: 'Sonar Buoy', fullName: 'Hydro-Sonar Buoy', upgrades: ['Active Ping', 'Torpedo Jammer'], color: 0x4de3d0 },
    railgun: { shortName: 'Destroyer', fullName: 'ASW Sub Destroyer', upgrades: ['Twin Torpedoes', 'ASW Salvo'], color: 0x7ec4f2 },
    swarm: { shortName: 'Aegis SAM', fullName: 'Aegis SAM Cruiser', upgrades: ['VLS Quad Pod', 'Cluster Warheads'], color: 0xf27474 },
  },
  enemies: {
    scout: { name: 'Patrol Boat', color: 0x6db3d8 },
    swarmer: { name: 'Attack Craft', color: 0x82c8e5 },
    cruiser: { name: 'Battleship', color: 0x5a7d9a },
    frigate: { name: 'Attack Sub', color: 0x3d9cb8 },
    phase: { name: 'Strike Bomber', color: 0xa8c2d1 },
    dreadnought: { name: 'Typhoon Carrier', color: 0xbf4343 },
  },
  waveNames: {
    1: 'Torpedo Patrol',
    2: 'Gunboat Swarm',
    3: 'Cruiser Squadron',
    4: 'Silent Running [SUBS]',
    5: 'Carrier Air Raid',
    6: 'Wolfpack & Escort',
    7: 'Fast Attack Surge',
    8: 'Armada Line',
    9: 'All-Hands Assault',
    10: 'Typhoon Flagship',
  },
};

const MARS_THEME: TheaterTheme = {
  id: 'mars',
  spaceBg: 0x1a100d,
  boardBg: 0x351e16,
  gridColor: 0xf2ccb8,
  borderColor: 0x7d4c3b,
  panelBg: 0x241511,
  slotBg: 0x331e18,
  routeDotColor: 0xf0c299,
  routePulseColor: 0xffa652,
  spawnLabel: 'RED FRONT',
  objectiveLabel: 'ARES DOME',
  bossTitle: 'OLYMPUS BEHEMOTH',
  victoryTitle: 'COLONY SAVED',
  defeatTitle: 'COLONY LOST',
  helpText:
    'Deploy colony defenses from YOUR dock to protect Ares Dome. ' +
    'Tap unit for radial Upgrade / Priority / Sell. ' +
    'Drag or flick ◆ credits to share with teammates. Start paused: plan, then Launch wave.',
  obstacleLabel: 'Canyon Ridge',
  boostLabel: 'Geothermal Vent',
  roleTags: {
    pulse: 'LASER',
    plasma: 'MAGMA',
    stasis: 'CRYO',
    railgun: 'RAIL',
    swarm: 'DRONE',
  },
  turrets: {
    pulse: { shortName: 'Pulse Laser', fullName: 'Dust-Blaster Laser', upgrades: ['Twin Optics', 'Thermal Beam'], color: 0x4cd9ef },
    plasma: { shortName: 'Magma Mortar', fullName: 'Magma Mortar', upgrades: ['Wide Crater', 'Lava Napalm'], color: 0xff8442 },
    stasis: { shortName: 'Cryo Thump', fullName: 'Cryo-Seismic Thumper', upgrades: ['Deep Freeze', 'Shield Quake'], color: 0x75e8ff },
    railgun: { shortName: 'Mass Driver', fullName: 'Mass Driver', upgrades: ['Capacitor Bank', 'Hyper-Pierce'], color: 0xe8c768 },
    swarm: { shortName: 'Drone Pod', fullName: 'Orbital Drone Pod', upgrades: ['Swarm Array', 'Blast Drones'], color: 0xf27ec8 },
  },
  enemies: {
    scout: { name: 'Sand Skimmer', color: 0xd99564 },
    swarmer: { name: 'Burrow Mite', color: 0xc27a4e },
    cruiser: { name: 'Juggernaut', color: 0x9c4233 },
    frigate: { name: 'Crystal Crawler', color: 0x58b5c9 },
    phase: { name: 'Dust Wasp', color: 0xe07297 },
    dreadnought: { name: 'Olympus Behemoth', color: 0xb53526 },
  },
  waveNames: {
    1: 'Dust Recon',
    2: 'Mite Burrow',
    3: 'Iron Rollers',
    4: 'Crystal Phalanx',
    5: 'Wasp Squall',
    6: 'Canyon Ambush',
    7: 'Red Tide',
    8: 'Heavy Crawlers',
    9: 'Crater Siege',
    10: 'Olympus Rising',
  },
};

const MEDIEVAL_THEME: TheaterTheme = {
  id: 'medieval',
  spaceBg: 0x151411,
  boardBg: 0x243322,
  gridColor: 0xe6dec5,
  borderColor: 0x736852,
  panelBg: 0x1f1c17,
  slotBg: 0x2c2720,
  routeDotColor: 0xe6d29c,
  routePulseColor: 0xf5c85b,
  spawnLabel: 'HORDE',
  objectiveLabel: 'IRONHOLD KEEP',
  bossTitle: 'SIEGE TROLL KING',
  victoryTitle: 'CASTLE DEFENDED',
  defeatTitle: 'CASTLE FALLEN',
  helpText:
    'Deploy kingdom defenses from YOUR dock to protect Ironhold Keep. ' +
    'Tap unit for radial Upgrade / Priority / Sell. ' +
    'Drag or flick ◆ credits to share with teammates. Start paused: plan, then Launch wave.',
  obstacleLabel: 'Dark Forest',
  boostLabel: 'Arcane Rune',
  roleTags: {
    pulse: 'ARCH',
    plasma: 'CAT',
    stasis: 'FROST',
    railgun: 'BOLT',
    swarm: 'MAGIC',
  },
  turrets: {
    pulse: { shortName: 'Archers', fullName: 'Archer Tower', upgrades: ['Twin Volleys', 'Elven Longbows'], color: 0xe8c866 },
    plasma: { shortName: 'Trebuchet', fullName: 'Flaming Trebuchet', upgrades: ['Heavy Stones', 'Greek Fire'], color: 0xf0853e },
    stasis: { shortName: 'Frost Mage', fullName: 'Frost Mage Spire', upgrades: ['Blizzard', 'Dispel Ward'], color: 0x6ce3ff },
    railgun: { shortName: 'Ballista', fullName: 'Heavy Ballista', upgrades: ['Windlass', 'Dragon-Piercer'], color: 0xd9be8a },
    swarm: { shortName: 'Arcane', fullName: 'Arcane Spire', upgrades: ['Star Volley', 'Meteor Sparks'], color: 0xc784ff },
  },
  enemies: {
    scout: { name: 'Goblin Raider', color: 0x6ca34e },
    swarmer: { name: 'Goblin Mob', color: 0x82b846 },
    cruiser: { name: 'Orc Brute', color: 0x476b3c },
    frigate: { name: 'Orc Shaman', color: 0x7a4fa3 },
    phase: { name: 'Wyvern', color: 0x9e3838 },
    dreadnought: { name: 'Siege Troll King', color: 0x8a2c2c },
  },
  waveNames: {
    1: 'Goblin Scouting',
    2: 'Goblin Horde',
    3: 'Orc Warband',
    4: 'Dark Shamans',
    5: 'Wyvern Swoop',
    6: 'Iron & Magic',
    7: 'Green Tide',
    8: 'Berserker Vanguard',
    9: 'Black Gate Assault',
    10: 'Siege Troll King',
  },
};

export const THEMES: Record<ThemeId, TheaterTheme> = {
  space: SPACE_THEME,
  military: MILITARY_THEME,
  naval: NAVAL_THEME,
  mars: MARS_THEME,
  medieval: MEDIEVAL_THEME,
};

export function getTheater(theme?: string): TheaterTheme {
  switch (theme) {
    case 'military':
      return MILITARY_THEME;
    case 'naval':
      return NAVAL_THEME;
    case 'mars':
      return MARS_THEME;
    case 'medieval':
      return MEDIEVAL_THEME;
    case 'space':
    default:
      return SPACE_THEME;
  }
}
