import { describe, expect, it } from 'vitest';
import { CREDIT_TRANSFER_AMOUNT, InputController, reasonText, TOUCH_LIFT } from '../src/input';
import { attachPointerInput } from '../src/inputDom';
import {
  boardCellCenter, CORNER_SCALE, creditChipRect, DOCK_W, dockToWorld, dockUp, hitDockSlot, LAYOUTS, radialButtons,
  settingsButtonRects, settingsPanelRect, slotRect, summaryButtonRects, TURRET_ORDER,
} from '../src/layout';
import { newGame } from './helpers';

function setup(layoutIdx = 0) {
  const layout = LAYOUTS[layoutIdx];
  const game = newGame(layout.playerCount);
  const toasts: string[] = [];
  const buttons: string[] = [];
  const sounds: string[] = [];
  const creditFlies: { fromPlayer: number; toPlayer: number; amount: number }[] = [];
  const input = new InputController(game, () => LAYOUTS[layoutIdx], {
    toast: m => toasts.push(m),
    button: id => buttons.push(id),
    creditFly: (fromPlayer, toPlayer, amount) => creditFlies.push({ fromPlayer, toPlayer, amount }),
    sound: ev => sounds.push(ev),
  });
  const slot = (dockIdx: number, i: number) => {
    const r = slotRect(i);
    return dockToWorld(layout.docks[dockIdx], r.x + r.w / 2, r.y + r.h / 2);
  };
  const chip = (dockIdx: number) => {
    const r = creditChipRect();
    return dockToWorld(layout.docks[dockIdx], r.x + r.w / 2, r.y + r.h / 2);
  };
  const cell = (x: number, y: number) => boardCellCenter(layout.board, x, y, layout.boardRotated);
  return { game, input, toasts, buttons, sounds, creditFlies, slot, chip, cell, layout };
}

describe('per-pointer drag ownership', () => {
  it('places for the dock owner and charges that wallet (mouse, bottom and rotated top dock)', () => {
    const { game, input, slot, cell } = setup();
    const start = game.currentMap.startingCredits;
    const pulseCost = game.turretById.get('pulse')!.cost;
    const plasmaCost = game.turretById.get('plasma')!.cost;
    const a = slot(0, 0), b = slot(1, 1);
    input.pointerDown(1, a.x, a.y, 'mouse', 0, 0);
    expect(input.drags.get(1)).toMatchObject({ owner: 0, turretId: 'pulse' });
    input.pointerMove(1, cell(3, 6).x, cell(3, 6).y);
    expect(input.drags.get(1)!.result?.ok).toBe(true);
    input.pointerUp(1, cell(3, 6).x, cell(3, 6).y, 10);
    expect(game.towerAt[game.idx(3, 6)]).toMatchObject({ owner: 0 });
    expect(game.credits[0]).toBe(start - pulseCost);

    input.pointerDown(2, b.x, b.y, 'mouse', 0, 20);
    expect(input.drags.get(2)).toMatchObject({ owner: 1, turretId: 'plasma' });
    input.pointerUp(2, cell(8, 6).x, cell(8, 6).y, 30);
    expect(game.towerAt[game.idx(8, 6)]).toMatchObject({ owner: 1 });
    expect(game.credits[1]).toBe(start - plasmaCost);
    expect(input.pointerCount).toBe(0);
  });

  it('keeps ownership captured at drag start even when dragged across the other dock', () => {
    const { game, input, slot, cell } = setup();
    const a = slot(0, 0), other = slot(1, 0);
    input.pointerDown(1, a.x, a.y, 'mouse', 0, 0);
    input.pointerMove(1, other.x, other.y);
    input.pointerUp(1, cell(4, 6).x, cell(4, 6).y, 5);
    expect(game.towerAt[game.idx(4, 6)]!.owner).toBe(0);
  });

  it('touch ghost is lifted along the dock "up" direction (inverse-rotated for the top dock)', () => {
    const { game, input, slot, cell } = setup();
    const bottom = slot(0, 0), top = slot(1, 0);
    // bottom dock: up is -y, so finger sits TOUCH_LIFT below the aimed cell
    input.pointerDown(1, bottom.x, bottom.y, 'touch', 0, 0);
    input.pointerUp(1, cell(5, 6).x, cell(5, 6).y + TOUCH_LIFT, 1);
    expect(game.towerAt[game.idx(5, 6)]).not.toBeNull();
    // top dock is rotated 180deg: up is +y, so finger is above the aimed cell
    input.pointerDown(2, top.x, top.y, 'touch', 0, 2);
    input.pointerUp(2, cell(9, 6).x, cell(9, 6).y - TOUCH_LIFT, 3);
    expect(game.towerAt[game.idx(9, 6)]!.owner).toBe(1);
  });

  it('supports simultaneous drags and revalidates atomically on release', () => {
    const { game, input, slot, cell } = setup();
    const start = game.currentMap.startingCredits;
    const pulseCost = game.turretById.get('pulse')!.cost;
    const a = slot(0, 0), b = slot(1, 0);
    input.pointerDown(10, a.x, a.y, 'touch', 0, 0);
    input.pointerDown(11, b.x, b.y, 'touch', 0, 0);
    expect(input.drags.size).toBe(2);
    expect(input.pointerCount).toBe(2);
    const t = cell(7, 7);
    input.pointerMove(10, t.x, t.y + TOUCH_LIFT);
    input.pointerMove(11, t.x, t.y - TOUCH_LIFT);
    // both ghosts looked valid while hovering the same free cell...
    expect(input.drags.get(10)!.result?.ok).toBe(true);
    expect(input.drags.get(11)!.result?.ok).toBe(true);
    input.pointerUp(10, t.x, t.y + TOUCH_LIFT, 1);
    input.pointerUp(11, t.x, t.y - TOUCH_LIFT, 1);
    // ...but only the first release commits; the second is rejected and charges nothing
    expect(game.towers.length).toBe(1);
    expect(game.credits).toEqual([start - pulseCost, start]);
    expect(game.totalCredits()).toBeCloseTo(game.expectedCredits(), 9);
  });

  it('cancellation discards a drag with no placement or charge', () => {
    const { game, input, slot, cell } = setup();
    const start = game.currentMap.startingCredits;
    const a = slot(0, 2);
    input.pointerDown(5, a.x, a.y, 'touch', 0, 0);
    input.pointerMove(5, cell(4, 4).x, cell(4, 4).y);
    input.cancel(5);
    expect(input.drags.size).toBe(0);
    expect(input.pointerCount).toBe(0);
    input.pointerUp(5, cell(4, 4).x, cell(4, 4).y, 1); // late up for a cancelled pointer is a no-op
    expect(game.towers.length).toBe(0);
    expect(game.credits).toEqual([start, start]);
  });

  it('cancelAll (focus loss / layout change) clears every pointer', () => {
    const { input, slot } = setup();
    input.pointerDown(1, slot(0, 0).x, slot(0, 0).y, 'touch', 0, 0);
    input.pointerDown(2, slot(1, 0).x, slot(1, 0).y, 'touch', 0, 0);
    input.cancelAll();
    expect(input.pointerCount).toBe(0);
    expect(input.drags.size).toBe(0);
  });

  it('dropping outside the grid places nothing', () => {
    const { game, input, slot } = setup();
    input.pointerDown(1, slot(0, 0).x, slot(0, 0).y, 'mouse', 0, 0);
    input.pointerUp(1, 20, 20, 1);
    expect(game.towers.length).toBe(0);
    expect(game.credits[0]).toBe(game.currentMap.startingCredits);
  });

  it('4P layouts: every dock slot starts a drag owned by that dock', () => {
    for (const li of LAYOUTS.map((l, i) => (l.playerCount === 4 ? i : -1)).filter(i => i >= 0)) {
      const { input, slot } = setup(li);
      LAYOUTS[li].docks.forEach((d, di) => {
        input.pointerDown(di + 1, slot(di, 1).x, slot(di, 1).y, 'touch', 0, 0);
        expect(input.drags.get(di + 1)).toMatchObject({ owner: d.player, turretId: 'plasma' });
      });
      expect(input.drags.size).toBe(4);
    }
  });
});

