# Prototype A completion report

**Status:** code complete, **nothing executed**. This session had no shell, so `npm install`, `tsc`, `vite build` and
`vitest` were never run. No `package-lock.json` exists yet and the render code has never been drawn on a real canvas.

## Files (all under `proto-web/`)
`package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `.gitignore`, `README.md`, `COMPLETION.md`,
`src/{main,render,layout,input,inputDom,data,types}.ts`, `src/sim/{game,grid,stepper}.ts`,
`tests/{helpers,grid,game,layout,input}.test.ts` (helpers.ts has no tests of its own).

## Parent should run
```
cd proto-web && npm install && npm run typecheck && npm test && npm run build
npm run dev   # then open in a browser; check stress, three layouts, touch
```
Expected risks if something fails (written without a compiler):
1. Type errors from Pixi v8 option typings in `render.ts` (`generateTexture({target,resolution})`, Text `style` fields).
2. A test whose arithmetic I could only reason about: lane-trap test in `grid.test.ts` relies on enemies choosing the bottom lane
   (the test reads the enemy's lane rather than assuming it); `game.test.ts` "conserves money" assumes at least one kill in 40 s.
3. Vite JSON import of `../../shared-data` (needs `server.fs.allow: ['..']`, already configured).

## Parity coverage
28×16 map + asteroids/portals/Earth/route preview ✔ · 3 rotated dock layouts, 3 turrets/player, wallets, coloured ghosts ✔ ·
per-pointer ownership, capture/cancel/blur/lostpointercapture, mouse fallback ✔ · reverse BFS with spawn + live-enemy checks ✔ ·
fixed 60 Hz ✔ · launch/pause/reset/layout/stress/fullscreen in-canvas ✔ · 70/30 bounty with fractional wallets ✔ ·
sell 70% (tap/right-click) ✔ · stress 150 enemies + 20 deterministic legal turrets ✔ · FPS/enemies/pointers + instructions ✔ ·
layout change resets match and pointers ✔ · focus loss cancels drags and pauses ✔ · wake lock best-effort ✔.

## Gaps / honest notes
- Bounty goes to the owner of the turret that landed the killing blow.
- Any player can tap-sell any turret (refund always goes to its owner); no per-player sell permission in this slice.
- Enemies and Text are reused/pooled where stated in README; enemy objects themselves are not pooled.
- No render interpolation between sim steps; no bilinear smoothing (deferred per contract).
- Stress scene runs live, so the 150 swarmers die within seconds under 20 turrets; FPS during the first seconds is the useful reading.
- Real touch, DPI and performance are unverified. Root `STATUS.md` and `docs/` were not touched.
