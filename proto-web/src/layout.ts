// Adaptive design stage, scaled uniformly to the window. Docks are rotated rectangles that
// live outside the 28x16 board; hit tests inverse-transform world points into dock-local space.
export const WORLD_W = 1280;
export const WORLD_H = 800;
export const CELL = 32;
export const GRID_W = 28;
export const GRID_H = 16;
export const BOARD_W = GRID_W * CELL;
export const BOARD_H = GRID_H * CELL;
export interface Rect { x: number; y: number; w: number; h: number }
export interface Vec { x: number; y: number }
export const BOARD: Rect = { x: 192, y: 144, w: BOARD_W, h: BOARD_H };

export const DOCK_W = 472;
export const DOCK_H = 120;
export const TURRET_ORDER = ['pulse', 'plasma', 'stasis', 'railgun', 'swarm'] as const;
export const TURRET_ORDER_WITH_HEALER = ['pulse', 'plasma', 'stasis', 'railgun', 'swarm', 'healer'] as const;
export function mapHasHealer(mechanic?: string): boolean {
  return mechanic === 'mars-storms' || mechanic === 'medieval-frenzy' || mechanic === 'volcano-lava-geyser';
}
export function activeTurretOrder(mechanic?: string): readonly string[] {
  return mapHasHealer(mechanic) ? TURRET_ORDER_WITH_HEALER : TURRET_ORDER;
}
export function slotRect(i: number, slotCount = 5): Rect {
  if (slotCount === 6) return { x: 7 + i * 77, y: 30, w: 73, h: 84 };
  return { x: 9 + i * 92, y: 30, w: 86, h: 84 };
}
export function creditChipRect(): Rect { return { x: 296, y: 2, w: 168, h: 26 }; }

/** `w`/`h` are logical (dock-local) size; `scale` is the physical scale, so the world footprint is w*scale x h*scale. */
export interface Dock { player: number; cx: number; cy: number; rot: number; scale: number; w: number; h: number; bounds: Rect }

export const HUD_BUTTON_IDS = ['wave', 'pause', 'fullscreen', 'settings'] as const;
export type HudButtonId = typeof HUD_BUTTON_IDS[number];
export const SETTINGS_BUTTON_IDS = ['map', 'players', 'screen', 'difficulty', 'waves', 'speed', 'auto', 'sfx', 'stats', 'reset', 'stress', 'install', 'update', 'close'] as const;
export type SettingsButtonId = typeof SETTINGS_BUTTON_IDS[number];
export const SUMMARY_BUTTON_IDS = ['add-waves', 'play-again', 'next-map'] as const;
export type SummaryButtonId = typeof SUMMARY_BUTTON_IDS[number];
export const BUTTON_IDS = [...HUD_BUTTON_IDS, ...SETTINGS_BUTTON_IDS, ...SUMMARY_BUTTON_IDS] as const;
export type ButtonId = HudButtonId | SettingsButtonId | SummaryButtonId;

export type PlayerCount = 1 | 2 | 3 | 4;
export const PLAYER_COUNTS: readonly PlayerCount[] = [1, 2, 3, 4];
export type SoloDockSide = 'right' | 'bottom' | 'left' | 'top';
export const SOLO_DOCK_SIDES: readonly SoloDockSide[] = ['right', 'bottom', 'left', 'top'];
export function nextSoloDockSide(side: SoloDockSide): SoloDockSide {
  return SOLO_DOCK_SIDES[(SOLO_DOCK_SIDES.indexOf(side) + 1) % SOLO_DOCK_SIDES.length];
}

export interface LayoutDef {
  id: string;
  name: string;
  screenLabel: string;
  playerCount: PlayerCount;
  stageW: number;
  stageH: number;
  board: Rect;
  boardRotated?: boolean;
  docks: Dock[];
  hudButtons: Record<HudButtonId, Rect>;
  statsOrigin: Vec;
}