describe('4P corners: four independent diagonal dock drags', () => {
  it('each 45/135/225/315 dock starts, lifts along its own "up" and commits for its owner', () => {
    const cornersIdx = LAYOUTS.findIndex(l => l.id === '4p-corners');
    const { game, input, slot, cell } = setup(cornersIdx);
    const docks = LAYOUTS[cornersIdx].docks;
    const targets = [[8, 4], [20, 4], [20, 11], [8, 11]]; // all legal, mutually distinct
    const finger = docks.map((d, i) => {
      const up = dockUp(d), c = cell(targets[i][0], targets[i][1]);
      return { x: c.x - up.x * TOUCH_LIFT, y: c.y - up.y * TOUCH_LIFT };
    });
    docks.forEach((d, i) => {
      const s = slot(i, i % 3);
      input.pointerDown(100 + i, s.x, s.y, 'touch', 0, 0);
      expect(input.drags.get(100 + i)).toMatchObject({ owner: d.player, turretId: TURRET_ORDER[i % 3] });
    });
    expect(input.drags.size).toBe(4);
    docks.forEach((_, i) => input.pointerMove(100 + i, finger[i].x, finger[i].y));
    docks.forEach((_, i) => expect(input.drags.get(100 + i)!.cell).toEqual({ x: targets[i][0], y: targets[i][1] }));
    // release in reverse order; each commit is independent
    for (let i = 3; i >= 0; i--) input.pointerUp(100 + i, finger[i].x, finger[i].y, 1);
    const start = game.currentMap.startingCredits;
    docks.forEach((d, i) => {
      expect(game.towerAt[game.idx(targets[i][0], targets[i][1])]).toMatchObject({ owner: d.player, def: { id: TURRET_ORDER[i % 3] } });
      expect(game.credits[d.player]).toBe(start - game.turretById.get(TURRET_ORDER[i % 3])!.cost);
    });
    expect(input.pointerCount).toBe(0);
    expect(game.totalCredits()).toBeCloseTo(game.expectedCredits(), 9);
  });

  it('hit testing honours the 0.61 scale and rotation (slot edge vs the gap between slots)', () => {
    const cornersIdx = LAYOUTS.findIndex(l => l.id === '4p-corners');
    const d = LAYOUTS[cornersIdx].docks[0];
    const r = slotRect(0);
    const edge = dockToWorld(d, r.x + r.w - 2, r.y + r.h / 2);   // 2 logical px inside slot 0
    const gap = dockToWorld(d, r.x + r.w + 3, r.y + r.h / 2);    // in the 6 logical px gap between slots 0 and 1
    const next = dockToWorld(d, r.x + r.w + 8, r.y + r.h / 2);   // 2 logical px inside slot 1
    expect(hitDockSlot(d, edge.x, edge.y)).toBe(0);
    expect(hitDockSlot(d, gap.x, gap.y)).toBe(-1);
    expect(hitDockSlot(d, next.x, next.y)).toBe(1);
    const c = dockToWorld(d, 0, 0), c2 = dockToWorld(d, DOCK_W, 0);
    expect(Math.hypot(c2.x - c.x, c2.y - c.y)).toBeCloseTo(DOCK_W * CORNER_SCALE, 9);
  });

  it('corner-layout always-on HUD buttons respond at horizontal bar position only', () => {
    const cornersIdx = LAYOUTS.findIndex(l => l.id === '4p-corners');
    const { input, buttons, layout } = setup(cornersIdx);
    const r = layout.hudButtons.wave, mid = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
    input.pointerDown(1, mid.x, mid.y, 'touch', 0, 0);
    input.pointerUp(1, mid.x, mid.y, 5);
    expect(buttons).toEqual(['wave']);
    input.pointerDown(2, 20, 20, 'touch', 0, 0); // old top-left position is empty space in 4p-corners
    input.pointerUp(2, 20, 20, 5);
    expect(buttons).toEqual(['wave']);
  });
});

