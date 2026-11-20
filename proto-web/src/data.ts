// Canonical shared data, imported straight from ../../shared-data (never copied or edited here).
import turretsJson from '../../shared-data/turrets.json';
import enemiesJson from '../../shared-data/enemies.json';
import mapsJson from '../../shared-data/maps.json';
import wavesJson from '../../shared-data/waves.json';
import type { EnemyDef, GameData, MapDef, TurretDef, WaveDef } from './types';

function root<T>(json: unknown, key: string): T[] {
  const r = json as { schemaVersion?: number } & Record<string, unknown>;
  if (r.schemaVersion !== 1) throw new Error(`shared-data ${key}: unsupported schemaVersion ${String(r.schemaVersion)}`);
  const arr = r[key];
  if (!Array.isArray(arr)) throw new Error(`shared-data: missing array "${key}"`);
  return arr as T[];
}

export function loadData(): GameData {
  const maps = root<MapDef>(mapsJson, 'maps');
  return {
    turrets: root<TurretDef>(turretsJson, 'turrets'),
    enemies: root<EnemyDef>(enemiesJson, 'enemies'),
    map: maps[0],
    maps,
    waves: root<WaveDef>(wavesJson, 'waves'),
  };
}

export const hex = (s: string): number => parseInt(s.replace('#', ''), 16);