export function rotatedBounds(cx: number, cy: number, w: number, h: number, rot: number): Rect {
  const c = Math.abs(Math.cos(rot)), s = Math.abs(Math.sin(rot));
  const bw = w * c + h * s, bh = w * s + h * c;
  return { x: cx - bw / 2, y: cy - bh / 2, w: bw, h: bh };
}
export function makeDock(player: number, cx: number, cy: number, rot: number, scale = 1): Dock {
  return { player, cx, cy, rot, scale, w: DOCK_W, h: DOCK_H, bounds: rotatedBounds(cx, cy, DOCK_W * scale, DOCK_H * scale, rot) };
}
/** dock-local -> world (same math as a Pixi container with pivot=(w/2,h/2), scale, position=center, rotation=rot). */
export function dockToWorld(d: Dock, lx: number, ly: number): Vec {
  const px = (lx - d.w / 2) * d.scale, py = (ly - d.h / 2) * d.scale, c = Math.cos(d.rot), s = Math.sin(d.rot);
  return { x: d.cx + px * c - py * s, y: d.cy + px * s + py * c };
}
export function worldToDock(d: Dock, wx: number, wy: number): Vec {
  const dx = wx - d.cx, dy = wy - d.cy, c = Math.cos(d.rot), s = Math.sin(d.rot);
  return { x: (dx * c + dy * s) / d.scale + d.w / 2, y: (-dx * s + dy * c) / d.scale + d.h / 2 };
}
/** The dock's true oriented footprint: 4 world-space corners. */
export function dockPolygon(d: Dock): Vec[] {
  return [dockToWorld(d, 0, 0), dockToWorld(d, d.w, 0), dockToWorld(d, d.w, d.h), dockToWorld(d, 0, d.h)];
}
export function rectPolygon(r: Rect): Vec[] {
  return [{ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y }, { x: r.x + r.w, y: r.y + r.h }, { x: r.x, y: r.y + r.h }];
}
/** Separating-axis test for two convex polygons; touching edges do not count as overlap. */
export function polygonsOverlap(a: Vec[], b: Vec[]): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length];
      const nx = -(q.y - p.y), ny = q.x - p.x;
      let aMin = Infinity, aMax = -Infinity, bMin = Infinity, bMax = -Infinity;
      for (const v of a) { const t = v.x * nx + v.y * ny; aMin = Math.min(aMin, t); aMax = Math.max(aMax, t); }
      for (const v of b) { const t = v.x * nx + v.y * ny; bMin = Math.min(bMin, t); bMax = Math.max(bMax, t); }
      if (aMax <= bMin + 1e-9 || bMax <= aMin + 1e-9) return false;
    }
  }
  return true;
}
/** World-space direction of the dock's local "up" (toward the player's far side / the board). */
export function dockUp(d: Dock): Vec { return { x: Math.sin(d.rot), y: -Math.cos(d.rot) }; }
export function inRect(r: Rect, x: number, y: number): boolean { return x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h; }
export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}
/** Slot index under a world point, or -1. */
export function hitDockSlot(d: Dock, wx: number, wy: number, slotCount = 5): number {
  const l = worldToDock(d, wx, wy);
  for (let i = 0; i < slotCount; i++) if (inRect(slotRect(i, slotCount), l.x, l.y)) return i;
  return -1;
}
export function hitCreditChip(d: Dock, wx: number, wy: number): boolean {
  const l = worldToDock(d, wx, wy);
  return inRect(creditChipRect(), l.x, l.y);
}
export function hitDockBody(d: Dock, wx: number, wy: number, pad = 0): boolean {
  const l = worldToDock(d, wx, wy);
  return inRect({ x: -pad, y: -pad, w: d.w + 2 * pad, h: d.h + 2 * pad }, l.x, l.y);
}

/** Compact 174x84 always-on HUD cluster for top-left or side-margin placement. */
export function cornerHud(x = 10, y = 16): Record<HudButtonId, Rect> {
  return {
    wave: { x, y, w: 174, h: 40 },
    pause: { x, y: y + 46, w: 74, h: 38 },
    fullscreen: { x: x + 80, y: y + 46, w: 44, h: 38 },
    settings: { x: x + 130, y: y + 46, w: 44, h: 38 },
  };
}

/** Sleek 404x42 single-row always-on HUD bar centered at `cx`. */
export function horizontalHud(cx: number, y: number): Record<HudButtonId, Rect> {
  const x = cx - 202;
  return {
    wave: { x, y, w: 186, h: 42 },
    pause: { x: x + 192, y, w: 96, h: 42 },
    fullscreen: { x: x + 294, y, w: 52, h: 42 },
    settings: { x: x + 352, y, w: 52, h: 42 },
  };
}

/** 488x50 single-row always-on HUD bar centered at `cx` for 548-wide vertical phone stages. */
export function phoneHorizontalHud(cx: number, y: number): Record<HudButtonId, Rect> {
  const x = cx - 244;
  return {
    wave: { x, y, w: 204, h: 50 },
    pause: { x: x + 212, y, w: 120, h: 50 },
    fullscreen: { x: x + 340, y, w: 70, h: 50 },
    settings: { x: x + 418, y, w: 70, h: 50 },
  };
}

const H = Math.PI / 2;
const DEG = Math.PI / 180;
/** Corner docks sit diagonally at 0.61 scale: clear of board, HUD, and stage edges. */
export const CORNER_SCALE = 0.61;

