import { describe, expect, it } from 'vitest';
import {
  BOARD, boardCellCenter, boardLocalToWorld, BUTTON_IDS, CELL, cellAt, CORNER_SCALE, creditChipRect, DOCK_H, DOCK_W,
  dockPolygon, dockToWorld, dockUp, hitCreditChip, hitDockBody, hitDockSlot, hitHudButton, hitRadialButton,
  hitSettingsButton, hitSummaryButton, HUD_BUTTON_IDS, inRect, LAYOUTS, PHONE_SETTINGS, polygonsOverlap, RADIAL_BTN_R,
  radialButtons, rectPolygon, rectsOverlap, SETTINGS_BUTTON_IDS, settingsButtonRects, settingsPanelRect, slotRect,
  SUMMARY_BUTTON_IDS, summaryButtonRects, summaryCardRect, TURRET_ORDER, Viewport, WORLD_H, WORLD_W, worldToBoardLocal,
  worldToDock,
} from '../src/layout';

const DEG = Math.PI / 180;

describe('rotation-aware dock layout', () => {
  it('SAT helper: diagonal rectangles can clear a box whose AABB they overlap', () => {
    const box = rectPolygon({ x: 0, y: 0, w: 100, h: 100 });
    const corners = LAYOUTS.find(l => l.id === '4p-corners')!;
    const diag = dockPolygon(corners.docks[3]);
    expect(rectsOverlap(corners.docks[3].bounds, corners.board)).toBe(true); // AABB is too coarse...
    expect(polygonsOverlap(diag, rectPolygon(corners.board))).toBe(false);   // ...the oriented rectangle is clear
    expect(polygonsOverlap(box, rectPolygon({ x: 50, y: 50, w: 100, h: 100 }))).toBe(true);
    expect(polygonsOverlap(box, rectPolygon({ x: 100, y: 0, w: 10, h: 10 }))).toBe(false);
  });

  it('4P corners uses true 45/135/225/315 degree docks at 0.61 scale', () => {
    const L = LAYOUTS.find(l => l.id === '4p-corners')!;
    expect(CORNER_SCALE).toBe(0.61);
    expect(L.docks.map(d => Math.round(((d.rot / DEG) % 360 + 360) % 360))).toEqual([45, 225, 315, 135]);
    for (const d of L.docks) {
      expect(d.scale).toBe(CORNER_SCALE);
      expect(d.w).toBe(472);
      expect(d.h).toBe(120);
    }
    const r = slotRect(0);
    expect(r.w * CORNER_SCALE).toBeGreaterThanOrEqual(50);
    expect(r.h * CORNER_SCALE).toBeGreaterThanOrEqual(50);
  });

  it('4P edges has ALL 4 docks at scale = 1.0 with P2/P3 dead-centered at cy = 400', () => {
    const L = LAYOUTS.find(l => l.id === '4p-edges')!;
    expect(L.docks.map(d => d.scale)).toEqual([1, 1, 1, 1]);
    const [p0, p1, p2, p3] = L.docks;
    expect(p0.cx).toBe(640);
    expect(p1.cx).toBe(640);
    expect(p2.cy).toBe(400);
    expect(p3.cy).toBe(400);
    expect(p2.bounds.x + p2.bounds.w).toBeLessThan(L.board.x);
    expect(p3.bounds.x).toBeGreaterThan(L.board.x + L.board.w);
    expect(p0.bounds.y).toBeGreaterThan(L.board.y + L.board.h);
    expect(p1.bounds.y + p1.bounds.h).toBeLessThan(L.board.y);
  });

  it('4P 2x2 has 2 bottom + 2 top docks at 0.96 scale', () => {
    const L = LAYOUTS.find(l => l.id === '4p-2x2')!;
    expect(L.playerCount).toBe(4);
    expect(L.docks.map(d => d.scale)).toEqual([0.96, 0.96, 0.96, 0.96]);
    const bottom = L.docks.filter(d => d.cy > L.board.y);
    const top = L.docks.filter(d => d.cy < L.board.y);
    expect(bottom.length).toBe(2);
    expect(top.length).toBe(2);
  });

  it('2P phone has portrait stage, rotated vertical court, >= 1.1x top/bottom docks, and portrait Viewport.fit', () => {
    const L = LAYOUTS.find(l => l.id === '2p-phone')!;
    expect(L.stageH).toBeGreaterThan(L.stageW);
    expect(L.stageW).toBe(548);
    expect(L.stageH).toBe(1244);
    expect(L.boardRotated).toBe(true);
    expect(L.board.h).toBeGreaterThan(L.board.w);
    expect(L.board).toEqual({ x: 18, y: 204, w: 512, h: 896 });
    for (const d of L.docks) expect(d.scale).toBeGreaterThanOrEqual(1.1);
    expect(L.docks[0].cy).toBeGreaterThan(L.board.y + L.board.h);
    expect(L.docks[1].cy).toBeLessThan(L.board.y);

    const v = new Viewport();
    expect(v.fit(390, 844, L.stageW, L.stageH)).toBe(true);
    const expectedScale = Math.min(390 / 548, 844 / 1244);
    expect(v.scale).toBeCloseTo(expectedScale, 9);
    expect(v.ox).toBeCloseTo((390 - 548 * expectedScale) / 2, 9);
    expect(v.oy).toBeCloseTo((844 - 1244 * expectedScale) / 2, 9);
  });

  it('1P base side has 1 dock on the right/base side at cx=1184, cy=400, scale=1', () => {
    const L = LAYOUTS.find(l => l.id === '1p-base')!;
    expect(L.playerCount).toBe(1);
    expect(L.docks).toHaveLength(1);
    expect(L.docks[0]).toMatchObject({ player: 0, cx: 1184, cy: 400, scale: 1 });
    expect(L.docks[0].bounds.x).toBeGreaterThan(L.board.x + L.board.w);
  });

  it('1P phone has 1 dock at the bottom at scale=1.12 and rotated vertical court', () => {
    const L = LAYOUTS.find(l => l.id === '1p-phone')!;
    expect(L.playerCount).toBe(1);
    expect(L.stageW).toBe(548);
    expect(L.stageH).toBe(1140);
    expect(L.boardRotated).toBe(true);
    expect(L.board.h).toBeGreaterThan(L.board.w);
    expect(L.board).toEqual({ x: 18, y: 80, w: 512, h: 896 });
    expect(L.docks).toHaveLength(1);
    expect(L.docks[0]).toMatchObject({ player: 0, cx: 274, cy: 1058, rot: 0, scale: 1.12 });
    expect(L.docks[0].bounds.y).toBeGreaterThan(L.board.y + L.board.h);
  });

  it('all 7 layouts are present in LAYOUTS', () => {
    expect(LAYOUTS.map(l => l.id)).toEqual(['2p-opposing', '2p-phone', '1p-base', '1p-phone', '4p-edges', '4p-2x2', '4p-corners']);
  });

  for (const L of LAYOUTS) {
    describe(L.name, () => {
      it('has one dock per player, all inside 0..stageW x 0..stageH and outside the board', () => {
        expect(L.docks.map(d => d.player)).toEqual(Array.from({ length: L.playerCount }, (_, i) => i));
        for (const d of L.docks) {
          for (const c of dockPolygon(d)) {
            expect(c.x).toBeGreaterThanOrEqual(0);
            expect(c.y).toBeGreaterThanOrEqual(0);
            expect(c.x).toBeLessThanOrEqual(L.stageW + 1e-6);
            expect(c.y).toBeLessThanOrEqual(L.stageH + 1e-6);
          }
          expect(polygonsOverlap(dockPolygon(d), rectPolygon(L.board))).toBe(false);
        }
      });

      it('docks, board, and always-on HUD buttons have zero SAT overlap', () => {
        const hudRects = HUD_BUTTON_IDS.map(id => L.hudButtons[id]);
        for (let i = 0; i < hudRects.length; i++) {
          const r = hudRects[i];
          expect(r.x).toBeGreaterThanOrEqual(0);
          expect(r.y).toBeGreaterThanOrEqual(0);
          expect(r.x + r.w).toBeLessThanOrEqual(L.stageW);
          expect(r.y + r.h).toBeLessThanOrEqual(L.stageH);
          expect(rectsOverlap(r, L.board)).toBe(false);
          for (let j = i + 1; j < hudRects.length; j++) {
            expect(rectsOverlap(r, hudRects[j])).toBe(false);
          }
        }
        L.docks.forEach((d, i) => {
          for (const hr of hudRects) {
            expect(polygonsOverlap(dockPolygon(d), rectPolygon(hr))).toBe(false);
          }
          for (let j = i + 1; j < L.docks.length; j++) {
            expect(polygonsOverlap(dockPolygon(d), dockPolygon(L.docks[j]))).toBe(false);
          }
        });
      });

      it('every dock slot hit-tests back to its own index through rotation and scale', () => {
        for (const d of L.docks) {
          expect(d.w).toBe(DOCK_W);
          expect(d.h).toBe(DOCK_H);
          TURRET_ORDER.forEach((_, i) => {
            const r = slotRect(i);
            expect(r.x).toBeGreaterThanOrEqual(0);
            expect(r.x + r.w).toBeLessThanOrEqual(d.w);
            expect(r.y + r.h).toBeLessThanOrEqual(d.h);
            const w = dockToWorld(d, r.x + r.w / 2, r.y + r.h / 2);
            expect(inRect(d.bounds, w.x, w.y)).toBe(true);
            expect(inRect(L.board, w.x, w.y)).toBe(false);
            expect(hitDockSlot(d, w.x, w.y)).toBe(i);
            const back = worldToDock(d, w.x, w.y);
            expect(back.x).toBeCloseTo(r.x + r.w / 2, 6);
            expect(back.y).toBeCloseTo(r.y + r.h / 2, 6);
          });
          for (const o of L.docks) if (o !== d) {
            const w = dockToWorld(o, slotRect(0).x + 10, slotRect(0).y + 10);
            expect(hitDockSlot(d, w.x, w.y)).toBe(-1);
          }
        }
      });

      it('dock "up" points toward the board', () => {
        for (const d of L.docks) {
          const up = dockUp(d);
          const toBoard = { x: L.board.x + L.board.w / 2 - d.cx, y: L.board.y + L.board.h / 2 - d.cy };
          expect(up.x * toBoard.x + up.y * toBoard.y).toBeGreaterThan(0);
        }
      });

      it('settings modal buttons fit inside settingsPanelRect with zero overlap', () => {
        const panel = settingsPanelRect(L);
        if (L.stageH > L.stageW) {
          // Phone modal covers the stage, so it only has to fit the stage (and be centred in it).
          expect(panel.x).toBeGreaterThanOrEqual(0);
          expect(panel.y).toBeGreaterThanOrEqual(0);
          expect(panel.x + panel.w).toBeLessThanOrEqual(L.stageW);
          expect(panel.y + panel.h).toBeLessThanOrEqual(L.stageH);
          expect(panel.x * 2 + panel.w).toBeCloseTo(L.stageW);
          expect(panel.y * 2 + panel.h).toBeCloseTo(L.stageH);
        } else {
          expect(panel.x).toBeGreaterThanOrEqual(L.board.x);
          expect(panel.y).toBeGreaterThanOrEqual(L.board.y);
          expect(panel.x + panel.w).toBeLessThanOrEqual(L.board.x + L.board.w);
          expect(panel.y + panel.h).toBeLessThanOrEqual(L.board.y + L.board.h);
        }

        const btnRects = settingsButtonRects(L);
        const ids = SETTINGS_BUTTON_IDS;
        for (let i = 0; i < ids.length; i++) {
          const id = ids[i];
          const r = btnRects[id];
          expect(inRect(panel, r.x, r.y)).toBe(true);
          expect(inRect(panel, r.x + r.w - 1, r.y + r.h - 1)).toBe(true);
          expect(hitSettingsButton(L, r.x + r.w / 2, r.y + r.h / 2)).toBe(id);
          for (let j = i + 1; j < ids.length; j++) {
            expect(rectsOverlap(r, btnRects[ids[j]])).toBe(false);
          }
        }
      });

      it('install/update row clears the status line and the two-line tip', () => {
        if (L.stageH > L.stageW) return; // phone geometry is covered by the phone settings suite below
        const panel = settingsPanelRect(L);
        const rects = settingsButtonRects(L);
        const rowBottom = Math.max(rects.install.y + rects.install.h, rects.update.y + rects.update.h);
        const statusTop = panel.y + 376 - 9; // 11px text centred at +376
        const tipTop = panel.y + panel.h - 32 - 16; // two 11px lines centred at h-32
        expect(rowBottom).toBeLessThan(statusTop);
        expect(statusTop + 18).toBeLessThanOrEqual(tipTop);
        expect(rects.install.w).toBeGreaterThanOrEqual(44);
        expect(rects.install.h).toBeGreaterThanOrEqual(32);
      });

      it('summary card buttons fit inside summaryCardRect with zero overlap', () => {
        const card = summaryCardRect(L);
        expect(card.x).toBeGreaterThanOrEqual(L.board.x);
        expect(card.y).toBeGreaterThanOrEqual(L.board.y);
        expect(card.x + card.w).toBeLessThanOrEqual(L.board.x + L.board.w);
        expect(card.y + card.h).toBeLessThanOrEqual(L.board.y + L.board.h);

        const btnRects = summaryButtonRects(L);
        for (let i = 0; i < SUMMARY_BUTTON_IDS.length; i++) {
          const id = SUMMARY_BUTTON_IDS[i];
          const r = btnRects[id];
          expect(inRect(card, r.x, r.y)).toBe(true);
          expect(inRect(card, r.x + r.w - 1, r.y + r.h - 1)).toBe(true);
          expect(hitSummaryButton(L, r.x + r.w / 2, r.y + r.h / 2)).toBe(id);
          expect(hitSummaryButton(L, r.x + r.w / 2, r.y + r.h / 2, false)).toBe(id === 'add-waves' ? null : id);
          for (let j = i + 1; j < SUMMARY_BUTTON_IDS.length; j++) {
            expect(rectsOverlap(r, btnRects[SUMMARY_BUTTON_IDS[j]])).toBe(false);
          }
        }
      });

      it('summary buttons are large touch targets inside the card on portrait phones', () => {
        if (L.stageH <= L.stageW) return;
        const card = summaryCardRect(L);
        const rects = summaryButtonRects(L);
        for (const id of SUMMARY_BUTTON_IDS) {
          const r = rects[id];
          expect(r.h).toBeGreaterThanOrEqual(88);
          for (const [vw, vh] of [[360, 640], [390, 844], [460, 760]]) {
            const scale = Math.min(vw / L.stageW, vh / L.stageH);
            expect(r.w * scale, `${id} width on ${vw}x${vh}`).toBeGreaterThanOrEqual(44);
            expect(r.h * scale, `${id} height on ${vw}x${vh}`).toBeGreaterThanOrEqual(44);
          }
          expect(r.x).toBeGreaterThanOrEqual(card.x + 28);
          expect(r.x + r.w).toBeLessThanOrEqual(card.x + card.w - 28);
          expect(r.y + r.h).toBeLessThanOrEqual(card.y + card.h - 28);
          // every corner-adjacent point hits only its own button
          for (const [px, py] of [[r.x + 1, r.y + 1], [r.x + r.w - 1, r.y + r.h - 1]]) {
            expect(hitSummaryButton(L, px, py)).toBe(id);
          }
        }
        const add = rects['add-waves'];
        const a = rects['play-again'];
        const b = rects['next-map'];
        const hGap = Math.min(Math.abs(b.x - (a.x + a.w)), Math.abs(a.x - (b.x + b.w)));
        expect(hGap).toBeGreaterThanOrEqual(28);
        expect(hitSummaryButton(L, a.x + a.w + hGap / 2, a.y + a.h / 2)).toBeNull();
        const vGap = a.y - (add.y + add.h);
        expect(vGap).toBeGreaterThanOrEqual(18);
        expect(hitSummaryButton(L, add.x + add.w / 2, add.y + add.h + vGap / 2)).toBeNull();
      });
    });
  }
});

