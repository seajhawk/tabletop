// Galactic Defense - bounded native Windows Chrome PWA install + cold offline launch smoke (Node builtins only).
//
//   node scripts/pwa-desktop-smoke.mjs --shutdown-fixture-for-offline [--base TTDefense|tabletop|root]
//        [--origin http://127.0.0.1:4187] [--browser-exe "C:\Program Files\Google\Chrome\Application\chrome.exe"]
//
// Needs scripts/pwa-smoke-server.mjs --desktop-smoke already running (it is NOT started here). Drives headful Chrome it spawns itself
// (own user-data-dir under a NEW .tasks/pwa-desktop-<stamp>-<rand>/, remote-debugging-port=0, windowsHide) over raw CDP via
// a local child-process pipe. Flow: fixture A -> open page -> wait for app + activated worker + full cache -> manifest/installability
// -> PWA.install -> PWA.launch (app window) -> prove standalone + boot + sentinel -> POST fixture /shutdown (explicitly
// authorized by --shutdown-fixture-for-offline; destructive to the fixture) -> Browser.close -> relaunch SAME profile ->
// PWA.launch with no server -> prove standalone + boot + worker + cache + sentinel -> PWA.uninstall -> close.
// Never deletes directories, never touches a default profile, never kills anything except the browsers it spawned.
// Hard limit 90 s total (75 s work + 15 s cleanup). Exit 0 PASS, 1 FAIL, 2 usage, 3 BLOCKED (PWA protocol unsupported).
import path from 'node:path';
import fs from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const T0 = Date.now();
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAIN_MS = 75000, CLEAN_MS = 15000, HARD_MS = 90000;
const DEFAULT_EXE = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASES = { root: '/', tabletop: '/tabletop/', TTDefense: '/TTDefense/' };
const PWA_TRANSPORT = 'local child-process pipe';
const SENTINEL_KEY = 'ga-pwa-desktop-sentinel';
const CTRL = '/__pwa_fixture__/';
const log = (...a) => console.error('[pwa-desktop]', ...a);

// ---- args -------------------------------------------------------------------------------------------------------------
function usage(msg) {
  console.error(`${msg}\nusage: node scripts/pwa-desktop-smoke.mjs --shutdown-fixture-for-offline [--base root|tabletop|TTDefense] ` +
    '[--origin http://127.0.0.1:4187] [--browser-exe <chrome.exe>]');
  process.exit(2);
}
function parseArgs(argv) {
  const o = { exe: DEFAULT_EXE, origin: 'http://127.0.0.1:4187', baseKey: 'TTDefense', shutdown: false };
  for (let i = 0; i < argv.length; i++) {
    let a = argv[i], v = null;
    const eq = a.indexOf('=');
    if (a.startsWith('--') && eq > 0) { v = a.slice(eq + 1); a = a.slice(0, eq); }
    const val = () => { if (v !== null) return v; if (i + 1 >= argv.length) usage(`missing value for ${a}`); return argv[++i]; };
    if (a === '--browser-exe') o.exe = val();
    else if (a === '--origin') o.origin = val();
    else if (a === '--base') o.baseKey = val();
    else if (a === '--shutdown-fixture-for-offline') o.shutdown = true;
    else usage(`unknown argument: ${a}`);
  }
  if (!o.shutdown) usage('--shutdown-fixture-for-offline is REQUIRED: this run POSTs /shutdown to the fixture server to prove offline launch');
  const key = Object.keys(BASES).find(k => k === o.baseKey || BASES[k] === o.baseKey);
  if (!key) usage(`--base must be one of ${Object.keys(BASES).join(', ')}`);
  o.baseKey = key; o.base = BASES[key];
  let u; try { u = new URL(o.origin); } catch { usage(`invalid --origin: ${o.origin}`); }
  if (u.protocol !== 'http:' || u.hostname !== '127.0.0.1' || !/^\d+$/.test(u.port || '') || (u.pathname !== '/' && u.pathname !== '') || u.search || u.hash || u.username || u.password) {
    usage('--origin must be exactly http://127.0.0.1:<port> (loopback only)');
  }
  o.origin = u.origin;
  if (path.basename(o.exe).toLowerCase() !== 'chrome.exe') usage('--browser-exe must point at chrome.exe');
  if (!fs.existsSync(o.exe)) usage(`browser exe not found: ${o.exe}`);
  return o;
}
const opts = parseArgs(process.argv.slice(2));
const { origin, base } = opts;

// ---- state / result ---------------------------------------------------------------------------------------------------
const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const RUN_DIR = path.join(REPO, '.tasks', `pwa-desktop-${stamp}-${randomBytes(4).toString('hex')}`);
const PROFILE = path.join(RUN_DIR, 'profile');
const RESULT_FILE = path.join(RUN_DIR, 'result.json');
fs.mkdirSync(path.dirname(RUN_DIR), { recursive: true });
fs.mkdirSync(RUN_DIR); // non-recursive: refuses to reuse an existing directory
fs.mkdirSync(PROFILE);

const result = {
  schema: 1, tool: 'pwa-desktop-smoke', status: 'FAIL', startedAt: new Date(T0).toISOString(), durationMs: null,
  args: { browserExe: opts.exe, origin, base, baseKey: opts.baseKey },
  source: null, browser: { exe: opts.exe, version: null, product: null, userAgent: null, launches: [] },
  profileDir: PROFILE, resultFile: RESULT_FILE, fixture: null, protocol: null, manifest: null, installability: null,
  install: null, window: {}, app: {}, coldOffline: {}, checks: [], errors: [], pageIssues: [], navEvidence: [], cleanup: {},
  limitations: [
    'Real Windows Chrome PWA install writes OS shortcuts (Start menu/desktop) for the isolated profile; uninstall is expected to remove them. If cleanup.uninstall is not ok, remove the shortcut manually.',
    'No real hardware touch, DPI, thermal, or public-CDN update behaviour is covered; fixture A is a synthetic local build served from loopback.',
    'PWA.* CDP methods are experimental; an unsupported method yields BLOCKED, not PASS.',
    'PWA commands use Chrome\'s inherited local debugging pipe. The loopback port only supplies protocol metadata. No normal-profile settings or user install dialog are exercised.',
    'Network.responseReceived fromServiceWorker evidence depends on browser-level auto-attach pausing the launched app before navigation; navEvidence.kind says what was actually observed.',
  ],
};
const checks = result.checks;
const check = (name, ok, detail) => { checks.push({ name, ok: !!ok, ...(detail === undefined ? {} : { detail }) }); if (!ok) log(`CHECK FAILED: ${name}`); return !!ok; };
const trunc = (s, n = 300) => String(s).length > n ? String(s).slice(0, n) + '...' : String(s);
const errText = e => trunc((e && e.stack && e.cdp ? e.message : e && e.message) || e);
const recordError = (phase, e) => result.errors.push({ phase, message: errText(e), ...(e && e.cdp ? { cdp: { code: e.cdp.code, message: trunc(e.cdp.message), data: e.cdp.data === undefined ? undefined : trunc(JSON.stringify(e.cdp.data)) } } : {}) });
class Blocked extends Error {}