export const LAYOUTS: LayoutDef[] = [
  {
    id: '2p-opposing',
    name: '2P opposing',
    screenLabel: 'Tabletop',
    playerCount: 2,
    stageW: WORLD_W,
    stageH: WORLD_H,
    // 36x36 exact 1:1 square cells (28*36 = 1008, 16*36 = 576) with larger 0.88x readable docks on baseline 1280x800
    board: { x: 136, y: 112, w: 28 * 36, h: 16 * 36 },
    docks: [makeDock(0, 640, 744, 0, 0.88), makeDock(1, 640, 56, Math.PI, 0.88)],
    hudButtons: cornerHud(10, 14),
    statsOrigin: { x: 1106, y: 14 },
  },
  {
    id: '2p-phone',
    name: '2P phone',
    screenLabel: 'Phone',
    playerCount: 2,
    stageW: 548,
    stageH: 1260,
    // 33x33 exact 1:1 square cells rotated (16*33 = 528, 28*33 = 924)
    board: { x: 10, y: 196, w: 16 * 33, h: 28 * 33 },
    boardRotated: true,
    docks: [makeDock(0, 274, 1190, 0, 1.10), makeDock(1, 274, 70, Math.PI, 1.10)],
    hudButtons: phoneHorizontalHud(274, 141),
    statsOrigin: { x: 10, y: 204 },
  },
  {
    id: '1p-base',
    name: '1P base side',
    screenLabel: 'Tabletop',
    playerCount: 1,
    stageW: WORLD_W,
    stageH: WORLD_H,
    // 39x39 exact 1:1 square cells (28*39 = 1092, 16*39 = 624)
    board: { x: 20, y: 104, w: 28 * 39, h: 16 * 39 },
    docks: [makeDock(0, 1184, 400, -H, 1.0)],
    hudButtons: cornerHud(10, 14),
    statsOrigin: { x: 200, y: 14 },
  },
  {
    id: '1p-phone',
    name: '1P phone',
    screenLabel: 'Phone',
    playerCount: 1,
    stageW: 548,
    stageH: 1140,
    // 33x33 exact 1:1 square cells rotated (16*33 = 528, 28*33 = 924)
    board: { x: 10, y: 70, w: 16 * 33, h: 28 * 33 },
    boardRotated: true,
    docks: [makeDock(0, 274, 1066, 0, 1.12)],
    hudButtons: phoneHorizontalHud(274, 14),
    statsOrigin: { x: 10, y: 78 },
  },
  {
    id: '3p-edges',
    name: '3P edges',
    screenLabel: 'Tabletop (Edges)',
    playerCount: 3,
    stageW: WORLD_W,
    stageH: WORLD_H,
    // 34x34 exact 1:1 square cells (28*34 = 952, 16*34 = 544); P1 bottom, P2 top, P3 right
    board: { x: 148, y: 128, w: 28 * 34, h: 16 * 34 },
    docks: [
      makeDock(0, 624, 736, 0, 1.0),
      makeDock(1, 624, 64, Math.PI, 1.0),
      makeDock(2, 1196, 400, -H, 1.0),
    ],
    hudButtons: cornerHud(10, 14),
    statsOrigin: { x: 1106, y: 14 },
  },
  {
    id: '3p-2v1',
    name: '3P 2+1',
    screenLabel: 'Tabletop (2+1)',
    playerCount: 3,
    stageW: WORLD_W,
    stageH: WORLD_H,
    // 34x34 exact 1:1 square cells (28*34 = 952, 16*34 = 544); P1 & P3 bottom, P2 top
    board: { x: 164, y: 128, w: 28 * 34, h: 16 * 34 },
    docks: [
      makeDock(0, 400, 738, 0, 0.96),
      makeDock(1, 640, 62, Math.PI, 0.96),
      makeDock(2, 880, 738, 0, 0.96),
    ],
    hudButtons: cornerHud(10, 14),
    statsOrigin: { x: 1106, y: 14 },
  },
  {
    id: '4p-edges',
    name: '4P edges',
    screenLabel: 'Tabletop (Edges)',
    playerCount: 4,
    stageW: WORLD_W,
    stageH: WORLD_H,
    // 34x34 exact 1:1 square cells (28*34 = 952, 16*34 = 544)
    board: { x: 164, y: 128, w: 28 * 34, h: 16 * 34 },
    docks: [
      makeDock(0, 640, 736, 0, 1.0),
      makeDock(1, 640, 64, Math.PI, 1.0),
      makeDock(2, 64, 400, H, 1.0),
      makeDock(3, 1216, 400, -H, 1.0),
    ],
    hudButtons: cornerHud(10, 14),
    statsOrigin: { x: 1106, y: 14 },
  },
  {
    id: '4p-2x2',
    name: '4P 2x2',
    screenLabel: 'Tabletop (2x2)',
    playerCount: 4,
    stageW: WORLD_W,
    stageH: WORLD_H,
    // 34x34 exact 1:1 square cells (28*34 = 952, 16*34 = 544)
    board: { x: 164, y: 128, w: 28 * 34, h: 16 * 34 },
    docks: [
      makeDock(0, 440, 738, 0, 0.96),
      makeDock(1, 920, 62, Math.PI, 0.96),
      makeDock(2, 920, 738, 0, 0.96),
      makeDock(3, 440, 62, Math.PI, 0.96),
    ],
    hudButtons: cornerHud(10, 14),
    statsOrigin: { x: 1154, y: 14 },
  },
  // Players: 0 = SW (45deg), 1 = NE (225deg), 2 = SE (315deg), 3 = NW (135deg); local "up" faces the board centre.
  {
    id: '4p-corners',
    name: '4P corners',
    screenLabel: 'Tabletop (Corners)',
    playerCount: 4,
    stageW: WORLD_W,
    stageH: WORLD_H,
    // 32.5x32.5 exact 1:1 square cells (28*32.5 = 910, 16*32.5 = 520)
    board: { x: 185, y: 140, w: 910, h: 520 },
    docks: [
      makeDock(0, 130, 670, 45 * DEG, CORNER_SCALE),
      makeDock(1, 1150, 130, 225 * DEG, CORNER_SCALE),
      makeDock(2, 1150, 670, 315 * DEG, CORNER_SCALE),
      makeDock(3, 130, 130, 135 * DEG, CORNER_SCALE),
    ],
    hudButtons: horizontalHud(640, 18),
    statsOrigin: { x: 1106, y: 310 },
  },
];

