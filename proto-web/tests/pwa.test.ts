import { describe, expect, it } from 'vitest';
import {
  ACTIVATE_MESSAGE, BLOCKED_MESSAGE, PwaController, canApplyGameUpdate,
  type GameUpdateView, type ContainerLike, type PwaEnv, type RegistrationLike, type WorkerLike,
} from '../src/pwa';

class FakeWorker implements WorkerLike {
  state = 'installing';
  sent: unknown[] = [];
  private fns: (() => void)[] = [];
  postMessage(m: unknown) { this.sent.push(m); }
  addEventListener(_t: 'statechange', fn: () => void) { this.fns.push(fn); }
  set(state: string) { this.state = state; this.fns.forEach(f => f()); }
}
class FakeReg implements RegistrationLike {
  waiting: FakeWorker | null = null;
  installing: FakeWorker | null = null;
  updates = 0;
  updateImpl: () => Promise<unknown> = async () => undefined;
  private fns: (() => void)[] = [];
  update() { this.updates++; return this.updateImpl(); }
  addEventListener(_t: 'updatefound', fn: () => void) { this.fns.push(fn); }
  found(w: FakeWorker) { this.installing = w; this.fns.forEach(f => f()); }
}
class FakeContainer implements ContainerLike {
  controller: unknown = null;
  reg = new FakeReg();
  registerError: Error | null = null;
  private fns: (() => void)[] = [];
  async register() { if (this.registerError) throw this.registerError; return this.reg; }
  addEventListener(_t: 'controllerchange', fn: () => void) { this.fns.push(fn); }
  change() { this.fns.forEach(f => f()); }
}
class FakeWin {
  handlers = new Map<string, ((ev: any) => void)[]>();
  addEventListener(t: string, fn: (ev: any) => void) { this.handlers.set(t, [...(this.handlers.get(t) ?? []), fn]); }
  emit(t: string, ev: any = {}) { (this.handlers.get(t) ?? []).forEach(f => f(ev)); }
}

function setup(opts: { production?: boolean; controlled?: boolean; safe?: boolean; standalone?: boolean; noContainer?: boolean } = {}) {
  const container = new FakeContainer();
  if (opts.controlled) container.controller = {};
  const win = new FakeWin();
  const state = { safe: opts.safe ?? true, reloads: 0 };
  const env: PwaEnv = {
    production: opts.production ?? true,
    container: opts.noContainer ? null : container,
    win,
    isStandalone: () => !!opts.standalone,
    reload: () => { state.reloads++; },
    canApply: () => state.safe,
    setTimer: () => 0,
  };
  return { pwa: new PwaController(env), container, win, state };
}
function installEvent(outcome: 'accepted' | 'dismissed' | 'throw') {
  const ev = { prevented: false, prompts: 0 };
  return Object.assign(ev, {
    preventDefault() { ev.prevented = true; },
    async prompt() { ev.prompts++; if (outcome === 'throw') throw new Error('x'); },
    userChoice: Promise.resolve({ outcome: outcome === 'throw' ? 'dismissed' as const : outcome }),
  });
}
async function withWaiting(opts: Parameters<typeof setup>[0] = {}) {
  const s = setup({ controlled: true, ...opts });
  const w = new FakeWorker(); w.state = 'installed';
  s.container.reg.waiting = w;
  await s.pwa.start();
  return { ...s, w };
}

