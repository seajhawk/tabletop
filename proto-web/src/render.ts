// PixiJS v8 presentation. Static art is drawn once; dynamic layers are updated only when the
// underlying state changes (map/towers/route), and sprites, radials, popups, and chips are pooled.
import { Application, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import type { Game } from './sim/game';
import type { InputController } from './input';
import { DIFFICULTIES, type MapTheme } from './types';
import { hex } from './data';
import { scoreLines, type ScoreResult } from './scores';
import { formatWaveName, getTheater, type TheaterTheme, type ThemeId } from './theme';
import { buildMilitaryTextures, type MilitaryTextureSet } from './militarySprites';
import { buildTheaterTextures, type TheaterTextureSet } from './theaterSprites';
import {
  boardCellCenter, boardLocalToWorld, CELL, creditChipRect, dockToWorld, GRID_H, GRID_W, HUD_BUTTON_IDS, isPhoneLayout,
  PHONE_SETTINGS, RADIAL_BTN_R, RADIAL_RADIUS, radialButtons, SETTINGS_BUTTON_IDS,
  settingsButtonRects, settingsPanelRect, slotRect, SUMMARY_BUTTON_IDS,
  summaryButtonRects, summaryCardRect, TURRET_ORDER,
  type ButtonId, type HudButtonId, type LayoutDef, type Rect,
  type SettingsButtonId, type SummaryButtonId,
} from './layout';
import { followRoute } from './sim/grid';
import type { PwaController } from './pwa';

const BOARD_W = GRID_W * CELL;
const BOARD_H = GRID_H * CELL;

type PwaView = Pick<PwaController, 'installLabel' | 'installDisabled' | 'updateLabel' | 'updateDisabled' | 'updateAvailable' | 'statusText'>;

export const C = {
  space: 0x081321, grid: 0x20354b, ice: 0xc5e4ed, cyan: 0x4cd9ef, amber: 0xffc16e,
  coral: 0xff7f87, mint: 0x82e3b4, panel: 0x0d2036, slot: 0x13304c, gold: 0xffd84d,
  violet: 0xc5a1f0,
};
const PLAYER_COLORS = [C.cyan, C.amber, C.coral, C.mint];
const SHORT_TURRET_NAME: Record<string, string> = {
  pulse: 'Pulse', plasma: 'Plasma', stasis: 'Stasis', railgun: 'Railgun', swarm: 'Swarm',
};
const MIL_ROLE_BADGE: Record<string, string> = {
  pulse: 'CIWS', plasma: 'ARTY', stasis: 'EW', railgun: 'TANK', swarm: 'SAM',
};
const PRIORITY_LABEL: Record<string, string> = {
  first: '1ST', strong: 'STR', close: 'CLS', air: 'AIR',
};
const FONT = 'Segoe UI, system-ui, -apple-system, Roboto, sans-serif';
const TEXT_RES = Math.max(2, Math.min(3, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 2));

const SETTINGS_TIP_DESKTOP = 'Drag units from your dock · Tap unit for Upgrade / Aim / Sell\nDrag or flick ◆ Share chip to send credits to teammates';
const SETTINGS_TIP_PHONE = 'Drag units from your dock · Tap unit: Upgrade / Aim / Sell\nDrag or flick ◆ Share chip to send credits';

function mkText(text: string, size: number, fill: number, opts: { bold?: boolean; wrap?: number; align?: 'left' | 'center' | 'right' } = {}): Text {
  return new Text({
    text,
    resolution: TEXT_RES,
    style: {
      fontFamily: FONT, fontSize: size, fill, fontWeight: opts.bold ? '700' : '400',
      wordWrap: !!opts.wrap, wordWrapWidth: opts.wrap ?? 0, align: opts.align ?? 'left', lineHeight: Math.round(size * 1.3),
    },
  });
}

function rp(cx: number, cy: number, lx: number, ly: number, cos: number, sin: number): [number, number] {
  return [cx + lx * cos - ly * sin, cy + lx * sin + ly * cos];
}

function drawRotRect(g: Graphics, cx: number, cy: number, x: number, y: number, w: number, h: number, cos: number, sin: number): Graphics {
  const [x0, y0] = rp(cx, cy, x, y, cos, sin);
  const [x1, y1] = rp(cx, cy, x + w, y, cos, sin);
  const [x2, y2] = rp(cx, cy, x + w, y + h, cos, sin);
  const [x3, y3] = rp(cx, cy, x, y + h, cos, sin);
  return g.poly([x0, y0, x1, y1, x2, y2, x3, y3]);
}

function drawMilitaryTurretHead(
  g: Graphics, id: string, cx: number, cy: number, r: number, color: number, rot: number, tier: number, alpha: number,
): void {
  const cos = Math.cos(rot), sin = Math.sin(rot);
  if (id === 'pulse') {
    // Vulcan CIWS: armored cupola + rotary multi-barrel gatling gun
    g.circle(cx, cy, r * 0.56).fill({ color: 0x263529, alpha }).stroke({ width: 1.8, color, alpha });
    g.circle(cx, cy, r * 0.34).fill({ color, alpha: alpha * 0.85 });
    const len = tier >= 1 ? r * 0.96 : r * 0.86;
    const mounts = tier >= 1 ? [-r * 0.28, r * 0.28] : [0];
    for (const my of mounts) {
      for (const bo of [-r * 0.1, 0, r * 0.1]) {
        const [x0, y0] = rp(cx, cy, r * 0.18, my + bo, cos, sin);
        const [x1, y1] = rp(cx, cy, len, my + bo, cos, sin);
        g.moveTo(x0, y0).lineTo(x1, y1).stroke({ width: 1.5, color, alpha });
      }
      drawRotRect(g, cx, cy, r * 0.62, my - r * 0.14, r * 0.12, r * 0.28, cos, sin).fill({ color: 0x1a261d, alpha });
      if (tier >= 2) {
        const [mx, myp] = rp(cx, cy, len + r * 0.04, my, cos, sin);
        g.circle(mx, myp, r * 0.13).fill({ color: 0xfff2a6, alpha: alpha * 0.95 });
      }
    }
  } else if (id === 'plasma') {
    // M777 Howitzer: splayed stabilizer trails + heavy breech + long thick barrel
    for (const sy of [-r * 0.52, r * 0.52]) {
      const [sx0, sy0] = rp(cx, cy, -r * 0.15, sy * 0.45, cos, sin);
      const [sx1, sy1] = rp(cx, cy, -r * 0.78, sy, cos, sin);
      g.moveTo(sx0, sy0).lineTo(sx1, sy1).stroke({ width: 3.2, color: 0x3b4a3e, alpha });
      g.circle(sx1, sy1, r * 0.11).fill({ color, alpha: alpha * 0.9 });
    }
    drawRotRect(g, cx, cy, -r * 0.34, -r * 0.3, r * 0.62, r * 0.6, cos, sin)
      .fill({ color: 0x263429, alpha }).stroke({ width: 1.6, color, alpha });
    const bLen = tier >= 1 ? r * 0.96 : r * 0.82;
    drawRotRect(g, cx, cy, r * 0.15, -r * 0.15, bLen, r * 0.3, cos, sin).fill({ color, alpha });
    drawRotRect(g, cx, cy, r * 0.15 + bLen - r * 0.12, -r * 0.21, r * 0.14, r * 0.42, cos, sin)
      .fill({ color: 0x263429, alpha }).stroke({ width: 1.2, color, alpha });
    g.circle(cx, cy, r * 0.18).fill({ color: tier >= 2 ? 0xff7f44 : color, alpha });
  } else if (id === 'stasis') {
    // EW Radar Jammer: tactical pedestal + curved parabolic dish + pulsing green emitter
    g.circle(cx, cy, r * 0.38).fill({ color: 0x1d2d23, alpha }).stroke({ width: 1.6, color, alpha });
    const dishPts: number[] = [];
    for (let i = -3; i <= 3; i++) {
      const ly = (i / 3) * r * 0.66;
      const lx = -r * 0.12 + 0.34 * r * Math.pow(i / 3, 2);
      const [px, py] = rp(cx, cy, lx, ly, cos, sin);
      dishPts.push(px, py);
    }
    g.moveTo(dishPts[0], dishPts[1]);
    for (let i = 2; i < dishPts.length; i += 2) g.lineTo(dishPts[i], dishPts[i + 1]);
    g.stroke({ width: 3.2, color, alpha });
    const [fx, fy] = rp(cx, cy, r * 0.46, 0, cos, sin);
    const [bx, by] = rp(cx, cy, -r * 0.1, 0, cos, sin);
    g.moveTo(bx, by).lineTo(fx, fy).stroke({ width: 1.8, color: 0xb8ebd0, alpha });
    g.circle(fx, fy, r * (tier >= 2 ? 0.24 : 0.18)).fill({ color: tier >= 2 ? 0xffffff : color, alpha });
  } else if (id === 'railgun') {
    // M1 Abrams AT: angular chobham turret + rear bustle rack + long slim 120mm sabot cannon
    const hullCoords: [number, number][] = [
      [0.48, -0.22], [0.48, 0.22], [-0.12, 0.46], [-0.56, 0.38], [-0.56, -0.38], [-0.12, -0.46],
    ];
    const pts: number[] = [];
    for (const [lx, ly] of hullCoords) {
      const [px, py] = rp(cx, cy, lx * r, ly * r, cos, sin);
      pts.push(px, py);
    }
    g.poly(pts).fill({ color: 0x26362c, alpha }).stroke({ width: 1.8, color, alpha });
    drawRotRect(g, cx, cy, -r * 0.72, -r * 0.3, r * 0.16, r * 0.6, cos, sin)
      .stroke({ width: 1.4, color, alpha: alpha * 0.85 });
    const barrelLen = r * (tier >= 1 ? 1.14 : 0.98);
    drawRotRect(g, cx, cy, r * 0.22, -r * 0.08, barrelLen, r * 0.16, cos, sin).fill({ color, alpha });
    drawRotRect(g, cx, cy, r * 0.58, -r * 0.13, r * 0.2, r * 0.26, cos, sin)
      .fill({ color: 0xffffff, alpha: alpha * 0.75 });
  } else if (id === 'swarm') {
    // Patriot SAM: angled boxy 4-tube missile launcher rack with red/white nosecones
    g.circle(cx, cy, r * 0.5).fill({ color: 0x223228, alpha }).stroke({ width: 1.4, color, alpha: alpha * 0.8 });
    drawRotRect(g, cx, cy, -r * 0.48, -r * 0.52, r * 0.96, r * 1.04, cos, sin)
      .fill({ color: 0x19271f, alpha }).stroke({ width: 1.8, color, alpha });
    const offs: [number, number][] = [[0.18, -0.24], [0.18, 0.24], [-0.18, -0.24], [-0.18, 0.24]];
    for (const [ox, oy] of offs) {
      const [px, py] = rp(cx, cy, r * ox, r * oy, cos, sin);
      g.circle(px, py, r * 0.16).fill({ color: 0xffffff, alpha: alpha * 0.95 });
      g.circle(px, py, r * 0.09).fill({ color: 0xe04848, alpha });
    }
  }
}

function drawTurretHead(
  g: Graphics, id: string, cx: number, cy: number, r: number, color: number, rot: number, tier: number, alpha = 1, themeId: ThemeId = 'space',
): void {
  if (themeId === 'military') {
    drawMilitaryTurretHead(g, id, cx, cy, r, color, rot, tier, alpha);
    return;
  }
  const cos = Math.cos(rot), sin = Math.sin(rot);
  if (id === 'pulse') {
    g.circle(cx, cy, r * 0.54).fill({ color, alpha });
    g.circle(cx, cy, r * 0.24).fill({ color: C.space, alpha: alpha * 0.85 });
    const len = tier >= 1 ? r * 0.95 : r * 0.78;
    const w = tier >= 2 ? r * 0.24 : r * 0.2;
    drawRotRect(g, cx, cy, r * 0.12, -r * 0.42, len, w, cos, sin).fill({ color, alpha });
    drawRotRect(g, cx, cy, r * 0.12, r * 0.42 - w, len, w, cos, sin).fill({ color, alpha });
    if (tier >= 2) g.circle(cx, cy, r * 0.16).fill({ color: 0xffffff, alpha: alpha * 0.9 });
  } else if (id === 'plasma') {
    const pts: number[] = [];
    for (let i = 0; i < 6; i++) {
      const a = rot + (Math.PI / 3) * i;
      pts.push(cx + Math.cos(a) * r * 0.72, cy + Math.sin(a) * r * 0.72);
    }
    g.poly(pts).fill({ color, alpha });
    drawRotRect(g, cx, cy, r * 0.05, -r * 0.28, r * 0.85, r * 0.56, cos, sin).fill({ color, alpha });
    g.circle(cx, cy, r * 0.34).fill({ color: C.space, alpha: alpha * 0.88 });
    g.circle(cx, cy, r * 0.18).fill({ color: tier >= 2 ? 0xff7f44 : color, alpha });
  } else if (id === 'stasis') {
    g.circle(cx, cy, r * 0.84).stroke({ width: 2, color, alpha });
    g.circle(cx, cy, r * 0.52).stroke({ width: 1.8, color, alpha });
    for (let i = 0; i < 3; i++) {
      const a = rot + (Math.PI * 2 * i) / 3;
      g.moveTo(cx + Math.cos(a) * r * 0.3, cy + Math.sin(a) * r * 0.3)
        .lineTo(cx + Math.cos(a) * r * 0.85, cy + Math.sin(a) * r * 0.85)
        .stroke({ width: 2, color, alpha });
    }
    g.circle(cx, cy, r * (tier >= 2 ? 0.28 : 0.22)).fill({ color: tier >= 2 ? 0xffffff : color, alpha });
  } else if (id === 'railgun') {
    g.circle(cx, cy, r * 0.48).fill({ color, alpha });
    const railLen = r * (tier >= 1 ? 1.18 : 1.05);
    drawRotRect(g, cx, cy, -r * 0.15, -r * 0.32, railLen, r * 0.18, cos, sin).fill({ color, alpha });
    drawRotRect(g, cx, cy, -r * 0.15, r * 0.14, railLen, r * 0.18, cos, sin).fill({ color, alpha });
    drawRotRect(g, cx, cy, r * 0.1, -r * 0.07, railLen * 0.65, r * 0.14, cos, sin).fill({ color: 0xffffff, alpha: alpha * 0.75 });
  } else if (id === 'swarm') {
    drawRotRect(g, cx, cy, -r * 0.52, -r * 0.56, r * 1.04, r * 1.12, cos, sin).fill({ color: C.panel, alpha }).stroke({ width: 1.8, color, alpha });
    const offs: [number, number][] = [[0.14, -0.26], [0.14, 0.26], [-0.22, -0.26], [-0.22, 0.26]];
    for (const [ox, oy] of offs) {
      const [px, py] = rp(cx, cy, r * ox, r * oy, cos, sin);
      g.circle(px, py, r * 0.16).fill({ color, alpha });
    }
    const [tipX, tipY] = rp(cx, cy, r * 0.55, 0, cos, sin);
    g.circle(tipX, tipY, r * 0.12).fill({ color: 0xffffff, alpha: alpha * 0.8 });
  }
}

function drawIcon(g: Graphics, id: string, cx: number, cy: number, r: number, color: number, alpha = 1, rot = -Math.PI / 2, themeId: ThemeId = 'space'): void {
  drawTurretHead(g, id, cx, cy, r, color, rot, 0, alpha, themeId);
}

function drawDashedLine(g: Graphics, x1: number, y1: number, x2: number, y2: number, color: number, alpha: number, dash = 8, gap = 6): void {
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
  if (len < 1) return;
  const ux = dx / len, uy = dy / len;
  for (let d = 0; d < len; d += dash + gap) {
    const e = Math.min(len, d + dash);
    g.moveTo(x1 + ux * d, y1 + uy * d).lineTo(x1 + ux * e, y1 + uy * e);
  }
  g.stroke({ width: 2, color, alpha });
}

function hash(a: number, b: number): number {
  let h = Math.imul(a * 73856093 ^ b * 19349663, 2654435761) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0;
  return (h >>> 0) / 4294967296;
}

interface DockView {
  container: Container;
  borderG: Graphics;
  wallet: Text;
  chipG: Graphics;
  chipText: Text;
  last: string;
  slots: Container[];
  aff: boolean[];
  chipAff: boolean;
  player: number;
}
interface ButtonView<T extends ButtonId = ButtonId> { id: T; rect: Rect; bg: Graphics; label: Text; state: string; text: string }
interface Toast { text: Text; ttl: number }
interface RadialView {
  container: Container;
  g: Graphics;
  btns: { title: Text; sub: Text; desc: Text }[];
}
interface FlyingChip {
  active: boolean;
  fromX: number; fromY: number; toX: number; toY: number;
  t: number; dur: number; amount: number; color: number;
}

export class Renderer {
  readonly world = new Container();
  private stageBg = new Container();
  private boardRoot = new Container();
  private bg = new Container();
  private craterLayer = new Container();
  private routeG = new Graphics();
  private routePulseG = new Graphics();
  private mineLayer = new Container();
  private towerBaseG = new Graphics();
  private towerHeadG = new Graphics();
  private milTowerLayer = new Container();
  private enemyShadowG = new Graphics();
  private enemyLayer = new Container();
  private onMapHudLayer = new Container();
  private fxGlow = new Graphics();
  private fx = new Graphics();
  private stormG = new Graphics();
  private ghostG = new Graphics();
  private dockLayer = new Container();
  private radialLayer = new Container();
  private hudLayer = new Container();
  private settingsLayer = new Container();
  private fxTextLayer = new Container();
  private toastLayer = new Container();

  private milTex: MilitaryTextureSet;
  private theaterTex: Record<'naval' | 'mars' | 'medieval' | 'kitchen' | 'lawn', TheaterTextureSet>;
  private craters: { sprite: Sprite; ttl: number; max: number }[] = [];
  private mineSprites: Sprite[] = [];
  private milTowers: { container: Container; base: Sprite; head: Sprite; badge: Graphics }[] = [];
  private lastGameTime = 0;

  private sprites: Sprite[] = [];
  private hpBars: Graphics[] = [];
  private chipG = new Graphics();
  private textures = new Map<string, Texture>();
  private dockViews: DockView[] = [];
  private buttons: ButtonView<HudButtonId>[] = [];
  private settingsButtons: ButtonView<SettingsButtonId>[] = [];
  private settingsBackdropG = new Graphics();
  private settingsTitle = mkText('SETTINGS & MATCH', 15, C.ice, { bold: true });
  private settingsTip = mkText(SETTINGS_TIP_DESKTOP, 11, C.ice, { align: 'center' });
  private settingsModalKey = '';
  private settingsStatus = mkText('', 11, C.ice, { bold: true, align: 'center' });

  private healthG = new Graphics();
  private healthText = mkText('', 11, 0xffffff, { bold: true });
  private lastLives = 0;
  private damageFlash = 0;
  private healthKey = '';

  private wavePillG = new Graphics();
  private wavePillText = mkText('', 11.5, C.ice, { bold: true });
  private waveDiffText = mkText('', 9.5, C.ice, { bold: true });
  private waveSpeedText = mkText('2x', 9.5, C.mint, { bold: true });
  private wavePillKey = '';

  private toasts: Toast[] = [];
  private popupPool: Text[] = [];
  private radialPool: RadialView[] = [];
  private flyingChips: FlyingChip[] = [];
  private chipLabels: Text[] = [];
  private routePaths: { x: number; y: number }[][] = [];
  private routePhase = 0;

  private statsText = mkText('', 13.5, C.ice);
  private banner = mkText('', 44, C.ice, { bold: true });
  private summaryCard = new Container();
  private summaryBg = new Graphics();
  private summaryTitle = mkText('', 30, C.mint, { bold: true, align: 'center' });
  private summarySub = mkText('', 14, C.ice, { align: 'center' });
  private summaryStats = mkText('', 14, C.ice, { bold: true, align: 'center' });
  private summaryPlayers = mkText('', 13.5, C.gold, { bold: true, align: 'center' });
  private summaryScore = mkText('', 13, C.ice, { align: 'center' });
  private summaryButtons: ButtonView<SummaryButtonId>[] = [];
  private bossBarG = new Graphics();
  private bossLabel = mkText('DREADNOUGHT', 12, 0xffffff, { bold: true });
  private stormAlertG = new Graphics();
  private stormAlertText = mkText('DUST STORM · RANGE -20% (VENTS/T2 IMMUNE)', 11, 0xffd394, { bold: true });

  private bannerKey = '';
  private summaryKey = '';
  private statsKey = '';
  private statsTimer = 0;
  private fps = 60;
  private mapSeen = -1;
  private towerSeen = -1;
  private pathSeen = -1;
  private tc = new Map<string, number>();

  constructor(
    private app: Application,
    private game: Game,
    private input: InputController,
    private getLayout: () => LayoutDef,
    private isMuted: () => boolean = () => false,
    private mapTextures: Partial<Record<MapTheme, Texture | null>> = {},
    private showStats: () => boolean = () => false,
    private getScore: () => ScoreResult | null = () => null,
    private pwa: PwaView | null = null,
  ) {
    for (const t of game.data.turrets) this.tc.set(t.id, hex(t.color));
    this.milTex = buildMilitaryTextures();
    this.theaterTex = {
      naval: buildTheaterTextures('naval'),
      mars: buildTheaterTextures('mars'),
      medieval: buildTheaterTextures('medieval'),
      kitchen: buildTheaterTextures('kitchen'),
      lawn: buildTheaterTextures('lawn'),
    };
    this.lastLives = game.lives;
    this.routePulseG.blendMode = 'add';
    this.fxGlow.blendMode = 'add';
    this.boardRoot.addChild(
      this.bg, this.craterLayer, this.routeG, this.routePulseG, this.mineLayer,
      this.towerBaseG, this.towerHeadG, this.milTowerLayer,
      this.enemyShadowG, this.enemyLayer, this.fxGlow, this.fx, this.stormG,
    );
    this.world.addChild(
      this.stageBg, this.boardRoot, this.onMapHudLayer, this.ghostG,
      this.dockLayer, this.radialLayer, this.hudLayer,
      this.settingsLayer, this.fxTextLayer, this.toastLayer,
    );
    app.stage.addChild(this.world);
    this.buildEnemyTextures();
    this.buildHud();
    this.buildSettingsModal();
    this.buildPools();
    this.setLayout(getLayout());
  }

  private buildPools(): void {
    const board = this.getLayout().board;
    for (let i = 0; i < 6; i++) {
      const t = mkText('', 16, C.mint, { bold: true });
      t.anchor.set(0.5); t.visible = false;
      this.toastLayer.addChild(t);
      this.toasts.push({ text: t, ttl: 0 });
    }
    this.banner.anchor.set(0.5);
    this.banner.position.set(board.x + board.w / 2, board.y + board.h / 2);
    this.hudLayer.addChild(this.banner);

    const cardR = summaryCardRect(this.getLayout());
    const cardCx = cardR.x + cardR.w / 2;
    const cardCy = cardR.y + cardR.h / 2;
    this.summaryCard.position.set(cardCx, cardCy);
    this.summaryCard.visible = false;
    this.summaryTitle.anchor.set(0.5); this.summaryTitle.position.set(0, -86);
    this.summarySub.anchor.set(0.5); this.summarySub.position.set(0, -52);
    this.summaryStats.anchor.set(0.5); this.summaryStats.position.set(0, -14);
    this.summaryPlayers.anchor.set(0.5); this.summaryPlayers.position.set(0, 18);
    this.summaryScore.anchor.set(0.5); this.summaryScore.position.set(0, 44);
    this.summaryCard.addChild(
      this.summaryBg, this.summaryTitle, this.summarySub, this.summaryStats, this.summaryPlayers, this.summaryScore,
    );
    const sumRects = summaryButtonRects(this.getLayout());
    for (const id of SUMMARY_BUTTON_IDS) {
      const rect = sumRects[id];
      const bg = new Graphics();
      const label = mkText(this.buttonLabel(id), 14, C.ice, { bold: true });
      label.anchor.set(0.5);
      label.position.set(rect.x + rect.w / 2 - cardCx, rect.y + rect.h / 2 - cardCy);
      this.summaryCard.addChild(bg, label);
      this.summaryButtons.push({ id, rect, bg, label, state: '', text: label.text });
    }
    this.applySummaryTypography(this.getLayout());
    this.hudLayer.addChild(this.summaryCard);

    this.bossLabel.anchor.set(0.5, 0);
    this.bossLabel.position.set(board.x + board.w / 2, board.y + 8);
    this.bossLabel.visible = false;
    this.stormAlertText.anchor.set(0.5, 0.5);
    this.stormAlertText.visible = false;
    this.stormAlertG.visible = false;
    this.hudLayer.addChild(this.bossBarG, this.bossLabel);
    this.onMapHudLayer.addChild(this.stormAlertG, this.stormAlertText);

    for (let i = 0; i < 4; i++) {
      const container = new Container();
      container.visible = false;
      const g = new Graphics();
      container.addChild(g);
      const btns: { title: Text; sub: Text; desc: Text }[] = [];
      for (let b = 0; b < 3; b++) {
        const title = mkText('', 11, C.ice, { bold: true });
        const sub = mkText('', 12, C.gold, { bold: true });
        const desc = mkText('', 9, C.ice);
        title.anchor.set(0.5); sub.anchor.set(0.5); desc.anchor.set(0.5);
        container.addChild(title, sub, desc);
        btns.push({ title, sub, desc });
      }
      this.radialLayer.addChild(container);
      this.radialPool.push({ container, g, btns });
    }

    this.fxTextLayer.addChild(this.chipG);
    for (let i = 0; i < 8; i++) {
      this.flyingChips.push({ active: false, fromX: 0, fromY: 0, toX: 0, toY: 0, t: 0, dur: 0.35, amount: 0, color: C.cyan });
      const lbl = mkText('', 12, 0xffffff, { bold: true });
      lbl.anchor.set(0.5); lbl.visible = false;
      this.fxTextLayer.addChild(lbl);
      this.chipLabels.push(lbl);
    }

    for (let i = 0; i < 36; i++) {
      const sp = new Sprite(this.milTex.crater);
      sp.anchor.set(0.5);
      sp.visible = false;
      this.craterLayer.addChild(sp);
      this.craters.push({ sprite: sp, ttl: 0, max: 18 });
    }
  }

  private clearCraters(): void {
    for (const c of this.craters) {
      c.ttl = 0;
      c.sprite.visible = false;
    }
  }

  private stampCrater(wx: number, wy: number, radiusPx: number): void {
    // Avoid double-stamping the same pooled explosion ring on consecutive frames
    for (const c of this.craters) {
      if (c.ttl > c.max - 0.12 && Math.hypot(c.sprite.x - wx, c.sprite.y - wy) < 6) return;
    }
    let slot = this.craters.find(c => c.ttl <= 0);
    if (!slot) {
      slot = this.craters[0];
      for (const c of this.craters) if (c.ttl < slot.ttl) slot = c;
    }
    const size = Math.max(22, Math.min(48, radiusPx * 0.9));
    slot.max = 18;
    slot.ttl = 18;
    slot.sprite.position.set(wx, wy);
    slot.sprite.width = size;
    slot.sprite.height = size;
    slot.sprite.rotation = Math.random() * Math.PI * 2;
    slot.sprite.alpha = 0.55;
    slot.sprite.visible = true;
  }

  applyViewport(scale: number, ox: number, oy: number): void {
    this.world.scale.set(scale);
    this.world.position.set(ox, oy);
  }

  toast(msg: string, wx: number, wy: number, good: boolean): void {
    const l = this.getLayout();
    const sw = l.stageW, sh = l.stageH, b = l.board;
    const tx = Math.min(Math.max(wx, 80), sw - 80);
    let ty = Math.min(Math.max(wy - 36, 20), sh - 20);
    let slot: Toast | null = null;
    const nearCenter = Math.abs(wx - (b.x + b.w / 2)) < 40 && Math.abs(wy - (b.y + b.h / 2)) < 40;
    for (const t of this.toasts) {
      if (t.ttl > 0 && Math.abs(t.text.x - tx) < 120 && Math.abs(t.text.y - ty) < 26) {
        if (nearCenter) { slot = t; break; }
        ty = Math.max(20, ty - 24);
      }
    }
    if (!slot) {
      slot = this.toasts[0];
      for (const t of this.toasts) if (t.ttl < slot.ttl) slot = t;
    }
    slot.text.text = msg;
    slot.text.style.fill = good ? C.mint : C.coral;
    slot.text.position.set(tx, ty);
    slot.text.visible = true; slot.text.alpha = 1; slot.ttl = 1.3;
  }

  spawnCreditChip(_fromPlayer: number, toPlayer: number, amount: number, fromX: number, fromY: number, toX: number, toY: number): void {
    let slot = this.flyingChips.find(c => !c.active);
    if (!slot) slot = this.flyingChips[0];
    slot.active = true;
    slot.fromX = fromX; slot.fromY = fromY;
    slot.toX = toX; slot.toY = toY;
    slot.t = 0; slot.dur = 0.36;
    slot.amount = amount;
    slot.color = PLAYER_COLORS[toPlayer] ?? C.cyan;
  }

  private theme(): TheaterTheme {
    return getTheater(this.game.currentMap.theme);
  }

  private activeSprites(themeId: ThemeId = this.theme().id): TheaterTextureSet | null {
    if (themeId === 'military') return this.milTex;
    if (themeId === 'naval' || themeId === 'mars' || themeId === 'medieval' || themeId === 'kitchen' || themeId === 'lawn') {
      return this.theaterTex[themeId];
    }
    return null;
  }

  private turretColor(id: string): number {
    return this.theme().turrets[id]?.color ?? this.tc.get(id) ?? C.cyan;
  }

  private syncBoardRoot(layout: LayoutDef): void {
    if (layout.boardRotated) {
      this.boardRoot.position.set(layout.board.x + layout.board.w, layout.board.y);
      this.boardRoot.rotation = Math.PI / 2;
    } else {
      this.boardRoot.position.set(layout.board.x, layout.board.y);
      this.boardRoot.rotation = 0;
    }
  }

  // ---------- static scene ----------
  private buildBoard(): void {
    this.mapSeen = this.game.mapVersion;
    this.clearCraters();
    for (const c of this.stageBg.removeChildren()) c.destroy();
    for (const c of this.bg.removeChildren()) c.destroy();
    const map = this.game.currentMap;
    const theme = this.theme();
    const hasSprites = theme.id !== 'space';
    const sprites = this.activeSprites(theme.id);
    const mapTex = this.mapTextures[theme.id] ?? null;
    const l = this.getLayout();
    const sw = l.stageW, sh = l.stageH;
    const rotated = !!l.boardRotated;
    this.syncBoardRoot(l);

    const stageG = new Graphics();
    stageG.rect(0, 0, sw, sh).fill(theme.spaceBg);
    this.stageBg.addChild(stageG);

    const g = new Graphics();
    g.rect(0, 0, BOARD_W, BOARD_H).fill({ color: theme.boardBg });
    this.bg.addChild(g);

    const avgExitY = map.exits.reduce((s, [, y]) => s + y, 0) / Math.max(1, map.exits.length);
    const ex = BOARD_W + 34, ey = (avgExitY + 0.5) * CELL;

    if (hasSprites && mapTex) {
      const sat = new Sprite(mapTex);
      sat.position.set(0, 0);
      sat.width = BOARD_W;
      sat.height = BOARD_H;
      const wash = new Graphics();
      wash.rect(0, 0, BOARD_W, BOARD_H).fill({ color: 0x0a0f0c, alpha: 0.07 });
      this.bg.addChild(sat, wash);
    } else if (theme.id === 'military') {
      const terrain = new Graphics();
      // Subtle green-olive topo contour arcs & range rings centered on Seattle
      const seattleCx = BOARD_W - 34, seattleCy = ey;
      for (let i = 1; i <= 5; i++) {
        terrain.circle(seattleCx, seattleCy, 95 + i * 115).stroke({ width: 1.2, color: 0x2c4738, alpha: 0.34 });
      }
      // Faint topo contour loops across landmass
      for (let i = 0; i < 6; i++) {
        const cx = (0.25 + hash(i, 11) * 0.55) * BOARD_W;
        const cy = (0.18 + hash(i, 12) * 0.64) * BOARD_H;
        terrain.ellipse(cx, cy, 48 + i * 14, 26 + i * 9).stroke({ width: 1, color: 0x2b4536, alpha: 0.32 });
      }

      // Puget Sound & Pacific coastal water on the western edge
      const westCoast = [
        0, 0,
        CELL * 2.1, 0,
        CELL * 1.85, BOARD_H * 0.18,
        CELL * 2.25, BOARD_H * 0.34,
        CELL * 1.55, BOARD_H * 0.52,
        CELL * 2.15, BOARD_H * 0.72,
        CELL * 1.65, BOARD_H * 0.88,
        CELL * 2.0, BOARD_H,
        0, BOARD_H,
      ];
      terrain.poly(westCoast).fill({ color: 0x0c2433, alpha: 0.92 });
      terrain.moveTo(westCoast[2], westCoast[3]);
      for (let i = 4; i < westCoast.length - 2; i += 2) terrain.lineTo(westCoast[i], westCoast[i + 1]);
      terrain.stroke({ width: 2, color: 0x4a7b8c, alpha: 0.45 });

      // Elliott Bay / Puget Sound shoreline on the right around Seattle
      const rx = BOARD_W;
      const bay = [
        rx, 0,
        rx - CELL * 2.3, 0,
        rx - CELL * 1.9, BOARD_H * 0.22,
        rx - CELL * 2.6, BOARD_H * 0.38,
        rx - CELL * 1.7, BOARD_H * 0.52,
        rx - CELL * 2.4, BOARD_H * 0.7,
        rx - CELL * 1.85, BOARD_H * 0.86,
        rx - CELL * 2.2, BOARD_H,
        rx, BOARD_H,
      ];
      terrain.poly(bay).fill({ color: 0x0c2433, alpha: 0.9 });
      terrain.moveTo(bay[2], bay[3]);
      for (let i = 4; i < bay.length - 2; i += 2) terrain.lineTo(bay[i], bay[i + 1]);
      terrain.stroke({ width: 2, color: 0x4a7b8c, alpha: 0.45 });

      // Emerald City landmass peninsula on the right edge
      const penX = rx - CELL * 1.55;
      terrain.ellipse(rx - 10, ey, CELL * 1.65, CELL * 3.4).fill({ color: 0x1b3626, alpha: 0.95 })
        .stroke({ width: 1.5, color: 0x4a7b8c, alpha: 0.5 });

      // Seattle skyline blocks
      const skyBlocks: [number, number, number, number][] = [
        [-28, -32, 12, 22], [-14, -42, 11, 34], [2, -26, 13, 20],
        [-26, 14, 14, 18], [-8, 12, 12, 24], [8, 8, 10, 22],
      ];
      for (const [bx, by, bw, bh] of skyBlocks) {
        terrain.rect(rx + bx - 16, ey + by, bw, bh).fill({ color: 0x264434, alpha: 0.92 })
          .stroke({ width: 1, color: 0x62d99a, alpha: 0.35 });
      }

      // Procedural Space Needle silhouette
      const snx = penX + 18, sny = ey - 4;
      terrain.circle(snx, sny + 26, 18).fill({ color: 0x62d99a, alpha: 0.1 });
      // Tapered tripod base
      terrain.moveTo(snx - 13, sny + 34).lineTo(snx - 4, sny + 4)
        .moveTo(snx + 13, sny + 34).lineTo(snx + 4, sny + 4)
        .moveTo(snx, sny + 34).lineTo(snx, sny + 4)
        .stroke({ width: 2.2, color: 0xc8d9c0, alpha: 0.92 });
      // Slender tower shaft
      terrain.rect(snx - 2.5, sny - 22, 5, 28).fill({ color: 0xb7ccb0, alpha: 0.95 });
      // Saucer observation deck
      terrain.ellipse(snx, sny - 22, 17, 4.5).fill({ color: 0x2b4a3a }).stroke({ width: 1.8, color: 0xd9e8d2 });
      terrain.ellipse(snx, sny - 25, 11, 2.6).fill({ color: 0x62d99a, alpha: 0.7 });
      // Spire + beacon
      terrain.moveTo(snx, sny - 27).lineTo(snx, sny - 44).stroke({ width: 2, color: 0xe6f2e0 });
      terrain.circle(snx, sny - 45, 2.4).fill({ color: 0x62d99a });

      const pad = 2000;
      const cover = new Graphics();
      cover.rect(-pad, -pad, BOARD_W + pad * 2, pad).fill(theme.spaceBg);
      cover.rect(-pad, BOARD_H, BOARD_W + pad * 2, pad).fill(theme.spaceBg);
      cover.rect(-pad, 0, pad, BOARD_H).fill(theme.spaceBg);
      cover.rect(BOARD_W, 0, pad, BOARD_H).fill(theme.spaceBg);
      this.bg.addChild(terrain, cover);
    } else {
      // orbital rings + Earth, masked to the board via outer cover bands
      const orbit = new Graphics();
      for (let i = 1; i <= 5; i++) orbit.circle(ex, ey, 150 + i * 105).stroke({ width: 1.5, color: C.ice, alpha: 0.07 });
      for (let i = 0; i < 80; i++) {
        const sx = hash(i + this.game.mapIndex * 97, 1) * BOARD_W;
        const sy = hash(i + this.game.mapIndex * 97, 2) * BOARD_H;
        orbit.circle(sx, sy, 0.6 + hash(i, 3) * 1.1).fill({ color: C.ice, alpha: 0.14 + hash(i, 4) * 0.32 });
      }
      orbit.circle(ex, ey, 196).fill({ color: 0x3d8de0, alpha: 0.10 });
      orbit.circle(ex, ey, 174).fill({ color: 0x4aa3ff, alpha: 0.18 });
      orbit.circle(ex, ey, 152).fill(0x1c5aa6);
      orbit.circle(ex, ey, 146).fill(0x1f6fc2);
      const land: number[][] = [
        [-120, -60, -80, -110, -30, -90, -20, -40, -70, -10, -110, -20],
        [-60, 40, -10, 20, 20, 60, -10, 110, -50, 100],
        [-140, 40, -110, 60, -120, 90, -150, 80],
      ];
      for (const poly of land) orbit.poly(poly.map((v, i) => (i % 2 ? ey + v : ex + v))).fill({ color: 0x4fae78, alpha: 0.9 });
      orbit.circle(ex - 40, ey - 70, 60).fill({ color: 0xffffff, alpha: 0.06 });

      const pad = 2000;
      const cover = new Graphics();
      cover.rect(-pad, -pad, BOARD_W + pad * 2, pad).fill(theme.spaceBg);
      cover.rect(-pad, BOARD_H, BOARD_W + pad * 2, pad).fill(theme.spaceBg);
      cover.rect(-pad, 0, pad, BOARD_H).fill(theme.spaceBg);
      cover.rect(BOARD_W, 0, pad, BOARD_H).fill(theme.spaceBg);
      this.bg.addChild(orbit, cover);
    }

    // grid
    const grid = new Graphics();
    const minorGridAlpha = theme.id === 'kitchen' ? 0.14 : hasSprites ? 0.08 : 0.55;
    const majorGridAlpha = theme.id === 'kitchen' ? 0.22 : hasSprites ? 0.16 : 0.95;
    for (let x = 0; x <= GRID_W; x++) grid.moveTo(x * CELL, 0).lineTo(x * CELL, BOARD_H);
    for (let y = 0; y <= GRID_H; y++) grid.moveTo(0, y * CELL).lineTo(BOARD_W, y * CELL);
    grid.stroke({ width: 1, color: theme.gridColor, alpha: minorGridAlpha });
    for (let x = 0; x <= GRID_W; x += 4) grid.moveTo(x * CELL, 0).lineTo(x * CELL, BOARD_H);
    for (let y = 0; y <= GRID_H; y += 4) grid.moveTo(0, y * CELL).lineTo(BOARD_W, y * CELL);
    grid.stroke({ width: hasSprites ? 1 : 1.5, color: theme.gridColor, alpha: majorGridAlpha });
    grid.rect(0, 0, BOARD_W, BOARD_H).stroke({
      width: 2,
      color: theme.id === 'military' ? 0x687a6e : theme.borderColor,
      alpha: hasSprites ? 0.85 : 0.35,
    });
    this.bg.addChild(grid);

    // obstacles: asteroids (space) or illustrated terrain obstacles (military/naval/mars/medieval/kitchen/lawn)
    if (hasSprites && sprites && sprites.obstacles.length > 0) {
      const obsAlpha = theme.id === 'naval' ? 0.62 : (theme.id === 'kitchen' || theme.id === 'lawn') ? 0.85 : 0.92;
      for (const [ax, ay] of map.asteroids) {
        const cx = (ax + 0.5) * CELL, cy = (ay + 0.5) * CELL;
        const obs = new Sprite(sprites.obstacles[(ax * 7 + ay * 13) % sprites.obstacles.length]);
        obs.anchor.set(0.5);
        obs.position.set(cx, cy);
        obs.width = CELL * 1.18;
        obs.height = CELL * 1.18;
        obs.alpha = obsAlpha;
        obs.rotation = 0;
        obs.scale.x *= (ax + ay) % 2 ? -1 : 1;
        this.bg.addChild(obs);
      }
    } else {
      const ast = new Graphics();
      for (const [ax, ay] of map.asteroids) {
        const cx = (ax + 0.5) * CELL, cy = (ay + 0.5) * CELL;
        const pts: number[] = [];
        const n = 9;
        for (let i = 0; i < n; i++) {
          const a = (Math.PI * 2 * i) / n + hash(ax, ay + i) * 0.3;
          const r = CELL * (0.38 + hash(ax * 7 + i, ay) * 0.14);
          pts.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        }
        ast.poly(pts).fill(0x3a4658).stroke({ width: 1.5, color: 0x7d90a6, alpha: 0.9 });
        ast.circle(cx - 5, cy - 4, 3.2).fill({ color: 0x2a3443, alpha: 0.9 });
        ast.circle(cx + 6, cy + 5, 2.2).fill({ color: 0x2a3443, alpha: 0.9 });
      }
      this.bg.addChild(ast);
    }

    // boost cells (Mars Geothermal Vents, Medieval Arcane Runes, Kitchen Stove Burners, Lawn Patio Pads)
    if (map.boostCells?.length) {
      const boostCol = theme.id === 'kitchen' ? 0xff8c2b
        : theme.id === 'lawn' ? 0xc8f052
        : theme.id === 'mars' ? 0xffa64d
        : 0x62f2ff;
      const boostLabel = theme.boostLabel ?? '+PWR';
      const boostG = new Graphics();
      this.bg.addChild(boostG);
      for (const [bx, by] of map.boostCells) {
        const cx = (bx + 0.5) * CELL, cy = (by + 0.5) * CELL;
        if (sprites?.boost) {
          const sp = new Sprite(sprites.boost);
          sp.anchor.set(0.5);
          sp.position.set(cx, cy);
          sp.width = CELL * 1.08;
          sp.height = CELL * 1.08;
          sp.alpha = 0.95;
          this.bg.addChild(sp);
        } else {
          boostG.circle(cx, cy, CELL * 0.4).stroke({ width: 1.8, color: boostCol, alpha: 0.75 });
        }
        const tag = mkText(boostLabel, 7.5, boostCol, { bold: true });
        tag.anchor.set(0.5);
        const pw = Math.max(28, Math.ceil(tag.width) + 8);
        const pillG = new Graphics();
        pillG.roundRect(-pw / 2, -5, pw, 10, 3)
          .fill({ color: 0x0b0f14, alpha: 0.85 })
          .stroke({ width: 0.8, color: boostCol, alpha: 0.7 });
        const tagC = new Container();
        tagC.addChild(pillG, tag);
        tagC.rotation = rotated ? -Math.PI / 2 : 0;
        tagC.position.set(cx + (rotated ? CELL * 0.24 + 5 : 0), cy + (rotated ? 0 : CELL * 0.24 + 5));
        this.bg.addChild(tagC);
      }
    }

    // portals / beachheads + objective gates
    const por = new Graphics();
    this.bg.addChild(por);
    for (const [sx, sy] of map.spawns) {
      const cx = (sx + 0.5) * CELL, cy = (sy + 0.5) * CELL;
      const lblC = new Container();
      if (hasSprites) {
        por.circle(cx, cy, 15).fill({ color: 0x120909, alpha: 0.78 }).stroke({ width: 1.8, color: 0xd94c4c, alpha: 0.92 });
        // Crimson tactical invasion chevrons pointing local +x (right on desktop, down on phone)
        por.moveTo(cx - 6, cy - 5).lineTo(cx - 1, cy).lineTo(cx - 6, cy + 5)
          .moveTo(cx + 1, cy - 5).lineTo(cx + 6, cy).lineTo(cx + 1, cy + 5)
          .stroke({ width: 2, color: 0xff7575, alpha: 0.95 });
        const inl = mkText(theme.spawnLabel, 10, 0xff9a9a, { bold: true });
        inl.anchor.set(0.5);
        const pw = inl.width + 10, ph = 15;
        const pill = new Graphics();
        pill.roundRect(-pw / 2, -ph / 2, pw, ph, 4)
          .fill({ color: 0x120909, alpha: 0.85 })
          .stroke({ width: 1, color: 0xd94c4c, alpha: 0.7 });
        lblC.addChild(pill, inl);
        if (rotated) {
          lblC.rotation = -Math.PI / 2;
          const lx = sx <= 1 ? (sx + 1) * CELL + 4 + ph / 2 : sx * CELL - 4 - ph / 2;
          const ly = Math.min(Math.max(cy, pw / 2 + 4), BOARD_H - pw / 2 - 4);
          lblC.position.set(lx, ly);
        } else {
          const ly = sy <= 1 ? (sy + 1) * CELL + 4 + ph / 2 : sy * CELL - 18 + ph / 2;
          const lx = Math.min(Math.max(sx * CELL + 2 + pw / 2, pw / 2 + 4), BOARD_W - pw / 2 - 4);
          lblC.position.set(lx, ly);
        }
      } else {
        por.circle(cx, cy, 15).fill({ color: 0x6a4cf0, alpha: 0.35 });
        por.circle(cx, cy, 13).stroke({ width: 2, color: C.violet });
        por.circle(cx, cy, 8).stroke({ width: 2, color: C.cyan, alpha: 0.9 });
        por.circle(cx, cy, 3).fill(C.ice);
        const inl = mkText(theme.spawnLabel, 10.5, C.violet, { bold: true });
        inl.anchor.set(0.5);
        lblC.addChild(inl);
        if (rotated) {
          lblC.rotation = -Math.PI / 2;
          const lx = sx <= 1 ? (sx + 1) * CELL + 10 : sx * CELL - 10;
          const ly = Math.min(Math.max(cy, inl.width / 2 + 4), BOARD_H - inl.width / 2 - 4);
          lblC.position.set(lx, ly);
        } else {
          const ly = sy <= 1 ? (sy + 1) * CELL + 9 : sy * CELL - 8;
          const lx = Math.min(Math.max(sx * CELL + 4 + inl.width / 2, inl.width / 2 + 4), BOARD_W - inl.width / 2 - 4);
          lblC.position.set(lx, ly);
        }
      }
      this.bg.addChild(lblC);
    }
    const exitColor = hasSprites ? 0xd9e87a : C.mint;
    for (const [x, y] of map.exits) {
      const rx = x * CELL, ry = y * CELL;
      if (hasSprites) {
        por.rect(rx + 2, ry + 2, CELL - 4, CELL - 4).fill({ color: 0x8be0ae, alpha: 0.08 });
        const b = 8;
        por.moveTo(rx + 2, ry + 2 + b).lineTo(rx + 2, ry + 2).lineTo(rx + 2 + b, ry + 2)
          .moveTo(rx + CELL - 2 - b, ry + 2).lineTo(rx + CELL - 2, ry + 2).lineTo(rx + CELL - 2, ry + 2 + b)
          .moveTo(rx + 2, ry + CELL - 2 - b).lineTo(rx + 2, ry + CELL - 2).lineTo(rx + 2 + b, ry + CELL - 2)
          .moveTo(rx + CELL - 2 - b, ry + CELL - 2).lineTo(rx + CELL - 2, ry + CELL - 2).lineTo(rx + CELL - 2, ry + CELL - 2 - b)
          .stroke({ width: 2.2, color: exitColor, alpha: 0.95 });
      } else {
        por.rect(rx + 2, ry + 2, CELL - 4, CELL - 4).fill({ color: exitColor, alpha: 0.22 }).stroke({ width: 2, color: exitColor });
      }
    }
    const gateC = new Container();
    if (hasSprites) {
      const minExitY = map.exits.reduce((m, [, y]) => Math.min(m, y), GRID_H);
      const minExitX = map.exits.reduce((m, [x]) => Math.min(m, x), GRID_W);
      const avgExitX = map.exits.reduce((s, [x]) => s + x, 0) / Math.max(1, map.exits.length);
      const gate = mkText(theme.objectiveLabel, 11, exitColor, { bold: true });
      gate.anchor.set(0.5, 0.5);
      const pw = gate.width + 14, ph = 18;
      const pill = new Graphics();
      pill.roundRect(-pw / 2, -ph / 2, pw, ph, 5)
        .fill({ color: 0x101712, alpha: 0.9 })
        .stroke({ width: 1.2, color: exitColor, alpha: 0.9 });
      gateC.addChild(pill, gate);
      if (rotated) {
        gateC.rotation = -Math.PI / 2;
        const lx = Math.min(BOARD_W - ph / 2 - 6, minExitX * CELL - 14);
        const ly = Math.min(Math.max((avgExitY + 0.5) * CELL, pw / 2 + 6), BOARD_H - pw / 2 - 6);
        gateC.position.set(lx, ly);
      } else {
        const px = Math.min(Math.max((avgExitX + 0.5) * CELL, pw / 2 + 6), BOARD_W - pw / 2 - 6);
        const py = Math.max(6 + ph / 2, minExitY * CELL - 20 + ph / 2);
        gateC.position.set(px, py);
      }
    } else {
      const gate = mkText(theme.objectiveLabel, 12, exitColor, { bold: true });
      gateC.addChild(gate);
      if (rotated) {
        gate.anchor.set(0.5);
        gateC.rotation = -Math.PI / 2;
        const ly = Math.min(Math.max((avgExitY + 0.5) * CELL, gate.width / 2 + 6), BOARD_H - gate.width / 2 - 6);
        gateC.position.set(BOARD_W - 46, ly);
      } else {
        gate.anchor.set(1, 0.5);
        gateC.position.set(BOARD_W - 36, (avgExitY + 0.5) * CELL - 24);
      }
    }
    this.bg.addChild(gateC);
  }

  private buildEnemyTextures(): void {
    const milTheme = getTheater('military');
    for (const themeId of ['space', 'military'] as const) {
      for (const def of this.game.data.enemies) {
        const g = new Graphics();
        if (themeId === 'military') {
          const col = milTheme.enemies[def.id]?.color ?? hex(def.color);
          if (def.id === 'cruiser') {
            // T-90M Tank: dark tracks, olive rectangular hull, rounded turret dome, long main gun, crimson stripe
            g.rect(-14, -11, 26, 4).fill(0x1a221c);
            g.rect(-14, 7, 26, 4).fill(0x1a221c);
            g.rect(-12, -8, 23, 16).fill(col).stroke({ width: 1.4, color: 0xc8d4b8, alpha: 0.85 });
            g.circle(-1, 0, 6.5).fill(0x4f6645).stroke({ width: 1.2, color: 0xdbe5cc, alpha: 0.8 });
            g.rect(4, -1.5, 14, 3).fill(0xb8c4a8);
            g.rect(-5, -2.5, 3, 5).fill(0xc93b3b);
          } else if (def.id === 'swarmer') {
            // Tigr Assault: compact fast armored truck/buggy
            g.poly([9, -3.5, 9, 3.5, 4, 5, -9, 5, -9, -5, 4, -5]).fill(col).stroke({ width: 1.1, color: 0xe3e8cc, alpha: 0.8 });
            g.rect(2, -3.5, 2.5, 7).fill({ color: 0x1b241d, alpha: 0.85 });
            g.circle(-1, 0, 1.8).fill(0x283226);
            g.rect(-6, -1.5, 2.5, 3).fill(0xc93b3b);
          } else if (def.id === 'frigate') {
            // T-14 Armata: sleek angular tracked heavy tank + wide sloped turret + cyan APS dots
            g.rect(-14, -10.5, 26, 3.5).fill(0x1a221c);
            g.rect(-14, 7, 26, 3.5).fill(0x1a221c);
            g.poly([13, -6, 13, 6, -12, 8, -12, -8]).fill(col).stroke({ width: 1.4, color: 0xd8f0e8, alpha: 0.85 });
            g.poly([7, -4.5, 7, 4.5, -7, 6, -7, -6]).fill(0x3f6e60).stroke({ width: 1.2, color: 0xffffff, alpha: 0.75 });
            g.rect(6, -1.4, 13, 2.8).fill(0xd0e8e0);
            g.circle(3, -5.5, 1.5).fill(0x52e0ff);
            g.circle(3, 5.5, 1.5).fill(0x52e0ff);
          } else if (def.id === 'phase') {
            // Su-57 Strike Jet: swept-wing twin-tail Russian stealth fighter
            g.poly([16, 0, 4, -3.5, -6, -14, -10, -14, -7, -4, -13, -5, -11, 0, -13, 5, -7, 4, -10, 14, -6, 14, 4, 3.5])
              .fill(col).stroke({ width: 1.3, color: 0xeaf2f8, alpha: 0.9 });
            g.poly([9, 0, 2, -2, 2, 2]).fill({ color: 0x1d2b3a, alpha: 0.9 });
            g.circle(-12, -2.5, 1.8).fill(0xff9b42);
            g.circle(-12, 2.5, 1.8).fill(0xff9b42);
            g.rect(-6, -10, 2.5, 3).fill(0xd13b3b);
            g.rect(-6, 7, 2.5, 3).fill(0xd13b3b);
          } else if (def.id === 'dreadnought') {
            // Kirov Siege Tank: massive twin-tracked super-heavy siege tank + twin mega-cannons
            g.rect(-21, -17, 40, 6).fill(0x1b1517).stroke({ width: 1, color: 0x6b3a3a, alpha: 0.8 });
            g.rect(-21, 11, 40, 6).fill(0x1b1517).stroke({ width: 1, color: 0x6b3a3a, alpha: 0.8 });
            g.poly([20, -10, 20, 10, -19, 13, -19, -13]).fill(col).stroke({ width: 2, color: 0xffd0d0, alpha: 0.9 });
            g.rect(-11, -8, 20, 16).fill(0x4a1c20).stroke({ width: 1.4, color: 0xffb36b, alpha: 0.85 });
            g.rect(8, -5.5, 17, 3.5).fill(0xd8c8c8);
            g.rect(8, 2, 17, 3.5).fill(0xd8c8c8);
            g.circle(-1, 0, 4).fill(0xffc16e);
          } else {
            // BTR-82 Recon: elongated 8-wheel APC hull + wheel pods + small forward turret
            g.roundRect(-13, -6, 25, 12, 3).fill(col).stroke({ width: 1.3, color: 0xd4dec2, alpha: 0.85 });
            for (const wx of [-9, -3, 3, 9]) {
              g.rect(wx - 2, -8, 4, 2.2).fill(0x1b241d);
              g.rect(wx - 2, 5.8, 4, 2.2).fill(0x1b241d);
            }
            g.circle(4, 0, 3.5).fill(0x4a5b3e).stroke({ width: 1, color: 0xd4dec2, alpha: 0.7 });
            g.rect(6, -1, 8, 2).fill(0xcfd8be);
            g.rect(-7, -2, 3.5, 4).fill(0xc93b3b);
          }
        } else {
          const col = hex(def.color);
          if (def.id === 'cruiser') {
            g.poly([15, 0, 4, -6, -6, -12, -12, -9, -9, 0, -12, 9, -6, 12, 4, 6]).fill(col).stroke({ width: 1.5, color: C.ice, alpha: 0.85 });
            g.rect(-5, -2, 9, 4).fill({ color: C.space, alpha: 0.75 });
          } else if (def.id === 'swarmer') {
            g.poly([7, 0, 0, -5, -6, 0, 0, 5]).fill(col).stroke({ width: 1, color: C.ice, alpha: 0.75 });
          } else if (def.id === 'frigate') {
            g.poly([13, 0, 3, -9, -8, -10, -11, -4, -7, 0, -11, 4, -8, 10, 3, 9]).fill(col).stroke({ width: 1.4, color: 0xffffff, alpha: 0.85 });
            g.circle(2, 0, 3.2).fill({ color: C.space, alpha: 0.8 });
            g.circle(2, 0, 1.5).fill(0xffffff);
          } else if (def.id === 'phase') {
            g.poly([14, 0, -2, -4, -10, -12, -6, 0, -10, 12, -2, 4]).fill(col).stroke({ width: 1.3, color: 0xffffff, alpha: 0.9 });
            g.poly([6, 0, -2, -2.5, -2, 2.5]).fill({ color: 0xffffff, alpha: 0.75 });
          } else if (def.id === 'dreadnought') {
            g.poly([22, -4, 14, -9, 2, -9, -8, -16, -20, -13, -16, -5, -21, 0, -16, 5, -20, 13, -8, 16, 2, 9, 14, 9, 22, 4, 15, 0])
              .fill(col).stroke({ width: 2, color: 0xffd6da, alpha: 0.95 });
            g.rect(-10, -5, 16, 10).fill({ color: 0x3b0d14, alpha: 0.9 }).stroke({ width: 1.2, color: C.amber, alpha: 0.8 });
            g.circle(2, 0, 3.5).fill(C.amber);
          } else {
            g.poly([11, 0, -7, -6, -3, 0, -7, 6]).fill(col).stroke({ width: 1.2, color: C.ice, alpha: 0.85 });
          }
        }
        const tex = this.app.renderer.generateTexture({ target: g, resolution: 2 });
        this.textures.set(`${themeId}:${def.id}`, tex);
        g.destroy();
      }
    }
  }

  // ---------- docks + HUD ----------
  setLayout(layout: LayoutDef): void {
    for (const v of this.dockViews) v.container.destroy({ children: true });
    this.dockLayer.removeChildren();
    this.dockViews = [];
    const chipR = creditChipRect();
    const theme = this.theme();
    const hasSprites = theme.id !== 'space';
    const sprites = this.activeSprites(theme.id);
    const textCol = hasSprites ? 0xe6ece8 : theme.borderColor;

    for (const d of layout.docks) {
      const c = new Container();
      c.pivot.set(d.w / 2, d.h / 2); c.position.set(d.cx, d.cy); c.rotation = d.rot; c.scale.set(d.scale);
      const col = PLAYER_COLORS[d.player];
      const borderG = new Graphics();
      if (hasSprites) {
        borderG.roundRect(0, 0, d.w, d.h, 12).fill({ color: theme.panelBg, alpha: 0.96 }).stroke({ width: 2, color: theme.borderColor, alpha: 0.95 });
        borderG.rect(12, 0, d.w - 24, 4).fill(col);
      } else {
        borderG.roundRect(0, 0, d.w, d.h, 14).fill({ color: theme.panelBg, alpha: 0.96 }).stroke({ width: 2, color: col, alpha: 0.9 });
      }
      c.addChild(borderG);

      const name = mkText(`P${d.player + 1}`, 14, col, { bold: true });
      name.position.set(12, 6);
      const wallet = mkText('', 15, textCol, { bold: true });
      wallet.position.set(42, 6);

      const chipG = new Graphics();
      chipG.position.set(chipR.x, chipR.y);
      chipG.roundRect(0, 0, chipR.w, chipR.h, 8).fill({ color: theme.slotBg, alpha: 0.95 }).stroke({ width: 1.5, color: col, alpha: 0.85 });
      const solo = this.game.playerCount <= 1;
      chipG.visible = !solo;
      const chipText = mkText(solo ? 'SOLO COMMAND' : '', solo ? 11.5 : 12.5, solo ? (hasSprites ? 0x8ea394 : 0x7da4bd) : col, { bold: true });
      chipText.anchor.set(0.5);
      chipText.position.set(chipR.x + chipR.w / 2, chipR.y + chipR.h / 2);
      if (solo) chipText.alpha = 0.72;

      c.addChild(name, wallet, chipG, chipText);

      const slots: Container[] = [];
      TURRET_ORDER.forEach((id, i) => {
        const def = this.game.turretById.get(id)!;
        const r = slotRect(i);
        const sc = new Container();
        sc.position.set(r.x, r.y);
        const tcol = this.turretColor(id);
        sc.addChild(new Graphics().roundRect(0, 0, r.w, r.h, 10).fill(theme.slotBg).stroke({
          width: hasSprites ? 1.5 : 2,
          color: tcol,
          alpha: hasSprites ? 0.65 : 0.85,
        }));
        if (hasSprites && sprites?.turrets[id]?.[0]) {
          const sp = new Sprite(sprites.turrets[id][0]);
          sp.anchor.set(0.5);
          sp.position.set(r.w / 2, 26);
          sp.width = 50;
          sp.height = 50;
          sp.rotation = -Math.PI / 2;
          sc.addChild(sp);

          const role = theme.roleTags?.[id] ?? MIL_ROLE_BADGE[id];
          if (role) {
            const rb = new Graphics();
            rb.roundRect(4, 4, role.length * 5.2 + 7, 13, 4)
              .fill({ color: 0x101712, alpha: 0.85 })
              .stroke({ width: 1, color: tcol, alpha: 0.75 });
            const rt = mkText(role, 7.5, tcol, { bold: true });
            rt.anchor.set(0.5);
            rt.position.set(4 + (role.length * 5.2 + 7) / 2, 10.5);
            sc.addChild(rb, rt);
          }
        } else {
          const icon = new Graphics();
          drawIcon(icon, id, r.w / 2, 30, 15, tcol, 1, -Math.PI / 2, theme.id);
          sc.addChild(icon);
        }
        const nm = mkText(theme.turrets[id]?.shortName ?? SHORT_TURRET_NAME[id] ?? def.name, 11.5, textCol, { bold: true });
        nm.anchor.set(0.5, 0); nm.position.set(r.w / 2, 52);
        const cost = mkText(`${def.cost} cr`, 11, tcol, { bold: true });
        cost.anchor.set(0.5, 0); cost.position.set(r.w / 2, 68);
        sc.addChild(nm, cost);

        if (def.targetsAir) {
          const badge = new Graphics();
          const airCol = hasSprites ? 0x8be0ae : C.cyan;
          badge.roundRect(r.w - 28, 4, 24, 13, 4).fill({ color: airCol, alpha: hasSprites ? 0.16 : 0.22 }).stroke({ width: 1, color: airCol, alpha: 0.75 });
          const airTxt = mkText(hasSprites ? 'AA' : 'AIR', 8.5, airCol, { bold: true });
          airTxt.anchor.set(0.5); airTxt.position.set(r.w - 16, 10.5);
          sc.addChild(badge, airTxt);
        }
        c.addChild(sc);
        slots.push(sc);
      });

      this.dockLayer.addChild(c);
      this.dockViews.push({
        container: c, borderG, wallet, chipG, chipText, last: '',
        slots, aff: TURRET_ORDER.map(() => true), chipAff: true, player: d.player,
      });
    }

    this.syncBoardRoot(layout);
    this.buildBoard();
    this.towerSeen = -1;
    this.pathSeen = -1;
    this.statsKey = '';
    this.bannerKey = '';
    this.summaryKey = '';
    this.healthKey = '';
    this.wavePillKey = '';
    this.settingsModalKey = '';

    const board = layout.board;
    this.banner.position.set(board.x + board.w / 2, board.y + board.h / 2);
    const cardR = summaryCardRect(layout);
    const cardCx = cardR.x + cardR.w / 2;
    const cardCy = cardR.y + cardR.h / 2;
    this.summaryCard.position.set(cardCx, cardCy);
    const sumRects = summaryButtonRects(layout);
    for (const sb of this.summaryButtons) {
      sb.rect = sumRects[sb.id];
      sb.label.position.set(sb.rect.x + sb.rect.w / 2 - cardCx, sb.rect.y + sb.rect.h / 2 - cardCy);
      sb.state = '';
    }
    this.applySummaryTypography(layout);
    this.bossLabel.position.set(board.x + board.w / 2, board.y + 8);
    this.statsText.style.fill = textCol;
    this.statsText.position.set(layout.statsOrigin.x, layout.statsOrigin.y);
    this.statsText.visible = this.showStats();

    for (const b of this.buttons) {
      b.rect = layout.hudButtons[b.id];
      b.label.position.set(b.rect.x + b.rect.w / 2, b.rect.y + b.rect.h / 2);
      b.label.style.fontSize = b.id === 'fullscreen' || b.id === 'settings' ? 17 : b.rect.w < 90 ? 12.5 : 13.5;
      b.state = '';
    }
    const sRects = settingsButtonRects(layout);
    for (const sb of this.settingsButtons) {
      sb.rect = sRects[sb.id];
      sb.label.position.set(sb.rect.x + sb.rect.w / 2, sb.rect.y + sb.rect.h / 2);
      sb.state = '';
    }
    this.applySettingsTypography(layout);
  }

  /** Explicitly restores every phone-varying text property so desktop returns to its original look. */
  private applySettingsTypography(layout: LayoutDef): void {
    const phone = isPhoneLayout(layout);
    const pr = settingsPanelRect(layout);
    const set = (t: Text, size: number, wrap: number) => {
      t.style.fontSize = size;
      t.style.lineHeight = Math.round(size * 1.3);
      t.style.wordWrap = wrap > 0;
      t.style.wordWrapWidth = wrap;
      t.style.align = 'center';
    };
    this.settingsTitle.style.fontSize = phone ? 30 : 15;
    this.settingsTitle.style.lineHeight = Math.round((phone ? 30 : 15) * 1.3);
    this.settingsTitle.style.align = 'left';
    this.settingsTitle.position.set(pr.x + (phone ? 22 : 20), pr.y + (phone ? 30 : 18));
    set(this.settingsStatus, phone ? 18 : 11, phone ? 480 : 0);
    set(this.settingsTip, phone ? 15 : 11, phone ? 480 : 0);
    this.settingsTip.text = phone ? SETTINGS_TIP_PHONE : SETTINGS_TIP_DESKTOP;
    if (phone) {
      this.settingsStatus.position.set(pr.x + pr.w / 2, pr.y + PHONE_SETTINGS.statusTop + PHONE_SETTINGS.statusH / 2);
      this.settingsTip.position.set(pr.x + pr.w / 2, pr.y + PHONE_SETTINGS.tipTop + PHONE_SETTINGS.tipH / 2);
    } else {
      this.settingsStatus.position.set(pr.x + pr.w / 2, pr.y + 376);
      this.settingsTip.position.set(pr.x + pr.w / 2, pr.y + pr.h - 32);
    }
    for (const sb of this.settingsButtons) {
      const size = sb.id === 'close' ? (phone ? 32 : 15) : phone ? 21 : 13;
      set(sb.label, size, phone && sb.id !== 'close' ? Math.floor(sb.rect.w - 16) : 0);
      sb.label.anchor.set(0.5);
      sb.label.position.set(sb.rect.x + sb.rect.w / 2, sb.rect.y + sb.rect.h / 2);
    }
    this.settingsModalKey = '';
  }

  private buildHud(): void {
    const hudBtns = this.getLayout().hudButtons;
    for (const id of HUD_BUTTON_IDS) {
      const rect = hudBtns[id];
      const bg = new Graphics();
      const fontSize = id === 'fullscreen' || id === 'settings' ? 17 : rect.w < 90 ? 12.5 : 13.5;
      const label = mkText('', fontSize, C.ice, { bold: true });
      label.anchor.set(0.5);
      label.position.set(rect.x + rect.w / 2, rect.y + rect.h / 2);
      this.hudLayer.addChild(bg, label);
      this.buttons.push({ id, rect, bg, label, state: '', text: '' });
    }
    this.statsText.visible = this.showStats();
    this.hudLayer.addChild(this.statsText);

    this.healthText.anchor.set(1, 0.5);
    this.onMapHudLayer.addChild(this.healthG, this.healthText, this.wavePillG, this.wavePillText, this.waveDiffText, this.waveSpeedText);
  }

  private buildSettingsModal(): void {
    this.settingsLayer.visible = false;
    this.settingsTip.anchor.set(0.5);
    this.settingsStatus.anchor.set(0.5);
    this.settingsLayer.addChild(this.settingsBackdropG, this.settingsTitle, this.settingsTip, this.settingsStatus);
    const sRects = settingsButtonRects(this.getLayout());
    for (const id of SETTINGS_BUTTON_IDS) {
      const rect = sRects[id];
      const bg = new Graphics();
      const label = mkText('', id === 'close' ? 15 : 13, C.ice, { bold: true });
      label.anchor.set(0.5);
      label.position.set(rect.x + rect.w / 2, rect.y + rect.h / 2);
      this.settingsLayer.addChild(bg, label);
      this.settingsButtons.push({ id, rect, bg, label, state: '', text: '' });
    }
    this.applySettingsTypography(this.getLayout());
  }

  private buttonLabel(id: ButtonId): string {
    const g = this.game;
    switch (id) {
      case 'wave': return g.over ? 'Match ended' : g.canLaunch ? `▶ Launch W${g.waveCursor + 1}/${g.totalWaves}` : 'All waves sent';
      case 'pause': return g.paused ? 'Resume' : 'Pause';
      case 'fullscreen': return '⛶';
      case 'settings': return '⚙';
      case 'close': return '✕';
      case 'map': return `Map: ${g.currentMap.name}`;
      case 'layout': return `Layout: ${this.getLayout().name}`;
      case 'difficulty': return `Diff: ${DIFFICULTIES[g.difficulty].label}`;
      case 'waves': return `Waves: ${g.waveCount}`;
      case 'speed': return `Speed: ${g.speed}x`;
      case 'auto': return `Auto-Wave: ${g.autoWave ? 'On' : 'Off'}`;
      case 'sfx': return `Audio SFX: ${this.isMuted() ? 'Off' : 'On'}`;
      case 'stats': return `HUD Stats: ${this.showStats() ? 'On' : 'Off'}`;
      case 'reset': return 'Reset Match';
      case 'stress': return 'Stress 150 + 20';
      case 'install': return this.pwa?.installLabel() ?? 'Install app';
      case 'update': return this.pwa?.updateLabel() ?? 'Update app';
      case 'play-again': return '▶ Play Again';
      case 'next-map': return 'Next Map ▸';
    }
  }

  private updateButtons(): void {
    const theme = this.theme();
    const hasSprites = theme.id !== 'space';
    for (const b of this.buttons) {
      const text = this.buttonLabel(b.id);
      if (text !== b.text) { b.label.text = text; b.text = text; }
      const pressed = this.input.isPressed(b.id);
      const on =
        (b.id === 'pause' && this.game.paused && this.game.launched) ||
        (b.id === 'settings' && this.input.settingsOpen);
      const readyWave = b.id === 'wave' && this.game.canLaunch;
      const disabled = b.id === 'wave' && !this.game.canLaunch;
      const key = `${theme.id}|${pressed ? 'p' : on ? 'on' : readyWave ? 'ready' : 'idle'}|${disabled ? 'x' : ''}`;
      if (key === b.state) continue;
      b.state = key;

      let fill = pressed
        ? (hasSprites ? 0x3b4d42 : 0x2f6a99)
        : on
          ? (hasSprites ? 0x2d4a3a : 0x1d6f5a)
          : readyWave
            ? (hasSprites ? 0x25382e : 0x133754)
            : theme.slotBg;
      let stroke = theme.borderColor;
      if (!pressed && readyWave) {
        stroke = hasSprites ? 0x8be0ae : C.cyan;
      } else if (!pressed && on) {
        stroke = hasSprites ? 0x6db88a : C.mint;
      }

      const alpha = disabled ? 0.5 : 1;
      b.bg.clear().roundRect(b.rect.x, b.rect.y, b.rect.w, b.rect.h, 9)
        .fill({ color: fill, alpha })
        .stroke({ width: 1.8, color: stroke, alpha: hasSprites ? 0.8 : 0.65 });
      b.label.style.fill = hasSprites ? 0xdbe2d8 : theme.borderColor;
      b.label.alpha = alpha;
    }
  }

  private updateSettingsModal(): void {
    const open = this.input.settingsOpen;
    if (this.settingsLayer.visible !== open) this.settingsLayer.visible = open;
    if (!open) return;

    const layout = this.getLayout();
    const pr = settingsPanelRect(layout);
    const theme = this.theme();
    const hasSprites = theme.id !== 'space';
    const mKey = `${theme.id}|${layout.id}`;
    if (mKey !== this.settingsModalKey) {
      this.settingsModalKey = mKey;
      const phone = isPhoneLayout(layout);
      const b = phone ? { x: 0, y: 0, w: layout.stageW, h: layout.stageH } : layout.board;
      this.settingsBackdropG.clear()
        .rect(b.x, b.y, b.w, b.h).fill({ color: 0x04080c, alpha: phone ? 0.93 : 0.55 })
        .roundRect(pr.x, pr.y, pr.w, pr.h, phone ? 28 : 14)
        .fill({ color: theme.panelBg, alpha: 0.97 })
        .stroke({ width: phone ? 4 : 2, color: hasSprites ? theme.borderColor : C.cyan, alpha: 0.9 });
      this.settingsTitle.style.fill = hasSprites ? 0xdbe2d8 : C.ice;
      this.settingsTip.style.fill = hasSprites ? 0xb8c4b8 : C.ice;
      this.settingsTip.alpha = 0.78;
      this.settingsStatus.style.fill = hasSprites ? 0xdbe2d8 : C.mint;
    }
    const status = this.pwa?.statusText() ?? '';
    if (status !== this.settingsStatus.text) this.settingsStatus.text = status;

    for (const sb of this.settingsButtons) {
      const text = this.buttonLabel(sb.id);
      if (text !== sb.text) { sb.label.text = text; sb.text = text; }
      const pressed = this.input.isPressed(sb.id);
      const muted = sb.id === 'sfx' && this.isMuted();
      const on =
        (sb.id === 'speed' && this.game.speed === 2) ||
        (sb.id === 'auto' && this.game.autoWave) ||
        (sb.id === 'stats' && this.showStats());
      const diff = sb.id === 'difficulty' ? this.game.difficulty : '';
      const pwaOff = (sb.id === 'install' && !!this.pwa?.installDisabled()) || (sb.id === 'update' && !!this.pwa?.updateDisabled());
      const pwaReady = sb.id === 'update' && !!this.pwa?.updateAvailable;
      const key = `${theme.id}|${pressed ? 'p' : on || pwaReady ? 'on' : 'idle'}|${diff}|${muted ? 'm' : ''}|${pwaOff ? 'x' : ''}`;
      if (key === sb.state) continue;
      sb.state = key;

      let fill = pressed ? (hasSprites ? 0x3b4d42 : 0x2f6a99) : on || pwaReady ? (hasSprites ? 0x2d4a3a : 0x1d6f5a) : theme.slotBg;
      let stroke = theme.borderColor;
      if (!pressed && sb.id === 'difficulty') {
        if (this.game.difficulty === 'easy') { fill = hasSprites ? 0x22382b : 0x15443c; stroke = hasSprites ? 0x6db88a : C.mint; }
        else if (this.game.difficulty === 'hard') { fill = hasSprites ? 0x3d2424 : 0x451c27; stroke = hasSprites ? 0xd46a6a : C.coral; }
      } else if (!pressed && sb.id === 'close') {
        fill = hasSprites ? 0x242c27 : 0x142b44;
        stroke = hasSprites ? 0x7f8f85 : C.ice;
      } else if (!pressed && muted) {
        fill = theme.panelBg;
      }

      const alpha = muted || pwaOff ? 0.65 : 1;
      const ph = isPhoneLayout(layout);
      sb.bg.clear().roundRect(sb.rect.x, sb.rect.y, sb.rect.w, sb.rect.h, ph ? 16 : 8)
        .fill({ color: fill, alpha })
        .stroke({ width: ph ? 3 : 1.5, color: stroke, alpha: hasSprites ? 0.78 : 0.6 });
      sb.label.style.fill = hasSprites ? 0xdbe2d8 : theme.borderColor;
      sb.label.alpha = alpha;
    }
  }

  private updateOnMapHealth(dtSec: number): void {
    const g = this.game;
    if (g.lives < this.lastLives) {
      this.damageFlash = 0.55;
    }
    this.lastLives = g.lives;
    if (this.damageFlash > 0) this.damageFlash = Math.max(0, this.damageFlash - dtSec);

    const maxLives = DIFFICULTIES[g.difficulty].lives;
    const lives = Math.max(0, g.lives);
    const ratio = Math.max(0, Math.min(1, lives / Math.max(1, maxLives)));
    const critical = ratio <= 0.3;
    const flash = this.damageFlash > 0;
    const theme = this.theme();
    const hasSprites = theme.id !== 'space';
    const layout = this.getLayout();
    const pulseBucket = critical ? Math.floor(g.time * 6) % 2 : 0;
    const key = `${theme.id}|${layout.id}|${g.mapIndex}|${lives}|${maxLives}|${flash ? 'f' : ''}|${pulseBucket}`;
    if (key === this.healthKey && !flash) return;
    this.healthKey = key;

    const board = layout.board;
    const map = g.currentMap;
    const pw = 104, ph = 26;
    const rotated = !!layout.boardRotated;
    const avgExitX = map.exits.reduce((s, [x]) => s + x, 0) / Math.max(1, map.exits.length);
    const maxExitY = map.exits.reduce((m, [, y]) => Math.max(m, y), 0);
    const exitLocalX = hasSprites ? (avgExitX + 0.5) * CELL : BOARD_W - 62;
    const exitLocalY = (maxExitY + 1) * CELL;
    const wp = boardLocalToWorld(board, exitLocalX, exitLocalY, rotated);
    const px = Math.min(Math.max(wp.x - pw / 2, board.x + 8), board.x + board.w - pw - 8);
    const py = Math.min(Math.max(wp.y + 6, board.y + 8), board.y + board.h - ph - 8);

    const barCol = ratio > 0.6 ? 0x62d99a : ratio > 0.3 ? 0xf2be54 : 0xf05656;
    const borderCol = flash ? 0xf05656 : critical && pulseBucket === 1 ? 0xff8a8a : barCol;
    const hg = this.healthG.clear();
    hg.roundRect(px, py, pw, ph, 7)
      .fill({ color: flash ? 0x3b1116 : (hasSprites ? 0x101712 : 0x091628), alpha: 0.88 })
      .stroke({ width: flash ? 2 : 1.3, color: borderCol, alpha: flash ? 0.98 : 0.78 });

    // Vector heart emblem on left
    const hx = px + 14, hy = py + 10;
    hg.circle(hx - 2.6, hy - 1.5, 2.8).circle(hx + 2.6, hy - 1.5, 2.8)
      .poly([hx - 5.2, hy - 0.5, hx + 5.2, hy - 0.5, hx, hy + 5.2])
      .fill({ color: barCol, alpha: 0.95 });

    this.healthText.text = `${lives}/${maxLives}`;
    this.healthText.style.fill = flash ? 0xffb3b8 : 0xf2f6fa;
    this.healthText.position.set(px + pw - 7, py + 9.5);

    // Health bar across the bottom of the pill
    const bx = px + 7, by = py + 19, bw = pw - 14, bh = 4;
    hg.roundRect(bx, by, bw, bh, 2).fill({ color: 0x050a0f, alpha: 0.85 });
    if (ratio > 0) {
      hg.roundRect(bx, by, Math.max(3, bw * ratio), bh, 2).fill({ color: barCol, alpha: 0.95 });
    }
  }

  private updateWavePill(): void {
    const g = this.game;
    const theme = this.theme();
    const hasSprites = theme.id !== 'space';
    const layout = this.getLayout();
    const board = layout.board;

    let label = '';
    if (g.mode === 'stress') {
      label = 'STRESS 150+20';
    } else if (g.autoWave && g.autoWaveTimer > 0 && g.canLaunch) {
      label = `Auto in ${g.autoWaveTimer.toFixed(1)}s`;
    } else if ((g.phase === 'running' || g.phase === 'paused') && g.waveCursor > 0) {
      const cw = g.ordinaryWaves[g.waveCursor - 1];
      const wName = cw ? formatWaveName(theme.id, cw) : '';
      label = `W${g.waveCursor}/${g.totalWaves} · ${wName}`;
    } else if (g.canLaunch) {
      const nw = g.ordinaryWaves[g.waveCursor];
      if (nw) {
        const hasBoss = nw.groups.some(gr => g.enemyById.get(gr.enemyId)?.boss);
        const hasAir = nw.groups.some(gr => g.enemyById.get(gr.enemyId)?.flying);
        const tag = hasBoss ? ' [BOSS]' : hasAir ? ' [AIR]' : '';
        const wName = formatWaveName(theme.id, nw);
        label = `Next: ${wName}${tag}`;
      }
    } else if (g.over === 'won') {
      label = 'Victory';
    } else if (g.over === 'lost') {
      label = 'Defeat';
    } else {
      label = 'All waves sent';
    }

    const diffTag = g.difficulty === 'easy' ? 'EASY' : g.difficulty === 'hard' ? 'HARD' : 'MED';
    const key = `${theme.id}|${layout.id}|${label}|${diffTag}|${g.speed}`;
    if (key === this.wavePillKey) return;
    this.wavePillKey = key;

    const px = board.x + 10, py = board.y + 8, ph = 22;
    this.wavePillText.text = label;
    this.wavePillText.style.fill = hasSprites ? 0xdbe2d8 : C.ice;
    this.wavePillText.anchor.set(0, 0.5);
    this.wavePillText.position.set(px + 9, py + ph / 2);

    this.waveDiffText.text = diffTag;
    const diffCol = g.difficulty === 'easy' ? C.mint : g.difficulty === 'hard' ? C.coral : C.amber;
    this.waveDiffText.style.fill = diffCol;
    this.waveDiffText.anchor.set(0, 0.5);

    const diffX = px + 9 + this.wavePillText.width + 8;
    const diffW = this.waveDiffText.width + 10;
    this.waveDiffText.position.set(diffX + 5, py + ph / 2);

    let totalW = 9 + this.wavePillText.width + 8 + diffW + 6;
    const show2x = g.speed === 2;
    this.waveSpeedText.visible = show2x;
    const speedX = px + totalW - 2;
    const speedW = 24;
    if (show2x) {
      this.waveSpeedText.anchor.set(0.5, 0.5);
      this.waveSpeedText.position.set(speedX + speedW / 2, py + ph / 2);
      totalW += speedW + 4;
    }

    const wg = this.wavePillG.clear();
    wg.roundRect(px, py, totalW, ph, 6)
      .fill({ color: hasSprites ? theme.panelBg : 0x091628, alpha: 0.72 })
      .stroke({ width: 1, color: theme.borderColor, alpha: 0.45 });
    wg.roundRect(diffX, py + 3, diffW, ph - 6, 4)
      .fill({ color: diffCol, alpha: 0.16 })
      .stroke({ width: 1, color: diffCol, alpha: 0.55 });
    if (show2x) {
      wg.roundRect(speedX, py + 3, speedW, ph - 6, 4)
        .fill({ color: C.mint, alpha: 0.18 })
        .stroke({ width: 1, color: C.mint, alpha: 0.65 });
    }
  }

  // ---------- per-frame ----------
  update(dtSec: number): void {
    this.fps += ((1 / Math.max(dtSec, 1e-4)) - this.fps) * 0.1;
    if (this.game.time < this.lastGameTime) {
      this.clearCraters();
    }
    this.lastGameTime = this.game.time;
    for (const c of this.craters) {
      if (c.ttl <= 0) continue;
      c.ttl -= dtSec;
      if (c.ttl <= 0) { c.sprite.visible = false; continue; }
      c.sprite.alpha = 0.55 * Math.min(1, c.ttl / 6);
    }
    if (this.mapSeen !== this.game.mapVersion) {
      this.setLayout(this.getLayout());
    }
    this.syncTowers();
    this.syncMines();
    this.syncRoute();
    this.animateRoute(dtSec);
    this.syncEnemies();
    this.drawFx(dtSec);
    this.updateStormOverlay(dtSec);
    this.drawGhosts(dtSec);
    this.drawRadials();
    this.updateDocks();
    this.updateButtons();
    this.updateSettingsModal();
    this.updateOnMapHealth(dtSec);
    this.updateWavePill();
    this.updateStats(dtSec);
    this.updateBossBar();
    this.updateBanner();
    for (const t of this.toasts) {
      if (t.ttl <= 0) continue;
      t.ttl -= dtSec;
      t.text.alpha = Math.min(1, t.ttl / 0.4);
      if (t.ttl <= 0) t.text.visible = false;
    }
  }

  private syncMines(): void {
    const mines = this.game.mines;
    const mineTex = this.activeSprites()?.mine ?? this.theaterTex.naval.mine ?? Texture.EMPTY;
    while (this.mineSprites.length < mines.length) {
      const s = new Sprite(mineTex);
      s.anchor.set(0.5);
      s.width = 22;
      s.height = 22;
      this.mineLayer.addChild(s);
      this.mineSprites.push(s);
    }
    for (let i = 0; i < this.mineSprites.length; i++) {
      const s = this.mineSprites[i];
      const m = mines[i];
      if (!m || !m.active) {
        if (s.visible) s.visible = false;
        continue;
      }
      if (s.texture !== mineTex) s.texture = mineTex;
      s.visible = true;
      s.width = 22;
      s.height = 22;
      s.position.set(m.x * CELL, m.y * CELL);
    }
  }

  private syncTowers(): void {
    const theme = this.theme();
    const hasSprites = theme.id !== 'space';
    const sprites = this.activeSprites(theme.id);
    this.towerBaseG.visible = !hasSprites;
    this.towerHeadG.visible = !hasSprites;
    this.milTowerLayer.visible = hasSprites;

    if (hasSprites && sprites) {
      const towers = this.game.towers;
      while (this.milTowers.length < towers.length) {
        const container = new Container();
        const base = new Sprite(Texture.EMPTY);
        base.anchor.set(0.5);
        const head = new Sprite(Texture.EMPTY);
        head.anchor.set(0.5);
        const badge = new Graphics();
        container.addChild(base, head, badge);
        this.milTowerLayer.addChild(container);
        this.milTowers.push({ container, base, head, badge });
      }
      for (let i = 0; i < this.milTowers.length; i++) {
        const mt = this.milTowers[i];
        if (i >= towers.length) {
          if (mt.container.visible) mt.container.visible = false;
          continue;
        }
        const t = towers[i];
        mt.container.visible = true;
        const cx = (t.x + 0.5) * CELL, cy = (t.y + 0.5) * CELL;
        mt.container.position.set(cx, cy);
        const bTex = sprites.bases[t.def.id] ?? Texture.EMPTY;
        if (mt.base.texture !== bTex) mt.base.texture = bTex;
        mt.base.width = CELL * 1.16;
        mt.base.height = CELL * 1.16;

        const tierIdx = Math.min(2, t.tier);
        const hTex = sprites.turrets[t.def.id]?.[tierIdx] ?? Texture.EMPTY;
        if (mt.head.texture !== hTex) mt.head.texture = hTex;
        mt.head.width = CELL * 1.28;
        mt.head.height = CELL * 1.28;
        mt.head.rotation = t.aimAngle;

        const bg = mt.badge.clear();
        if (t.boosted) {
          const boostCol = theme.id === 'kitchen' ? 0xff8c2b
            : theme.id === 'lawn' ? 0xc8f052
            : theme.id === 'mars' ? 0xffa64d
            : 0x62f2ff;
          bg.circle(0, 0, CELL * 0.45).stroke({ width: 1.8, color: boostCol, alpha: 0.82 });
        }
        bg.rect(-10, CELL * 0.36, 12, 3).fill(PLAYER_COLORS[t.owner] ?? C.cyan);
        bg.rect(3, CELL * 0.36, 7, 3).fill(this.turretColor(t.def.id));
        if (t.tier >= 1) {
          for (let k = 0; k < t.tier; k++) {
            const ox = -(t.tier - 1) * 3.5 + k * 7;
            const oy = -CELL * 0.38;
            bg.poly([ox - 3, oy + 2, ox, oy - 2, ox + 3, oy + 2]).stroke({ width: 1.6, color: C.gold, alpha: 0.95 });
          }
        }
      }
      return;
    }

    if (this.towerSeen !== this.game.towerVersion) {
      this.towerSeen = this.game.towerVersion;
      const bg = this.towerBaseG.clear();
      const baseFill = 0x0a2236;
      for (const t of this.game.towers) {
        const cx = (t.x + 0.5) * CELL, cy = (t.y + 0.5) * CELL;
        const col = this.turretColor(t.def.id);
        bg.circle(cx, cy, CELL * 0.46).fill({ color: baseFill, alpha: 0.95 }).stroke({ width: 2, color: col, alpha: 0.9 });
        if (t.tier >= 2) bg.circle(cx, cy, CELL * 0.38).stroke({ width: 1.5, color: C.gold, alpha: 0.7 });
        for (let i = 0; i <= t.owner; i++) {
          bg.circle(cx - t.owner * 3 + i * 6, cy + CELL * 0.36, 1.8).fill(PLAYER_COLORS[t.owner]);
        }
      }
    }

    const hg = this.towerHeadG.clear();
    for (const t of this.game.towers) {
      const cx = (t.x + 0.5) * CELL, cy = (t.y + 0.5) * CELL;
      const col = this.turretColor(t.def.id);
      drawTurretHead(hg, t.def.id, cx, cy - 1, CELL * 0.32, col, t.aimAngle, t.tier, 1, theme.id);
      if (t.tier >= 1) {
        for (let i = 0; i < t.tier; i++) {
          const ox = cx - (t.tier - 1) * 3.5 + i * 7;
          const oy = cy - CELL * 0.36;
          hg.poly([ox - 3, oy + 2, ox, oy - 2, ox + 3, oy + 2]).stroke({ width: 1.6, color: C.gold, alpha: 0.95 });
        }
      }
    }
  }

  private syncRoute(): void {
    if (this.pathSeen === this.game.pathVersion) return;
    this.pathSeen = this.game.pathVersion;
    const g = this.routeG.clear();
    const theme = this.theme();
    const hasSprites = theme.id !== 'space';
    const dotColor = theme.routeDotColor;
    this.routePaths = [];
    for (const [sx, sy] of this.game.currentMap.spawns) {
      const route = followRoute(this.game.w, this.game.h, this.game.dist, this.game.idx(sx, sy));
      const pts: { x: number; y: number }[] = [];
      for (let i = 0; i < route.length; i++) {
        const x = ((route[i] % this.game.w) + 0.5) * CELL;
        const y = (Math.floor(route[i] / this.game.w) + 0.5) * CELL;
        pts.push({ x, y });
        g.circle(x, y, hasSprites ? 1.5 : 1.6).fill({ color: dotColor, alpha: 0.20 });
      }
      this.routePaths.push(pts);
    }
  }

  private animateRoute(dt: number): void {
    const theme = this.theme();
    const hasSprites = theme.id !== 'space';
    this.routePulseG.blendMode = hasSprites ? 'normal' : 'add';
    this.routePhase = (this.routePhase + dt * (hasSprites ? 0.40 : 0.45)) % 1;
    const g = this.routePulseG.clear();
    const pulseColor = theme.routePulseColor;
    const spacing = 5;
    for (const pts of this.routePaths) {
      if (pts.length < 2) continue;
      const maxIdx = pts.length - 1;
      for (let k = this.routePhase * spacing; k < maxIdx; k += spacing) {
        const i = Math.floor(k);
        const f = k - i;
        const a = pts[i], b = pts[i + 1];
        const px = a.x + (b.x - a.x) * f;
        const py = a.y + (b.y - a.y) * f;
        g.circle(px, py, hasSprites ? 1.9 : 2.0).fill({ color: pulseColor, alpha: hasSprites ? 0.28 : 0.34 });
      }
    }
  }

  private syncEnemies(): void {
    const list = this.game.enemies;
    const themeId = this.theme().id;
    const hasSprites = themeId !== 'space';
    const isLawnBurrow = this.game.currentMap.mechanic === 'lawn-split-burrow';
    const sprites = this.activeSprites(themeId);
    const rotated = !!this.getLayout().boardRotated;
    const sg = this.enemyShadowG.clear();
    const spriteSizes: Record<string, number> = {
      swarmer: 22, scout: 30, cruiser: 36, frigate: 37, phase: 38, dreadnought: 60,
    };
    while (this.sprites.length < list.length) {
      const s = new Sprite(Texture.EMPTY);
      s.anchor.set(0.5);
      this.enemyLayer.addChild(s);
      this.sprites.push(s);
      const hb = new Graphics();
      this.enemyLayer.addChild(hb);
      this.hpBars.push(hb);
    }
    for (let i = 0; i < this.sprites.length; i++) {
      const s = this.sprites[i];
      const hb = this.hpBars[i];
      if (i >= list.length) {
        if (s.visible) s.visible = false;
        if (hb.visible) hb.visible = false;
        continue;
      }
      const e = list[i];
      const useMound = hasSprites && isLawnBurrow && e.submerged && e.revealedT <= 0 && !!sprites?.moleMound;
      const spriteTex = useMound ? sprites!.moleMound : (hasSprites ? sprites?.enemies[e.def.id] : undefined);
      const tex = spriteTex ?? this.textures.get(`${themeId}:${e.def.id}`) ?? this.textures.get(`space:${e.def.id}`)!;
      if (s.texture !== tex) s.texture = tex;
      const splitScale = e.isSplitChild ? 0.72 : 1;
      if (spriteTex) {
        const sz = (spriteSizes[e.def.id] ?? 28) * splitScale;
        s.width = sz;
        s.height = sz;
      } else {
        s.scale.set(splitScale);
      }
      s.visible = true;
      const ex = (e.x + e.ox) * CELL;
      const ey = (e.y + e.oy) * CELL;
      s.position.set(ex, ey);
      s.rotation = useMound ? 0 : e.ang;
      s.alpha = e.submerged ? (e.revealedT > 0 ? (isLawnBurrow ? 1.0 : 0.96) : (isLawnBurrow ? 0.96 : 0.34)) : 1;
      s.tint = e.slowT > 0 ? 0x9ffff0 : e.burnT > 0 ? 0xffbb77 : 0xffffff;
      if (e.def.flying) {
        if (hasSprites) {
          sg.ellipse(ex - 12, ey + 12, 13, 6).fill({ color: 0x050806, alpha: 0.42 });
        } else {
          sg.ellipse(ex + 6, ey + 8, 10, 5).fill({ color: 0x02060d, alpha: 0.5 });
        }
      }
      if (e.hp < e.maxHp || e.shield > 0) {
        hb.visible = true;
        hb.position.set(ex, ey);
        hb.rotation = rotated ? -Math.PI / 2 : 0;
        const bw = e.def.boss ? 34 : e.isSplitChild ? 12 : 16;
        const bx = -bw / 2;
        const by = -(e.def.boss ? 24 : e.isSplitChild ? 11 : 14);
        hb.clear();
        hb.rect(bx, by, bw, 2.5).fill({ color: 0x000000, alpha: 0.65 });
        hb.rect(bx, by, bw * Math.max(0, e.hp / e.maxHp), 2.5).fill({ color: C.mint });
        if (e.maxShield > 0 && e.shield > 0) {
          hb.rect(bx, by - 3.5, bw, 2.2).fill({ color: 0x000000, alpha: 0.65 });
          hb.rect(bx, by - 3.5, bw * Math.max(0, e.shield / e.maxShield), 2.2).fill({ color: C.cyan });
        }
      } else if (hb.visible) {
        hb.visible = false;
      }
    }
  }

  private drawFx(dt: number): void {
    const g = this.fx.clear();
    const glow = this.fxGlow.clear();
    const cg = this.chipG.clear();
    const gm = this.game;
    const themeId = this.theme().id;
    const hasSprites = themeId !== 'space';
    const layout = this.getLayout();
    const board = layout.board;
    const rotated = !!layout.boardRotated;

    if (!hasSprites) {
      for (const t of gm.towers) {
        if (t.tier >= 2) {
          const cx = (t.x + 0.5) * CELL, cy = (t.y + 0.5) * CELL;
          glow.circle(cx, cy, CELL * 0.34).fill({ color: this.turretColor(t.def.id), alpha: 0.22 });
        }
      }
    }

    // Naval sea mine blinking indicator dots
    for (const m of gm.mines) {
      if (!m.active) continue;
      const mx = m.x * CELL, my = m.y * CELL;
      const blink = Math.sin(gm.time * 8 + m.x * 3 + m.y * 5) > 0;
      g.circle(mx, my, blink ? 2.8 : 1.7).fill({ color: blink ? 0xff4242 : 0x991f1f, alpha: blink ? 0.95 : 0.72 });
    }

    for (const b of gm.beams) {
      if (!b.active) continue;
      const a = Math.max(0, b.ttl / b.max);
      const x1 = b.x1 * CELL, y1 = b.y1 * CELL;
      const x2 = b.x2 * CELL, y2 = b.y2 * CELL;
      const w = b.width || 2.5;
      if (themeId === 'military') {
        if (b.kind === 'rail') {
          g.moveTo(x1, y1).lineTo(x2, y2).stroke({ width: 2.6, color: 0xfffbe6, alpha: a });
          g.circle(x1, y1, 7 * a).fill({ color: 0xffe4a8, alpha: a * 0.9 });
          g.circle(x1, y1, (1 - a) * 12 + 4).fill({ color: 0x6e736f, alpha: a * 0.45 });
        } else {
          glow.moveTo(x1, y1).lineTo(x2, y2).stroke({ width: w * 2.0, color: 0xffb84d, alpha: a * 0.25 });
          g.moveTo(x1, y1).lineTo(x2, y2).stroke({ width: 1.8, color: 0xfff3c4, alpha: a });
          g.circle(x1, y1, 4.5 * a).fill({ color: 0xffb84d, alpha: a * 0.85 });
        }
      } else if (themeId === 'naval') {
        if (b.kind === 'rail') {
          glow.moveTo(x1, y1).lineTo(x2, y2).stroke({ width: 4.5, color: 0x5ee6ff, alpha: a * 0.35 });
          g.moveTo(x1, y1).lineTo(x2, y2).stroke({ width: 2.4, color: 0xe6fbff, alpha: a });
          g.circle(x1, y1, 6 * a).fill({ color: 0x8ef2ff, alpha: a * 0.85 });
        } else {
          glow.moveTo(x1, y1).lineTo(x2, y2).stroke({ width: w * 1.8, color: 0xffc65c, alpha: a * 0.25 });
          g.moveTo(x1, y1).lineTo(x2, y2).stroke({ width: 1.8, color: 0xfff3c4, alpha: a });
          g.circle(x1, y1, 4 * a).fill({ color: 0xffc65c, alpha: a * 0.85 });
        }
      } else if (themeId === 'mars') {
        if (b.kind === 'rail') {
          glow.moveTo(x1, y1).lineTo(x2, y2).stroke({ width: w * 2.6, color: 0xffd25a, alpha: a * 0.45 });
          g.moveTo(x1, y1).lineTo(x2, y2).stroke({ width: 2.8, color: 0xfffbe0, alpha: a });
          g.circle(x1, y1, 6.5 * a).fill({ color: 0xffe484, alpha: a * 0.9 });
        } else {
          glow.moveTo(x1, y1).lineTo(x2, y2).stroke({ width: w * 2.4, color: 0x45e8ff, alpha: a * 0.42 });
          g.moveTo(x1, y1).lineTo(x2, y2).stroke({ width: 2.0, color: 0xe8fdff, alpha: a });
          g.circle(x1, y1, 4.5 * a).fill({ color: 0x62f2ff, alpha: a * 0.9 });
        }
      } else if (themeId === 'medieval') {
        if (b.kind === 'rail') {
          // Thick bronze-white ballista bolt
          g.moveTo(x1, y1).lineTo(x2, y2).stroke({ width: 3.0, color: 0xd49a4a, alpha: a });
          g.moveTo(x1, y1).lineTo(x2, y2).stroke({ width: 1.4, color: 0xfff4d6, alpha: a * 0.9 });
          g.circle(x1, y1, 5 * a).fill({ color: 0xffe2a8, alpha: a * 0.8 });
        } else {
          // Crisp silver-white arrow streak
          g.moveTo(x1, y1).lineTo(x2, y2).stroke({ width: 1.5, color: 0xeef6ff, alpha: a });
          g.circle(x2, y2, 2.5 * a).fill({ color: 0xffffff, alpha: a * 0.85 });
        }
      } else if (themeId === 'kitchen') {
        if (b.kind === 'rail') {
          // Metallic silver knife-slash rail beam
          glow.moveTo(x1, y1).lineTo(x2, y2).stroke({ width: 4.2, color: 0xcbd5e1, alpha: a * 0.38 });
          g.moveTo(x1, y1).lineTo(x2, y2).stroke({ width: 2.6, color: 0xf8fafc, alpha: a });
          g.moveTo(x1, y1).lineTo(x2, y2).stroke({ width: 1.2, color: 0x94a3b8, alpha: a * 0.85 });
          g.circle(x2, y2, 4.5 * a).fill({ color: 0xffffff, alpha: a * 0.85 });
        } else {
          // Electric-cyan swat beam
          glow.moveTo(x1, y1).lineTo(x2, y2).stroke({ width: w * 2.1, color: 0x38bdf8, alpha: a * 0.36 });
          g.moveTo(x1, y1).lineTo(x2, y2).stroke({ width: 1.9, color: 0xe0f7ff, alpha: a });
          g.circle(x2, y2, 3.8 * a).fill({ color: 0x38bdf8, alpha: a * 0.9 });
        }
      } else if (themeId === 'lawn') {
        if (b.kind === 'rail') {
          // Shiny silver spade-slash rail beam
          glow.moveTo(x1, y1).lineTo(x2, y2).stroke({ width: 4.4, color: 0x94a3b8, alpha: a * 0.4 });
          g.moveTo(x1, y1).lineTo(x2, y2).stroke({ width: 2.8, color: 0xffffff, alpha: a });
          g.circle(x1, y1, 5.5 * a).fill({ color: 0xe2e8f0, alpha: a * 0.88 });
        } else {
          // Bright UV bug-zapper beam
          glow.moveTo(x1, y1).lineTo(x2, y2).stroke({ width: w * 2.3, color: 0x8b5cf6, alpha: a * 0.42 });
          g.moveTo(x1, y1).lineTo(x2, y2).stroke({ width: 1.9, color: 0x38d9ff, alpha: a });
          g.circle(x2, y2, 4.2 * a).fill({ color: 0xe879f9, alpha: a * 0.9 });
        }
      } else {
        glow.moveTo(x1, y1).lineTo(x2, y2).stroke({ width: w * 2.8, color: b.color, alpha: a * 0.45 });
        g.moveTo(x1, y1).lineTo(x2, y2).stroke({ width: w, color: b.kind === 'rail' ? 0xffffff : b.color, alpha: a });
      }
    }

    for (const r of gm.rings) {
      if (!r.active) continue;
      const k = 1 - r.ttl / r.max;
      const cx = r.x * CELL, cy = r.y * CELL;
      const rad = r.r * CELL * (0.35 + 0.65 * k);
      if (themeId === 'military') {
        if (r.max <= 0.3) {
          if (r.ttl >= r.max - 0.04 && r.r <= 2.6) this.stampCrater(cx, cy, r.r * CELL);
          g.circle(cx, cy, rad).stroke({ width: 5 * (1 - k * 0.4), color: 0x2a2927, alpha: (1 - k) * 0.68 });
          g.circle(cx, cy, rad * 0.82).stroke({ width: 3, color: 0x45423e, alpha: (1 - k) * 0.55 });
          if (k < 0.7) g.circle(cx, cy, rad * 0.55).fill({ color: 0xff7b29, alpha: (1 - k / 0.7) * 0.65 });
          if (k < 0.35) g.circle(cx, cy, rad * 0.32).fill({ color: 0xfff5c4, alpha: (1 - k / 0.35) * 0.9 });
        } else {
          g.circle(cx, cy, rad).stroke({ width: 1.4, color: 0x9adbb5, alpha: (1 - k) * 0.42 });
        }
      } else if (themeId === 'naval') {
        if (r.max <= 0.3) {
          // White-cyan water plume rings on mine / torpedo blasts
          g.circle(cx, cy, rad).stroke({ width: 4 * (1 - k * 0.3), color: 0x6fd4eb, alpha: (1 - k) * 0.75 });
          g.circle(cx, cy, rad * 0.76).stroke({ width: 2.8, color: 0xdff9ff, alpha: (1 - k) * 0.85 });
          if (k < 0.45) g.circle(cx, cy, rad * 0.42).fill({ color: 0xffffff, alpha: (1 - k / 0.45) * 0.78 });
        } else {
          // Turquoise expanding Sonar wave
          glow.circle(cx, cy, rad).stroke({ width: 3.5, color: 0x38f2d8, alpha: (1 - k) * 0.35 });
          g.circle(cx, cy, rad).stroke({ width: 1.8, color: 0x7afce8, alpha: (1 - k) * 0.72 });
        }
      } else if (themeId === 'mars') {
        if (r.max <= 0.3) {
          if (r.ttl >= r.max - 0.04 && r.r <= 2.6) this.stampCrater(cx, cy, r.r * CELL);
          // Fiery molten magma splash
          glow.circle(cx, cy, rad).stroke({ width: 4.5, color: 0xff551a, alpha: (1 - k) * 0.5 });
          g.circle(cx, cy, rad * 0.85).stroke({ width: 2.8, color: 0xffaa33, alpha: (1 - k) * 0.85 });
          if (k < 0.55) g.circle(cx, cy, rad * 0.5).fill({ color: 0xff6622, alpha: (1 - k / 0.55) * 0.72 });
          if (k < 0.28) g.circle(cx, cy, rad * 0.26).fill({ color: 0xfff0b3, alpha: (1 - k / 0.28) * 0.92 });
        } else {
          // Icy blue seismic ring
          glow.circle(cx, cy, rad).stroke({ width: 4, color: 0x52c8ff, alpha: (1 - k) * 0.32 });
          g.circle(cx, cy, rad).stroke({ width: 1.8, color: 0xb8eeff, alpha: (1 - k) * 0.72 });
        }
      } else if (themeId === 'medieval') {
        if (r.max <= 0.3) {
          if (r.ttl >= r.max - 0.04 && r.r <= 2.6) this.stampCrater(cx, cy, r.r * CELL);
          // Fire & smoke burst for stone boulder impact
          g.circle(cx, cy, rad).stroke({ width: 4.2, color: 0x3b302a, alpha: (1 - k) * 0.65 });
          if (k < 0.65) g.circle(cx, cy, rad * 0.58).fill({ color: 0xff6e24, alpha: (1 - k / 0.65) * 0.68 });
          if (k < 0.35) g.circle(cx, cy, rad * 0.3).fill({ color: 0xffdf94, alpha: (1 - k / 0.35) * 0.88 });
        } else {
          // Sparkling icy-blue Frost Nova ring
          glow.circle(cx, cy, rad).stroke({ width: 4, color: 0x7ce8ff, alpha: (1 - k) * 0.36 });
          g.circle(cx, cy, rad).stroke({ width: 2, color: 0xdffaff, alpha: (1 - k) * 0.78 });
        }
      } else if (themeId === 'kitchen') {
        if (r.max <= 0.3) {
          // Fiery pepper burst
          glow.circle(cx, cy, rad).stroke({ width: 4.2, color: 0xf97316, alpha: (1 - k) * 0.45 });
          g.circle(cx, cy, rad * 0.84).stroke({ width: 2.6, color: 0xff5722, alpha: (1 - k) * 0.82 });
          if (k < 0.58) g.circle(cx, cy, rad * 0.52).fill({ color: 0xff7b29, alpha: (1 - k / 0.58) * 0.68 });
          if (k < 0.3) g.circle(cx, cy, rad * 0.28).fill({ color: 0xfff3c4, alpha: (1 - k / 0.3) * 0.9 });
        } else {
          // Golden honey slow ring
          glow.circle(cx, cy, rad).stroke({ width: 4.5, color: 0xfacc15, alpha: (1 - k) * 0.36 });
          g.circle(cx, cy, rad).stroke({ width: 2.2, color: 0xfde047, alpha: (1 - k) * 0.8 });
        }
      } else if (themeId === 'lawn') {
        if (r.max <= 0.3) {
          // Fiery gnome mortar burst
          glow.circle(cx, cy, rad).stroke({ width: 4.2, color: 0xff6b4a, alpha: (1 - k) * 0.48 });
          g.circle(cx, cy, rad * 0.85).stroke({ width: 2.6, color: 0xff8c42, alpha: (1 - k) * 0.82 });
          if (k < 0.55) g.circle(cx, cy, rad * 0.5).fill({ color: 0xff6b4a, alpha: (1 - k / 0.55) * 0.66 });
          if (k < 0.28) g.circle(cx, cy, rad * 0.26).fill({ color: 0xffe082, alpha: (1 - k / 0.28) * 0.9 });
        } else {
          // Sky-blue sprinkler/thumper shockwave ring
          glow.circle(cx, cy, rad).stroke({ width: 4, color: 0x38bdf8, alpha: (1 - k) * 0.38 });
          g.circle(cx, cy, rad).stroke({ width: 2, color: 0xbae6fd, alpha: (1 - k) * 0.8 });
        }
      } else {
        glow.circle(cx, cy, rad).stroke({ width: 5, color: r.color, alpha: (1 - k) * 0.35 });
        g.circle(cx, cy, rad).stroke({ width: 2, color: r.color, alpha: (1 - k) * 0.85 });
      }
    }

    for (const p of gm.projectiles) {
      if (!p.active) continue;
      const px = p.x * CELL, py = p.y * CELL;
      if (themeId === 'military' || themeId === 'naval') {
        if (p.kind === 'missile') {
          const sx = (p.x - p.vx * 0.085) * CELL;
          const sy = (p.y - p.vy * 0.085) * CELL;
          g.moveTo(sx, sy).lineTo(px, py).stroke({ width: 3, color: 0xe6ece8, alpha: 0.65 });
          const spd = Math.hypot(p.vx, p.vy) || 1;
          const tx = px - (p.vx / spd) * 9, ty = py - (p.vy / spd) * 9;
          g.moveTo(tx, ty).lineTo(px, py).stroke({ width: 2.2, color: 0xf4f7f5, alpha: 0.95 });
          g.circle(tx, ty, 2.2).fill({ color: 0xffa838, alpha: 0.9 });
        } else {
          g.circle(px, py, 3.6).fill({ color: 0x2e2e2e }).stroke({ width: 1, color: 0x707571, alpha: 0.85 });
          g.circle(px, py, 2.0).fill({ color: 0xffa038, alpha: 0.95 });
        }
      } else if (themeId === 'mars') {
        if (p.kind === 'missile') {
          const spd = Math.hypot(p.vx, p.vy) || 1;
          const tx = px - (p.vx / spd) * 10, ty = py - (p.vy / spd) * 10;
          glow.moveTo(tx, ty).lineTo(px, py).stroke({ width: 4.5, color: 0x5ce8ff, alpha: 0.55 });
          g.moveTo(tx, ty).lineTo(px, py).stroke({ width: 2, color: 0xffffff, alpha: 0.9 });
          g.circle(px, py, 2.8).fill(0x78f0ff);
        } else {
          glow.circle(px, py, 6.5).fill({ color: 0xff6622, alpha: 0.45 });
          g.circle(px, py, 3.8).fill({ color: 0xff6622 }).stroke({ width: 1.3, color: 0xffdf80, alpha: 0.85 });
        }
      } else if (themeId === 'medieval') {
        if (p.kind === 'missile') {
          // Glowing violet-gold homing arcane bolt
          const spd = Math.hypot(p.vx, p.vy) || 1;
          const tx = px - (p.vx / spd) * 10, ty = py - (p.vy / spd) * 10;
          glow.moveTo(tx, ty).lineTo(px, py).stroke({ width: 5, color: 0xc988ff, alpha: 0.6 });
          g.moveTo(tx, ty).lineTo(px, py).stroke({ width: 2.2, color: 0xffe082, alpha: 0.95 });
          g.circle(px, py, 3.0).fill(0xd99eff);
        } else {
          // Flaming orange stone boulder
          glow.circle(px, py, 6.5).fill({ color: 0xff7722, alpha: 0.45 });
          g.circle(px, py, 4.2).fill({ color: 0x5c4b3e }).stroke({ width: 1.5, color: 0xff8833, alpha: 0.9 });
        }
      } else if (themeId === 'kitchen') {
        if (p.kind === 'missile') {
          // Pink-white soap missiles
          const spd = Math.hypot(p.vx, p.vy) || 1;
          const tx = px - (p.vx / spd) * 10, ty = py - (p.vy / spd) * 10;
          glow.moveTo(tx, ty).lineTo(px, py).stroke({ width: 5, color: 0xf472b6, alpha: 0.55 });
          g.moveTo(tx, ty).lineTo(px, py).stroke({ width: 2.2, color: 0xffffff, alpha: 0.95 });
          g.circle(px, py, 3.0).fill({ color: 0xfbcfe8 }).stroke({ width: 1, color: 0xf472b6, alpha: 0.9 });
        } else {
          // Fiery pepper mortar orb
          glow.circle(px, py, 6.5).fill({ color: 0xf97316, alpha: 0.45 });
          g.circle(px, py, 3.8).fill({ color: 0xd9480f }).stroke({ width: 1.4, color: 0xfdba74, alpha: 0.9 });
        }
      } else if (themeId === 'lawn') {
        if (p.kind === 'missile') {
          // Pressurized aqua-gold hose jets
          const spd = Math.hypot(p.vx, p.vy) || 1;
          const tx = px - (p.vx / spd) * 11, ty = py - (p.vy / spd) * 11;
          glow.moveTo(tx, ty).lineTo(px, py).stroke({ width: 5, color: 0x38d9ff, alpha: 0.55 });
          g.moveTo(tx, ty).lineTo(px, py).stroke({ width: 2.2, color: 0xfbbf24, alpha: 0.95 });
          g.circle(px, py, 2.8).fill(0xe0f7ff);
        } else {
          // Fiery gnome mortar shell
          glow.circle(px, py, 6.5).fill({ color: 0xff6b4a, alpha: 0.45 });
          g.circle(px, py, 4.0).fill({ color: 0x854d0e }).stroke({ width: 1.5, color: 0xff8c42, alpha: 0.9 });
        }
      } else if (p.kind === 'missile') {
        const spd = Math.hypot(p.vx, p.vy) || 1;
        const tx = px - (p.vx / spd) * 11, ty = py - (p.vy / spd) * 11;
        glow.moveTo(tx, ty).lineTo(px, py).stroke({ width: 5, color: p.color, alpha: 0.65 });
        g.moveTo(tx, ty).lineTo(px, py).stroke({ width: 2.2, color: 0xffffff, alpha: 0.9 });
        g.circle(px, py, 2.8).fill(p.color);
      } else {
        glow.circle(px, py, 7).fill({ color: p.color, alpha: 0.45 });
        g.circle(px, py, 4).fill({ color: p.color }).stroke({ width: 1.5, color: 0xffffff, alpha: 0.75 });
      }
    }

    for (const pt of gm.particles) {
      if (!pt.active) continue;
      const a = Math.max(0, pt.ttl / pt.max);
      if (hasSprites) {
        const isBurn = pt.color === 0xff8a3d || pt.color === 0xffc16e;
        const pcol = isBurn ? pt.color : (themeId === 'naval' ? 0xb8effa : 0x4a4742);
        g.circle(pt.x * CELL, pt.y * CELL, pt.size).fill({ color: pcol, alpha: a * (isBurn ? 0.85 : 0.6) });
      } else {
        glow.circle(pt.x * CELL, pt.y * CELL, pt.size).fill({ color: pt.color, alpha: a * 0.85 });
      }
    }

    const isLawnBurrow = gm.currentMap.mechanic === 'lawn-split-burrow';
    for (const e of gm.enemies) {
      if (e.dead) continue;
      const ex = (e.x + e.ox) * CELL, ey = (e.y + e.oy) * CELL;
      if (e.submerged) {
        if (e.revealedT <= 0) {
          const pulse = 13 + Math.sin(gm.time * 5 + e.id) * 2;
          if (isLawnBurrow) {
            g.circle(ex, ey, pulse).stroke({ width: 1.6, color: 0x7c4d25, alpha: 0.68 });
          } else {
            g.circle(ex, ey, pulse).stroke({ width: 1.3, color: 0x0b2a3d, alpha: 0.58 });
          }
        } else {
          // Crisp sonar-lock (naval) or amber-lime target-lock (lawn) corner brackets
          const lockCol = isLawnBurrow ? 0xd4f24b : 0x38f2d8;
          const r = 14, b = 5;
          g.moveTo(ex - r, ey - r + b).lineTo(ex - r, ey - r).lineTo(ex - r + b, ey - r)
            .moveTo(ex + r - b, ey - r).lineTo(ex + r, ey - r).lineTo(ex + r, ey - r + b)
            .moveTo(ex - r, ey + r - b).lineTo(ex - r, ey + r).lineTo(ex - r + b, ey + r)
            .moveTo(ex + r - b, ey + r).lineTo(ex + r, ey + r).lineTo(ex + r, ey + r - b)
            .stroke({ width: 1.8, color: lockCol, alpha: 0.95 });
        }
      }
      if (e.enraged) {
        const rr = (e.def.boss ? 26 : 15) + Math.sin(gm.time * 16 + e.id) * 2.2;
        glow.circle(ex, ey, rr).stroke({ width: 3.2, color: 0xff3838, alpha: 0.55 });
        g.circle(ex, ey, rr).stroke({ width: 1.6, color: 0xff7a29, alpha: 0.9 });
        for (let sp = 0; sp < 3; sp++) {
          const sa = gm.time * 7 + e.id + (sp * Math.PI * 2) / 3;
          g.circle(ex + Math.cos(sa) * rr, ey + Math.sin(sa) * rr, 2.2).fill({ color: 0xffd066, alpha: 0.92 });
        }
      }
      if (e.shield > 0) {
        const sr = e.def.boss ? 26 : 15;
        if (hasSprites) {
          g.circle(ex, ey, sr).stroke({ width: 1.2, color: 0x9ad8f0, alpha: 0.35 });
        } else {
          glow.circle(ex, ey, sr).stroke({ width: 2, color: C.cyan, alpha: 0.45 });
          g.circle(ex, ey, sr).fill({ color: C.cyan, alpha: 0.08 }).stroke({ width: 1.2, color: C.cyan, alpha: 0.5 });
        }
      }
      if (e.burnT > 0) {
        glow.circle(ex, ey, e.def.boss ? 18 : 10).fill({ color: 0xff7a2f, alpha: 0.25 + 0.12 * Math.sin(gm.time * 24 + e.id) });
      }
    }

    // pooled floating popups
    const popups = gm.popups;
    while (this.popupPool.length < popups.length) {
      const t = mkText('', 11, C.gold, { bold: true });
      t.anchor.set(0.5); t.visible = false;
      this.fxTextLayer.addChild(t);
      this.popupPool.push(t);
    }
    for (let i = 0; i < this.popupPool.length; i++) {
      const txt = this.popupPool[i];
      const p = popups[i];
      if (!p || !p.active) { if (txt.visible) txt.visible = false; continue; }
      txt.visible = true;
      if (txt.text !== p.text) txt.text = p.text;
      txt.style.fill = p.color;
      const wp = boardLocalToWorld(board, p.x * CELL, p.y * CELL, rotated);
      txt.position.set(wp.x, wp.y);
      txt.alpha = Math.min(1, p.ttl / Math.max(0.1, p.max * 0.45));
    }

    // flying credit chips
    for (let i = 0; i < this.flyingChips.length; i++) {
      const fc = this.flyingChips[i];
      const lbl = this.chipLabels[i];
      if (!fc.active) { if (lbl.visible) lbl.visible = false; continue; }
      fc.t += dt;
      const k = Math.min(1, fc.t / fc.dur);
      const ease = 1 - Math.pow(1 - k, 3);
      const arc = Math.sin(k * Math.PI) * -28;
      const x = fc.fromX + (fc.toX - fc.fromX) * ease;
      const y = fc.fromY + (fc.toY - fc.fromY) * ease + arc;
      cg.circle(x, y, 22).fill({ color: fc.color, alpha: 0.35 * (1 - k * 0.4) });
      cg.roundRect(x - 24, y - 12, 48, 24, 8).fill({ color: C.panel, alpha: 0.95 }).stroke({ width: 2, color: fc.color });
      lbl.visible = true;
      lbl.text = `+${fc.amount.toFixed(0)}`;
      lbl.style.fill = fc.color;
      lbl.position.set(x, y);
      if (k >= 1) { fc.active = false; lbl.visible = false; }
    }
  }

  private updateStormOverlay(_dt: number): void {
    const gm = this.game;
    const g = this.stormG.clear();
    const isMarsStorm = gm.currentMap.mechanic === 'mars-storms' && gm.stormActive;
    const isKitchenRush = gm.currentMap.mechanic === 'kitchen-rush' && gm.rushActive;
    if (!isMarsStorm && !isKitchenRush) {
      if (this.stormAlertG.visible) this.stormAlertG.visible = false;
      if (this.stormAlertText.visible) this.stormAlertText.visible = false;
      return;
    }

    const board = this.getLayout().board;
    if (isMarsStorm) {
      // Translucent rust-amber wind streaks sweeping diagonally across the board
      g.rect(0, 0, BOARD_W, BOARD_H).fill({ color: 0xc95b24, alpha: 0.10 });
      const t = gm.time * 280;
      for (let i = 0; i < 24; i++) {
        const rx = ((hash(i, 41) * BOARD_W + t * (0.9 + (i % 3) * 0.25)) % (BOARD_W + 180)) - 140;
        const ry = ((hash(i, 42) * BOARD_H + t * 0.32) % (BOARD_H + 80)) - 40;
        const len = 70 + (i % 4) * 35;
        const x1 = Math.max(0, rx);
        const y1 = Math.max(0, ry);
        const x2 = Math.min(BOARD_W, rx + len);
        const y2 = Math.min(BOARD_H, ry + len * 0.28);
        if (x2 > x1 && y2 > y1) {
          g.moveTo(x1, y1).lineTo(x2, y2).stroke({ width: 1.6 + (i % 2), color: 0xffa65c, alpha: 0.22 });
        }
      }
      this.stormAlertText.text = 'DUST STORM · RANGE -20% (VENTS/T2 IMMUNE)';
      this.stormAlertText.style.fill = 0xffd394;
    } else {
      // Soft icy cyan-white translucent fridge-light trapezoid/mist radiating leftward from open fridge (exits)
      const exits = gm.currentMap.exits;
      const avgExitY = exits.reduce((s, [, y]) => s + y, 0) / Math.max(1, exits.length);
      const fy = (avgExitY + 0.5) * CELL;
      const fx = BOARD_W;
      const leftX = BOARD_W * 0.16;
      const midX = BOARD_W * 0.48;
      const topOuter = Math.max(0, fy - BOARD_H * 0.44);
      const botOuter = Math.min(BOARD_H, fy + BOARD_H * 0.44);
      const topInner = Math.max(0, fy - BOARD_H * 0.28);
      const botInner = Math.min(BOARD_H, fy + BOARD_H * 0.28);
      const topExit = Math.max(0, fy - CELL * 1.15);
      const botExit = Math.min(BOARD_H, fy + CELL * 1.15);

      g.rect(0, 0, BOARD_W, BOARD_H).fill({ color: 0x8ae8ff, alpha: 0.05 });
      g.poly([fx, topExit, fx, botExit, leftX, botOuter, leftX, topOuter]).fill({ color: 0xb8f3ff, alpha: 0.11 });
      g.poly([fx, topExit, fx, botExit, midX, botInner, midX, topInner]).fill({ color: 0xe6fbff, alpha: 0.13 });

      // Subtle drifting icy chill wisps clipped inside board
      const t = gm.time * 170;
      for (let i = 0; i < 18; i++) {
        const span = BOARD_W * 0.82;
        const rx = BOARD_W - ((hash(i, 51) * span + t * (0.75 + (i % 3) * 0.22)) % (span + 120));
        const ry = hash(i, 52) * BOARD_H;
        const len = 45 + (i % 4) * 24;
        const x1 = Math.max(0, rx - len);
        const x2 = Math.min(BOARD_W, rx);
        const y = Math.max(4, Math.min(BOARD_H - 4, ry));
        if (x2 > x1) {
          g.moveTo(x1, y).lineTo(x2, y).stroke({ width: 1.4 + (i % 2) * 0.6, color: 0xb8f3ff, alpha: 0.20 });
        }
      }
      this.stormAlertText.text = 'FRIDGE OPEN! — SNACK RUSH (+30% SPEED)';
      this.stormAlertText.style.fill = 0xb8f3ff;
    }

    // Centered top-of-board alert pill (below Wave pill on vertical phone boards, and below Boss bar if Boss is active)
    const hasBoss = !!gm.activeBoss();
    const topOffset = this.getLayout().boardRotated ? 42 : 8;
    const py = hasBoss ? board.y + topOffset + 40 : board.y + topOffset;
    const pw = Math.min(350, board.w - 20), ph = 24;
    const px = board.x + board.w / 2 - pw / 2;
    this.stormAlertG.visible = true;
    this.stormAlertG.clear()
      .roundRect(px, py, pw, ph, 7)
      .fill({ color: isKitchenRush ? 0x0c2433 : 0x2b1208, alpha: 0.90 })
      .stroke({ width: 1.5, color: isKitchenRush ? 0x6ee7ff : 0xff8c42, alpha: 0.92 });
    this.stormAlertText.visible = true;
    this.stormAlertText.style.fontSize = board.w < 560 ? 10 : 11;
    this.stormAlertText.position.set(board.x + board.w / 2, py + ph / 2);
  }

  private drawGhosts(_dt: number): void {
    const g = this.ghostG.clear();
    const theme = this.theme();
    const hasSprites = theme.id !== 'space';
    const layout = this.getLayout();
    const board = layout.board;
    for (const d of this.input.drags.values()) {
      const col = this.turretColor(d.turretId);
      const def = this.game.turretById.get(d.turretId)!;
      const ok = !!d.result?.ok;
      if (d.cell) {
        const { x: cx, y: cy } = boardCellCenter(board, d.cell.x, d.cell.y, !!layout.boardRotated);
        if (hasSprites) {
          g.circle(cx, cy, def.range * CELL).fill({ color: 0xf2e2ad, alpha: 0.06 }).stroke({ width: 1.2, color: 0xf2e2ad, alpha: 0.45 });
          g.rect(cx - CELL / 2, cy - CELL / 2, CELL, CELL)
            .fill({ color: ok ? 0x6db88a : 0xd46a6a, alpha: 0.24 }).stroke({ width: 2, color: ok ? 0x6db88a : 0xd46a6a });
        } else {
          g.circle(cx, cy, def.range * CELL).fill({ color: col, alpha: 0.07 }).stroke({ width: 1.5, color: col, alpha: 0.5 });
          g.rect(cx - CELL / 2, cy - CELL / 2, CELL, CELL)
            .fill({ color: ok ? C.mint : C.coral, alpha: 0.22 }).stroke({ width: 2, color: ok ? C.mint : C.coral });
        }
        drawIcon(g, d.turretId, cx, cy, CELL * 0.34, col, 0.85, -Math.PI / 2, theme.id);
        if (d.touch) g.moveTo(d.px, d.py).lineTo(cx, cy).stroke({ width: 1.5, color: PLAYER_COLORS[d.owner], alpha: 0.6 });
      }
      g.circle(d.px, d.py, 20).fill({ color: hasSprites ? theme.panelBg : theme.panelBg, alpha: hasSprites ? 0.82 : 0.7 }).stroke({ width: 2.5, color: PLAYER_COLORS[d.owner] });
      drawIcon(g, d.turretId, d.px, d.py, 12, col, 0.95, -Math.PI / 2, theme.id);
    }

    const chipR = creditChipRect();
    for (const cd of this.input.creditDrags.values()) {
      const dock = layout.docks.find(dk => dk.player === cd.fromPlayer);
      const pcol = PLAYER_COLORS[cd.fromPlayer] ?? C.cyan;
      if (dock) {
        const origin = dockToWorld(dock, chipR.x + chipR.w / 2, chipR.y + chipR.h / 2);
        drawDashedLine(g, origin.x, origin.y, cd.px, cd.py, pcol, 0.75);
      }
      g.circle(cd.px, cd.py, 22).fill({ color: theme.panelBg, alpha: 0.9 }).stroke({ width: 2.5, color: pcol });
      g.circle(cd.px, cd.py, 14).stroke({ width: 1.5, color: C.gold, alpha: 0.85 });
      if (cd.targetPlayer !== null) {
        const tdock = layout.docks.find(dk => dk.player === cd.targetPlayer);
        if (tdock) {
          const c0 = dockToWorld(tdock, 0, 0), c1 = dockToWorld(tdock, tdock.w, 0);
          const c2 = dockToWorld(tdock, tdock.w, tdock.h), c3 = dockToWorld(tdock, 0, tdock.h);
          g.poly([c0.x, c0.y, c1.x, c1.y, c2.x, c2.y, c3.x, c3.y]).stroke({ width: 4, color: C.mint, alpha: 0.9 });
        }
      }
    }
  }

  private drawRadials(): void {
    let idx = 0;
    const theme = this.theme();
    const l = this.getLayout();
    const board = l.board;
    for (const m of this.input.openRadials.values()) {
      if (idx >= this.radialPool.length) break;
      const tower = this.game.towerById(m.towerId);
      if (!tower) continue;
      const rv = this.radialPool[idx++];
      rv.container.visible = true;
      const g = rv.g.clear();
      const stats = this.game.towerStats(tower);
      const { x: tx, y: ty } = boardCellCenter(board, tower.x, tower.y, !!l.boardRotated);
      const tcol = this.turretColor(tower.def.id);

      g.circle(tx, ty, stats.range * CELL).fill({ color: tcol, alpha: 0.05 }).stroke({ width: 1.5, color: tcol, alpha: 0.45 });
      g.circle(m.cx, m.cy, RADIAL_RADIUS).stroke({ width: 1.5, color: PLAYER_COLORS[m.owner] ?? C.cyan, alpha: 0.5 });

      const btns = radialButtons(m.cx, m.cy, m.rot, l.stageW, l.stageH);
      const nextUpg = this.game.nextUpgrade(tower);
      const canUpg = this.game.canUpgrade(tower.id).ok;
      const refund = (tower.invested * 0.7).toFixed(1);

      btns.forEach((b, bi) => {
        const lbl = rv.btns[bi];
        let border = C.cyan;
        let alpha = 1;
        if (b.action === 'upgrade') {
          border = !nextUpg ? C.gold : canUpg ? C.mint : C.coral;
          alpha = nextUpg && !canUpg ? 0.5 : 1;
          lbl.title.text = nextUpg ? 'UPG' : 'MAX';
          lbl.sub.text = nextUpg ? `+${nextUpg.cost}` : `T${tower.tier}`;
          const upgName = nextUpg ? (theme.turrets[tower.def.id]?.upgrades[tower.tier] ?? nextUpg.name) : '';
          lbl.desc.text = nextUpg ? upgName.split(' ')[0] : 'Maxed';
          lbl.sub.style.fill = border;
        } else if (b.action === 'priority') {
          border = C.cyan;
          lbl.title.text = 'AIM';
          lbl.sub.text = PRIORITY_LABEL[tower.priority] ?? tower.priority.toUpperCase();
          lbl.desc.text = 'Target';
          lbl.sub.style.fill = C.cyan;
        } else {
          border = C.coral;
          lbl.title.text = 'SELL';
          lbl.sub.text = `+${refund}`;
          lbl.desc.text = '70%';
          lbl.sub.style.fill = C.coral;
        }
        g.circle(b.x, b.y, RADIAL_BTN_R).fill({ color: theme.panelBg, alpha: 0.94 * alpha }).stroke({ width: 2.2, color: border, alpha: alpha * 0.95 });

        const cos = Math.cos(m.rot), sin = Math.sin(m.rot);
        lbl.title.rotation = m.rot; lbl.sub.rotation = m.rot; lbl.desc.rotation = m.rot;
        lbl.title.alpha = alpha; lbl.sub.alpha = alpha; lbl.desc.alpha = alpha;
        lbl.title.position.set(b.x + 0 * cos - (-11) * sin, b.y + 0 * sin + (-11) * cos);
        lbl.sub.position.set(b.x, b.y + 1);
        lbl.desc.position.set(b.x + 0 * cos - 13 * sin, b.y + 0 * sin + 13 * cos);
      });
    }
    for (let i = idx; i < this.radialPool.length; i++) {
      this.radialPool[i].container.visible = false;
    }
  }

  private updateDocks(): void {
    const solo = this.game.playerCount <= 1;
    for (const v of this.dockViews) {
      const credits = this.game.credits[v.player] ?? 0;
      const s = credits.toFixed(1);
      if (s !== v.last) {
        v.last = s;
        v.wallet.text = `${s} cr`;
        if (!solo) {
          v.chipText.text = credits >= 5 ? `◆ Share ${Math.min(25, Math.floor(credits))} ⇄` : '◆ Share ⇄';
        }
      }
      if (solo) {
        if (v.chipG.visible) v.chipG.visible = false;
        if (v.chipText.text !== 'SOLO COMMAND') v.chipText.text = 'SOLO COMMAND';
        v.chipText.alpha = 0.72;
      } else {
        if (!v.chipG.visible) v.chipG.visible = true;
        const chipAff = credits >= 5;
        if (chipAff !== v.chipAff) {
          v.chipAff = chipAff;
          v.chipG.alpha = chipAff ? 1 : 0.4;
          v.chipText.alpha = chipAff ? 1 : 0.4;
        }
      }
      TURRET_ORDER.forEach((id, i) => {
        const aff = credits + 1e-9 >= this.game.turretById.get(id)!.cost;
        if (aff !== v.aff[i]) { v.aff[i] = aff; v.slots[i].alpha = aff ? 1 : 0.45; }
      });
    }
  }

  private updateStats(dt: number): void {
    const visible = this.showStats();
    if (this.statsText.visible !== visible) this.statsText.visible = visible;
    if (!visible) return;
    this.statsTimer -= dt;
    if (this.statsTimer > 0) return;
    this.statsTimer = 0.25;
    const g = this.game;
    const theme = this.theme();
    let nextLine = g.over === 'lost' ? 'Next: Match over' : 'Next: Complete';
    if (g.autoWave && g.autoWaveTimer > 0 && g.canLaunch) {
      nextLine = `Auto in ${g.autoWaveTimer.toFixed(1)}s`;
    } else if (g.canLaunch) {
      const nw = g.ordinaryWaves[g.waveCursor];
      if (nw) {
        const hasBoss = nw.groups.some(gr => g.enemyById.get(gr.enemyId)?.boss);
        const hasAir = nw.groups.some(gr => g.enemyById.get(gr.enemyId)?.flying);
        const tag = hasBoss ? ' [BOSS]' : hasAir ? ' [AIR]' : '';
        const wName = formatWaveName(theme.id, nw);
        nextLine = `Next: ${wName}${tag}`;
      }
    }
    const key = [
      Math.round(this.fps), g.enemies.length, this.input.pointerCount,
      g.waveCursor, Math.max(0, g.lives), g.phase, g.difficulty, g.towers.length, g.stats.kills, nextLine,
    ].join('|');
    if (key === this.statsKey) return;
    this.statsKey = key;
    this.statsText.text =
      `FPS  ${Math.round(this.fps)}\nEnemies  ${g.enemies.length}\nPointers  ${this.input.pointerCount}\n` +
      `Diff  ${DIFFICULTIES[g.difficulty].label}\n` +
      `Wave  ${g.waveCursor}/${g.totalWaves}${g.mode === 'stress' ? ' (stress)' : ''}\nLives  ${Math.max(0, g.lives)}\n` +
      `Turrets  ${g.towers.length}   Kills  ${g.stats.kills}\nState  ${g.phase}\n${nextLine}`;
  }

  private updateBossBar(): void {
    const boss = this.game.activeBoss();
    const g = this.bossBarG.clear();
    if (!boss) {
      if (this.bossLabel.visible) this.bossLabel.visible = false;
      return;
    }
    const theme = this.theme();
    const layout = this.getLayout();
    const board = layout.board;
    this.bossLabel.text = theme.bossTitle;
    this.bossLabel.visible = true;
    const bw = Math.min(340, board.w - 28), bx = board.x + board.w / 2 - bw / 2, by = board.y + (layout.boardRotated ? 42 : 8);
    this.bossLabel.position.set(board.x + board.w / 2, by);
    g.roundRect(bx - 8, by - 2, bw + 16, 36, 8).fill({ color: theme.panelBg, alpha: 0.88 }).stroke({ width: 1.5, color: 0xff4d5a, alpha: 0.85 });
    const barY = by + 16;
    if (boss.maxShield > 0) {
      g.rect(bx, barY, bw, 4).fill({ color: 0x06101c, alpha: 0.9 });
      g.rect(bx, barY, bw * Math.max(0, boss.shield / boss.maxShield), 4).fill({ color: C.cyan });
    }
    const hpY = barY + 6;
    g.rect(bx, hpY, bw, 7).fill({ color: 0x06101c, alpha: 0.9 });
    g.rect(bx, hpY, bw * Math.max(0, boss.hp / boss.maxHp), 7).fill({ color: 0xff4d5a });
    // phase notches at 33% and 66%
    g.rect(bx + bw * 0.33, hpY - 1, 2, 9).fill({ color: 0xffffff, alpha: 0.75 });
    g.rect(bx + bw * 0.66, hpY - 1, 2, 9).fill({ color: 0xffffff, alpha: 0.75 });
  }

  /** Font sizes and row positions for the end-of-match card; phone is scaled up for its ~0.5 viewport scale. */
  private applySummaryTypography(layout: LayoutDef): void {
    const phone = isPhoneLayout(layout);
    const rows: [Text, number, number][] = phone
      ? [[this.summaryTitle, 34, -168], [this.summarySub, 19, -114], [this.summaryStats, 19, -58],
         [this.summaryPlayers, 18, -4], [this.summaryScore, 18, 54]]
      : [[this.summaryTitle, 30, -86], [this.summarySub, 14, -52], [this.summaryStats, 14, -14],
         [this.summaryPlayers, 13.5, 18], [this.summaryScore, 13, 44]];
    for (const [t, size, y] of rows) {
      t.style.fontSize = size;
      t.style.lineHeight = Math.round(size * 1.3);
      t.style.wordWrap = phone;
      t.style.wordWrapWidth = phone ? 440 : 0;
      t.position.set(0, y);
    }
    for (const sb of this.summaryButtons) {
      sb.label.style.fontSize = phone ? 21 : 14;
      sb.label.style.lineHeight = Math.round((phone ? 21 : 14) * 1.3);
    }
    this.summaryKey = '';
  }

  private updateBanner(): void {
    const g = this.game;
    if (g.over === 'won' || g.over === 'lost') {
      if (this.banner.visible) this.banner.visible = false;
      this.summaryCard.visible = true;
      const theme = this.theme();
      const hasSprites = theme.id !== 'space';
      const layout = this.getLayout();
      const cardR = summaryCardRect(layout);
      const cardCx = cardR.x + cardR.w / 2;
      const cardCy = cardR.y + cardR.h / 2;
      const pk = g.stats.playerKills.slice(0, g.playerCount).map((k, i) => `P${i + 1}: ${k} kills`).join('   •   ');
      const sc = this.getScore();
      const scLines = sc ? scoreLines(sc) : null;
      const sKey = `${g.over}|${g.difficulty}|${g.currentMap.id}|${g.waveCursor}|${g.lives}|${g.stats.kills}|${g.stats.leaks}|${pk}|${layout.id}|${g.runId}|${scLines ? scLines.join('/') : ''}`;
      if (sKey !== this.summaryKey) {
        this.summaryKey = sKey;
        const won = g.over === 'won';
        const col = hasSprites ? (won ? 0x6db88a : 0xd46a6a) : (won ? C.mint : C.coral);
        this.summaryBg.clear()
          .roundRect(-cardR.w / 2, -cardR.h / 2, cardR.w, cardR.h, 16)
          .fill({ color: hasSprites ? theme.panelBg : 0x091628, alpha: 0.95 })
          .stroke({ width: 2.5, color: col, alpha: 0.95 });
        this.summaryTitle.text = won ? theme.victoryTitle : theme.defeatTitle;
        this.summaryTitle.style.fill = col;
        this.summarySub.text = `${DIFFICULTIES[g.difficulty].label}  •  ${g.currentMap.name}`;
        this.summaryStats.text = isPhoneLayout(layout)
          ? `Waves ${g.waveCursor}/${g.totalWaves}   •   Lives ${Math.max(0, g.lives)}\nKills ${g.stats.kills}   •   Leaks ${g.stats.leaks}`
          : `Waves ${g.waveCursor}/${g.totalWaves}   •   Lives ${Math.max(0, g.lives)}   •   Kills ${g.stats.kills}   •   Leaks ${g.stats.leaks}`;
        this.summaryPlayers.text = pk;
        this.summaryScore.text = scLines ? (scLines[1] ? scLines.join('\n') : scLines[0]) : '';
      }
      for (const sb of this.summaryButtons) {
        const pressed = this.input.isPressed(sb.id);
        const btnKey = `${theme.id}|${pressed ? 'p' : 'idle'}|${layout.id}`;
        if (btnKey === sb.state) continue;
        sb.state = btnKey;
        const isPrimary = sb.id === 'play-again';
        const fill = isPrimary
          ? (pressed ? (hasSprites ? 0x3b6e52 : 0x267a5c) : (hasSprites ? 0x244734 : 0x164d3e))
          : (pressed ? (hasSprites ? 0x3b4d42 : 0x2f6a99) : theme.slotBg);
        const stroke = isPrimary
          ? (hasSprites ? 0x7be0a5 : C.mint)
          : (hasSprites ? 0x6a9ab0 : C.cyan);
        const lx = sb.rect.x - cardCx;
        const ly = sb.rect.y - cardCy;
        sb.bg.clear().roundRect(lx, ly, sb.rect.w, sb.rect.h, 10)
          .fill({ color: fill, alpha: 0.96 })
          .stroke({ width: 2, color: stroke, alpha: 0.92 });
        sb.label.style.fill = isPrimary ? (hasSprites ? 0xeaf7ef : C.mint) : (hasSprites ? 0xdbe2d8 : C.ice);
      }
      return;
    }

    if (this.summaryCard.visible) {
      this.summaryCard.visible = false;
      this.summaryKey = '';
    }
    const ph = g.phase;
    const hasSprites = this.theme().id !== 'space';
    const bKey = `${ph}|${hasSprites ? 'm' : 's'}`;
    if (bKey === this.bannerKey) return;
    this.bannerKey = bKey;
    const msg = ph === 'planning' ? 'PLANNING — PAUSED' : ph === 'paused' ? 'PAUSED' : '';
    this.banner.text = msg;
    this.banner.visible = msg !== '';
    this.banner.style.fill = hasSprites ? 0xf2f5ec : C.ice;
    this.banner.style.stroke = { color: 0x0b100d, width: hasSprites ? 3 : 0 };
    this.banner.alpha = hasSprites ? 0.30 : 0.22;
  }
}