/** Layouts matching a given player count (1..4). */
export function layoutsForPlayers(playerCount: number): LayoutDef[] {
  return LAYOUTS.filter(l => l.playerCount === playerCount);
}

/** Pick the next player count (1->2->3->4->1) while preserving Phone vs Tabletop preference when available. */
export function cyclePlayersLayout(currentIdx: number): number {
  const cur = LAYOUTS[currentIdx] ?? LAYOUTS[0];
  const wantPhone = isPhoneLayout(cur);
  const nextCount = ((cur.playerCount % 4) + 1) as PlayerCount;
  const candidates = layoutsForPlayers(nextCount);
  const preferred = candidates.find(l => isPhoneLayout(l) === wantPhone) ?? candidates[0];
  return preferred ? LAYOUTS.indexOf(preferred) : 0;
}

/** Cycle through screen/arrangement options within the current player count. */
export function cycleScreenLayout(currentIdx: number): number {
  const cur = LAYOUTS[currentIdx] ?? LAYOUTS[0];
  const candidates = layoutsForPlayers(cur.playerCount);
  if (candidates.length <= 1) return currentIdx;
  const pos = candidates.indexOf(cur);
  const next = candidates[(pos + 1) % candidates.length];
  return LAYOUTS.indexOf(next);
}

/**
 * Dynamically adapts a layout to the active window aspect ratio while preserving strictly
 * 1:1 square grid cells (`cw === ch`) so there is minimal blank space around the playfield
 * and player cards scale up as large and readable as the screen shape allows.
 */