let phase = 'init';
const st = { installed: false, uninstalled: false, manifestId: null, fixtureShutdown: false, closing: false };
const browsers = [];

// ---- deadline helpers -------------------------------------------------------------------------------------------------
let deadline = T0 + MAIN_MS;
const left = () => deadline - Date.now();
const cap = ms => { const l = left(); if (l <= 0) throw new Error('deadline exceeded'); return Math.min(ms, l); };
const sleep = ms => new Promise(r => setTimeout(r, Math.max(0, ms)));
async function waitFor(label, fn, ms = 10000, step = 200) {
  const end = Date.now() + cap(ms); let last;
  for (;;) {
    try { const v = await fn(); if (v) return v; } catch (e) { last = e; }
    if (Date.now() >= end) throw new Error(`timeout: ${label}${last ? ` (${trunc(last.message || last, 200)})` : ''}`);
    await sleep(step);
  }
}

// ---- minimal raw CDP client -------------------------------------------------------------------------------------------
class Cdp {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map(); this.handlers = new Set(); this.closed = false;
    ws.addEventListener('message', ev => this.onMessage(ev.data));
    ws.addEventListener('close', () => this.dead('websocket closed'));
    ws.addEventListener('error', () => this.dead('websocket error'));
  }
  static fromPipe(child) {
    // Chromium permits local-only PWA operations on its inherited pipe, not a remote WebSocket client.
    // Port 0 remains available solely to read this build's /json/protocol schema.
    const handlers = new Map(), decoder = new TextDecoder();
    let buffered = '';
    const emit = (name, ev) => { for (const fn of handlers.get(name) || []) fn(ev); };
    const transport = {
      addEventListener(name, fn) { if (!handlers.has(name)) handlers.set(name, new Set()); handlers.get(name).add(fn); },
      send(data) { child.stdio[3].write(data + '\0', error => { if (error) emit('error', error); }); },
      close() { child.stdio[3].end(); child.stdio[4].destroy(); },
    };
    child.stdio[4].on('data', chunk => {
      buffered += decoder.decode(chunk, { stream: true });
      let end;
      while ((end = buffered.indexOf('\0')) >= 0) {
        const message = buffered.slice(0, end); buffered = buffered.slice(end + 1);
        if (message) emit('message', { data: message });
      }
    });
    child.stdio[4].on('end', () => emit('close'));
    child.stdio[4].on('error', error => emit('error', error));
    child.stdio[3].on('error', error => emit('error', error));
    return new Cdp(transport);
  }
  onMessage(raw) {
    let m; try { m = JSON.parse(typeof raw === 'string' ? raw : String(raw)); } catch { return; }
    if (m.id !== undefined) {
      const p = this.pending.get(m.id); if (!p) return;
      this.pending.delete(m.id); clearTimeout(p.t);
      if (m.error) { const e = new Error(`${p.method}: ${m.error.code} ${m.error.message}`); e.cdp = m.error; p.reject(e); } else p.resolve(m.result || {});
    } else if (m.method) {
      for (const h of this.handlers) { try { h(m); } catch (e) { recordError('cdp-handler', e); } }
    }
  }
  dead(why) {
    if (this.closed) return;
    this.closed = true;
    for (const [id, p] of this.pending) { clearTimeout(p.t); p.reject(new Error(`${p.method}: ${why}`)); this.pending.delete(id); }
  }
  send(method, params = {}, sessionId, ms = 8000) {
    if (this.closed) return Promise.reject(new Error(`cdp closed before ${method}`));
    return new Promise((resolve, reject) => {
      const id = ++this.id, msg = { id, method, params };
      if (sessionId) msg.sessionId = sessionId;
      const t = setTimeout(() => { this.pending.delete(id); reject(new Error(`cdp timeout: ${method}`)); }, cap(ms));
      this.pending.set(id, { resolve, reject, t, method });
      try { this.ws.send(JSON.stringify(msg)); } catch (e) { clearTimeout(t); this.pending.delete(id); reject(e); }
    });
  }
  close() { try { this.ws.close(); } catch { /* ignore */ } this.dead('closed by client'); }
}

// ---- browser lifecycle ------------------------------------------------------------------------------------------------
const AP = path.join(PROFILE, 'DevToolsActivePort');
const unlinkAP = () => { try { fs.unlinkSync(AP); } catch (e) { if (e.code !== 'ENOENT') recordError('unlink-devtools-port', e); } };

