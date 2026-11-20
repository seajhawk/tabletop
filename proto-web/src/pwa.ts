// Install / offline-update controller. All browser access goes through PwaEnv so the lifecycle can be unit
// tested with mocks. Updates are never applied implicitly: the page must ask, and only when no match is in progress.
const BASE_URL = (import.meta.env?.BASE_URL ?? '/').replace(/\/?$/, '/');
export const SW_URL = `${BASE_URL}ga-sw.js`;
export const SW_SCOPE = BASE_URL;
export const ACTIVATE_MESSAGE = { type: 'GA_SKIP_WAITING' };
export const BLOCKED_MESSAGE = 'Finish or reset the match before updating.';

export interface WorkerLike {
  state: string;
  postMessage(msg: unknown): void;
  addEventListener(type: 'statechange', fn: () => void): void;
}
export interface RegistrationLike {
  waiting: WorkerLike | null;
  installing: WorkerLike | null;
  update(): Promise<unknown>;
  addEventListener(type: 'updatefound', fn: () => void): void;
}
export interface ContainerLike {
  controller: unknown;
  register(url: string, opts: { scope: string }): Promise<RegistrationLike>;
  addEventListener(type: 'controllerchange', fn: () => void): void;
}
export interface InstallPromptEvent {
  preventDefault(): void;
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
export interface EventHost { addEventListener(type: string, fn: (ev: any) => void): void }
export interface PwaEnv {
  production: boolean;
  container: ContainerLike | null;
  win: EventHost;
  isStandalone(): boolean;
  reload(): void;
  /** True when applying an update would not interrupt a match in progress. */
  canApply(): boolean;
  setTimer?(fn: () => void, ms: number): unknown;
}

export type UpdateState = 'none' | 'checking' | 'downloading' | 'ready' | 'applying';

/** The slice of Game state that decides whether a reload would discard progress. */
export interface GameUpdateView {
  over: unknown;
  launched: boolean;
  mode: string;
  waveCursor: number;
  towers: readonly unknown[];
  enemies: readonly unknown[];
  spawners: readonly unknown[];
  credits: readonly number[];
  ledger: { start: number; granted: number; bounty: number; refunded: number; spent: number };
}

/** Safe to reload: the match ended, or it is truly fresh planning with no placement or economy activity. */
export function canApplyGameUpdate(g: GameUpdateView): boolean {
  if (g.over !== null && g.over !== undefined) return true;
  if (g.launched || g.mode !== 'normal' || g.waveCursor !== 0) return false;
  if (g.towers.length || g.enemies.length || g.spawners.length) return false;
  const l = g.ledger;
  if (l.spent !== 0 || l.granted !== 0 || l.bounty !== 0 || l.refunded !== 0) return false;
  if (g.credits.length === 0) return false;
  const each = l.start / g.credits.length;
  return g.credits.every(c => Math.abs(c - each) < 1e-6);
}

export class PwaController {
  updateState: UpdateState = 'none';
  installed: boolean;
  message = '';
  registered = false;
  private reg: RegistrationLike | null = null;
  private hadController = false;
  private deferred: InstallPromptEvent | null = null;
  private promptBusy = false;
  private reloaded = false;
  /** A new worker already controls this page (activation finished) but we have not reloaded onto it yet. */
  private activated = false;

  constructor(private env: PwaEnv) {
    this.installed = env.isStandalone();
    // Listen from construction so an early beforeinstallprompt is not missed.
    env.win.addEventListener('beforeinstallprompt', ev => {
      ev.preventDefault();
      if (this.installed) return;
      this.deferred = ev as InstallPromptEvent;
    });
    env.win.addEventListener('appinstalled', () => {
      this.installed = true; this.deferred = null; this.message = 'App installed.';
    });
  }

  /** Register the worker (production only). Failures are swallowed into a status message. */
  async start(): Promise<void> {
    const c = this.env.container;
    if (!this.env.production || !c) return;
    this.hadController = !!c.controller;
    c.addEventListener('controllerchange', () => {
      const had = this.hadController;
      this.hadController = true;
      if (!had) return; // first claim: nothing to update, never reload
      if (this.reloaded) return;
      if (this.updateState === 'applying') {
        // Revalidate: another finger may have started a match while activation was in flight.
        if (this.env.canApply()) { this.reloaded = true; this.env.reload(); return; }
      }
      // Other tab's activation, or this page's no longer safe: stay alive and offer an explicit refresh later.
      this.activated = true;
      this.updateState = 'ready';
      this.message = this.env.canApply() ? 'Update ready. Tap Update app to restart.' : BLOCKED_MESSAGE;
    });
    try {
      const reg = await c.register(SW_URL, { scope: SW_SCOPE });
      this.reg = reg; this.registered = true;
      reg.addEventListener('updatefound', () => this.watch(reg.installing));
      if (reg.waiting && this.hadController) this.markReady();
      else this.watch(reg.installing);
    } catch {
      this.registered = false;
      this.message = 'Offline mode is unavailable in this browser.';
    }
  }