export function adaptLayout(base: LayoutDef, screenW: number, screenH: number, soloSide: SoloDockSide = 'right'): LayoutDef {
  if (!(screenW > 0 && screenH > 0)) return base;
  const phone = isPhoneLayout(base);
  const aspect = screenW / screenH;

  if (phone) {
    const clampedAspect = Math.max(0.40, Math.min(0.68, aspect));
    const stageH = 1260;
    const stageW = Math.max(548, Math.round(stageH * clampedAspect));
    if (base.id === '2p-phone') {
      const maxCellW = (stageW - 20) / GRID_H;
      const maxCellH = (stageH - 336) / GRID_W;
      const cell = Math.max(32, Math.floor(Math.min(maxCellW, maxCellH) * 2) / 2);
      const bw = GRID_H * cell;
      const bh = GRID_W * cell;
      const bx = Math.round((stageW - bw) / 2);
      const topAvail = stageH - bh;
      const topSpace = Math.max(196, Math.round(topAvail * 0.58));
      const botSpace = stageH - bh - topSpace;
      const dockScale = Math.max(1.10, Math.min(1.26, Math.min((stageW - 24) / DOCK_W, (botSpace - 10) / DOCK_H, (topSpace - 64) / DOCK_H)));
      const topDockH = DOCK_H * dockScale;
      const topDockCy = Math.round(6 + topDockH / 2);
      const hudY = Math.round(topDockCy + topDockH / 2 + 6);
      const by = Math.max(hudY + 54, topSpace);
      const botDockCy = Math.round(by + bh + (stageH - (by + bh)) / 2);
      return {
        ...base,
        stageW,
        stageH,
        board: { x: bx, y: by, w: bw, h: bh },
        docks: [
          makeDock(0, stageW / 2, botDockCy, 0, dockScale),
          makeDock(1, stageW / 2, topDockCy, Math.PI, dockScale),
        ],
        hudButtons: phoneHorizontalHud(stageW / 2, hudY),
        statsOrigin: { x: bx, y: by + 8 },
      };
    }
    if (base.id === '1p-phone') {
      const stage1H = 1140;
      const stage1W = Math.max(548, Math.round(stage1H * clampedAspect));
      const maxCellW = (stage1W - 20) / GRID_H;
      const maxCellH = (stage1H - 216) / GRID_W;
      const cell = Math.max(32, Math.floor(Math.min(maxCellW, maxCellH) * 2) / 2);
      const bw = GRID_H * cell;
      const bh = GRID_W * cell;
      const bx = Math.round((stage1W - bw) / 2);
      const by = 70;
      const botSpace = stage1H - (by + bh);
      const dockScale = Math.max(1.12, Math.min(1.28, Math.min((stage1W - 24) / DOCK_W, (botSpace - 12) / DOCK_H)));
      const botDockCy = Math.round(by + bh + botSpace / 2);
      return {
        ...base,
        stageW: stage1W,
        stageH: stage1H,
        board: { x: bx, y: by, w: bw, h: bh },
        docks: [makeDock(0, stage1W / 2, botDockCy, 0, dockScale)],
        hudButtons: phoneHorizontalHud(stage1W / 2, 14),
        statsOrigin: { x: bx, y: by + 8 },
      };
    }
    return base;
  }

  // Landscape / square desktop & tablet screens
  const clampedAspect = Math.max(0.95, Math.min(2.05, aspect));
  const stageW = clampedAspect >= 1.6 ? Math.round(800 * clampedAspect) : 1280;
  const stageH = Math.round(stageW / clampedAspect);

  if (base.id === '2p-opposing') {
    // Reserve at least 112px top/bottom bands so docks stay >= 0.88x and HUD (84px tall) clears board
    const minBand = 112;
    const maxCellW = (stageW - 24) / GRID_W;
    const maxCellH = (stageH - minBand * 2) / GRID_H;
    const cell = Math.max(32, Math.floor(Math.min(maxCellW, maxCellH) * 2) / 2);
    const bw = GRID_W * cell;
    const bh = GRID_H * cell;
    const bx = Math.round((stageW - bw) / 2);
    const bandH = (stageH - bh) / 2;
    const by = Math.round(bandH);
    // Scale player cards as large as fits in the top/bottom band while leaving room on the left for cornerHud (x=12..186)
    const maxDockWForHud = (stageW / 2 - 196) * 2;
    const dockScale = Math.max(
      0.88,
      Math.min(1.42, (bandH - 12) / DOCK_H, maxDockWForHud / DOCK_W),
    );
    const topCy = Math.round(bandH / 2);
    const botCy = Math.round(stageH - bandH / 2);
    const hudY = Math.max(10, Math.min(by - 88, Math.round((bandH - 84) / 2)));
    return {
      ...base,
      stageW,
      stageH,
      board: { x: bx, y: by, w: bw, h: bh },
      docks: [
        makeDock(0, stageW / 2, botCy, 0, dockScale),
        makeDock(1, stageW / 2, topCy, Math.PI, dockScale),
      ],
      hudButtons: cornerHud(12, hudY),
      statsOrigin: { x: stageW - 174, y: hudY },
    };
  }

  if (base.id === '1p-base') {
    if (soloSide === 'right' || soloSide === 'left') {
      const dockScale = Math.max(1.0, Math.min(1.24, (stageH - 40) / DOCK_W));
      const dockWWorld = DOCK_H * dockScale;
      const topReserve = 104;
      const availW = Math.floor(stageW - dockWWorld - 36);
      const maxCellW = availW / GRID_W;
      const maxCellH = (stageH - topReserve - 16) / GRID_H;
      const cell = Math.max(32, Math.floor(Math.min(maxCellW, maxCellH) * 2) / 2);
      const bw = GRID_W * cell;
      const bh = GRID_H * cell;
      const by = Math.max(topReserve, Math.round((stageH + topReserve - bh) / 2));
      if (soloSide === 'right') {
        const dockCx = Math.round(stageW - 12 - dockWWorld / 2);
        const bx = Math.max(14, Math.round((dockCx - dockWWorld / 2 - 12 - bw) / 2) + 6);
        return {
          ...base,
          stageW,
          stageH,
          board: { x: bx, y: by, w: bw, h: bh },
          docks: [makeDock(0, dockCx, Math.round(stageH / 2), -H, dockScale)],
          hudButtons: cornerHud(14, 14),
          statsOrigin: { x: 204, y: 14 },
        };
      }
      // Left side: dock sits on the left edge below cornerHud (or centered vertically if it fits right of HUD)
      const hudBottom = 104;
      const leftDockScale = Math.max(0.88, Math.min(1.22, (stageH - hudBottom - 16) / DOCK_W));
      const leftDockW = DOCK_H * leftDockScale;
      const leftDockCx = Math.round(12 + leftDockW / 2);
      const leftDockCy = Math.round(hudBottom + (stageH - hudBottom) / 2);
      const leftAvailW = Math.floor(stageW - (leftDockCx + leftDockW / 2) - 24);
      const leftCell = Math.max(32, Math.floor(Math.min(leftAvailW / GRID_W, (stageH - topReserve - 16) / GRID_H) * 2) / 2);
      const lbw = GRID_W * leftCell;
      const lbh = GRID_H * leftCell;
      const lbx = Math.round(leftDockCx + leftDockW / 2 + 12 + (leftAvailW - lbw) / 2);
      const lby = Math.max(topReserve, Math.round((stageH + topReserve - lbh) / 2));
      return {
        ...base,
        stageW,
        stageH,
        board: { x: lbx, y: lby, w: lbw, h: lbh },
        docks: [makeDock(0, leftDockCx, leftDockCy, H, leftDockScale)],
        hudButtons: cornerHud(14, 14),
        statsOrigin: { x: 204, y: 14 },
      };
    }

    // Bottom or Top side
    const minBand = 114;
    const maxCellW = (stageW - 24) / GRID_W;
    const maxCellH = (stageH - minBand - 104) / GRID_H;
    const cell = Math.max(32, Math.floor(Math.min(maxCellW, maxCellH) * 2) / 2);
    const bw = GRID_W * cell;
    const bh = GRID_H * cell;
    const bx = Math.round((stageW - bw) / 2);
    if (soloSide === 'bottom') {
      const topBand = 102;
      const botSpace = stageH - topBand - bh;
      const dockScale = Math.max(0.88, Math.min(1.38, (botSpace - 12) / DOCK_H, (stageW - 40) / DOCK_W));
      const by = Math.round(topBand + Math.max(0, (botSpace - DOCK_H * dockScale - 14) / 2));
      const botCy = Math.round(by + bh + (stageH - (by + bh)) / 2);
      return {
        ...base,
        stageW,
        stageH,
        board: { x: bx, y: by, w: bw, h: bh },
        docks: [makeDock(0, stageW / 2, botCy, 0, dockScale)],
        hudButtons: cornerHud(12, 10),
        statsOrigin: { x: stageW - 174, y: 10 },
      };
    }
    // Top side
    const maxDockWForHud = (stageW / 2 - 196) * 2;
    const topSpace = stageH - bh - 16;
    const dockScale = Math.max(0.88, Math.min(1.38, (topSpace - 14) / DOCK_H, maxDockWForHud / DOCK_W));
    const topBand = Math.max(104, Math.round(DOCK_H * dockScale + 14));
    const by = Math.round(topBand + Math.max(0, (stageH - topBand - bh - 12) / 2));
    const topCy = Math.round(topBand / 2);
    const hudY = Math.max(10, Math.min(by - 88, Math.round((topBand - 84) / 2)));
    return {
      ...base,
      stageW,
      stageH,
      board: { x: bx, y: by, w: bw, h: bh },
      docks: [makeDock(0, stageW / 2, topCy, Math.PI, dockScale)],
      hudButtons: cornerHud(12, hudY),
      statsOrigin: { x: stageW - 174, y: hudY },
    };
  }

  return base;
}

