// Per-pointer input state. No single-pointer globals: every finger/mouse has its own entry.
import type { Game, PlaceResult } from './sim/game';
import type { SoundEvent } from './types';
import { getTheater } from './theme';
import {
  activeTurretOrder, boardCellCenter, cellAt, dockUp, hitCreditChip, hitDockBody, hitDockSlot, hitHudButton, hitRadialButton, hitSettingsButton,
  hitSummaryButton, inRect, settingsPanelRect, type ButtonId, type Dock, type LayoutDef, type RadialAction,
} from './layout';

export interface DragState {
  pointerId: number; owner: number; turretId: string;
  px: number; py: number;          // pointer position (world)
  ax: number; ay: number;          // aim point (pointer lifted toward the board for touch)
  upx: number; upy: number;        // owning dock's local "up" in world space
  touch: boolean;
  cell: { x: number; y: number } | null;
  result: PlaceResult | null;
}
export interface RadialMenuState {
  towerId: number; owner: number; cx: number; cy: number; rot: number;
}
export interface CreditDragState {
  pointerId: number; fromPlayer: number; amount: number;
  startX: number; startY: number; startT: number; moved: boolean;
  px: number; py: number; vx: number; vy: number;
  targetPlayer: number | null;
}

type Press =
  | { kind: 'idle' }
  | { kind: 'button'; id: ButtonId }
  | { kind: 'dismiss-settings' }
  | { kind: 'drag' }
  | { kind: 'credit' }
  | { kind: 'move-dock'; player: number }
  | { kind: 'radial-btn'; owner: number; towerId: number; action: RadialAction }
  | { kind: 'tap'; cx: number; cy: number; towerId: number; x: number; y: number; t: number }
  | { kind: 'empty-tap'; x: number; y: number; t: number };

export interface InputHooks {
  toast(msg: string, wx: number, wy: number, good: boolean): void;
  button(id: ButtonId): void;
  moveSoloDock?(): void;
  creditFly?(fromPlayer: number, toPlayer: number, amount: number, fromX: number, fromY: number, toX: number, toY: number): void;
  sound?(ev: SoundEvent): void;
}

export const TOUCH_LIFT = 60; // world px: ghost sits above the finger so it stays visible
export const TAP_SLOP = 14;
export const TAP_MS = 700;
export const CREDIT_TRANSFER_AMOUNTS = [25, 50, 100] as const;
export type CreditTransferAmount = typeof CREDIT_TRANSFER_AMOUNTS[number];
export const CREDIT_TRANSFER_AMOUNT = 25;
export const CREDIT_MIN_TRANSFER = 5;
export const FLICK_MIN_SPEED = 240; // world px/sec

export const REASON_TEXT: Record<string, string> = {
  ok: 'Placed', outside: 'Outside grid', reserved: 'Reserved cell', asteroid: 'Asteroid',
  occupied: 'Occupied', enemy: 'Enemy in cell', funds: 'Not enough credits',
  'blocks-path': 'Would block route', 'unknown-player': 'Unknown player',
  'unknown-turret': 'Unknown turret', 'healer-limit': 'Max 1 Healer per player',
  over: 'Match over', 'full-hp': 'Already full HP',
};

const THEATER_REASON_OVERRIDES: Record<string, Record<string, string>> = {
  military: {
    ok: 'Deployed',
    reserved: 'Invasion / HQ',
    'blocks-path': 'Would block advance',
  },
  naval: {
    ok: 'Deployed',
    reserved: 'Harbor / Sea Lane',
    'blocks-path': 'Would block sea lane',
  },
  mars: {
    ok: 'Deployed',
    reserved: 'Red Front / Dome',
    'blocks-path': 'Would block convoy',
  },
  medieval: {
    ok: 'Built',
    reserved: 'Castle / Road Gate',
    'blocks-path': 'Would block road',
  },
  kitchen: {
    ok: 'Placed',
    reserved: 'Pantry / Fridge',
    'blocks-path': 'Would block counter',
  },
  lawn: {
    ok: 'Placed',
    reserved: 'Fence / Porch',
    'blocks-path': 'Would block yard',
  },
};

export function reasonText(reason: string, theme?: string): string {
  if (reason === 'asteroid') {
    return getTheater(theme).obstacleLabel;
  }
  if (theme && THEATER_REASON_OVERRIDES[theme]?.[reason]) {
    return THEATER_REASON_OVERRIDES[theme][reason];
  }
  return REASON_TEXT[reason] ?? reason;
}