describe('buttons, selling & radial menus', () => {
  it('phone modal blank header captures touches above the covered HUD button', () => {
    const { input, layout, buttons } = setup(LAYOUTS.findIndex(l => l.id === '2p-phone'));
    input.toggleSettings();
    const hud = layout.hudButtons.wave;
    const x = hud.x + hud.w / 2, y = hud.y + 5;
    input.pointerDown(1, x, y, 'touch', 0, 0);
    input.pointerUp(1, x, y, 10);
    expect(input.settingsOpen).toBe(true);
    expect(buttons).toEqual([]);
    expect(input.pointerCount).toBe(0);
  });

  it('button fires only on release inside the pressed button, per pointer', () => {
    const { input, buttons, layout } = setup();
    const r = layout.hudButtons.pause, mid = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
    input.pointerDown(1, mid.x, mid.y, 'touch', 0, 0);
    expect(input.isPressed('pause')).toBe(true);
    input.pointerUp(1, mid.x, mid.y, 5);
    expect(buttons).toEqual(['pause']);
    input.pointerDown(2, mid.x, mid.y, 'touch', 0, 0);
    input.pointerUp(2, 600, 400, 5); // slid off
    input.pointerDown(3, mid.x, mid.y, 'touch', 0, 0);
    input.cancel(3);
    input.pointerUp(3, mid.x, mid.y, 5);
    expect(buttons).toEqual(['pause']);
  });

  it('routes always-on HUD buttons and settings modal buttons to hooks.button', () => {
    const { game, input, buttons, layout, cell } = setup();
    const sBtn = layout.hudButtons.settings;
    input.pointerDown(1, sBtn.x + sBtn.w / 2, sBtn.y + sBtn.h / 2, 'touch', 0, 0);
    input.pointerUp(1, sBtn.x + sBtn.w / 2, sBtn.y + sBtn.h / 2, 5);
    expect(buttons).toEqual(['settings']);

    // Place a tower underneath the modal and outside it to verify modal capture
    game.tryPlace(0, 'pulse', 2, 6);
    expect(input.toggleSettings()).toBe(true);

    const sRects = settingsButtonRects(layout);
    for (const id of ['map', 'difficulty', 'close'] as const) {
      const r = sRects[id];
      input.pointerDown(2, r.x + r.w / 2, r.y + r.h / 2, 'touch', 0, 10);
      input.pointerUp(2, r.x + r.w / 2, r.y + r.h / 2, 15);
    }
    expect(buttons).toEqual(['settings', 'map', 'difficulty', 'close']);

    // Right-click while settingsOpen does not sell tower underneath
    const towerPos = cell(2, 6);
    input.pointerDown(3, towerPos.x, towerPos.y, 'mouse', 2, 20);
    input.pointerUp(3, towerPos.x, towerPos.y, 25);
    expect(game.towerAt[game.idx(2, 6)]).not.toBeNull();
    expect(input.settingsOpen).toBe(true);

    // Tapping outside settingsPanelRect dismisses modal without touching tower underneath
    const panel = settingsPanelRect(layout);
    expect(towerPos.x).toBeLessThan(panel.x);
    input.pointerDown(4, towerPos.x, towerPos.y, 'touch', 0, 30);
    input.pointerUp(4, towerPos.x, towerPos.y, 35);
    expect(input.settingsOpen).toBe(false);
    expect(input.openRadials.size).toBe(0);
    expect(game.towerAt[game.idx(2, 6)]).not.toBeNull();

    // cancelAll closes settings modal
    input.toggleSettings();
    expect(input.settingsOpen).toBe(true);
    input.cancelAll();
    expect(input.settingsOpen).toBe(false);
  });

  for (const phoneId of ['1p-phone', '2p-phone']) {
    it(`${phoneId} settings modal keeps simultaneous fingers independent and cancellation clean`, () => {
      const { input, buttons, layout } = setup(LAYOUTS.findIndex(l => l.id === phoneId));
      input.toggleSettings();
      const r = settingsButtonRects(layout);
      const c = (id: 'speed' | 'auto' | 'sfx') => ({ x: r[id].x + r[id].w / 2, y: r[id].y + r[id].h / 2 });

      input.pointerDown(1, c('speed').x, c('speed').y, 'touch', 0, 0);
      input.pointerDown(2, c('auto').x, c('auto').y, 'touch', 0, 1);
      expect(input.isPressed('speed')).toBe(true);
      expect(input.isPressed('auto')).toBe(true);
      input.pointerUp(2, c('auto').x, c('auto').y, 5);
      expect(buttons).toEqual(['auto']);
      expect(input.isPressed('speed')).toBe(true); // other finger unaffected
      input.pointerUp(1, c('speed').x, c('speed').y, 6);
      expect(buttons).toEqual(['auto', 'speed']);

      // Slide off the target before release: no activation.
      input.pointerDown(3, c('sfx').x, c('sfx').y, 'touch', 0, 10);
      input.pointerUp(3, c('speed').x, c('speed').y, 11);
      expect(buttons).toEqual(['auto', 'speed']);

      // Outside-dismiss only completes on its own finger's release; a concurrent button press still fires.
      const panel = settingsPanelRect(layout);
      input.pointerDown(4, panel.x / 2, panel.y + 300, 'touch', 0, 20);
      input.pointerDown(5, c('sfx').x, c('sfx').y, 'touch', 0, 21);
      expect(input.settingsOpen).toBe(true);
      input.pointerUp(5, c('sfx').x, c('sfx').y, 25);
      expect(buttons).toEqual(['auto', 'speed', 'sfx']);
      input.pointerUp(4, panel.x / 2, panel.y + 300, 26);
      expect(input.settingsOpen).toBe(false);

      // cancelAll releases pressed buttons without activating them.
      input.toggleSettings();
      input.pointerDown(6, c('auto').x, c('auto').y, 'touch', 0, 30);
      input.cancelAll();
      expect(input.isPressed('auto')).toBe(false);
      expect(input.pointerCount).toBe(0);
      expect(buttons).toEqual(['auto', 'speed', 'sfx']);
    });
  }

  it('2P phone portrait layout supports rotated vertical-court placement, radial menus, and waves settings button', () => {
    const phoneIdx = LAYOUTS.findIndex(l => l.id === '2p-phone');
    const { game, input, slot, cell, buttons, layout } = setup(phoneIdx);
    const s0 = slot(0, 0);
    const target0 = cell(5, 6);
    input.pointerDown(1, s0.x, s0.y, 'touch', 0, 0);
    input.pointerUp(1, target0.x, target0.y + TOUCH_LIFT, 10);
    expect(game.towerAt[game.idx(5, 6)]).toMatchObject({ owner: 0, def: { id: 'pulse' } });

    // P1 top dock (rotated PI) lifts downward (+TOUCH_LIFT in dock-up = +y in world)
    const s1 = slot(1, 1);
    const target1 = cell(20, 10);
    input.pointerDown(10, s1.x, s1.y, 'touch', 0, 12);
    input.pointerUp(10, target1.x, target1.y - TOUCH_LIFT, 15);
    expect(game.towerAt[game.idx(20, 10)]).toMatchObject({ owner: 1, def: { id: 'plasma' } });

    input.pointerDown(2, target0.x, target0.y, 'touch', 0, 20);
    input.pointerUp(2, target0.x, target0.y, 60);
    const radial = input.openRadials.get(0);
    expect(radial).toBeDefined();
    expect(radial!.cx).toBeCloseTo(target0.x, 6);
    expect(radial!.cy).toBeCloseTo(target0.y, 6);

    // Upgrade via radial on rotated board
    const upgBtn = radialButtons(radial!.cx, radial!.cy, radial!.rot, layout.stageW, layout.stageH).find(b => b.action === 'upgrade')!;
    input.pointerDown(3, upgBtn.x, upgBtn.y, 'touch', 0, 70);
    input.pointerUp(3, upgBtn.x, upgBtn.y, 80);
    expect(game.towerAt[game.idx(5, 6)]!.tier).toBe(1);

    // Settings 'waves' button fires on release
    input.toggleSettings();
    const wavesBtn = settingsButtonRects(layout).waves;
    input.pointerDown(4, wavesBtn.x + wavesBtn.w / 2, wavesBtn.y + wavesBtn.h / 2, 'touch', 0, 90);
    input.pointerUp(4, wavesBtn.x + wavesBtn.w / 2, wavesBtn.y + wavesBtn.h / 2, 100);
    expect(buttons).toEqual(['waves']);
  });

  it('emits ui-place, ui-error, ui-upgrade, ui-sell, and ui-share sound events', () => {
    const { game, input, slot, chip, cell, sounds } = setup();
    // ui-place on valid drop
    const s = slot(0, 0);
    const c = cell(4, 6);
    input.pointerDown(1, s.x, s.y, 'mouse', 0, 0);
    input.pointerUp(1, c.x, c.y, 10);
    expect(sounds).toEqual(['ui-place']);

    // ui-error on occupied cell
    input.pointerDown(2, s.x, s.y, 'mouse', 0, 20);
    input.pointerUp(2, c.x, c.y, 30);
    expect(sounds).toEqual(['ui-place', 'ui-error']);

    // ui-upgrade via radial
    input.pointerDown(3, c.x, c.y, 'touch', 0, 40);
    input.pointerUp(3, c.x, c.y, 80);
    const r = input.openRadials.get(0)!;
    const upgBtn = radialButtons(r.cx, r.cy, r.rot).find(b => b.action === 'upgrade')!;
    input.pointerDown(4, upgBtn.x, upgBtn.y, 'touch', 0, 100);
    input.pointerUp(4, upgBtn.x, upgBtn.y, 120);
    expect(sounds).toEqual(['ui-place', 'ui-error', 'ui-upgrade']);

    // ui-share via credit drop
    const from = chip(0);
    const targetDock = LAYOUTS[0].docks[1];
    input.pointerDown(5, from.x, from.y, 'touch', 0, 140);
    input.pointerUp(5, targetDock.cx, targetDock.cy, 160);
    expect(sounds).toEqual(['ui-place', 'ui-error', 'ui-upgrade', 'ui-share']);

    // ui-sell via right-click
    input.pointerDown(6, c.x, c.y, 'mouse', 2, 180);
    expect(sounds).toEqual(['ui-place', 'ui-error', 'ui-upgrade', 'ui-share', 'ui-sell']);
  });

  it('right-click sells at once; tap opens radial menu (sell button sells); drag-away does not', () => {
    const { game, input, cell } = setup();
    const start = game.currentMap.startingCredits;
    const pulseCost = game.turretById.get('pulse')!.cost;
    const plasmaCost = game.turretById.get('plasma')!.cost;
    const stasisCost = game.turretById.get('stasis')!.cost;
    game.tryPlace(0, 'pulse', 3, 6);
    game.tryPlace(1, 'plasma', 5, 6);
    game.tryPlace(0, 'stasis', 7, 6);
    const c1 = cell(3, 6);
    input.pointerDown(1, c1.x, c1.y, 'mouse', 2, 0);
    expect(game.towerAt[game.idx(3, 6)]).toBeNull();
    expect(game.credits[0]).toBeCloseTo(start - pulseCost - stasisCost + pulseCost * 0.7, 9);

    const c2 = cell(5, 6);
    input.pointerDown(2, c2.x, c2.y, 'touch', 0, 0);
    input.pointerUp(2, c2.x, c2.y, 100);
    expect(input.openRadials.get(1)).toBeDefined();
    const sellBtn = radialButtons(c2.x, c2.y, input.openRadials.get(1)!.rot).find(b => b.action === 'sell')!;
    input.pointerDown(20, sellBtn.x, sellBtn.y, 'touch', 0, 150);
    input.pointerUp(20, sellBtn.x, sellBtn.y, 200);
    expect(game.towerAt[game.idx(5, 6)]).toBeNull();
    expect(input.openRadials.has(1)).toBe(false);
    expect(game.credits[1]).toBeCloseTo(start - plasmaCost + plasmaCost * 0.7, 9);

    const c3 = cell(7, 6);
    input.pointerDown(3, c3.x, c3.y, 'touch', 0, 0);
    input.pointerMove(3, c3.x + 40, c3.y, 50);
    input.pointerUp(3, c3.x + 40, c3.y, 100);
    expect(game.towerAt[game.idx(7, 6)]).not.toBeNull();
    expect(input.openRadials.size).toBe(0);
    expect(game.totalCredits()).toBeCloseTo(game.expectedCredits(), 9);
  });

  it('supports simultaneous multi-player radial menus: P1 upgrades while P2 cycles priority & sells', () => {
    const { game, input, cell } = setup();
    game.tryPlace(0, 'pulse', 4, 6);
    game.tryPlace(1, 'plasma', 10, 6);
    const p1Pos = cell(4, 6), p2Pos = cell(10, 6);

    // Both players tap their towers simultaneously
    input.pointerDown(1, p1Pos.x, p1Pos.y, 'touch', 0, 0);
    input.pointerDown(2, p2Pos.x, p2Pos.y, 'touch', 0, 0);
    input.pointerUp(1, p1Pos.x, p1Pos.y, 80);
    input.pointerUp(2, p2Pos.x, p2Pos.y, 90);
    expect(input.openRadials.size).toBe(2);
    const r1 = input.openRadials.get(0)!;
    const r2 = input.openRadials.get(1)!;
    expect(r1.rot).toBe(0);
    expect(r2.rot).toBeCloseTo(Math.PI, 9);

    // P2 cycles priority (radial stays open); P1 upgrades (radial closes)
    const p2Prio = radialButtons(r2.cx, r2.cy, r2.rot).find(b => b.action === 'priority')!;
    const p1Upg = radialButtons(r1.cx, r1.cy, r1.rot).find(b => b.action === 'upgrade')!;
    input.pointerDown(3, p2Prio.x, p2Prio.y, 'touch', 0, 120);
    input.pointerDown(4, p1Upg.x, p1Upg.y, 'touch', 0, 120);
    input.pointerUp(3, p2Prio.x, p2Prio.y, 160);
    input.pointerUp(4, p1Upg.x, p1Upg.y, 160);

    expect(game.towerAt[game.idx(4, 6)]!.tier).toBe(1);
    expect(game.towerAt[game.idx(10, 6)]!.priority).toBe('strong');
    expect(input.openRadials.has(0)).toBe(false);
    expect(input.openRadials.has(1)).toBe(true);

    // Tapping empty board space closes remaining radials
    const empty = cell(14, 6);
    input.pointerDown(5, empty.x, empty.y, 'touch', 0, 200);
    input.pointerUp(5, empty.x, empty.y, 240);
    expect(input.openRadials.size).toBe(0);
    expect(game.totalCredits()).toBeCloseTo(game.expectedCredits(), 9);
  });

  it('empty-tap spares a menu with a held radial press; the held upgrade commits once for its owner', () => {
    const { game, input, cell } = setup();
    const start = game.currentMap.startingCredits;
    const pulse = game.turretById.get('pulse')!;
    const plasma = game.turretById.get('plasma')!;
    game.tryPlace(0, 'pulse', 4, 6);
    game.tryPlace(1, 'plasma', 10, 6);
    const p1 = cell(4, 6), p2 = cell(10, 6);
    input.pointerDown(1, p1.x, p1.y, 'touch', 0, 0);
    input.pointerUp(1, p1.x, p1.y, 50);
    input.pointerDown(2, p2.x, p2.y, 'touch', 0, 0);
    input.pointerUp(2, p2.x, p2.y, 60);
    const r1 = input.openRadials.get(0)!;
    const upg = radialButtons(r1.cx, r1.cy, r1.rot).find(b => b.action === 'upgrade')!;

    input.pointerDown(3, upg.x, upg.y, 'touch', 0, 100); // P1 holds Upgrade
    const empty = cell(14, 6);
    input.pointerDown(4, empty.x, empty.y, 'touch', 0, 110); // other pointer taps empty board
    input.pointerUp(4, empty.x, empty.y, 130);
    expect(input.openRadials.has(0)).toBe(true);  // held menu survives
    expect(input.openRadials.has(1)).toBe(false); // idle menu still dismissed

    input.pointerUp(3, upg.x, upg.y, 150);
    const cost = game.towerAt[game.idx(4, 6)]!.def.upgrades[0].cost;
    expect(game.towerAt[game.idx(4, 6)]!.tier).toBe(1);
    expect(game.credits[0]).toBeCloseTo(start - pulse.cost - cost, 9);
    expect(game.credits[1]).toBeCloseTo(start - plasma.cost, 9);
    expect(input.openRadials.has(0)).toBe(false);
    expect(game.totalCredits()).toBeCloseTo(game.expectedCredits(), 9);
  });

  it('empty-tap still dismisses idle menus, including after a held press is cancelled', () => {
    const { game, input, cell } = setup();
    game.tryPlace(0, 'pulse', 4, 6);
    const p1 = cell(4, 6), empty = cell(14, 6);
    input.pointerDown(1, p1.x, p1.y, 'touch', 0, 0);
    input.pointerUp(1, p1.x, p1.y, 50);
    const r = input.openRadials.get(0)!;
    const upg = radialButtons(r.cx, r.cy, r.rot).find(b => b.action === 'upgrade')!;
    input.pointerDown(2, upg.x, upg.y, 'touch', 0, 100);
    input.cancel(2); // held press cancelled (focus loss / pointercancel)
    input.pointerDown(3, empty.x, empty.y, 'touch', 0, 110);
    input.pointerUp(3, empty.x, empty.y, 130);
    expect(input.openRadials.size).toBe(0);
    input.pointerUp(2, upg.x, upg.y, 140); // late up is a no-op
    expect(game.towerAt[game.idx(4, 6)]!.tier).toBe(0);
    expect(input.pointerCount).toBe(0);
  });

  it('refreshAll prunes stale radial menus when a tower is removed', () => {
    const { game, input, cell } = setup();
    game.tryPlace(0, 'pulse', 4, 6);
    const pos = cell(4, 6);
    input.pointerDown(1, pos.x, pos.y, 'touch', 0, 0);
    input.pointerUp(1, pos.x, pos.y, 50);
    expect(input.openRadials.size).toBe(1);
    game.sellAt(4, 6);
    input.refreshAll();
    expect(input.openRadials.size).toBe(0);
  });
});

