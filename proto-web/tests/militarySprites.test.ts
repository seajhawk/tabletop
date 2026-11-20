import { Texture } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { buildMilitaryTextures } from '../src/militarySprites';

const TURRET_KEYS = ['pulse', 'plasma', 'stasis', 'railgun', 'swarm'] as const;
const ENEMY_KEYS = ['scout', 'swarmer', 'cruiser', 'frigate', 'phase', 'dreadnought'] as const;

describe('buildMilitaryTextures', () => {
  it('returns a valid MilitaryTextureSet with Texture.EMPTY in headless Node', () => {
    expect(typeof document).toBe('undefined');

    const set = buildMilitaryTextures();

    expect(Object.keys(set.bases).sort()).toEqual([...TURRET_KEYS].sort());
    for (const key of TURRET_KEYS) {
      expect(set.bases[key]).toBe(Texture.EMPTY);
    }

    expect(Object.keys(set.turrets).sort()).toEqual([...TURRET_KEYS].sort());
    for (const key of TURRET_KEYS) {
      expect(set.turrets[key]).toHaveLength(3);
      expect(set.turrets[key][0]).toBe(Texture.EMPTY);
      expect(set.turrets[key][1]).toBe(Texture.EMPTY);
      expect(set.turrets[key][2]).toBe(Texture.EMPTY);
    }

    expect(Object.keys(set.enemies).sort()).toEqual([...ENEMY_KEYS].sort());
    for (const key of ENEMY_KEYS) {
      expect(set.enemies[key]).toBe(Texture.EMPTY);
    }

    expect(set.obstacles).toHaveLength(3);
    for (const obs of set.obstacles) {
      expect(obs).toBe(Texture.EMPTY);
    }

    expect(set.crater).toBe(Texture.EMPTY);
    expect(() => set.destroy()).not.toThrow();
  });
});