describe('pwa lifecycle', () => {
  it('retiring the previous active worker does not cancel an explicit update reload', async () => {
    const { pwa, container, state } = setup();
    await pwa.start();
    const original = new FakeWorker();
    container.reg.found(original);
    original.set('installed'); original.set('activated'); container.change();
    const next = new FakeWorker();
    container.reg.found(next); next.set('installed'); container.reg.waiting = next;
    await pwa.update();
    container.reg.waiting = null;
    original.set('redundant'); // normal browser ordering when the replacement activates
    expect(pwa.updateState).toBe('applying');
    container.change();
    expect(state.reloads).toBe(1);
  });

  it('first activation claims silently: no update prompt, no reload', async () => {
    const { pwa, container, state } = setup(); // uncontrolled first visit
    await pwa.start();
    const w = new FakeWorker(); container.reg.found(w); w.set('installed'); w.set('activated');
    container.change(); // clients.claim()
    expect(pwa.updateAvailable).toBe(false);
    expect(state.reloads).toBe(0);
  });

  it('waiting worker is reported ready but never applied or reloaded automatically', async () => {
    const { pwa, state, w, container } = await withWaiting();
    expect(pwa.updateAvailable).toBe(true);
    expect(w.sent).toEqual([]);
    container.change(); // another tab activated an update
    expect(state.reloads).toBe(0);
  });

  it('detects an update found while running', async () => {
    const { pwa, container } = setup({ controlled: true });
    await pwa.start();
    const w = new FakeWorker(); container.reg.found(w);
    expect(pwa.updateState).toBe('downloading');
    w.set('installed');
    expect(pwa.updateAvailable).toBe(true);
  });

  it('explicit apply posts the activation message once and reloads once on controllerchange', async () => {
    const { pwa, container, state, w } = await withWaiting();
    await pwa.update(); await pwa.update(); // duplicate clicks
    expect(w.sent).toEqual([ACTIVATE_MESSAGE]);
    container.change(); container.change();
    expect(state.reloads).toBe(1);
  });

  it('blocks apply mid-match, keeps the update pending, and revalidates at click time', async () => {
    const { pwa, state, w, container } = await withWaiting({ safe: false });
    await pwa.update();
    expect(pwa.statusText()).toBe(BLOCKED_MESSAGE);
    expect(w.sent).toEqual([]);
    expect(pwa.updateAvailable).toBe(true);
    container.change();
    expect(state.reloads).toBe(0);
    state.safe = true; // match ended / reset
    await pwa.update();
    expect(w.sent).toEqual([ACTIVATE_MESSAGE]);
  });

  it('no update: check reports latest; failures do not leave the controller pending', async () => {
    const { pwa, container } = setup({ controlled: true });
    await pwa.start();
    await pwa.update();
    expect(container.reg.updates).toBe(1);
    expect(pwa.statusText()).toMatch(/latest/i);
    container.reg.updateImpl = async () => { throw new Error('offline'); };
    await pwa.update();
    expect(pwa.updateState).toBe('none');
    expect(pwa.statusText()).toMatch(/Could not check/);
    await pwa.update(); // still usable
    expect(container.reg.updates).toBe(3);
  });

  it('first claim then a later waiting update in the same session is reported ready without navigation', async () => {
    const { pwa, container, state } = setup(); // uncontrolled first visit
    await pwa.start();
    const first = new FakeWorker(); container.reg.found(first); first.set('installed'); first.set('activated');
    container.change(); // claim
    expect(pwa.updateAvailable).toBe(false);
    const next = new FakeWorker(); container.reg.found(next); next.set('installed');
    expect(pwa.updateAvailable).toBe(true);
    expect(state.reloads).toBe(0);
  });

  it('revalidates on controllerchange: unsafe now keeps the page, later explicit update reloads once', async () => {
    const { pwa, container, state, w } = await withWaiting();
    await pwa.update();
    expect(w.sent).toEqual([ACTIVATE_MESSAGE]);
    state.safe = false; // another finger started a match during activation
    container.reg.waiting = null;
    container.change();
    expect(state.reloads).toBe(0);
    expect(pwa.statusText()).toBe(BLOCKED_MESSAGE);
    expect(pwa.updateState).toBe('ready');
    await pwa.update(); // still blocked
    expect(state.reloads).toBe(0);
    state.safe = true;
    await pwa.update(); await pwa.update();
    expect(state.reloads).toBe(1);
    container.change();
    expect(state.reloads).toBe(1);
  });

  it('other-tab activation never reloads automatically but offers an explicit refresh', async () => {
    const { pwa, container, state } = setup({ controlled: true });
    await pwa.start();
    container.change();
    expect(state.reloads).toBe(0);
    expect(pwa.updateAvailable).toBe(true);
    await pwa.update();
    expect(state.reloads).toBe(1);
  });

  it('redundant install shows an actionable failure and recovers, even before update() resolves', async () => {
    const { pwa, container } = setup({ controlled: true });
    await pwa.start();
    let release!: () => void;
    container.reg.updateImpl = () => new Promise<void>(r => { release = r; });
    const pending = pwa.update();
    expect(pwa.updateState).toBe('checking');
    const w = new FakeWorker(); container.reg.found(w); w.set('redundant');
    expect(pwa.updateState).toBe('none');
    expect(pwa.statusText()).toMatch(/could not be installed/i);
    expect(pwa.updateDisabled()).toBe(false);
    release(); await pending;
    expect(pwa.updateState).toBe('none');
    expect(pwa.statusText()).toMatch(/could not be installed/i);
    // downloading -> redundant also recovers
    container.reg.updateImpl = async () => undefined;
    const w2 = new FakeWorker(); container.reg.found(w2);
    expect(pwa.updateState).toBe('downloading');
    w2.set('redundant');
    expect(pwa.updateState).toBe('none');
    expect(pwa.updateDisabled()).toBe(false);
  });

  it('already-redundant worker found by update() does not stick on downloading', async () => {
    const { pwa, container } = setup({ controlled: true });
    await pwa.start();
    container.reg.updateImpl = async () => { const w = new FakeWorker(); w.state = 'redundant'; container.reg.installing = w; };
    await pwa.update();
    expect(pwa.updateState).toBe('none');
    expect(pwa.statusText()).toMatch(/could not be installed/i);
  });

  it('registration failure is contained', async () => {
    const { pwa, container } = setup();
    container.registerError = new Error('denied');
    await expect(pwa.start()).resolves.toBeUndefined();
    await pwa.update();
    expect(pwa.updateState).toBe('none');
    expect(pwa.updateDisabled()).toBe(false);
  });

  it('dev build never registers and degrades quietly', async () => {
    const { pwa, container } = setup({ production: false });
    let registered = false;
    container.register = async () => { registered = true; return container.reg; };
    await pwa.start(); await pwa.update();
    expect(registered).toBe(false);
    expect(pwa.updateDisabled()).toBe(true);
    expect(pwa.statusText()).not.toMatch(/service|worker|cache/i);
  });

  it('missing service worker support is contained', async () => {
    const { pwa } = setup({ noContainer: true });
    await expect(pwa.start()).resolves.toBeUndefined();
  });
});