describe('credit-chip drop & flick-to-share', () => {
  it('direct drop onto another player dock transfers credits and fires creditFly', () => {
    const { game, input, chip } = setup();
    const start = game.currentMap.startingCredits;
    const from = chip(0);
    const targetDock = LAYOUTS[0].docks[1];
    input.pointerDown(1, from.x, from.y, 'touch', 0, 0);
    expect(input.creditDrags.get(1)).toMatchObject({ fromPlayer: 0, amount: CREDIT_TRANSFER_AMOUNT });
    input.pointerMove(1, targetDock.cx, targetDock.cy, 100);
    expect(input.creditDrags.get(1)!.targetPlayer).toBe(1);
    input.pointerUp(1, targetDock.cx, targetDock.cy, 120);

    expect(game.credits[0]).toBe(start - CREDIT_TRANSFER_AMOUNT);
    expect(game.credits[1]).toBe(start + CREDIT_TRANSFER_AMOUNT);
    expect(game.totalCredits()).toBeCloseTo(game.expectedCredits(), 9);
  });

  it('flick-to-share transfers when flicked toward another dock, and rejects off-target or slow flicks', () => {
    const { game, input, chip, creditFlies } = setup();
    const start = game.currentMap.startingCredits;
    const from = chip(0);

    // Fast flick straight up toward P1 dock (640, 70): dy = -200 in 50ms => vy = -4000 px/s
    input.pointerDown(1, from.x, from.y, 'touch', 0, 0);
    input.pointerMove(1, from.x, from.y - 100, 25);
    input.pointerMove(1, from.x, from.y - 200, 50);
    input.pointerUp(1, from.x, from.y - 200, 60);
    expect(game.credits[0]).toBe(start - CREDIT_TRANSFER_AMOUNT);
    expect(game.credits[1]).toBe(start + CREDIT_TRANSFER_AMOUNT);
    expect(creditFlies.length).toBe(1);

    // Off-target fast flick sideways (to the left) does not transfer
    input.pointerDown(2, from.x, from.y, 'touch', 0, 100);
    input.pointerMove(2, from.x - 100, from.y, 125);
    input.pointerMove(2, from.x - 200, from.y, 150);
    input.pointerUp(2, from.x - 200, from.y, 160);
    expect(game.credits[0]).toBe(start - CREDIT_TRANSFER_AMOUNT);
    expect(game.credits[1]).toBe(start + CREDIT_TRANSFER_AMOUNT);

    // Slow drag released in mid-board does not transfer
    input.pointerDown(3, from.x, from.y, 'touch', 0, 200);
    input.pointerMove(3, from.x, from.y - 50, 700);
    input.pointerMove(3, from.x, from.y - 100, 1200);
    input.pointerUp(3, from.x, from.y - 100, 1250);
    expect(game.credits[0]).toBe(start - CREDIT_TRANSFER_AMOUNT);
    expect(game.credits[1]).toBe(start + CREDIT_TRANSFER_AMOUNT);
    expect(game.totalCredits()).toBeCloseTo(game.expectedCredits(), 9);
  });

  it('cancel discards credit drag with no transfer', () => {
    const { game, input, chip } = setup();
    const start = game.currentMap.startingCredits;
    const from = chip(0);
    const targetDock = LAYOUTS[0].docks[1];
    input.pointerDown(1, from.x, from.y, 'touch', 0, 0);
    input.pointerMove(1, targetDock.cx, targetDock.cy, 50);
    input.cancel(1);
    expect(input.creditDrags.size).toBe(0);
    input.pointerUp(1, targetDock.cx, targetDock.cy, 60);
    expect(game.credits).toEqual([start, start]);
  });

  it('disables credit-chip dragging in 1P layouts', () => {
    for (const id of ['1p-base', '1p-phone'] as const) {
      const idx = LAYOUTS.findIndex(l => l.id === id);
      const { input, chip, toasts } = setup(idx);
      const c = chip(0);
      input.pointerDown(1, c.x, c.y, 'touch', 0, 0);
      expect(input.creditDrags.size).toBe(0);
      expect(toasts).toEqual([]);
      input.pointerUp(1, c.x, c.y, 20);
    }
  });
});