describe('hud + viewport', () => {
  it('always-on HUD buttons and settings/summary button IDs match contract', () => {
    expect(HUD_BUTTON_IDS).toEqual(['wave', 'pause', 'fullscreen', 'settings']);
    expect(SETTINGS_BUTTON_IDS).toEqual(['map', 'layout', 'difficulty', 'waves', 'speed', 'auto', 'sfx', 'stats', 'reset', 'stress', 'install', 'update', 'close']);
    expect(SUMMARY_BUTTON_IDS).toEqual(['add-waves', 'play-again', 'next-map']);
    expect(BUTTON_IDS).toEqual([...HUD_BUTTON_IDS, ...SETTINGS_BUTTON_IDS, ...SUMMARY_BUTTON_IDS]);
    expect(TURRET_ORDER).toEqual(['pulse', 'plasma', 'stasis', 'railgun', 'swarm']);

    for (const L of LAYOUTS) {
      for (const id of HUD_BUTTON_IDS) {
        const r = L.hudButtons[id];
        expect(r.h).toBeGreaterThanOrEqual(38);
        expect(hitHudButton(L, r.x + r.w / 2, r.y + r.h / 2)).toBe(id);
      }
    }
  });

  it('credit chip and dock body hit-testing respect rotation and scale across all layouts', () => {
    const chip = creditChipRect();
    expect(chip.x + chip.w).toBeLessThanOrEqual(DOCK_W);
    expect(chip.y + chip.h).toBeLessThan(slotRect(0).y);
    for (const L of LAYOUTS) {
      for (const d of L.docks) {
        const w = dockToWorld(d, chip.x + chip.w / 2, chip.y + chip.h / 2);
        expect(hitCreditChip(d, w.x, w.y)).toBe(true);
        expect(hitDockSlot(d, w.x, w.y)).toBe(-1);
        expect(hitDockBody(d, w.x, w.y)).toBe(true);
        const justOutside = dockToWorld(d, -10, d.h / 2);
        expect(hitDockBody(d, justOutside.x, justOutside.y, 0)).toBe(false);
        expect(hitDockBody(d, justOutside.x, justOutside.y, 20)).toBe(true);
        for (const o of L.docks) if (o !== d) {
          expect(hitCreditChip(o, w.x, w.y)).toBe(false);
        }
      }
    }
  });

  it('radial buttons rotate around center, clamp inside active stageW/stageH, and hit-test accurately', () => {
    for (const deg of [0, 45, 90, 135, 180, 225, 270, 315]) {
      const rot = deg * DEG;
      const btns = radialButtons(640, 400, rot);
      expect(btns.map(b => b.action)).toEqual(['upgrade', 'priority', 'sell']);
      for (const b of btns) {
        expect(b.r).toBe(RADIAL_BTN_R);
        expect(hitRadialButton(640, 400, rot, b.x, b.y)).toBe(b.action);
        expect(hitRadialButton(640, 400, rot, b.x + b.r + 3, b.y)).toBe(b.action);
      }
      expect(hitRadialButton(640, 400, rot, 640, 400)).toBeNull();

      // 4-button repair mode: zero pairwise overlap, accurate hit-test, and clamps inside stage
      const btns4 = radialButtons(640, 400, rot, WORLD_W, WORLD_H, true);
      expect(btns4.map(b => b.action)).toEqual(['upgrade', 'priority', 'sell', 'repair']);
      for (let i = 0; i < btns4.length; i++) {
        for (let j = i + 1; j < btns4.length; j++) {
          expect(Math.hypot(btns4[i].x - btns4[j].x, btns4[i].y - btns4[j].y)).toBeGreaterThanOrEqual(2 * RADIAL_BTN_R - 1e-6);
        }
      }
      const repairBtn = btns4.find(b => b.action === 'repair')!;
      expect(hitRadialButton(640, 400, rot, repairBtn.x, repairBtn.y, WORLD_W, WORLD_H, true)).toBe('repair');
      expect(hitRadialButton(640, 400, rot, repairBtn.x, repairBtn.y, WORLD_W, WORLD_H, false)).toBeNull();

      for (const [sw, sh] of [[WORLD_W, WORLD_H], [920, 1280]]) {
        for (const [cx, cy] of [[0, 0], [sw, 0], [0, sh], [sw, sh]]) {
          for (const showRepair of [false, true]) {
            const clamped = radialButtons(cx, cy, rot, sw, sh, showRepair);
            for (const b of clamped) {
              expect(b.x).toBeGreaterThanOrEqual(26 - 1e-6);
              expect(b.x).toBeLessThanOrEqual(sw - 26 + 1e-6);
              expect(b.y).toBeGreaterThanOrEqual(26 - 1e-6);
              expect(b.y).toBeLessThanOrEqual(sh - 26 + 1e-6);
            }
          }
        }
      }
    }
  });

  it('board is 28x16 cells and cellAt + coordinate helpers map corners for default and rotated phone boards', () => {
    expect(BOARD.w / CELL).toBe(28);
    expect(BOARD.h / CELL).toBe(16);
    expect(cellAt(BOARD.x + 1, BOARD.y + 1)).toEqual({ x: 0, y: 0 });
    expect(cellAt(BOARD.x + BOARD.w - 1, BOARD.y + BOARD.h - 1)).toEqual({ x: 27, y: 15 });
    expect(cellAt(BOARD.x - 1, BOARD.y)).toBeNull();

    const phone = LAYOUTS.find(l => l.id === '2p-phone')!;
    // Rotated +90 deg CW: logical (0,0) -> top-right, (0,15) -> top-left, (27,0) -> bottom-right, (27,15) -> bottom-left
    expect(cellAt(phone.board.x + phone.board.w - 1, phone.board.y + 1, phone.board, true)).toEqual({ x: 0, y: 0 });
    expect(cellAt(phone.board.x + 1, phone.board.y + 1, phone.board, true)).toEqual({ x: 0, y: 15 });
    expect(cellAt(phone.board.x + phone.board.w - 1, phone.board.y + phone.board.h - 1, phone.board, true)).toEqual({ x: 27, y: 0 });
    expect(cellAt(phone.board.x + 1, phone.board.y + phone.board.h - 1, phone.board, true)).toEqual({ x: 27, y: 15 });
    expect(cellAt(phone.board.x - 1, phone.board.y, phone.board, true)).toBeNull();

    for (const [gx, gy] of [[0, 0], [0, 15], [27, 0], [27, 15], [13, 7]]) {
      const wc = boardCellCenter(phone.board, gx, gy, true);
      expect(cellAt(wc.x, wc.y, phone.board, true)).toEqual({ x: gx, y: gy });
      const back = worldToBoardLocal(phone.board, wc.x, wc.y, true);
      expect(back.x).toBeCloseTo((gx + 0.5) * CELL, 9);
      expect(back.y).toBeCloseTo((gy + 0.5) * CELL, 9);
      const fwd = boardLocalToWorld(phone.board, back.x, back.y, true);
      expect(fwd.x).toBeCloseTo(wc.x, 9);
      expect(fwd.y).toBeCloseTo(wc.y, 9);
    }
  });

  it('viewport scale + inverse transform round-trip and tracks worldW/worldH changes', () => {
    const v = new Viewport();
    expect(v.fit(2560, 1600)).toBe(true);
    expect(v.fit(2560, 1600)).toBe(false);
    expect(v.scale).toBe(2);
    expect(v.toWorld(0, 0)).toEqual({ x: 0, y: 0 });
    expect(v.fit(1920, 1080)).toBe(true); // letterboxed: height-limited
    const w = v.toWorld(v.ox + 100 * v.scale, v.oy + 50 * v.scale);
    expect(w.x).toBeCloseTo(100, 9);
    expect(w.y).toBeCloseTo(50, 9);
    // changing only worldW/worldH returns true
    expect(v.fit(1920, 1080, 920, 1280)).toBe(true);
    expect(v.ww).toBe(920);
    expect(v.wh).toBe(1280);
  });
});

