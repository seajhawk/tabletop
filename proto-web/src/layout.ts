// Adaptive design stage, scaled uniformly to the window. Docks are rotated rectangles that
// live outside the 28x16 board; hit tests inverse-transform world points into dock-local space.
export const WORLD_W = 1280;
export const WORLD_H = 800;
export const CELL = 32;
export const GRID_W = 28;
export const GRID_H = 16;
export interface Rect { x: number; y: number; w: number; h: number }
export interface Vec { x: number; y: number }
export const BOARD: Rect = { x: 192, y: 144, w: GRID_W * CELL, h: GRID_H * CELL };

export const DOCK_W = 472;
export const DOCK_H = 120;
export const TURRET_ORDER = ['pulse', 'plasma', 'stasis', 'railgun', 'swarm'] as const;
export function slotRect(i: number): Rect { return { x: 9 + i * 92, y: 30, w: 86, h: 84 }; }
export function creditChipRect(): Rect { return { x: 296, y: 2, w: 168, h: 26 }; }

/** `w`/`h` are logical (dock-local) size; `scale` is the physical scale, so the world footprint is w*scale x h*scale. */
export interface Dock { player: number; cx: number; cy: number; rot: number; scale: number; w: number; h: number; bounds: Rect }

export const HUD_BUTTON_IDS = ['wave', 'pause', 'fullscreen', 'settings'] as const;
export type HudButtonId = typeof HUD_BUTTON_IDS[number];
export const SETTINGS_BUTTON_IDS = ['map', 'layout', 'difficulty', 'speed', 'auto', 'sfx', 'stats', 'reset', 'stress', 'install', 'update', 'close'] as const;
export type SettingsButtonId = typeof SETTINGS_BUTTON_IDS[number];
export const SUMMARY_BUTTON_IDS = ['play-again', 'next-map'] as const;
export type SummaryButtonId = typeof SUMMARY_BUTTON_IDS[number];
export const BUTTON_IDS = [...HUD_BUTTON_IDS, ...SETTINGS_BUTTON_IDS, ...SUMMARY_BUTTON_IDS] as const;
export type ButtonId = HudButtonId | SettingsButtonId | SummaryButtonId;

