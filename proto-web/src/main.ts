import { Application, Assets, type Texture } from 'pixi.js';
import { SoundEngine } from './audio';
import { loadData } from './data';
import { Game } from './sim/game';
import { FixedStepper } from './sim/stepper';
import { InputController } from './input';
import { attachPointerInput } from './inputDom';
import { adaptLayout, cyclePlayersLayout, cycleScreenLayout, LAYOUTS, Viewport, type ButtonId, type LayoutDef } from './layout';
import { Renderer } from './render';
import { ScoreBook, browserStorage } from './scores';
import { createBrowserPwa, canApplyGameUpdate } from './pwa';
import { formatWaveName } from './theme';
import { DIFFICULTIES, type MapTheme } from './types';

async function main(): Promise<void> {
  const data = loadData();
  // Created before the first await so an early beforeinstallprompt is captured.
  let updateSafe = () => true;
  const pwa = createBrowserPwa(() => updateSafe());
  const app = new Application();
  await app.init({
    background: '#081321', resizeTo: window, antialias: true, autoDensity: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2.5),
  });
  document.body.appendChild(app.canvas);
  app.canvas.style.touchAction = 'none';

  const phoneIdx = LAYOUTS.findIndex(l => l.id === '2p-phone');
  let layoutIdx = (phoneIdx >= 0 && window.innerHeight > window.innerWidth * 1.15) ? phoneIdx : 0;
  let showStats = false;
  let adaptedScreenW = app.screen.width;
  let adaptedScreenH = app.screen.height;
  let adaptedLayout: LayoutDef = adaptLayout(LAYOUTS[layoutIdx], adaptedScreenW, adaptedScreenH);
  const refreshLayout = (): LayoutDef => {
    adaptedScreenW = app.screen.width;
    adaptedScreenH = app.screen.height;
    adaptedLayout = adaptLayout(LAYOUTS[layoutIdx], adaptedScreenW, adaptedScreenH);
    return adaptedLayout;
  };
  const layout = () => adaptedLayout;
  const game = new Game(data, layout().playerCount);
  const scores = new ScoreBook((data.maps ?? [data.map]).map(m => m.id), browserStorage);
  updateSafe = () => canApplyGameUpdate(game); // ended, or fresh planning with no placement/economy activity
  const audio = new SoundEngine();
  audio.setTheme(game.currentMap.theme ?? 'space');
  const base = import.meta.env.BASE_URL;
  const [militaryTex, navalTex, marsTex, medievalTex, kitchenTex, lawnTex, cyberTex, volcanoTex, biolabTex, officeTex, zooTex, arcadeTex] = await Promise.all([
    Assets.load<Texture>(`${base}assets/us-dc-map.jpg`).catch(() => null),
    Assets.load<Texture>(`${base}assets/naval-map.jpg`).catch(() => null),
    Assets.load<Texture>(`${base}assets/mars-map.jpg`).catch(() => null),
    Assets.load<Texture>(`${base}assets/castle-map.jpg`).catch(() => null),
    Assets.load<Texture>(`${base}assets/kitchen-map.jpg`).catch(() => null),
    Assets.load<Texture>(`${base}assets/lawn-map.jpg`).catch(() => null),
    Assets.load<Texture>(`${base}assets/cyber-map.jpg`).catch(() => null),
    Assets.load<Texture>(`${base}assets/volcano-map.jpg`).catch(() => null),
    Assets.load<Texture>(`${base}assets/biolab-map.jpg`).catch(() => null),
    Assets.load<Texture>(`${base}assets/office-map.jpg`).catch(() => null),
    Assets.load<Texture>(`${base}assets/zoo-map.jpg`).catch(() => null),
    Assets.load<Texture>(`${base}assets/arcade-map.jpg`).catch(() => null),
  ]);
  const mapTextures: Partial<Record<MapTheme, Texture | null>> = {
    military: militaryTex,
    naval: navalTex,
    mars: marsTex,
    medieval: medievalTex,
    kitchen: kitchenTex,
    lawn: lawnTex,
    cyber: cyberTex,
    volcano: volcanoTex,
    biolab: biolabTex,
    office: officeTex,
    zoo: zooTex,
    arcade: arcadeTex,
  };
  const viewport = new Viewport();
  const stepper = new FixedStepper();

  let renderer!: Renderer;
  const wake = { lock: null as { release(): Promise<void>; addEventListener(t: string, f: () => void): void } | null, wanted: false };
  const acquireWake = async () => { // best effort; needs a user gesture and a supporting browser
    wake.wanted = true;
    try {
      const nav = navigator as unknown as { wakeLock?: { request(t: 'screen'): Promise<NonNullable<typeof wake.lock>> } };
      if (!nav.wakeLock || wake.lock) return;
      wake.lock = await nav.wakeLock.request('screen');
      wake.lock.addEventListener('release', () => { wake.lock = null; });
    } catch { /* unsupported or denied: ignore */ }
  };

  const onButton = (id: ButtonId) => {
    const b = layout().board;
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    switch (id) {
      case 'wave':
        if (!game.launchWave()) {
          renderer.toast('No more waves', cx, cy, false);
        } else {
          const w = game.ordinaryWaves[game.waveCursor - 1];
          const bonus = game.lastEarlyBonus > 0 ? ` (+${game.lastEarlyBonus} cr early bonus!)` : '';
          const wName = w ? formatWaveName(game.currentMap.theme, w) : '';
          if (w) renderer.toast(`Wave ${w.index}: ${wName}${bonus}`, cx, cy, true);
        }
        break;
      case 'pause':
        game.togglePause();
        break;
      case 'fullscreen':
        if (document.fullscreenElement) void document.exitFullscreen?.();
        else void document.documentElement.requestFullscreen?.().catch(() => undefined);
        break;
      case 'settings':
        input.toggleSettings();
        break;
      case 'close':
        input.closeSettings();
        break;
      case 'speed':
        game.toggleSpeed();
        break;
      case 'difficulty': {
        const keepOpen = input.settingsOpen;
        input.cancelAll();
        input.settingsOpen = keepOpen;
        const d = game.cycleDifficulty();
        renderer.toast(`Difficulty: ${DIFFICULTIES[d].label}`, cx, cy, true);
        break;
      }
      case 'waves': {
        const keepOpen = input.settingsOpen;
        input.cancelAll();
        input.settingsOpen = keepOpen;
        const w = game.cycleWaveCount();
        renderer.toast(`Waves: ${w}`, cx, cy, true);
        break;
      }
      case 'auto':
        game.toggleAutoWave();
        break;
      case 'sfx':
        audio.toggleMute();
        break;
      case 'stats':
        showStats = !showStats;
        break;
      case 'reset':
        input.cancelAll();
        game.reset();
        break;
      case 'players': {
        const keepOpen = input.settingsOpen;
        layoutIdx = cyclePlayersLayout(layoutIdx);
        refreshLayout();
        input.cancelAll(); // ownership / active players change: reset match and pointers together
        input.settingsOpen = keepOpen;
        game.reset(layout().playerCount);
        renderer.setLayout(layout());
        renderer.toast(`Players: ${layout().playerCount}P (${layout().screenLabel})`, cx, cy, true);
        break;
      }
      case 'screen': {
        const keepOpen = input.settingsOpen;
        const nextIdx = cycleScreenLayout(layoutIdx);
        if (nextIdx !== layoutIdx) {
          layoutIdx = nextIdx;
          refreshLayout();
          input.cancelAll();
          input.settingsOpen = keepOpen;
          game.reset(layout().playerCount);
          renderer.setLayout(layout());
        }
        renderer.toast(`Screen: ${layout().screenLabel}`, cx, cy, true);
        break;
      }
      case 'map': {
        const keepOpen = input.settingsOpen;
        input.cancelAll();
        input.settingsOpen = keepOpen;
        game.setMap(game.mapIndex + 1);
        audio.setTheme(game.currentMap.theme ?? 'space');
        renderer.toast(`Theater: ${game.currentMap.name}`, cx, cy, true);
        break;
      }
      case 'install':
        void pwa.install();
        break;
      case 'update':
        void pwa.update();
        break;
      case 'stress':
        input.cancelAll();
        game.setupStress();
        break;
      case 'play-again':
        input.cancelAll();
        game.reset();
        break;
      case 'next-map':
        input.cancelAll();
        game.setMap(game.mapIndex + 1);
        audio.setTheme(game.currentMap.theme ?? 'space');
        renderer.toast(`Theater: ${game.currentMap.name}`, layout().stageW / 2, layout().stageH / 2, true);
        break;
      case 'add-waves':
        if (game.addMoreWaves(5)) {
          input.cancelAll();
          renderer.toast(`+5 Overtime Waves! (W${game.waveCursor + 1}–${game.totalWaves})`, cx, cy, true);
        }
        break;
    }
  };

  const input = new InputController(game, layout, {
    toast: (m, x, y, ok) => renderer.toast(m, x, y, ok),
    button: onButton,
    creditFly: (fromPlayer, toPlayer, amount, fromX, fromY, toX, toY) =>
      renderer.spawnCreditChip(fromPlayer, toPlayer, amount, fromX, fromY, toX, toY),
    sound: ev => audio.play(ev),
  });
  renderer = new Renderer(app, game, input, layout, () => audio.muted, mapTextures, () => showStats,
    () => scores.result(game), pwa);

  const toWorld = (cx: number, cy: number) => {
    const r = app.canvas.getBoundingClientRect();
    const sx = (cx - r.left) * (app.screen.width / Math.max(r.width, 1));
    const sy = (cy - r.top) * (app.screen.height / Math.max(r.height, 1));
    return viewport.toWorld(sx, sy);
  };
  attachPointerInput({
    canvas: app.canvas, win: window, doc: document, toWorld, input,
    onUserAction: () => { audio.unlock(); void acquireWake(); },
    onFocusLoss: () => game.setPaused(true), // focus loss cancels drags (done by input) and pauses
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && wake.wanted) void acquireWake(); });

  app.ticker.add(ticker => {
    if (app.screen.width !== adaptedScreenW || app.screen.height !== adaptedScreenH) {
      const prev = adaptedLayout;
      const next = refreshLayout();
      if (next.stageW !== prev.stageW || next.stageH !== prev.stageH || next.board.w !== prev.board.w || next.board.h !== prev.board.h) {
        renderer.setLayout(next);
      }
    }
    const l = layout();
    if (viewport.fit(app.screen.width, app.screen.height, l.stageW, l.stageH)) {
      renderer.applyViewport(viewport.scale, viewport.ox, viewport.oy);
    }
    const dt = ticker.deltaMS / 1000;
    stepper.advance(dt * game.speed, step => game.step(step));
    for (const ev of game.drainEvents()) audio.play(ev);
    scores.observe(game); // idempotent per runId: records a finished normal match once
    input.refreshAll();
    renderer.update(dt);
  });

  (window as unknown as Record<string, unknown>).__ga = { game, input, layout, renderer, scores, pwa }; // debug handle
  void pwa.start();
}

void main();