async function startBrowser(label) {
  if (browsers.some(b => !b.exited)) throw new Error('refusing to reuse a profile while its owned browser process is still running');
  unlinkAP(); // exact file only, so a stale endpoint from the previous launch can never be reused
  const spawnedAt = Date.now();
  // PWA commands use the inherited local pipe. The loopback endpoint is only for schema discovery.
  const args = [`--user-data-dir=${PROFILE}`, '--remote-debugging-port=0', '--remote-debugging-pipe', '--no-first-run', '--no-default-browser-check', 'about:blank'];
  const child = spawn(opts.exe, args, { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'], windowsHide: true });
  const b = { label, child, pid: child.pid, exited: false, exitCode: null, cdp: null, spawnedAt, sessionByTarget: new Map(), sessionLabel: new Map(), autoAttach: false,
    tabSessions: new Map(), pageChildren: new Map(), tabAutoAttach: new Map() };
  b.exitP = new Promise(res => {
    child.once('exit', (code, sig) => { b.exited = true; b.exitCode = code === null ? sig : code; res(); });
    child.once('error', e => { b.exited = true; b.spawnError = e.message; res(); });
  });
  browsers.push(b);
  const launch = { label, pid: b.pid, spawnedAt: new Date(spawnedAt).toISOString(), transport: PWA_TRANSPORT, automationFlags: ['--remote-debugging-pipe'] };
  result.browser.launches.push(launch); b.launch = launch;
  const endEp = Date.now() + cap(15000);
  let ep = null;
  while (!ep) {
    if (b.exited) throw new Error(`browser ${label} exited before exposing a debug endpoint (code ${b.exitCode}${b.spawnError ? ', ' + b.spawnError : ''})`);
    try {
      const s = fs.statSync(AP);
      if (s.mtimeMs >= spawnedAt - 2000) {
        const [port, wsPath] = fs.readFileSync(AP, 'utf8').split(/\r?\n/);
        if (/^\d+$/.test(port) && wsPath && wsPath.startsWith('/devtools/browser/')) ep = { port: Number(port), wsPath, mtimeMs: s.mtimeMs };
      }
    } catch { /* not yet */ }
    if (!ep) { if (Date.now() > endEp) throw new Error(`timeout waiting for fresh DevToolsActivePort (${label})`); await sleep(100); }
  }
  b.http = `http://127.0.0.1:${ep.port}`;
  launch.debugPort = ep.port;
  b.cdp = Cdp.fromPipe(child);
  b.cdp.handlers.add(m => onEvent(b, m));
  const v = await b.cdp.send('Browser.getVersion');
  launch.product = v.product; launch.userAgent = trunc(v.userAgent, 200);
  if (!result.browser.version) { result.browser.version = v.product; result.browser.product = v.product; result.browser.userAgent = v.userAgent; result.browser.protocolVersion = v.protocolVersion; }
  return b;
}

async function closeBrowser(b) {
  const out = { label: b.label, pid: b.pid, cleanClose: false, forcedKill: false, exited: b.exited, exitCode: b.exitCode };
  if (!b.exited) {
    st.closing = true;
    try { if (b.cdp && !b.cdp.closed) await b.cdp.send('Browser.close', {}, undefined, 4000); } catch { /* socket may drop mid-reply */ }
    await Promise.race([b.exitP, sleep(Math.max(500, Math.min(8000, left())))]);
    out.cleanClose = b.exited;
    if (!b.exited) { out.forcedKill = true; try { b.child.kill(); } catch { /* ignore */ } await Promise.race([b.exitP, sleep(Math.max(500, Math.min(2000, left())))]); }
  } else out.cleanClose = true;
  if (b.cdp) b.cdp.close();
  out.exited = b.exited; out.exitCode = b.exitCode;
  unlinkAP();
  st.closing = false;
  b.closeInfo = out;
  return out;
}

// ---- events / sessions ------------------------------------------------------------------------------------------------
const ignoreNoise = t => /controllerchange/i.test(t);
function issue(b, sid, kind, text) {
  if (st.closing || ignoreNoise(text) || result.pageIssues.length >= 40) return;
  result.pageIssues.push({ browser: b.label, session: b.sessionLabel.get(sid) || (sid ? 'unlabeled' : 'browser'), kind, text: trunc(text, 300) });
}
function onEvent(b, m) {
  const p = m.params || {}, sid = m.sessionId;
  switch (m.method) {
    case 'Target.attachedToTarget': {
      // `sid` (m.sessionId) is the PARENT session that auto-attached this target (undefined at browser level).
      const tid = p.targetInfo && p.targetInfo.targetId, type = p.targetInfo && p.targetInfo.type;
      if (b.sessionByTarget.has(tid) && b.sessionByTarget.get(tid) !== p.sessionId) { recordError('duplicate-attach', new Error(`target ${tid} (${type}) attached twice`)); }
      b.sessionByTarget.set(tid, p.sessionId); b.sessionLabel.set(p.sessionId, `auto:${type}`);
      if (type === 'tab') {
        // A tab is NOT a Runtime page: no Runtime.enable / runIfWaitingForDebugger here. Only hand its page child to us.
        b.tabSessions.set(p.sessionId, tid);
        ensureTabAutoAttach(b, p.sessionId).catch(e => recordError('tab-auto-attach', e));
      } else if (type === 'page') {
        // Page child: Runtime/Log/Network/Page enabled BEFORE it is resumed, so the launch navigation is observed.
        const child = { sid: p.sessionId, targetId: tid, parentSid: sid || null, waitingForDebugger: !!p.waitingForDebugger };
        child.ready = (async () => {
          await enableDomains(b, p.sessionId);
          if (p.waitingForDebugger) await b.cdp.send('Runtime.runIfWaitingForDebugger', {}, p.sessionId, 4000);
        })();
        child.ready.catch(e => recordError('page-child-ready', e));
        b.pageChildren.set(sid || p.sessionId, child);
      }
      break;
    }
    case 'Runtime.exceptionThrown': issue(b, sid, 'exception', (p.exceptionDetails && (p.exceptionDetails.exception && p.exceptionDetails.exception.description || p.exceptionDetails.text)) || 'exception'); break;
    case 'Runtime.consoleAPICalled':
      if (p.type === 'error' || p.type === 'assert') issue(b, sid, 'console.' + p.type, (p.args || []).map(a => a.value !== undefined ? a.value : a.description || a.type).join(' '));
      break;
    case 'Log.entryAdded': if (p.entry && p.entry.level === 'error') issue(b, sid, 'log.error', `${p.entry.source}: ${p.entry.text} ${p.entry.url || ''}`); break;
    case 'Network.loadingFailed': if (!p.canceled) issue(b, sid, 'network.failed', `${p.type} ${p.errorText}`); break;
    case 'Network.responseReceived':
      if (p.type === 'Document' && result.navEvidence.length < 20) {
        const r = p.response || {};
        result.navEvidence.push({ browser: b.label, sessionId: sid, session: b.sessionLabel.get(sid) || 'unlabeled', url: r.url, status: r.status, fromServiceWorker: !!r.fromServiceWorker, fromDiskCache: !!r.fromDiskCache, serviceWorkerResponseSource: r.serviceWorkerResponseSource, cacheStorageCacheName: r.cacheStorageCacheName, protocol: r.protocol });
      }
      break;
    case 'Inspector.targetCrashed': case 'Target.targetCrashed': issue(b, sid, 'crash', 'target crashed'); break;
    default:
  }
}
async function enableDomains(b, sid) {
  for (const d of ['Runtime', 'Log', 'Network', 'Page']) await b.cdp.send(`${d}.enable`, {}, sid, 5000);
}
async function openSession(b, targetId, label) {
  let sid = b.sessionByTarget.get(targetId);
  if (!sid) {
    sid = (await b.cdp.send('Target.attachToTarget', { targetId, flatten: true })).sessionId;
    b.sessionByTarget.set(targetId, sid); b.sessionLabel.set(sid, label);
    await enableDomains(b, sid);
  } else b.sessionLabel.set(sid, label);
  return sid;
}
// Once per tab session: ask it to auto-attach its page child, paused until our handler has enabled the domains.
function ensureTabAutoAttach(b, tabSid) {
  if (!b.tabAutoAttach.has(tabSid)) {
    b.tabAutoAttach.set(tabSid, b.cdp.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true, filter: [{ type: 'page' }, { exclude: true }] }, tabSid, 5000));
  }
  return b.tabAutoAttach.get(tabSid);
}
// PWA.launch returns a TAB target id (Puppeteer Browser.ts). Resolve it to the page child session that actually runs the app.
// Returns { sid (page child session: use for probes AND nav evidence), pageTargetId, tabTargetId, tabSid, targetType }.
async function openAppPage(b, targetId, label) {
  const info = (await b.cdp.send('Target.getTargetInfo', { targetId }, undefined, 5000)).targetInfo || {};
  if (info.type === 'page') return { sid: await openSession(b, targetId, label), pageTargetId: targetId, tabTargetId: null, tabSid: null, targetType: 'page' };
  if (info.type !== 'tab') throw new Error(`PWA.launch target ${targetId} has unexpected type ${info.type}`);
  // With browser-level auto-attach (cold launch) the tab event may be in flight: give it a moment before attaching by hand.
  if (b.autoAttach && !b.sessionByTarget.has(targetId)) { try { await waitFor('tab auto-attach event', () => b.sessionByTarget.has(targetId), 1500, 50); } catch { /* attach manually */ } }
  let tabSid = b.sessionByTarget.get(targetId);
  if (!tabSid) {
    tabSid = (await b.cdp.send('Target.attachToTarget', { targetId, flatten: true })).sessionId;
    b.sessionByTarget.set(targetId, tabSid); b.tabSessions.set(tabSid, targetId);
  }
  b.sessionLabel.set(tabSid, `${label}:tab`);
  await ensureTabAutoAttach(b, tabSid);
  const child = await waitFor(`page child of tab ${targetId}`, () => b.pageChildren.get(tabSid), 15000, 100);
  await child.ready; // domains enabled, then resumed
  b.sessionLabel.set(child.sid, label);
  return { sid: child.sid, pageTargetId: child.targetId, tabTargetId: targetId, tabSid, targetType: 'tab', childWasWaiting: child.waitingForDebugger };
}
async function evalIn(b, sid, expression, ms = 8000) {
  const r = await b.cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sid, ms);
  if (r.exceptionDetails) throw new Error(`page eval failed: ${trunc(r.exceptionDetails.exception ? r.exceptionDetails.exception.description : r.exceptionDetails.text, 200)}`);
  return r.result.value;
}
const inPage = (fn, arg) => `(${fn.toString()})(${JSON.stringify(arg)})`;