describe('settings modal geometry', () => {
  it('keeps the desktop panel and button geometry exactly as designed', () => {
    for (const L of LAYOUTS.filter(l => l.stageW > l.stageH)) {
      const p = settingsPanelRect(L);
      expect(p).toEqual({ x: L.board.x + (L.board.w - 440) / 2, y: L.board.y + (L.board.h - 446) / 2, w: 440, h: 446 });
      const r = settingsButtonRects(L);
      expect(r.close).toEqual({ x: p.x + 394, y: p.y + 12, w: 34, h: 32 });
      expect(r.map).toEqual({ x: p.x + 20, y: p.y + 58, w: 400, h: 36 });
      expect(r.difficulty).toEqual({ x: p.x + 20, y: p.y + 146, w: 194, h: 36 });
      expect(r.waves).toEqual({ x: p.x + 226, y: p.y + 146, w: 194, h: 36 });
      expect(r.auto).toEqual({ x: p.x + 226, y: p.y + 190, w: 194, h: 36 });
      expect(r.update).toEqual({ x: p.x + 226, y: p.y + 322, w: 194, h: 36 });
    }
  });

  for (const L of LAYOUTS.filter(l => l.stageH > l.stageW)) {
    describe(L.id, () => {
      const panel = settingsPanelRect(L);
      const rects = settingsButtonRects(L);

      it('has seven disjoint rows in the panel, ordered above the status and tip areas', () => {
        const rows = [['map'], ['layout'], ['difficulty', 'waves'], ['speed', 'auto'], ['sfx', 'stats'], ['reset', 'stress'], ['install', 'update']] as const;
        let prevBottom = -Infinity;
        for (const row of rows) {
          const top = rects[row[0]].y;
          expect(top).toBeGreaterThan(prevBottom);
          for (const id of row) expect(rects[id].y).toBe(top);
          prevBottom = top + rects[row[0]].h;
        }
        expect(rects.close.y + rects.close.h).toBeLessThanOrEqual(rects.map.y);
        // Status (3 lines of 34px wrapped text) and tip (2 lines of 34px) must fit below the last row without overlap.
        expect(panel.y + PHONE_SETTINGS.statusTop).toBeGreaterThanOrEqual(prevBottom);
        expect(PHONE_SETTINGS.statusTop + PHONE_SETTINGS.statusH).toBeLessThanOrEqual(PHONE_SETTINGS.tipTop);
        expect(PHONE_SETTINGS.statusH).toBeGreaterThanOrEqual(3 * 34);
        expect(PHONE_SETTINGS.tipTop + PHONE_SETTINGS.tipH).toBeLessThanOrEqual(panel.h);
        for (const id of SETTINGS_BUTTON_IDS) {
          const r = rects[id];
          expect(r.x).toBeGreaterThanOrEqual(panel.x);
          expect(r.x + r.w).toBeLessThanOrEqual(panel.x + panel.w);
          expect(r.y).toBeGreaterThanOrEqual(panel.y);
          expect(r.y + r.h).toBeLessThanOrEqual(panel.y + panel.h);
        }
      });

      for (const [vw, vh] of [[360, 640], [390, 844], [460, 760]]) {
        it(`every settings target is >=44 CSS px on a ${vw}x${vh} viewport`, () => {
          const scale = Math.min(vw / L.stageW, vh / L.stageH);
          for (const id of SETTINGS_BUTTON_IDS) {
            expect(rects[id].w * scale, `${id} width`).toBeGreaterThanOrEqual(44);
            expect(rects[id].h * scale, `${id} height`).toBeGreaterThanOrEqual(44);
          }
        });
      }

      it('hit-tests each target centre, and gaps/status/outside resolve to nothing', () => {
        for (const id of SETTINGS_BUTTON_IDS) {
          const r = rects[id];
          expect(hitSettingsButton(L, r.x + r.w / 2, r.y + r.h / 2)).toBe(id);
        }
        const between = (rects.map.y + rects.map.h + rects.layout.y) / 2;
        expect(hitSettingsButton(L, rects.map.x + 10, between)).toBeNull();
        expect(hitSettingsButton(L, panel.x + panel.w / 2, panel.y + PHONE_SETTINGS.statusTop + 10)).toBeNull();
        expect(hitSettingsButton(L, 2, 2)).toBeNull();
      });
    });
  }
});