describe('theater obstacle & placement reason text & end-of-match summary buttons', () => {
  it('reasonText translates obstacle labels and status codes cleanly for all 5 theaters', () => {
    // Space (default)
    expect(reasonText('asteroid', 'space')).toBe('Asteroid');
    expect(reasonText('asteroid')).toBe('Asteroid');
    expect(reasonText('ok', 'space')).toBe('Placed');
    expect(reasonText('reserved', 'space')).toBe('Reserved cell');
    expect(reasonText('blocks-path', 'space')).toBe('Would block route');

    // Military (Mountains)
    expect(reasonText('asteroid', 'military')).toBe('Mountains');
    expect(reasonText('ok', 'military')).toBe('Deployed');
    expect(reasonText('reserved', 'military')).toBe('Invasion / HQ');
    expect(reasonText('blocks-path', 'military')).toBe('Would block advance');

    // Naval (Islands)
    expect(reasonText('asteroid', 'naval')).toBe('Islands');
    expect(reasonText('ok', 'naval')).toBe('Deployed');
    expect(reasonText('reserved', 'naval')).toBe('Harbor / Sea Lane');
    expect(reasonText('blocks-path', 'naval')).toBe('Would block sea lane');

    // Mars (Canyon Ridge)
    expect(reasonText('asteroid', 'mars')).toBe('Canyon Ridge');
    expect(reasonText('ok', 'mars')).toBe('Deployed');
    expect(reasonText('reserved', 'mars')).toBe('Red Front / Dome');
    expect(reasonText('blocks-path', 'mars')).toBe('Would block convoy');

    // Medieval (Dark Forest)
    expect(reasonText('asteroid', 'medieval')).toBe('Dark Forest');
    expect(reasonText('ok', 'medieval')).toBe('Built');
    expect(reasonText('reserved', 'medieval')).toBe('Castle / Road Gate');
    expect(reasonText('blocks-path', 'medieval')).toBe('Would block road');
  });

  it('summary buttons play-again & next-map fire when game.over is won or lost (and ignore clicks otherwise)', () => {
    const { game, input, buttons, layout } = setup();
    const sRects = summaryButtonRects(layout);
    const playAgain = sRects['play-again'];
    const nextMap = sRects['next-map'];

    // While match is active, summary buttons do nothing.
    input.pointerDown(1, playAgain.x + playAgain.w / 2, playAgain.y + playAgain.h / 2, 'touch', 0, 0);
    input.pointerUp(1, playAgain.x + playAgain.w / 2, playAgain.y + playAgain.h / 2, 10);
    expect(buttons).toEqual([]);

    // When won, clicking play-again fires 'play-again'.
    game.over = 'won';
    input.pointerDown(2, playAgain.x + playAgain.w / 2, playAgain.y + playAgain.h / 2, 'touch', 0, 20);
    input.pointerUp(2, playAgain.x + playAgain.w / 2, playAgain.y + playAgain.h / 2, 30);
    expect(buttons).toEqual(['play-again']);

    // When lost, clicking next-map fires 'next-map'.
    game.over = 'lost';
    input.pointerDown(3, nextMap.x + nextMap.w / 2, nextMap.y + nextMap.h / 2, 'mouse', 0, 40);
    input.pointerUp(3, nextMap.x + nextMap.w / 2, nextMap.y + nextMap.h / 2, 50);
    expect(buttons).toEqual(['play-again', 'next-map']);
  });
});