// Runs inside the page: everything needed to judge "app booted, worker activated, cache complete, sentinel".
async function pageProbe(a) {
  const ga = window.__ga, pwa = ga && ga.pwa, g = ga && ga.game;
  const out = {
    href: location.href, hasGa: !!(ga && g && pwa), canvas: !!document.querySelector('canvas'),
    registered: !!(pwa && pwa.registered), controlled: !!navigator.serviceWorker.controller,
    standalone: matchMedia('(display-mode: standalone)').matches,
    displayModes: ['browser', 'minimal-ui', 'standalone', 'fullscreen', 'window-controls-overlay'].filter(m => matchMedia(`(display-mode: ${m})`).matches),
    chrome: { menubar: window.menubar.visible, toolbar: window.toolbar.visible, locationbar: window.locationbar.visible },
    marker: (document.querySelector('meta[name="ga-pwa-smoke"]') || {}).content || null,
    sentinel: localStorage.getItem(a.sentinelKey), reg: null, cache: null,
  };
  const r = await navigator.serviceWorker.getRegistration(a.scopeUrl);
  if (r) out.reg = { scope: r.scope, activeUrl: r.active && r.active.scriptURL, activeState: r.active && r.active.state, waiting: !!r.waiting, controllerUrl: navigator.serviceWorker.controller && navigator.serviceWorker.controller.scriptURL };
  const names = await caches.keys();
  const pick = a.cacheName && names.includes(a.cacheName) ? a.cacheName : null;
  out.cache = { names, pick, count: null, hasShell: false, hasManifest: false, probeBody: null, mainJsBytes: null };
  if (pick) {
    const c = await caches.open(pick);
    const paths = (await c.keys()).map(x => new URL(x.url).pathname);
    out.cache.count = paths.length; out.cache.hasShell = paths.includes(a.shell); out.cache.hasManifest = paths.includes(a.manifest);
    if (a.deep) {
      const pr = await c.match(a.probeUrl); out.cache.probeBody = pr ? await pr.text() : null;
      const mj = a.mainJs && await c.match(a.mainJs); out.cache.mainJsBytes = mj ? (await mj.arrayBuffer()).byteLength : null;
      const nav = performance.getEntriesByType('navigation')[0];
      out.perfNav = nav ? { workerStart: nav.workerStart, type: nav.type, deliveryType: nav.deliveryType || null, responseStart: nav.responseStart, transferSize: nav.transferSize } : null;
    }
  }
  return out;
}