export interface LayoutDef {
  id: string;
  name: string;
  playerCount: number;
  stageW: number;
  stageH: number;
  board: Rect;
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
export function hitDockSlot(d: Dock, wx: number, wy: number): number {
  const l = worldToDock(d, wx, wy);
  for (let i = 0; i < TURRET_ORDER.length; i++) if (inRect(slotRect(i), l.x, l.y)) return i;
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

const H = Math.PI / 2;
const DEG = Math.PI / 180;
/** Corner docks sit diagonally at 0.61 scale: clear of board, HUD, and stage edges. */
export const CORNER_SCALE = 0.61;

export const LAYOUTS: LayoutDef[] = [
  {
    id: '2p-opposing',
    name: '2P opposing',
    playerCount: 2,
    stageW: WORLD_W,
    stageH: WORLD_H,
    board: BOARD,
    docks: [makeDock(0, 640, 730, 0, 1), makeDock(1, 640, 70, Math.PI, 1)],
    hudButtons: cornerHud(10, 16),
    statsOrigin: { x: 1106, y: 16 },
  },
  {
    id: '2p-phone',
    name: '2P phone',
    playerCount: 2,
    stageW: 920,
    stageH: 1280,
    board: { x: 12, y: 384, w: GRID_W * CELL, h: GRID_H * CELL },
    docks: [makeDock(0, 460, 1170, 0, 1.55), makeDock(1, 460, 110, Math.PI, 1.55)],
    hudButtons: horizontalHud(460, 294),
    statsOrigin: { x: 740, y: 224 },
  },
  {
    id: '1p-base',
    name: '1P base side',
    playerCount: 1,
    stageW: WORLD_W,
    stageH: WORLD_H,
    board: BOARD,
    docks: [makeDock(0, 1184, 400, -H, 1.0)],
    hudButtons: cornerHud(10, 16),
    statsOrigin: { x: 10, y: 120 },
  },
  {
    id: '1p-phone',
    name: '1P phone',
    playerCount: 1,
    stageW: 920,
    stageH: 1280,
    board: { x: 12, y: 244, w: GRID_W * CELL, h: GRID_H * CELL },
    docks: [makeDock(0, 460, 1120, 0, 1.65)],
    hudButtons: horizontalHud(460, 148),
    statsOrigin: { x: 740, y: 40 },
  },
  {
    id: '4p-edges',
    name: '4P edges',
    playerCount: 4,
    stageW: WORLD_W,
    stageH: WORLD_H,
    board: BOARD,
    docks: [
      makeDock(0, 640, 730, 0, 1.0),
      makeDock(1, 640, 70, Math.PI, 1.0),
      makeDock(2, 96, 400, H, 1.0),
      makeDock(3, 1184, 400, -H, 1.0),
    ],
    hudButtons: cornerHud(10, 16),
    statsOrigin: { x: 1106, y: 16 },
  },
  {
    id: '4p-2x2',
    name: '4P 2x2',
    playerCount: 4,
    stageW: WORLD_W,
    stageH: WORLD_H,
    board: BOARD,
    docks: [
      makeDock(0, 384, 730, 0, 0.96),
      makeDock(1, 896, 70, Math.PI, 0.96),
      makeDock(2, 896, 730, 0, 0.96),
      makeDock(3, 384, 70, Math.PI, 0.96),
    ],
    hudButtons: cornerHud(10, 358),
    statsOrigin: { x: 1106, y: 160 },
  },
  // Players: 0 = SW (45deg), 1 = NE (225deg), 2 = SE (315deg), 3 = NW (135deg); local "up" faces the board centre.
  {
    id: '4p-corners',
    name: '4P corners',
    playerCount: 4,
    stageW: WORLD_W,
    stageH: WORLD_H,
    board: BOARD,
    docks: [
      makeDock(0, 134, 666, 45 * DEG, CORNER_SCALE),
      makeDock(1, 1146, 134, 225 * DEG, CORNER_SCALE),
      makeDock(2, 1146, 666, 315 * DEG, CORNER_SCALE),
      makeDock(3, 134, 134, 135 * DEG, CORNER_SCALE),
    ],
    hudButtons: horizontalHud(640, 18),
    statsOrigin: { x: 1106, y: 310 },
  },
];

export function hitHudButton(layout: LayoutDef, x: number, y: number): HudButtonId | null {
  for (const id of HUD_BUTTON_IDS) {
    if (inRect(layout.hudButtons[id], x, y)) return id;
  }
  return null;
}

/** Phone stages render at ~0.4 scale, so Settings is a stage-centred modal with >=114 world-px targets (>=44 CSS px at 360 wide). */
export const PHONE_SETTINGS = {
  w: 860, h: 1200, margin: 24, rowH: 114, gap: 12, headerH: 124, closeW: 114,
  statusTop: 1002, statusH: 108, tipTop: 1116, tipH: 72,
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
      layout: { x: x0, y: ry(1), w: fw, h: bh },
      difficulty: { x: x0, y: ry(2), w: fw, h: bh },
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
    layout: { x: x0, y: py + 102, w: 400, h: 36 },
    difficulty: { x: x0, y: py + 146, w: 400, h: 36 },
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
  const w = phone ? 820 : 500, h = phone ? 500 : 252;
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
    const m = 28, bh = 88, bw = (pw - m * 3) / 2, by = py + ph - m - bh;
    return {
      'play-again': { x: px + m, y: by, w: bw, h: bh },
      'next-map': { x: px + m * 2 + bw, y: by, w: bw, h: bh },
    };
  }
  const y = py + ph - 56;
  return {
    'play-again': { x: px + 42, y, w: 200, h: 40 },
    'next-map': { x: px + 258, y, w: 200, h: 40 },
  };
}

export function hitSummaryButton(layout: LayoutDef, x: number, y: number): SummaryButtonId | null {
  const rects = summaryButtonRects(layout);
  for (const id of SUMMARY_BUTTON_IDS) {
    if (inRect(rects[id], x, y)) return id;
  }
  return null;
}

export type RadialAction = 'upgrade' | 'priority' | 'sell';
export const RADIAL_RADIUS = 52;
export const RADIAL_BTN_R = 22;
const RADIAL_LOCAL: { action: RadialAction; lx: number; ly: number }[] = [
  { action: 'upgrade', lx: 0, ly: -RADIAL_RADIUS },
  { action: 'priority', lx: -45, ly: 26 },
  { action: 'sell', lx: 45, ly: 26 },
];
export function radialButtons(cx: number, cy: number, rot: number, stageW = WORLD_W, stageH = WORLD_H): { action: RadialAction; x: number; y: number; r: number }[] {
  const c = Math.cos(rot), s = Math.sin(rot);
  const rotated = RADIAL_LOCAL.map(({ action, lx, ly }) => ({
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
export function hitRadialButton(cx: number, cy: number, rot: number, wx: number, wy: number, stageW = WORLD_W, stageH = WORLD_H): RadialAction | null {
  for (const b of radialButtons(cx, cy, rot, stageW, stageH)) {
    if (Math.hypot(wx - b.x, wy - b.y) <= b.r + 4) return b.action;
  }
  return null;
}
export function cellAt(wx: number, wy: number, board: Rect = BOARD): { x: number; y: number } | null {
  if (!inRect(board, wx, wy)) return null;
  return { x: Math.floor((wx - board.x) / CELL), y: Math.floor((wy - board.y) / CELL) };
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