describe('canApplyGameUpdate', () => {
  const fresh = (): GameUpdateView => ({
    over: null, launched: false, mode: 'normal', waveCursor: 0, towers: [], enemies: [], spawners: [],
    credits: [300, 300], ledger: { start: 600, granted: 0, bounty: 0, refunded: 0, spent: 0 },
  });
  it('allows fresh planning, a reset game, and ended games', () => {
    expect(canApplyGameUpdate(fresh())).toBe(true);
    const ended = { ...fresh(), over: 'lost' as const, launched: true, waveCursor: 4, towers: [{}] };
    expect(canApplyGameUpdate(ended)).toBe(true);
    expect(canApplyGameUpdate({ ...ended, over: 'won' as const })).toBe(true);
  });
  it('blocks pre-wave placement, spending, refunds and transfers', () => {
    expect(canApplyGameUpdate({ ...fresh(), towers: [{}] })).toBe(false);
    const spent = { ...fresh(), credits: [250, 300], ledger: { ...fresh().ledger, spent: 50 } };
    expect(canApplyGameUpdate(spent)).toBe(false);
    const refunded = { ...fresh(), ledger: { ...fresh().ledger, spent: 50, refunded: 50 } };
    expect(canApplyGameUpdate(refunded)).toBe(false);
    expect(canApplyGameUpdate({ ...fresh(), credits: [350, 250] })).toBe(false); // transfer
    expect(canApplyGameUpdate({ ...fresh(), ledger: { ...fresh().ledger, granted: 10 } })).toBe(false);
  });
  it('blocks launched, paused, between-wave and stress states', () => {
    expect(canApplyGameUpdate({ ...fresh(), launched: true })).toBe(false);
    expect(canApplyGameUpdate({ ...fresh(), launched: true, waveCursor: 2 })).toBe(false);
    expect(canApplyGameUpdate({ ...fresh(), waveCursor: 1 })).toBe(false);
    expect(canApplyGameUpdate({ ...fresh(), mode: 'stress' })).toBe(false);
    expect(canApplyGameUpdate({ ...fresh(), enemies: [{}] })).toBe(false);
    expect(canApplyGameUpdate({ ...fresh(), spawners: [{}] })).toBe(false);
  });
});

describe('pwa install', () => {
  it('captures the early prompt and shows it only on user action; accepted', async () => {
    const { pwa, win } = setup();
    const ev = installEvent('accepted');
    win.emit('beforeinstallprompt', ev);
    expect(ev.prevented).toBe(true);
    expect(ev.prompts).toBe(0);
    await pwa.install(); await pwa.install();
    expect(ev.prompts).toBe(1);
    expect(pwa.installed).toBe(true);
    expect(pwa.installDisabled()).toBe(true);
  });

  it('dismissed leaves the app installable via menu guidance', async () => {
    const { pwa, win } = setup();
    win.emit('beforeinstallprompt', installEvent('dismissed'));
    await pwa.install();
    expect(pwa.installed).toBe(false);
    expect(pwa.statusText()).toMatch(/browser menu/);
    await pwa.install(); // single-use event consumed: falls back to guidance, no crash
    expect(pwa.statusText()).toMatch(/Add to Home Screen/);
  });

  it('unsupported browser gives guidance and prompt errors are contained', async () => {
    const a = setup();
    await a.pwa.install();
    expect(a.pwa.statusText()).toMatch(/Add to Home Screen/);
    const b = setup();
    b.win.emit('beforeinstallprompt', installEvent('throw'));
    await b.pwa.install();
    expect(b.pwa.installed).toBe(false);
  });

  it('standalone and appinstalled states never prompt', async () => {
    const s = setup({ standalone: true });
    const ev = installEvent('accepted');
    s.win.emit('beforeinstallprompt', ev);
    await s.pwa.install();
    expect(ev.prompts).toBe(0);
    expect(s.pwa.installed).toBe(true);
    const t = setup();
    t.win.emit('appinstalled');
    expect(t.pwa.installed).toBe(true);
  });
});