// ---- PWA protocol -----------------------------------------------------------------------------------------------------
let schema = null; // { cmds: {name: {params:[{name,type,optional,enum}], returns}}, types: {id: {type, enum}} }
function summarizeProtocol(json) {
  const dom = (json.domains || []).find(d => d.domain === 'PWA');
  if (!dom) return null;
  const cmds = {};
  for (const c of dom.commands || []) {
    cmds[c.name] = { experimental: !!c.experimental, params: (c.parameters || []).map(p => ({ name: p.name, type: p.type || p.$ref, optional: !!p.optional, enum: p.enum })), returns: (c.returns || []).map(p => ({ name: p.name, type: p.type || p.$ref })) };
  }
  const types = {};
  for (const t of dom.types || []) types[t.id] = { type: t.type, enum: t.enum };
  return { version: json.version, cmds, types };
}
function buildParams(method, desired) {
  const c = schema.cmds[method];
  if (!c) throw new Blocked(`PWA.${method} is not in this browser's protocol`);
  const out = {};
  for (const p of c.params) {
    if (p.name in desired) out[p.name] = desired[p.name];
    else if (!p.optional) throw new Blocked(`PWA.${method} requires unexpected parameter ${p.name} (${p.type})`);
  }
  return out;
}
async function pwa(b, method, desired, ms = 10000) {
  const params = buildParams(method, desired);
  try { return await b.cdp.send(`PWA.${method}`, params, undefined, ms); }
  catch (e) { if (e.cdp && e.cdp.code === -32601) throw new Blocked(`PWA.${method} unsupported over ${PWA_TRANSPORT}: ${e.message}`); throw e; }
}
// Observed Chrome158 response: exact error code AND exact owned manifest ID; generic protocol errors are never absence.
const isNoAppError = e => !(e instanceof Blocked) && e.cdp && e.cdp.code === -32602 &&
  e.cdp.message === 'Unknown web-app manifest id ' + st.manifestId;

// ---- helpers ----------------------------------------------------------------------------------------------------------
async function jfetch(pathname, init = {}, ms = 4000) {
  const res = await fetch(origin + pathname, { ...init, signal: AbortSignal.timeout(cap(ms)) });
  if (!res.ok) throw new Error(`${init.method || 'GET'} ${pathname} -> ${res.status}`);
  return res.json();
}
async function originReachable() {
  try { await fetch(origin + CTRL + 'meta', { signal: AbortSignal.timeout(cap(1500)) }); return true; } catch { return false; }
}
function gitInfo() {
  const run = args => execFileSync('git', args, { cwd: REPO, encoding: 'utf8', windowsHide: true, timeout: 4000 }).trim();
  try { return { head: run(['rev-parse', 'HEAD']), dirtyEntries: run(['status', '--porcelain']).split('\n').filter(Boolean).length }; }
  catch (e) { return { head: null, error: trunc(e.message, 120) }; }
}