export function hitHudButton(layout: LayoutDef, x: number, y: number): HudButtonId | null {
  for (const id of HUD_BUTTON_IDS) {
    if (inRect(layout.hudButtons[id], x, y)) return id;
  }
  return null;
}

/** Phone stages (548 wide) render at ~0.51..0.71 scale, so Settings is a stage-centred modal with >=92 world-px targets (>=44 CSS px at 360x640). */
export const PHONE_SETTINGS = {
  w: 516, h: 1060, margin: 18, rowH: 92, gap: 12, headerH: 104, closeW: 92,
  statusTop: 842, statusH: 120, tipTop: 970, tipH: 80,
} as const;

export function settingsPanelRect(layout: LayoutDef): Rect {
  if (isPhoneLayout(layout)) {
    const { w, h } = PHONE_SETTINGS;
    return { x: (layout.stageW - w) / 2, y: (layout.stageH - h) / 2, w, h };
  }
  const w = 440, h = 446; // rows end at +358; status line ~+372; tip centred at h-32
  return {
    x: layout.board.x + (layout.board.w - w) / 2,
    y: layout.board.y + (layout.board.h - h) / 2,
    w,
    h,
  };
}

export function settingsButtonRects(layout: LayoutDef): Record<SettingsButtonId, Rect> {
  const { x: px, y: py, w: pw } = settingsPanelRect(layout);
  if (isPhoneLayout(layout)) {
    const { margin: m, rowH: bh, gap: g, headerH, closeW } = PHONE_SETTINGS;
    const fw = pw - m * 2, hw = (fw - g) / 2, x0 = px + m, x1 = x0 + hw + g;
    const ry = (i: number) => py + headerH + i * (bh + g);
    return {
      close: { x: px + pw - m - closeW, y: py + 5, w: closeW, h: bh },
      map: { x: x0, y: ry(0), w: fw, h: bh },
      players: { x: x0, y: ry(1), w: hw, h: bh },
      screen: { x: x1, y: ry(1), w: hw, h: bh },
      difficulty: { x: x0, y: ry(2), w: hw, h: bh },
      waves: { x: x1, y: ry(2), w: hw, h: bh },
      speed: { x: x0, y: ry(3), w: hw, h: bh },
      auto: { x: x1, y: ry(3), w: hw, h: bh },
      sfx: { x: x0, y: ry(4), w: hw, h: bh },
      stats: { x: x1, y: ry(4), w: hw, h: bh },
      reset: { x: x0, y: ry(5), w: hw, h: bh },
      stress: { x: x1, y: ry(5), w: hw, h: bh },
      install: { x: x0, y: ry(6), w: hw, h: bh },
      update: { x: x1, y: ry(6), w: hw, h: bh },
    };
  }
  const x0 = px + 20, hw = 194, gap = 12;
  return {
    close: { x: px + 440 - 46, y: py + 12, w: 34, h: 32 },
    map: { x: x0, y: py + 58, w: 400, h: 36 },
    players: { x: x0, y: py + 102, w: hw, h: 36 },
    screen: { x: x0 + hw + gap, y: py + 102, w: hw, h: 36 },
    difficulty: { x: x0, y: py + 146, w: hw, h: 36 },
    waves: { x: x0 + hw + gap, y: py + 146, w: hw, h: 36 },
    speed: { x: x0, y: py + 190, w: hw, h: 36 },
    auto: { x: x0 + hw + gap, y: py + 190, w: hw, h: 36 },
    sfx: { x: x0, y: py + 234, w: hw, h: 36 },
    stats: { x: x0 + hw + gap, y: py + 234, w: hw, h: 36 },
    reset: { x: x0, y: py + 278, w: hw, h: 36 },
    stress: { x: x0 + hw + gap, y: py + 278, w: hw, h: 36 },
    install: { x: x0, y: py + 322, w: hw, h: 36 },
    update: { x: x0 + hw + gap, y: py + 322, w: hw, h: 36 },
  };
}