export class InputController {
  readonly pointers = new Map<number, Press>();
  readonly drags = new Map<number, DragState>();
  readonly creditDrags = new Map<number, CreditDragState>();
  readonly openRadials = new Map<number, RadialMenuState>();
  private readonly creditLastT = new Map<number, number>();
  private readonly shareAmounts = new Map<number, CreditTransferAmount>();
  settingsOpen = false;

  constructor(private game: Game, private getLayout: () => LayoutDef, private hooks: InputHooks) {}

  shareAmount(player: number): CreditTransferAmount {
    return this.shareAmounts.get(player) ?? CREDIT_TRANSFER_AMOUNT;
  }

  cycleShareAmount(player: number): CreditTransferAmount {
    const cur = this.shareAmount(player);
    const next = CREDIT_TRANSFER_AMOUNTS[(CREDIT_TRANSFER_AMOUNTS.indexOf(cur) + 1) % CREDIT_TRANSFER_AMOUNTS.length];
    this.shareAmounts.set(player, next);
    return next;
  }

  toggleSettings(): boolean {
    this.settingsOpen = !this.settingsOpen;
    return this.settingsOpen;
  }
  closeSettings(): void {
    this.settingsOpen = false;
  }

  get pointerCount(): number { return this.pointers.size; }
  isPressed(id: ButtonId): boolean {
    for (const p of this.pointers.values()) if (p.kind === 'button' && p.id === id) return true;
    return false;
  }

  pointerDown(id: number, x: number, y: number, type: string, button: number, now: number): void {
    if (this.pointers.has(id)) this.cancel(id);
    this.pointers.set(id, { kind: 'idle' });
    const layout = this.getLayout();

    // 0. Settings modal captures all pointer interactions while open.
    if (this.settingsOpen) {
      if (type === 'mouse' && button !== 0) return;
      const sb = hitSettingsButton(layout, x, y);
      if (sb) { this.pointers.set(id, { kind: 'button', id: sb }); return; }
      // A phone modal covers the HUD: blank panel space must not activate a hidden button.
      if (!inRect(settingsPanelRect(layout), x, y) && hitHudButton(layout, x, y) === 'settings') {
        this.pointers.set(id, { kind: 'button', id: 'settings' }); return;
      }
      if (!inRect(settingsPanelRect(layout), x, y)) { this.pointers.set(id, { kind: 'dismiss-settings' }); return; }
      return;
    }

    // 1. Right-click quick-sells tower at (x, y) and closes any radial on that tower.
    if (type === 'mouse' && button === 2) {
      const c = cellAt(x, y, layout.board, layout.boardRotated);
      const t = c ? this.game.towerAt[this.game.idx(c.x, c.y)] : null;
      if (t && this.openRadials.get(t.owner)?.towerId === t.id) this.openRadials.delete(t.owner);
      this.sellAt(x, y);
      return;
    }
    if (type === 'mouse' && button !== 0) return;

    // 2. Open radial menu buttons (per-owner, supports simultaneous players).
    for (const m of this.openRadials.values()) {
      const rt = this.game.towerById(m.towerId);
      const showRepair = !!rt && rt.hp < rt.maxHp;
      const action = hitRadialButton(m.cx, m.cy, m.rot, x, y, layout.stageW, layout.stageH, showRepair);
      if (action) {
        this.pointers.set(id, { kind: 'radial-btn', owner: m.owner, towerId: m.towerId, action });
        return;
      }
    }

    // 3. Always-on HUD buttons.
    const hb = hitHudButton(layout, x, y);
    if (hb) { this.pointers.set(id, { kind: 'button', id: hb }); return; }

    // 3b. End-of-match summary card buttons (when match is over and settings modal is closed).
    if (this.game.over !== null) {
      const sb = hitSummaryButton(layout, x, y, this.game.over === 'won' && this.game.mode === 'normal');
      if (sb) { this.pointers.set(id, { kind: 'button', id: sb }); return; }
    }

    // 4. Player docks: credit chip (multiplayer) or Move Card button (1P desktop), then turret slots.
    for (const dock of layout.docks) {
      if (dock.player >= this.game.playerCount) continue;
      if (this.game.playerCount === 1 && layout.id === '1p-base' && hitCreditChip(dock, x, y)) {
        this.pointers.set(id, { kind: 'move-dock', player: dock.player });
        return;
      }
      if (this.game.playerCount > 1 && hitCreditChip(dock, x, y)) {
        const credits = this.game.credits[dock.player] ?? 0;
        const chosen = this.shareAmount(dock.player);
        const amount = credits >= CREDIT_MIN_TRANSFER ? Math.min(chosen, Math.floor(credits)) : 0;
        const cd: CreditDragState = {
          pointerId: id, fromPlayer: dock.player, amount,
          startX: x, startY: y, startT: now, moved: false,
          px: x, py: y, vx: 0, vy: 0, targetPlayer: null,
        };
        this.creditDrags.set(id, cd);
        this.creditLastT.set(id, now);
        this.pointers.set(id, { kind: 'credit' });
        return;
      }
      const order = activeTurretOrder(this.game.currentMap.mechanic);
      const slot = hitDockSlot(dock, x, y, order.length);
      if (slot < 0) continue;
      const up = dockUp(dock);
      // Ownership is captured here, at drag start, and never recomputed from position.
      const d: DragState = {
        pointerId: id, owner: dock.player, turretId: order[slot], px: x, py: y, ax: x, ay: y,
        upx: up.x, upy: up.y, touch: type !== 'mouse', cell: null, result: null,
      };
      this.drags.set(id, d);
      this.pointers.set(id, { kind: 'drag' });
      this.refreshDrag(d);
      return;
    }

    // 5. Board tower tap.
    const c = cellAt(x, y, layout.board, layout.boardRotated);
    const tower = c ? this.game.towerAt[this.game.idx(c.x, c.y)] : null;
    if (c && tower) {
      this.pointers.set(id, { kind: 'tap', cx: c.x, cy: c.y, towerId: tower.id, x, y, t: now });
      return;
    }

    // 6. Empty space tap (closes open radials on release).
    this.pointers.set(id, { kind: 'empty-tap', x, y, t: now });
  }