class FakeTarget {
  private l = new Map<string, Array<(e: any) => void>>();
  hidden = false;
  captured = new Set<number>();
  addEventListener(t: string, f: (e: any) => void) { this.l.set(t, [...(this.l.get(t) ?? []), f]); }
  removeEventListener(t: string, f: (e: any) => void) { this.l.set(t, (this.l.get(t) ?? []).filter(x => x !== f)); }
  dispatch(t: string, e: any = {}) { for (const f of this.l.get(t) ?? []) f(e); }
  setPointerCapture(id: number) { this.captured.add(id); }
  releasePointerCapture(id: number) { this.captured.delete(id); }
  hasPointerCapture(id: number) { return this.captured.has(id); }
}

describe('DOM pointer wiring', () => {
  function wire() {
    const s = setup();
    const canvas = new FakeTarget(), win = new FakeTarget(), doc = new FakeTarget();
    let focusLost = 0, actions = 0;
    const detach = attachPointerInput({
      canvas, win, doc, input: s.input, toWorld: (x, y) => ({ x, y }), now: () => 0,
      onUserAction: () => { actions++; }, onFocusLoss: () => { focusLost++; },
    });
    const down = (id: number, p: { x: number; y: number }, type = 'touch') =>
      canvas.dispatch('pointerdown', { pointerId: id, pointerType: type, button: 0, clientX: p.x, clientY: p.y, preventDefault() {} });
    return { ...s, canvas, win, doc, detach, down, get focusLost() { return focusLost; }, get actions() { return actions; } };
  }

  it('captures on down, releases on up, and cleans up on pointercancel / lostpointercapture', () => {
    const w = wire();
    const p = w.slot(0, 0), t = w.cell(6, 6);
    w.down(1, p);
    expect(w.canvas.captured.has(1)).toBe(true);
    expect(w.actions).toBe(1);
    w.canvas.dispatch('pointerup', { pointerId: 1, clientX: t.x, clientY: t.y + TOUCH_LIFT });
    expect(w.canvas.captured.size).toBe(0);
    expect(w.game.towers.length).toBe(1);

    w.down(2, p);
    w.canvas.dispatch('pointercancel', { pointerId: 2, clientX: 0, clientY: 0 });
    expect(w.input.pointerCount).toBe(0);
    expect(w.canvas.captured.size).toBe(0);

    w.down(3, p);
    w.canvas.dispatch('lostpointercapture', { pointerId: 3 });
    expect(w.input.pointerCount).toBe(0);
    expect(w.game.towers.length).toBe(1);
    expect(w.game.credits[0]).toBe(w.game.currentMap.startingCredits - w.game.turretById.get('pulse')!.cost);
  });

  it('blur and hidden visibility cancel all pointers and signal focus loss; contextmenu is prevented', () => {
    const w = wire();
    w.down(1, w.slot(0, 0)); w.down(2, w.slot(1, 0));
    expect(w.input.pointerCount).toBe(2);
    w.win.dispatch('blur');
    expect(w.input.pointerCount).toBe(0);
    expect(w.focusLost).toBe(1);
    w.down(3, w.slot(0, 1));
    w.doc.hidden = true;
    w.doc.dispatch('visibilitychange');
    expect(w.input.pointerCount).toBe(0);
    expect(w.focusLost).toBe(2);
    let prevented = false;
    w.canvas.dispatch('contextmenu', { preventDefault() { prevented = true; } });
    expect(prevented).toBe(true);
    w.detach();
    w.down(4, w.slot(0, 0));
    expect(w.input.pointerCount).toBe(0); // detached
  });

  it('passes pointermove timeStamp into InputController for DOM flick-to-share', () => {
    const w = wire();
    const start = w.game.currentMap.startingCredits;
    const c = w.chip(0);
    w.canvas.dispatch('pointerdown', { pointerId: 7, pointerType: 'touch', button: 0, clientX: c.x, clientY: c.y, timeStamp: 100 });
    w.canvas.dispatch('pointermove', { pointerId: 7, clientX: c.x, clientY: c.y - 120, timeStamp: 120 });
    w.canvas.dispatch('pointermove', { pointerId: 7, clientX: c.x, clientY: c.y - 240, timeStamp: 140 });
    w.canvas.dispatch('pointerup', { pointerId: 7, clientX: c.x, clientY: c.y - 240, timeStamp: 150 });
    expect(w.game.credits[0]).toBe(start - CREDIT_TRANSFER_AMOUNT);
    expect(w.game.credits[1]).toBe(start + CREDIT_TRANSFER_AMOUNT);
  });
});