// ---- main flow --------------------------------------------------------------------------------------------------------
async function run() {
  result.source = gitInfo();

  phase = 'fixture';
  const meta = await jfetch(CTRL + 'meta');
  const buildDir = path.resolve(String(meta.buildDir || ''));
  const tasksRoot = path.join(REPO, '.tasks') + path.sep;
  const buildOk = buildDir.startsWith(tasksRoot) && path.basename(buildDir).startsWith('pwa-smoke-') && meta.origin === origin;
  check('fixture meta is the expected local pwa-smoke fixture (origin matches, buildDir inside REPO/.tasks/pwa-smoke-*)', buildOk, { origin: meta.origin, buildDir });
  if (!buildOk) throw new Error('refusing to use (and later shut down) a server that is not the repo pwa-smoke fixture');
  if (!check('fixture has a unique desktop test app name', /^TTDefense Test [0-9a-f]{10}$/.test(meta.installTestName || ''), meta.installTestName)) {
    throw new Error('start the fixture server with --desktop-smoke to avoid OS shortcut-name collisions');
  }
  result.installTestName = meta.installTestName;
  const sel = await jfetch(CTRL + 'select', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ base, version: 'A' }) });
  check('fixture base selected as version A', sel.ok && sel.selected && sel.selected[base] === 'A', sel.selected);
  const fx = meta.bases[base].A;
  const cacheName = fx.cacheName || (fx.cachePrefix ? fx.cachePrefix + fx.version : null);
  const shell = new URL(fx.shellUrl, origin).pathname, manifestPath = new URL(fx.manifestUrl, origin).pathname;
  const mainJs = fx.mainJsUrl ? new URL(fx.mainJsUrl, origin + base).pathname : null;
  result.fixture = { origin, buildDir, base, version: 'A', fixtureVersion: fx.version, cacheName, precacheCount: fx.precacheCount, shellUrl: fx.shellUrl, manifestUrl: fx.manifestUrl, mainJsUrl: fx.mainJsUrl, probeUrl: fx.probeUrl, synthetic: meta.synthetic };
  const probeArgs = deep => ({ sentinelKey: SENTINEL_KEY, scopeUrl: origin + base, cacheName, shell, manifest: manifestPath, mainJs, probeUrl: fx.probeUrl, deep });
  const probe = (b, sid, deep = false) => evalIn(b, sid, inPage(pageProbe, probeArgs(deep)));
  const ready = (s, deep) => !!(s && s.hasGa && s.canvas && s.registered && s.controlled && s.marker === 'A' && s.reg && s.reg.scope === origin + base && s.reg.activeState === 'activated' &&
    s.reg.activeUrl === origin + base + 'ga-sw.js' && s.cache && s.cache.pick && s.cache.count === fx.precacheCount && s.cache.hasShell && s.cache.hasManifest &&
    (!deep || (s.cache.probeBody === fx.probeBody && s.cache.mainJsBytes > 0)));
  const readyView = s => s && ({ href: s.href, hasGa: s.hasGa, canvas: s.canvas, controlled: s.controlled, reg: s.reg, cache: s.cache && { pick: s.cache.pick, count: s.cache.count, hasShell: s.cache.hasShell, hasManifest: s.cache.hasManifest, mainJsBytes: s.cache.mainJsBytes, probeBodyMatches: s.cache.probeBody === fx.probeBody } });

  phase = 'launch-1';
  const b1 = await startBrowser('install');
  result.browser.versionMatchesExpected158 = /^Chrome\/158\./.test(b1.launch.product || '');

  phase = 'protocol';
  const pj = await (await fetch(`${b1.http}/json/protocol`, { signal: AbortSignal.timeout(cap(6000)) })).json();
  schema = summarizeProtocol(pj);
  if (!schema) throw new Blocked('this browser has no PWA protocol domain');
  result.protocol = { source: `${b1.http}/json/protocol`, version: pj.version, commands: schema.cmds, types: schema.types, official: 'https://chromedevtools.github.io/devtools-protocol/tot/PWA/' };
  for (const need of ['install', 'launch', 'uninstall', 'getOsAppState']) {
    if (!check(`PWA.${need} present in this browser's protocol`, !!schema.cmds[need], schema.cmds[need])) throw new Blocked(`PWA.${need} missing`);
  }

  phase = 'open-page';
  const { targetId: tabId } = await b1.cdp.send('Target.createTarget', { url: origin + base });
  const tab = await openSession(b1, tabId, 'install-tab');
  const s1 = await waitFor('app boot + activated worker + full cache in install tab', async () => { const s = await probe(b1, tab); return ready(s) ? s : null; }, 25000, 300);
  check('install tab: __ga game/pwa + canvas, worker activated for scope, full precache present', true, readyView(s1));

  phase = 'manifest';
  let appManifest = null;
  try {
    appManifest = await b1.cdp.send('Page.getAppManifest', {}, tab, 8000);
    let parsed = null; try { parsed = appManifest.data ? JSON.parse(appManifest.data) : (appManifest.manifest || null); } catch { /* keep null */ }
    result.manifest = { url: appManifest.url, errors: appManifest.errors, parsed: parsed && { id: parsed.id, name: parsed.name, short_name: parsed.short_name, start_url: parsed.start_url, scope: parsed.scope, display: parsed.display, icons: (parsed.icons || []).length } };
    if (!parsed || parsed.name !== meta.installTestName || parsed.short_name !== meta.installTestName) throw new Error('manifest test name does not match fixture metadata');
    appManifest.parsedObj = parsed;
    check('Page.getAppManifest returned the fixture manifest with no manifest errors', appManifest.url === origin + fx.manifestUrl && !(appManifest.errors || []).length, result.manifest);
  } catch (e) { recordError('getAppManifest', e); check('Page.getAppManifest supported and succeeded', false, errText(e)); }
  try {
    const ie = await b1.cdp.send('Page.getInstallabilityErrors', {}, tab, 8000);
    result.installability = ie.installabilityErrors || [];
    check('Page.getInstallabilityErrors reports no errors', result.installability.length === 0, result.installability);
  } catch (e) { recordError('getInstallabilityErrors', e); check('Page.getInstallabilityErrors supported and succeeded', false, errText(e)); }
  if (!appManifest || appManifest.parsedObj?.name !== meta.installTestName) throw new Error('refusing installation without verified unique test manifest name');

  // Manifest id: a manifest `id` resolves against start_url's ORIGIN (so "./" is the origin root even under /TTDefense/). The
  // runtime Page.getAppId value is the only proof; computedId is informational and never substitutes for it.
  let computedId = null;
  try {
    const mf = (appManifest && appManifest.parsedObj) || {};
    const startUrl = new URL(mf.start_url || '.', appManifest ? appManifest.url : origin + base);
    const u = new URL(mf.id !== undefined ? mf.id : startUrl.href, startUrl.origin); u.hash = '';
    computedId = u.href;
  } catch (e) { recordError('compute-manifest-id', e); }
  let reportedId = null, recommendedId = null, getAppIdRaw = null;
  try { const r = await b1.cdp.send('Page.getAppId', {}, tab, 5000); getAppIdRaw = r; reportedId = r.appId || null; recommendedId = r.recommendedId || null; result.manifest = { ...(result.manifest || {}), getAppId: r }; } catch (e) { recordError('getAppId', e); }
  const expectedId = origin + base;
  let recommendedResolved = null; try { recommendedResolved = recommendedId ? new URL(recommendedId, origin).href : null; } catch { /* keep null */ }
  const manifestId = reportedId;
  result.install = { manifestId, manifestIdSource: 'Page.getAppId.appId (runtime)', expectedId, computedId, reportedId, recommendedId, recommendedResolved, mismatch: !!(computedId && reportedId && computedId !== reportedId) };
  // Regression guard: the app identity must be the base URL itself (not the origin root shared by sibling apps).
  const idOk = check('Page.getAppId.appId equals origin+base (identity is this app, not the origin root)', reportedId === expectedId, { appId: reportedId, expectedId });
  const recOk = check('Page.getAppId.recommendedId (when reported) resolves to origin+base', recommendedId === null || recommendedResolved === expectedId, { recommendedId, recommendedResolved, expectedId });
  if (!idOk || !recOk) throw new Error(`manifest id is wrong (appId=${reportedId}, recommendedId=${recommendedId}, expected ${expectedId}); refusing to install an app with the wrong identity`);
  st.manifestId = manifestId;

  phase = 'install';
  st.installed = true; // from here cleanup must try to uninstall
  try { await pwa(b1, 'install', { manifestId, installUrlOrBundleUrl: origin + base }, 15000); }
  catch (e) {
    // Blocked = definitive -32601 / missing method: the command never ran, so there is nothing to clean up. Anything else is uncertain.
    if (e instanceof Blocked) { st.installed = false; result.install.installNotRun = e.message; }
    throw e;
  }
  const os1 = await waitFor('PWA.getOsAppState succeeds after install', async () => pwa(b1, 'getOsAppState', { manifestId }, 4000), 10000, 400);
  result.install.osAppState = os1;
  check('PWA.install accepted and PWA.getOsAppState succeeds for the same manifestId', true, os1);

  const cs = schema.cmds.changeAppUserSettings;
  const dm = cs && cs.params.find(p => p.name === 'displayMode');
  const dmType = dm && schema.types[dm.type];
  if (dm && dmType && (dmType.enum || []).includes('standalone')) {
    try { await pwa(b1, 'changeAppUserSettings', { manifestId, displayMode: 'standalone' }, 6000); result.install.displayModeSet = 'standalone'; check('PWA.changeAppUserSettings displayMode=standalone accepted', true); }
    catch (e) { recordError('changeAppUserSettings', e); result.install.displayModeSet = 'failed'; check('PWA.changeAppUserSettings displayMode=standalone accepted', false, errText(e)); }
  } else { result.install.displayModeSet = 'unsupported-by-schema'; result.install.displayModeSchema = dm ? { param: dm, type: dmType } : null; }

  phase = 'launch-app';
  b1.cdp.send('Target.closeTarget', { targetId: tabId }, undefined, 4000).catch(e => recordError('close-install-tab', e));
  b1.sessionByTarget.delete(tabId);
  const l1 = await pwa(b1, 'launch', { manifestId }, 15000);
  check('PWA.launch returned a targetId', !!l1.targetId, l1);
  const app1 = await openAppPage(b1, l1.targetId, 'app-1');
  const appSid = app1.sid;
  result.app.firstTargets = { ...app1 };
  const a1 = await waitFor('app window boot + activated worker + full cache', async () => { const s = await probe(b1, appSid); return s && s.href === origin + base && ready(s) ? s : null; }, 25000, 300);
  check('app window URL is exactly the expected start URL', a1.href === origin + base, a1.href);
  check('app window matchMedia(display-mode: standalone) is true', a1.standalone, { standalone: a1.standalone, displayModes: a1.displayModes, chrome: a1.chrome });
  check('app window: game booted (__ga.game/pwa + canvas), worker activated, full cache', true, readyView(a1));
  const sentinel = `ga-pwa-desktop-${randomBytes(6).toString('hex')}`;
  await evalIn(b1, appSid, `localStorage.setItem(${JSON.stringify(SENTINEL_KEY)}, ${JSON.stringify(sentinel)}) , localStorage.getItem(${JSON.stringify(SENTINEL_KEY)})`);
  try { result.window.app1 = await b1.cdp.send('Browser.getWindowForTarget', { targetId: app1.pageTargetId }, undefined, 4000); } catch (e) { recordError('getWindowForTarget', e); }
  try {
    const am = await b1.cdp.send('Page.getAppManifest', {}, appSid, 6000);
    result.app.manifestInAppWindow = { url: am.url, errors: am.errors };
  } catch (e) { recordError('getAppManifest(app)', e); }
  result.app.first = { targetId: l1.targetId, href: a1.href, standalone: a1.standalone, sentinel, reg: a1.reg };

  phase = 'offline-prep';
  const auth = b1.pid;
  const sd = await fetch(origin + CTRL + 'shutdown', { method: 'POST', signal: AbortSignal.timeout(cap(3000)) });
  st.fixtureShutdown = sd.ok;
  check('fixture accepted POST shutdown (explicitly authorized)', sd.ok, sd.status);
  await waitFor('origin HTTP unavailable', async () => !(await originReachable()), 8000, 300);
  check('origin HTTP is unreachable from Node (fixture gone)', true);

  phase = 'close-1';
  const c1 = await closeBrowser(b1);
  if (!check('first owned browser closed via Browser.close and its process exited', c1.cleanClose && c1.exited && !c1.forcedKill, c1)) throw new Error('cold launch requires the first browser to exit cleanly');

  phase = 'launch-2';
  const b2 = await startBrowser('cold-offline');
  check('second launch has a distinct PID and fresh debug endpoint', b2.pid !== auth && b2.launch.debugPort !== undefined, { pid1: auth, pid2: b2.pid, port2: b2.launch.debugPort });
  check('two distinct owned browser PIDs', new Set([auth, b2.pid]).size === 2);
  // Browser level: attach TABS only (not paused; a tab is never resumed via Runtime). Each tab's handler then auto-attaches its
  // page child paused, enables domains, and only then resumes it, so the launch navigation response is observed.
  try { await b2.cdp.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true, filter: [{ type: 'tab' }, { exclude: true }] }, undefined, 5000); b2.autoAttach = true; }
  catch (e) { recordError('setAutoAttach', e); }
  result.coldOffline.autoAttach = b2.autoAttach;
  const os2 = await pwa(b2, 'getOsAppState', { manifestId }, 6000);
  check('install persisted: PWA.getOsAppState succeeds after browser restart (server still down)', true, os2);

  phase = 'launch-app-offline';
  check('origin still unreachable before offline launch', !(await originReachable()));
  const l2 = await pwa(b2, 'launch', { manifestId }, 15000);
  check('PWA.launch (no server) returned a targetId', !!l2.targetId, l2);
  const app2Pages = await openAppPage(b2, l2.targetId, 'app-2');
  const app2 = app2Pages.sid;
  result.coldOffline.targets = { ...app2Pages };
  const a2 = await waitFor('offline app window boot + activated worker + full cache', async () => { const s = await probe(b2, app2, true); return s && s.href === origin + base && ready(s, true) ? s : null; }, 25000, 400);
  check('cold offline: URL exactly matches expected start URL', a2.href === origin + base, a2.href);
  check('cold offline: matchMedia(display-mode: standalone) is true', a2.standalone, { standalone: a2.standalone, displayModes: a2.displayModes, chrome: a2.chrome });
  check('cold offline: game booted, worker activated, full cache (probe asset + main JS bodies actually cached)', true, readyView(a2));
  check('cold offline: page controlled by the activated worker', a2.controlled && a2.reg.controllerUrl === a2.reg.activeUrl, a2.reg);
  check('cold offline: storage sentinel restored from the persistent profile', a2.sentinel === sentinel, { expected: sentinel, got: a2.sentinel });
  check('origin HTTP still unreachable after offline launch', !(await originReachable()));
  const nav = result.navEvidence.filter(n => n.browser === 'cold-offline' && n.sessionId === app2 && n.url === origin + base);
  // A service worker's persistent Cache Storage response may also carry fromDiskCache=true after a cold start.
  // Require the explicit worker/cache-storage provenance, not a contradictory assumption about that disk flag.
  const viaSw = nav.find(n => n.fromServiceWorker && n.status === 200 && n.serviceWorkerResponseSource === 'cache-storage');
  if (viaSw) { result.coldOffline.navEvidence = { kind: 'Network.responseReceived fromServiceWorker=true', entry: viaSw }; check('cold offline navigation response came fromServiceWorker (Network.responseReceived)', true, viaSw); }
  else {
    const pn = a2.perfNav;
    const weak = !!(pn && pn.workerStart > 0);
    result.coldOffline.navEvidence = { kind: 'fallback: performance.navigation workerStart>0 + cache bodies + origin HTTP unreachable (no fromServiceWorker response captured)', observedResponses: nav, perfNav: pn, limit: 'Network events for the launch navigation were not observed; this does not directly prove the document bytes came from the worker.' };
    check('cold offline navigation has direct service-worker response evidence (workerStart alone is insufficient)', false, { ...result.coldOffline.navEvidence, workerInvolvement: weak });
  }
  try { result.window.app2 = await b2.cdp.send('Browser.getWindowForTarget', { targetId: app2Pages.pageTargetId }, undefined, 4000); } catch (e) { recordError('getWindowForTarget(2)', e); }
  result.coldOffline.second = { targetId: l2.targetId, href: a2.href, standalone: a2.standalone, perfNav: a2.perfNav, sentinel: a2.sentinel, reg: a2.reg };
  check('page exceptions during the run: none (console/log/network errors are recorded in pageIssues, not failed on)', !result.pageIssues.some(i => i.kind === 'exception'), result.pageIssues.filter(i => i.kind === 'exception'));

  phase = 'uninstall';
  await pwa(b2, 'uninstall', { manifestId }, 15000);
  let noApp = { ok: false };
  try { const r = await pwa(b2, 'getOsAppState', { manifestId }, 5000); noApp = { ok: false, stillInstalled: r }; }
  catch (e) { if (e instanceof Blocked) throw e; noApp = { ok: !!isNoAppError(e), rawError: errText(e), cdp: e.cdp }; }
  result.install.afterUninstall = noApp;
  st.uninstalled = noApp.ok;
  check('after PWA.uninstall, PWA.getOsAppState reports the exact owned manifest ID is unknown', noApp.ok, noApp);

  phase = 'close-2';
  const c2 = await closeBrowser(b2);
  check('second owned browser closed via Browser.close and its process exited', c2.cleanClose && c2.exited && !c2.forcedKill, c2);
}