  pointerMove(id: number, x: number, y: number, now = 0): void {
    const p = this.pointers.get(id);
    if (!p) return;
    if (p.kind === 'drag') {
      const d = this.drags.get(id)!;
      d.px = x; d.py = y;
      this.refreshDrag(d);
    } else if (p.kind === 'credit') {
      const cd = this.creditDrags.get(id)!;
      if (Math.hypot(x - cd.startX, y - cd.startY) > TAP_SLOP) cd.moved = true;
      const lastT = this.creditLastT.get(id) ?? now;
      const dt = (now - lastT) / 1000;
      if (dt > 0 && dt < 0.25) {
        const ivx = (x - cd.px) / dt;
        const ivy = (y - cd.py) / dt;
        if (cd.vx === 0 && cd.vy === 0) { cd.vx = ivx; cd.vy = ivy; }
        else { cd.vx = cd.vx * 0.4 + ivx * 0.6; cd.vy = cd.vy * 0.4 + ivy * 0.6; }
      }
      if (now > lastT) this.creditLastT.set(id, now);
      cd.px = x; cd.py = y;
      const target = cd.amount >= CREDIT_MIN_TRANSFER ? this.resolveCreditTarget(cd, x, y) : null;
      cd.targetPlayer = target ? target.player : null;
    } else if ((p.kind === 'tap' || p.kind === 'empty-tap') && Math.hypot(x - p.x, y - p.y) > TAP_SLOP) {
      this.pointers.set(id, { kind: 'idle' });
    }
  }