  private watch(w: WorkerLike | null): void {
    if (!w) return;
    let wasActive = w.state === 'activated';
    if (this.updateState === 'none' && this.hadController) this.updateState = 'downloading';
    const onState = () => {
      if (w.state === 'activated') { wasActive = true; return; }
      if (w.state === 'installed' && this.hadController) this.markReady();
      else if (w.state === 'redundant' && !wasActive) {
        const s = this.updateState;
        if (s === 'applying' || s === 'downloading' || s === 'checking') {
          if (this.reg?.waiting && this.hadController) this.markReady();
          else {
            this.updateState = 'none';
            this.message = 'Update could not be installed. Tap Update app to try again.';
          }
        }
      }
    };
    w.addEventListener('statechange', onState);
    onState(); // the worker may already have settled before we attached
  }

  private markReady(): void {
    this.updateState = 'ready';
    this.message = 'Update ready. Tap Update app to restart.';
  }

  get updateAvailable(): boolean { return this.updateState === 'ready'; }
  get canInstallPrompt(): boolean { return !!this.deferred && !this.installed; }

  installLabel(): string { return this.installed ? 'App installed ✓' : 'Install app'; }
  installDisabled(): boolean { return this.installed; }
  updateLabel(): string {
    switch (this.updateState) {
      case 'ready': return 'Update app ●';
      case 'checking': return 'Checking…';
      case 'downloading': return 'Downloading…';
      case 'applying': return 'Updating…';
      default: return 'Update app';
    }
  }
  updateDisabled(): boolean {
    return this.updateState === 'checking' || this.updateState === 'downloading' || this.updateState === 'applying' ||
      !this.env.production;
  }
  statusText(): string {
    if (this.message) return this.message;
    if (!this.env.production) return 'Offline install is available in the production build.';
    return '';
  }

  /** User gesture only. Never prompts automatically. */
  async install(): Promise<void> {
    if (this.installed || this.promptBusy) return;
    const ev = this.deferred;
    if (!ev) {
      this.message = 'Use your browser menu: Install app or Add to Home Screen.';
      return;
    }
    this.promptBusy = true;
    this.deferred = null; // a captured prompt event is single use
    try {
      await ev.prompt();
      const choice = await ev.userChoice;
      if (choice.outcome === 'accepted') { this.installed = true; this.message = 'App installed.'; }
      else this.message = 'Install skipped. You can also use your browser menu.';
    } catch {
      this.message = 'Use your browser menu: Install app or Add to Home Screen.';
    } finally {
      this.promptBusy = false;
    }
  }

  /** Apply a ready update (when safe) or check for a new one. */
  async update(): Promise<void> {
    if (!this.env.production || !this.reg) {
      this.message = this.env.production ? 'Offline mode is unavailable in this browser.' : 'Updates apply to the production build.';
      return;
    }
    if (this.updateState === 'checking' || this.updateState === 'applying' || this.updateState === 'downloading') return;
    if (this.updateState === 'ready') { this.apply(); return; }
    this.updateState = 'checking';
    this.message = 'Checking for updates…';
    try {
      await this.reg.update();
      if (this.updateState !== 'checking') return; // a redundant install or activation already settled the state
      const r = this.reg;
      if (r.waiting && this.hadController) this.markReady();
      else if (r.installing) { this.updateState = 'downloading'; this.message = 'Downloading update…'; this.watch(r.installing); }
      else { this.updateState = 'none'; this.message = 'You have the latest version.'; }
    } catch {
      if (this.updateState !== 'checking') return;
      this.updateState = 'none';
      this.message = 'Could not check for updates. Try again when online.';
    }
  }

  private apply(): void {
    // Revalidated at the moment of the action, not only when the button was drawn.
    if (!this.env.canApply()) { this.message = BLOCKED_MESSAGE; return; }
    if (this.activated && !this.reg?.waiting) { // new worker already controls this page: just reload, once
      if (!this.reloaded) { this.reloaded = true; this.message = 'Updating…'; this.env.reload(); }
      return;
    }
    const w = this.reg?.waiting;
    if (!w) { this.updateState = 'none'; this.message = 'You have the latest version.'; return; }
    this.updateState = 'applying';
    this.message = 'Updating…';
    try {
      w.postMessage(ACTIVATE_MESSAGE);
    } catch {
      this.updateState = 'ready'; this.message = 'Update failed. Try again.';
      return;
    }
    // If activation never happens, do not leave the button stuck.
    (this.env.setTimer ?? ((fn, ms) => setTimeout(fn, ms)))(() => {
      if (this.updateState === 'applying' && !this.reloaded) {
        this.updateState = this.reg?.waiting ? 'ready' : 'none';
        this.message = 'Update did not finish. Try again.';
      }
    }, 10000);
  }
}

export function createBrowserPwa(canApply: () => boolean): PwaController {
  const standalone = () =>
    (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches) ||
    (navigator as unknown as { standalone?: boolean }).standalone === true;
  return new PwaController({
    production: import.meta.env.PROD,
    container: 'serviceWorker' in navigator ? (navigator.serviceWorker as unknown as ContainerLike) : null,
    win: window,
    isStandalone: standalone,
    reload: () => location.reload(),
    canApply,
  });
}