async function cleanup() {
  deadline = Math.min(Date.now() + CLEAN_MS, T0 + HARD_MS);
  const c = result.cleanup;
  try {
    if (st.installed && !st.uninstalled && st.manifestId && schema) {
      let live = browsers.find(b => !b.exited && b.cdp && !b.cdp.closed);
      try {
        if (!live) { c.relaunchedForUninstall = true; live = await startBrowser('cleanup'); }
        // Always attempt uninstall after an uncertain install; generic protocol errors never mean app absence.
        await sleep(500);
        try { await pwa(live, 'uninstall', { manifestId: st.manifestId }, 8000); }
        catch (e) { if (!isNoAppError(e)) throw e; }
        let gone = false;
        for (let i = 0; i < 2; i++) {
          await sleep(300);
          try { await pwa(live, 'getOsAppState', { manifestId: st.manifestId }, 3000); gone = false; break; }
          catch (e) { if (!isNoAppError(e)) throw e; gone = true; }
        }
        c.uninstall = { ok: gone, uninstalled: true };
        st.uninstalled = c.uninstall.ok;
      } catch (e) { c.uninstall = { ok: false, error: errText(e) }; recordError('cleanup-uninstall', e); }
    } else if (st.installed) c.uninstall = st.uninstalled ? { ok: true, note: 'uninstalled in main flow' } : { ok: false, note: 'no manifestId/protocol to uninstall with' };
    else c.uninstall = { ok: true, note: 'nothing was installed' };
  } catch (e) { recordError('cleanup', e); }
  c.browsers = [];
  for (const b of browsers) {
    try { c.browsers.push(b.closeInfo && b.exited ? b.closeInfo : await closeBrowser(b)); }
    catch (e) { c.browsers.push({ label: b.label, pid: b.pid, error: errText(e) }); recordError('cleanup-close', e); }
  }
  c.allBrowsersExited = browsers.every(b => b.exited);
  c.fixtureShutdownByThisRun = st.fixtureShutdown;
  c.profileKept = PROFILE; // never deleted
}