  pointerUp(id: number, x: number, y: number, now: number): void {
    const p = this.pointers.get(id);
    if (!p) return;
    this.pointers.delete(id);
    if (p.kind === 'drag') {
      const d = this.drags.get(id)!;
      this.drags.delete(id);
      d.px = x; d.py = y;
      this.aim(d);
      if (!d.cell) return; // dropped outside the grid: silently discarded
      // Revalidate and commit atomically against the state at release time.
      const r = this.game.tryPlace(d.owner, d.turretId, d.cell.x, d.cell.y);
      this.hooks.toast(reasonText(r.reason, this.game.currentMap.theme), d.ax, d.ay, r.ok);
      this.hooks.sound?.(r.ok ? 'ui-place' : 'ui-error');
    } else if (p.kind === 'dismiss-settings') {
      this.closeSettings();
    } else if (p.kind === 'button') {
      const layout = this.getLayout();
      const hit: ButtonId | null = this.settingsOpen
        ? hitSettingsButton(layout, x, y)
        : hitHudButton(layout, x, y) ?? (this.game.over !== null ? hitSummaryButton(layout, x, y, this.game.over === 'won' && this.game.mode === 'normal') : null);
      if (hit === p.id || (this.settingsOpen && p.id === 'settings' && hitHudButton(layout, x, y) === 'settings')) {
        this.hooks.button(p.id);
      }
    } else if (p.kind === 'radial-btn') {
      const m = this.openRadials.get(p.owner);
      if (!m || m.towerId !== p.towerId) return;
      const layout = this.getLayout();
      const rt = this.game.towerById(m.towerId);
      const showRepair = !!rt && rt.hp < rt.maxHp;
      if (hitRadialButton(m.cx, m.cy, m.rot, x, y, layout.stageW, layout.stageH, showRepair) !== p.action) return;
      if (p.action === 'upgrade') {
        const r = this.game.upgradeTower(p.towerId);
        if (r.ok) {
          this.hooks.toast(r.name ? `Upgraded: ${r.name}` : `Tier ${r.tier ?? ''}`, m.cx, m.cy, true);
          this.hooks.sound?.('ui-upgrade');
          this.openRadials.delete(p.owner);
        } else {
          const msg = r.reason === 'funds' ? 'Not enough credits' : r.reason === 'max-tier' ? 'Max tier' : r.reason;
          this.hooks.toast(msg, m.cx, m.cy, false);
          this.hooks.sound?.('ui-error');
        }
      } else if (p.action === 'priority') {
        const next = this.game.cycleTowerPriority(p.towerId);
        if (next !== null) this.hooks.toast(`Target: ${next.toUpperCase()}`, m.cx, m.cy, true);
      } else if (p.action === 'sell') {
        const refund = this.game.sellTower(p.towerId);
        if (refund !== null) {
          this.hooks.toast(`Sold +${refund.toFixed(1)}`, m.cx, m.cy, true);
          this.hooks.sound?.('ui-sell');
        }
        this.openRadials.delete(p.owner);
      } else if (p.action === 'repair') {
        const r = this.game.repairTower(m.towerId, m.owner);
        if (r.ok) {
          this.hooks.toast(`Repaired (-${r.cost} cr)`, m.cx, m.cy, true);
          this.hooks.sound?.('ui-repair');
        } else {
          this.hooks.toast(reasonText(r.reason, this.game.currentMap.theme), m.cx, m.cy, false);
          this.hooks.sound?.('ui-error');
        }
        this.openRadials.delete(m.owner);
      }
    } else if (p.kind === 'move-dock') {
      const dock = this.getLayout().docks.find(d => d.player === p.player);
      if (dock && hitCreditChip(dock, x, y)) {
        this.hooks.moveSoloDock?.();
      }
    } else if (p.kind === 'credit') {
      const cd = this.creditDrags.get(id)!;
      this.creditDrags.delete(id);
      this.creditLastT.delete(id);
      const dist = Math.hypot(x - cd.startX, y - cd.startY);
      const speed = Math.hypot(cd.vx, cd.vy);
      if (!cd.moved && dist <= TAP_SLOP && speed < FLICK_MIN_SPEED && now - cd.startT < TAP_MS) {
        const nextAmt = this.cycleShareAmount(cd.fromPlayer);
        this.hooks.toast(`Share: ${nextAmt} cr`, x, y, true);
        return;
      }
      if (cd.amount < CREDIT_MIN_TRANSFER) {
        this.hooks.toast('Not enough credits', x, y, false);
        this.hooks.sound?.('ui-error');
        return;
      }
      const recipient = this.resolveCreditTarget(cd, x, y);
      if (!recipient) return;
      const res = this.game.transferCredits(cd.fromPlayer, recipient.player, cd.amount);
      if (res.ok && res.transferred > 0) {
        this.hooks.creditFly?.(cd.fromPlayer, recipient.player, res.transferred, x, y, recipient.cx, recipient.cy);
        this.hooks.toast(`+${res.transferred} cr -> P${recipient.player + 1}`, recipient.cx, recipient.cy, true);
        this.hooks.sound?.('ui-share');
      }
    } else if (p.kind === 'tap') {
      const layout = this.getLayout();
      const c = cellAt(x, y, layout.board, layout.boardRotated);
      if (c && c.x === p.cx && c.y === p.cy && now - p.t < TAP_MS) {
        const tower = this.game.towerById(p.towerId);
        if (!tower) return;
        const existing = this.openRadials.get(tower.owner);
        if (existing && existing.towerId === tower.id) {
          this.openRadials.delete(tower.owner);
        } else {
          const ownerDock = layout.docks.find(d => d.player === tower.owner) ?? layout.docks[0];
          const center = boardCellCenter(layout.board, tower.x, tower.y, layout.boardRotated);
          this.openRadials.set(tower.owner, {
            towerId: tower.id,
            owner: tower.owner,
            cx: center.x,
            cy: center.y,
            rot: ownerDock ? ownerDock.rot : 0,
          });
        }
      }
    } else if (p.kind === 'empty-tap') {
      if (now - p.t < TAP_MS) {
        // Keep any menu another pointer is mid-press on, so its release still commits.
        const held = new Set<number>();
        for (const q of this.pointers.values()) if (q.kind === 'radial-btn') held.add(q.owner);
        for (const owner of [...this.openRadials.keys()]) if (!held.has(owner)) this.openRadials.delete(owner);
      }
    }
  }

