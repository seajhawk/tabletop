---
name: new-map
description: End-to-end procedure for creating a new themed map in Tabletop Defense (Galactic Defense) from a picture, idea, or concept—including top-down artwork, canonical JSON layout, matched defense/attacker sprites, unique gameplay twists, audio routing, tests, and live visual verification.
---

# Creating a New Themed Map (`new-map`)

Use this skill whenever the user asks to add a new map/theater—whether starting from a concept, theme idea, reference photo, or custom twist.

## 1. Design the Map & Twists First
Every new map lives on a **28×16** grid (`shared-data/maps.json`) and should feel distinct in both **visuals** and **tactics**:
- **Theme ID & Map ID**: short lowercase slug (e.g., `cyber` / `neon-cybergrid`).
- **Portals**: 2–3 `spawns` on the left edge (`x = 0..3`) and 1–2 `exits` on the right edge (`x = 24..27`).
- **Terrain & Special Cells**:
  - `asteroids`: impassable obstacles matching the artwork (never block all routes from any spawn to exit).
  - `boostCells` *(optional)*: 4 symmetric power pads (`+25%` fire rate, `+20%` range, plus an optional map-specific bonus).
  - `wallCells` *(optional)*: elevated mount cells (`+15%` range, e.g., castle walls, kitchen counters, basalt plateaus).
  - `stressTurrets`: **exactly 20** `[x, y, turretId]` placements that keep all spawns reachable.
- **1–2 Unique Mechanics (`MapMechanic`)**: e.g., periodic environmental hazards, chain-lightning/burn modifiers, enemy regeneration/splitting, defeatable defenses + Healer slot (`mapHasHealer` + `hasDefeatableDefenses`).

## 2. Generate or Prepare Top-Down Artwork
- Invoke the `image-generator` subagent for a **16:9 strictly orthographic top-down 2D illustration** with **no text, labels, UI, or grid lines** (or adapt a user-provided image).
- Inspect the generated image with `read_file` to verify obstacle, spawn, exit, and boost pad positions align with your 28×16 coordinates.
- Copy the final `.jpg` into `proto-web/public/assets/<theme>-map.jpg`.

## 3. Canonical Data & Validator (MUST Stay in Sync)
1. **`shared-data/maps.json`**: append the new map entry (`id`, `name`, `theme`, `mechanic`, `width: 28`, `height: 16`, `spawns`, `exits`, `asteroids`, optional `boostCells`/`wallCells`, `startingCredits`, `startingLives`, and 20 `stressTurrets`).
2. **`scripts/validate-data.mjs`**: add the new `theme` to `validThemes` and new `mechanic` to `validMechanics`.
3. Run `node scripts/validate-data.mjs` immediately to verify schema & BFS reachability (base + stress).

## 4. Types, Theme Metadata, & Audio
1. **`proto-web/src/types.ts`**: add the new slug to `MapTheme` and `MapMechanic`.
2. **`proto-web/src/theme.ts`**: define a full `TheaterTheme` (`spaceBg`, `boardBg`, `gridColor`, `borderColor`, `panelBg`, `slotBg`, `routeDotColor`, `routePulseColor`, `spawnLabel`, `objectiveLabel`, `bossTitle`, `victoryTitle`, `defeatTitle`, `helpText`, `obstacleLabel`, optional `wallLabel`/`boostLabel`, `roleTags`, all 5 `turrets` + optional `healer`, all 6 `enemies`, and `waveNames[1..10]`) and register it in `THEMES` + `getTheater()`.
3. **`proto-web/src/audio.ts`**: route `this.theme === '<theme>'` to an appropriate synthesizer (or add a dedicated synthesizer).

## 5. Custom Matched Sprites (CRITICAL — Prevents Invisible Towers/Fallback Shapes!)
Never leave a non-`space` theme without a `TheaterTextureSet` in `theaterSprites.ts`—otherwise `render.ts` (`hasSprites = theme.id !== 'space'`) will have no sprite textures for placed towers or enemies!
1. **`proto-web/src/theaterSprites.ts`**:
   - Add `<theme>` to `TheaterTheme`.
   - Implement bespoke top-down Canvas2D painters matching the map's aesthetic:
     - `paint<Theme>Base(key)` (all 5 turret bases)
     - `paint<Theme>Turret(key, tier)` (all 5 turrets across tiers `0 | 1 | 2`, facing `+X`)
     - `paint<Theme>Enemy(key)` (all 6 enemies: `scout`, `swarmer`, `cruiser`, `frigate`, `phase`, `dreadnought`, facing `+X`)
     - `paint<Theme>Obstacle(variant)` (3 variants) & `paint<Theme>Crater()`
   - Register in `THEME_PAINTERS`, handle headless `document === 'undefined'` stubbing, and attach `boost` (plus `healer`/`healerBase`/`healerTurrets` if the map has defeatable defenses).
2. **`proto-web/src/render.ts`**:
   - Add `<theme>` to `this.theaterTex` type & constructor (`buildTheaterTextures('<theme>')`).
   - Return `this.theaterTex[themeId]` in `activeSprites()`.
   - Add boost color in `buildBoard()` and `syncTowers()`, and any environmental overlay in `updateStormOverlay()`.
   - Keep `syncTowers()` guarded with `const hasSprites = theme.id !== 'space' && !!sprites;` as a safety net.
3. **`proto-web/src/main.ts`**: load `${base}assets/<theme>-map.jpg` into `mapTextures.<theme>`.

## 6. Gameplay Twists & Healer Wiring
1. **`proto-web/src/sim/game.ts`**:
   - Add any timers/flags (reset them in `reset()`).
   - Implement the mechanic hooks in `step()`, `towerStats()`, `updateEnemies()`, `fireTowers()`, `damageEnemy()`, or `updateMeteors()`.
   - If the map has defeatable defenses, include the mechanic in `hasDefeatableDefenses()` AND in `proto-web/src/layout.ts` → `mapHasHealer()` so the 6th dock slot appears.

## 7. Automated Tests & Live Visual Verification
1. Update tests:
   - `proto-web/tests/theme.test.ts`: add `<theme>` to `THEME_IDS` and assert labels/turrets/enemies.
   - `proto-web/tests/theaterSprites.test.ts`: add `<theme>` to the `buildTheaterTextures` table.
   - `proto-web/tests/game.test.ts`: update map count/wrap assertions and add a dedicated unit test exercising the new map's twists.
2. Run:
   - `node scripts/validate-data.mjs`
   - `npm --prefix proto-web run typecheck`
   - `npx --prefix proto-web vitest run tests/theme.test.ts tests/theaterSprites.test.ts tests/game.test.ts tests/layout.test.ts`
3. **Live Browser Check**: open `http://localhost:5173/`, switch to the new map, **place at least 1 defense on the board and launch Wave 1** to visually confirm placed towers, enemies, dock icons, and map art all render cleanly with `0` console/network errors.
4. Build, commit (staging only modified files), push to `main`, and deploy to GitHub Pages (`/TTDefense/`).