export function hitSettingsButton(layout: LayoutDef, x: number, y: number): SettingsButtonId | null {
  const rects = settingsButtonRects(layout);
  for (const id of SETTINGS_BUTTON_IDS) {
    if (inRect(rects[id], x, y)) return id;
  }
  return null;
}

/** Portrait phone stages are drawn at ~0.5 scale, so their summary card uses larger world-space geometry. */
export function isPhoneLayout(layout: LayoutDef): boolean {
  return layout.stageH > layout.stageW;
}

export function summaryCardRect(layout: LayoutDef): Rect {
  const phone = isPhoneLayout(layout);
  const w = phone ? 480 : 500, h = phone ? 540 : 296;
  return {
    x: layout.board.x + (layout.board.w - w) / 2,
    y: layout.board.y + (layout.board.h - h) / 2,
    w,
    h,
  };
}

export function summaryButtonRects(layout: LayoutDef): Record<SummaryButtonId, Rect> {
  const { x: px, y: py, w: pw, h: ph } = summaryCardRect(layout);
  if (isPhoneLayout(layout)) {
    const m = 28, bh = 88, gap = 18, bw = (pw - m * 3) / 2, by = py + ph - m - bh;
    return {
      'add-waves': { x: px + m, y: by - gap - bh, w: pw - m * 2, h: bh },
      'play-again': { x: px + m, y: by, w: bw, h: bh },
      'next-map': { x: px + m * 2 + bw, y: by, w: bw, h: bh },
    };
  }
  const by = py + ph - 54;
  return {
    'add-waves': { x: px + 42, y: by - 50, w: 416, h: 40 },
    'play-again': { x: px + 42, y: by, w: 200, h: 40 },
    'next-map': { x: px + 258, y: by, w: 200, h: 40 },
  };
}

export function hitSummaryButton(layout: LayoutDef, x: number, y: number, showAddWaves = true): SummaryButtonId | null {
  const rects = summaryButtonRects(layout);
  for (const id of SUMMARY_BUTTON_IDS) {
    if (id === 'add-waves' && !showAddWaves) continue;
    if (inRect(rects[id], x, y)) return id;
  }
  return null;
}