  /** Pointer cancelled, capture lost, etc.: drop everything it owned without side effects. */
  cancel(id: number): void {
    this.pointers.delete(id);
    this.drags.delete(id);
    this.creditDrags.delete(id);
    this.creditLastT.delete(id);
  }
  cancelAll(): void {
    this.pointers.clear();
    this.drags.clear();
    this.creditDrags.clear();
    this.creditLastT.clear();
    this.openRadials.clear();
    this.settingsOpen = false;
  }

  /** Re-evaluate ghosts and prune stale radial menus against the live simulation (call every frame). */
  refreshAll(): void {
    for (const d of this.drags.values()) this.refreshDrag(d);
    for (const [owner, m] of this.openRadials) {
      if (!this.game.towerById(m.towerId)) this.openRadials.delete(owner);
    }
  }

  private resolveCreditTarget(cd: CreditDragState, x: number, y: number): Dock | null {
    const docks = this.getLayout().docks;
    let directDock: Dock | null = null;
    let directDist = Infinity;
    for (const d of docks) {
      if (d.player === cd.fromPlayer || d.player >= this.game.playerCount) continue;
      if (hitDockBody(d, x, y, 48)) {
        const dist = Math.hypot(d.cx - x, d.cy - y);
        if (dist < directDist) { directDist = dist; directDock = d; }
      }
    }
    if (directDock) return directDock;

    const speed = Math.hypot(cd.vx, cd.vy);
    if (speed < FLICK_MIN_SPEED) return null;
    const ux = cd.vx / speed, uy = cd.vy / speed;
    let bestDock: Dock | null = null;
    let bestCos = 0.7;
    for (const d of docks) {
      if (d.player === cd.fromPlayer || d.player >= this.game.playerCount) continue;
      const dx = d.cx - x, dy = d.cy - y;
      const dist = Math.hypot(dx, dy);
      if (dist <= 1e-6) continue;
      const cos = (ux * dx + uy * dy) / dist;
      if (cos >= bestCos) { bestCos = cos; bestDock = d; }
    }
    return bestDock;
  }

  private aim(d: DragState): void {
    const lift = d.touch ? TOUCH_LIFT : 0;
    d.ax = d.px + d.upx * lift;
    d.ay = d.py + d.upy * lift;
    const layout = this.getLayout();
    d.cell = cellAt(d.ax, d.ay, layout.board, layout.boardRotated);
  }
  private refreshDrag(d: DragState): void {
    this.aim(d);
    d.result = d.cell ? this.game.check(d.owner, d.turretId, d.cell.x, d.cell.y) : null;
  }
  private sellAt(x: number, y: number): void {
    const layout = this.getLayout();
    const c = cellAt(x, y, layout.board, layout.boardRotated);
    if (!c) return;
    const refund = this.game.sellAt(c.x, c.y);
    if (refund !== null) {
      this.hooks.toast(`Sold +${refund.toFixed(1)}`, x, y, true);
      this.hooks.sound?.('ui-sell');
    }
  }
}