function finish(status) {
  result.status = status;
  result.durationMs = Date.now() - T0;
  try { fs.writeFileSync(RESULT_FILE, JSON.stringify(result, null, 1)); } catch (e) { console.error('could not write result file', e.message); }
  const passed = checks.filter(c => c.ok).length;
  console.log(JSON.stringify({ status, checksPassed: passed, checksFailed: checks.length - passed, errors: result.errors.length, pageIssues: result.pageIssues.length, pids: result.browser.launches.map(l => l.pid), cleanupOk: !!(result.cleanup.allBrowsersExited && result.cleanup.uninstall && result.cleanup.uninstall.ok), durationMs: result.durationMs, result: RESULT_FILE }));
  process.exit(status === 'PASS' ? 0 : status === 'BLOCKED' ? 3 : 1);
}

const watchdog = setTimeout(() => {
  result.errors.push({ phase, message: 'hard 90 s limit reached; owned browsers force-killed' });
  for (const b of browsers) { try { if (!b.exited) b.child.kill(); } catch { /* ignore */ } }
  result.cleanup.hardTimeout = true;
  result.cleanup.uninstall = { ok: st.uninstalled, unverified: !st.uninstalled, manifestId: st.manifestId, testName: result.installTestName, profile: PROFILE };
  finish('FAIL');
}, HARD_MS - 500);
watchdog.unref?.();

let blocked = false;
try { await run(); }
catch (e) { blocked = e instanceof Blocked; recordError(phase, e); if (blocked) result.blocked = e.message; log(`${blocked ? 'BLOCKED' : 'FAILED'} in ${phase}: ${errText(e)}`); }
try { await cleanup(); } catch (e) { recordError('cleanup', e); }
const cleanOk = !!(result.cleanup.allBrowsersExited && result.cleanup.uninstall && result.cleanup.uninstall.ok);
if (!cleanOk) check('cleanup: app uninstalled and every owned browser exited', false, result.cleanup);
const allOk = checks.every(c => c.ok) && !result.errors.length;
finish(blocked ? 'BLOCKED' : allOk && cleanOk ? 'PASS' : 'FAIL');