export type RadialAction = 'upgrade' | 'priority' | 'sell' | 'repair';
export const RADIAL_RADIUS = 52;
export const RADIAL_BTN_R = 22;
const RADIAL_LOCAL: { action: RadialAction; lx: number; ly: number }[] = [
  { action: 'upgrade', lx: 0, ly: -RADIAL_RADIUS },
  { action: 'priority', lx: -45, ly: 26 },
  { action: 'sell', lx: 45, ly: 26 },
];
const RADIAL_REPAIR_LOCAL = { action: 'repair' as const, lx: 0, ly: RADIAL_RADIUS };
export function radialButtons(cx: number, cy: number, rot: number, stageW = WORLD_W, stageH = WORLD_H, showRepair = false): { action: RadialAction; x: number; y: number; r: number }[] {
  const c = Math.cos(rot), s = Math.sin(rot);
  const local = showRepair ? [...RADIAL_LOCAL, RADIAL_REPAIR_LOCAL] : RADIAL_LOCAL;
  const rotated = local.map(({ action, lx, ly }) => ({
    action,
    ox: lx * c - ly * s,
    oy: lx * s + ly * c,
  }));
  let minOx = Infinity, maxOx = -Infinity, minOy = Infinity, maxOy = -Infinity;
  for (const o of rotated) {
    if (o.ox < minOx) minOx = o.ox;
    if (o.ox > maxOx) maxOx = o.ox;
    if (o.oy < minOy) minOy = o.oy;
    if (o.oy > maxOy) maxOy = o.oy;
  }
  const ccx = Math.max(26 - minOx, Math.min(stageW - 26 - maxOx, cx));
  const ccy = Math.max(26 - minOy, Math.min(stageH - 26 - maxOy, cy));
  return rotated.map(o => ({ action: o.action, x: ccx + o.ox, y: ccy + o.oy, r: RADIAL_BTN_R }));
}
export function hitRadialButton(cx: number, cy: number, rot: number, wx: number, wy: number, stageW = WORLD_W, stageH = WORLD_H, showRepair = false): RadialAction | null {
  for (const b of radialButtons(cx, cy, rot, stageW, stageH, showRepair)) {
    if (Math.hypot(wx - b.x, wy - b.y) <= b.r + 4) return b.action;
  }
  return null;
}
export function boardCellSize(board: Rect, rotated = false): { cw: number; ch: number } {
  return rotated
    ? { cw: board.w / GRID_H, ch: board.h / GRID_W }
    : { cw: board.w / GRID_W, ch: board.h / GRID_H };
}
export function boardLocalToWorld(board: Rect, lx: number, ly: number, rotated = false): Vec {
  if (!rotated) {
    return {
      x: board.x + (lx / BOARD_W) * board.w,
      y: board.y + (ly / BOARD_H) * board.h,
    };
  }
  return {
    x: board.x + board.w - (ly / BOARD_H) * board.w,
    y: board.y + (lx / BOARD_W) * board.h,
  };
}
export function worldToBoardLocal(board: Rect, wx: number, wy: number, rotated = false): Vec {
  if (!rotated) {
    return {
      x: ((wx - board.x) / board.w) * BOARD_W,
      y: ((wy - board.y) / board.h) * BOARD_H,
    };
  }
  return {
    x: ((wy - board.y) / board.h) * BOARD_W,
    y: ((board.x + board.w - wx) / board.w) * BOARD_H,
  };
}
export function boardCellCenter(board: Rect, gx: number, gy: number, rotated = false): Vec {
  return boardLocalToWorld(board, (gx + 0.5) * CELL, (gy + 0.5) * CELL, rotated);
}
export function cellAt(wx: number, wy: number, board: Rect = BOARD, rotated = false): { x: number; y: number } | null {
  if (!inRect(board, wx, wy)) return null;
  const l = worldToBoardLocal(board, wx, wy, rotated);
  return {
    x: Math.max(0, Math.min(GRID_W - 1, Math.floor(l.x / CELL))),
    y: Math.max(0, Math.min(GRID_H - 1, Math.floor(l.y / CELL))),
  };
}

/** Uniform fit of the design stage into the window. */
export class Viewport {
  scale = 1; ox = 0; oy = 0; sw = 0; sh = 0; ww = WORLD_W; wh = WORLD_H;
  /** Returns true when anything changed. */
  fit(sw: number, sh: number, worldW = WORLD_W, worldH = WORLD_H): boolean {
    if (sw === this.sw && sh === this.sh && worldW === this.ww && worldH === this.wh) return false;
    this.sw = sw; this.sh = sh; this.ww = worldW; this.wh = worldH;
    this.scale = Math.min(sw / worldW, sh / worldH);
    this.ox = (sw - worldW * this.scale) / 2;
    this.oy = (sh - worldH * this.scale) / 2;
    return true;
  }
  toWorld(sx: number, sy: number): Vec { return { x: (sx - this.ox) / this.scale, y: (sy - this.oy) / this.scale }; }
}
