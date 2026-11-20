import { Texture } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import {
  buildTheaterTextures,
  type TheaterSpriteTheme,
  type TheaterTheme,
} from '../src/theaterSprites';

const TURRET_KEYS = ['pulse', 'plasma', 'stasis', 'railgun', 'swarm'] as const;
const ENEMY_KEYS = ['scout', 'swarmer', 'cruiser', 'frigate', 'phase', 'dreadnought'] as const;

describe('buildTheaterTextures', () => {
  it.each<TheaterSpriteTheme>(['naval', 'mars', 'medieval', 'kitchen', 'lawn'])(
    'returns a valid TheaterTextureSet with Texture.EMPTY in headless Node for %s',
    (theme: TheaterTheme) => {
      expect(typeof document).toBe('undefined');

      const set = buildTheaterTextures(theme);

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

      if (theme === 'naval') {
        expect(set.mine).toBe(Texture.EMPTY);
        expect(set.boost).toBeUndefined();
      } else {
        expect(set.boost).toBe(Texture.EMPTY);
        expect(set.mine).toBeUndefined();
      }

      if (theme === 'kitchen' || theme === 'lawn') {
        expect(set.base).toBe(Texture.EMPTY);
      } else {
        expect(set.base).toBeUndefined();
      }

      if (theme === 'lawn') {
        expect(set.moleMound).toBe(Texture.EMPTY);
      } else {
        expect(set.moleMound).toBeUndefined();
      }

      if (theme === 'medieval') {
        expect(set.knight).toBe(Texture.EMPTY);
      } else {
        expect(set.knight).toBeUndefined();
      }

      expect(() => set.destroy()).not.toThrow();
    },
  );
});
