import { afterEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectPrecache, computeVersion, generateWorker, renderWorker, REQUIRED_FILES } from '../scripts/sw-lib.mjs';

const TEMPLATE_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'sw-template.js');
const dirs = [];
afterEach(async () => { for (const d of dirs.splice(0)) await fs.rm(d, { recursive: true, force: true }); });

async function makeDist(extra = {}, skip = []) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ga-dist-'));
  dirs.push(dir);
  const files = {
    'index.html': '<script type="module" src="/assets/index-abc.js"></script><link rel="manifest" href="/manifest.webmanifest">',
    'manifest.webmanifest': '{}',
    'assets/index-abc.js': 'console.log(1)',
    'assets/index-abc.js.map': '{}',
    'assets/font.woff2': 'font',
    'assets/castle-map.jpg': 'jpg',
    ...Object.fromEntries(REQUIRED_FILES.filter(f => f.startsWith('icons/')).map(f => [f, 'png:' + f])),
    ...extra,
  };
  for (const [f, body] of Object.entries(files)) {
    if (skip.includes(f)) continue;
    await fs.mkdir(path.dirname(path.join(dir, f)), { recursive: true });
    await fs.writeFile(path.join(dir, f), body);
  }
  return dir;
}

describe('service worker build', () => {
  it('precaches every emitted file except the worker and sourcemaps', async () => {
    const dir = await makeDist({ 'ga-sw.js': 'old worker' });
    const urls = (await collectPrecache(dir)).map(e => e.url);
    expect(urls).toContain('/index.html');
    expect(urls).toContain('/manifest.webmanifest');
    expect(urls).toContain('/assets/font.woff2');
    expect(urls).toContain('/assets/castle-map.jpg');
    expect(urls).toContain('/icons/maskable-512.png');
    expect(urls).not.toContain('/ga-sw.js');
    expect(urls.some(u => u.endsWith('.map'))).toBe(false);
  });

  it('fails clearly when required output is missing', async () => {
    await expect(collectPrecache(await makeDist({}, ['icons/icon-512.png']))).rejects.toThrow(/icons\/icon-512\.png/);
    await expect(collectPrecache(await makeDist({}, ['manifest.webmanifest']))).rejects.toThrow(/manifest/);
    await expect(collectPrecache(path.join(os.tmpdir(), 'ga-no-such-dist-xyz'))).rejects.toThrow(/dist not found/);
    await expect(collectPrecache(await makeDist({ 'index.html': '<script src="/assets/gone.js"></script>' }))).rejects.toThrow(/gone\.js/);
  });

  it('version is deterministic and changes only with content', async () => {
    const a = await makeDist(), b = await makeDist(), c = await makeDist({ 'assets/index-abc.js': 'console.log(2)' });
    const tpl = await fs.readFile(TEMPLATE_PATH, 'utf8');
    const v = async d => computeVersion(await collectPrecache(d), tpl);
    expect(await v(a)).toBe(await v(b));
    expect(await v(a)).not.toBe(await v(c));
    const r1 = await generateWorker(a, TEMPLATE_PATH);
    const first = await fs.readFile(path.join(a, 'ga-sw.js'), 'utf8');
    const r2 = await generateWorker(a, TEMPLATE_PATH); // rerun with ga-sw.js present
    expect(r2.version).toBe(r1.version);
    expect(await fs.readFile(path.join(a, 'ga-sw.js'), 'utf8')).toBe(first);
    expect(first).toContain(r1.version);
    expect(first).not.toMatch(/__GA_/);
  });
});

// ---- worker behaviour under a fake ServiceWorkerGlobalScope ----
const ORIGIN = 'https://ga.example';
const scoped = (base, version) => 'ga-scope-app:' + encodeURIComponent(base) + ':' + version;
// Network response with an unread body stream; `tracker` counts bodies not yet consumed.
function netResponse(init, tracker) {
  const res = {
    ok: true, status: 200, statusText: 'OK', type: 'basic', headers: { 'content-type': 'text/plain' }, ...init,
    clone() { return netResponse(init); },
    async arrayBuffer() {
      if (init.bodyError) throw new Error('body read failed');
      if (tracker && !res.drained) { res.drained = true; tracker.outstanding--; }
      return new TextEncoder().encode(res.body ?? '').buffer;
    },
  };
  if (tracker) tracker.outstanding++;
  return res;
}
function boot(urls, version, { responses = {}, clients = 1, preCaches = {}, base = '/' } = {}) {
  const store = new Map(Object.entries(preCaches).map(([n, files]) => [n, new Map(Object.entries(files))]));
  const caches = {
    async open(name) {
      if (!store.has(name)) store.set(name, new Map());
      const m = store.get(name);
      return { async put(u, r) { m.set(u, r); }, async match(u) { return m.get(u); } };
    },
    async keys() { return [...store.keys()]; },
    async delete(n) { return store.delete(n); },
  };
  const state = { skipWaiting: 0, claimed: 0, outstanding: 0, outstandingAtFetch: [] };
  const fetched = [];
  const handlers = {};
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (t, fn) => { handlers[t] = fn; },
    skipWaiting: () => { state.skipWaiting++; },
    clients: { claim: async () => { state.claimed++; }, matchAll: async () => Array.from({ length: clients }, () => ({})) },
  };
  const fetchFn = async req => {
    fetched.push(req.url ?? req);
    const key = String(req.url ?? req);
    state.outstandingAtFetch.push(state.outstanding); // bodies still unread when this fetch began
    return netResponse({ url: new URL(key, ORIGIN).href, ...(responses[key] ?? { body: 'net:' + key }) }, state);
  };
  class Request { constructor(url) { this.url = url; } }
  const code = renderWorker(templateBody, version, urls, base);
  new Function('self', 'caches', 'fetch', 'Request', code)(self, caches, fetchFn, Request);
  const run = async (type, extra = {}) => {
    const out = { waits: [], response: undefined, responded: false };
    const ev = { ...extra, waitUntil: p => out.waits.push(p), respondWith: p => { out.responded = true; out.response = p; } };
    handlers[type](ev);
    await Promise.all(out.waits);
    out.response = await out.response;
    return out;
  };
  return { store, state, fetched, run };
}
let templateBody = '';
const loadTemplate = async () => { templateBody = await fs.readFile(TEMPLATE_PATH, 'utf8'); };
const URLS = ['/index.html', '/assets/app-1.js', '/manifest.webmanifest'];
const nav = (path = '/') => ({ request: { method: 'GET', mode: 'navigate', url: ORIGIN + path } });
const get = path => ({ request: { method: 'GET', mode: 'no-cors', url: path.startsWith('http') ? path : ORIGIN + path } });

describe('service worker runtime', () => {
  it('installs atomically into a versioned cache without skipWaiting', async () => {
    await loadTemplate();
    const sw = boot(URLS, 'v1');
    await sw.run('install');
    expect([...sw.store.keys()]).toEqual(['ga-scope-app:%2F:v1']);
    expect([...sw.store.get('ga-scope-app:%2F:v1').keys()].sort()).toEqual([...URLS].sort());
    expect(sw.state.skipWaiting).toBe(0);
  });

  it('uses a literal, distinct cache prefix per deployment base', async () => {
    await loadTemplate();
    const names = [];
    for (const base of ['/', '/tabletop/', '/TTDefense/']) {
      const sw = boot([base + 'index.html'], 'v1', { base });
      await sw.run('install');
      names.push(...sw.store.keys());
    }
    expect(names).toEqual(['ga-scope-app:%2F:v1', 'ga-scope-app:%2Ftabletop%2F:v1', 'ga-scope-app:%2FTTDefense%2F:v1']);
  });

  it('new cache names survive the cleanup predicate used by legacy workers', async () => {
    await loadTemplate();
    const sw = boot(URLS, 'v1');
    await sw.run('install');
    const candidates = [...sw.store.keys()].filter(n => n.startsWith('ga-app-'));
    expect(candidates).toEqual([]);
    expect(sw.store.has('ga-scope-app:%2F:v1')).toBe(true);
  });

  it.each([['/', '/-preview/'], ['/one/', '/one/-preview/']])('activation at %s preserves the distinct %s cache', async (base, sibling) => {
    await loadTemplate();
    const other = scoped(sibling, 'v1');
    const sw = boot([base + 'index.html'], 'v2', { base, preCaches: { [other]: { [sibling + 'index.html']: { ok: true, body: 'keep' } } } });
    await sw.run('install');
    await sw.run('activate');
    expect(sw.store.get(other).get(sibling + 'index.html').body).toBe('keep');
  });

  it('real generated worker versions yield scoped cache names', async () => {
    await loadTemplate();
    const dir = await makeDist({
      'index.html': '<script type="module" src="/tabletop/assets/index-abc.js"></script><link rel="manifest" href="./manifest.webmanifest">',
    });
    const { version } = await generateWorker(dir, TEMPLATE_PATH, '/tabletop/');
    expect(version).toMatch(/^[0-9a-f]{16}$/);
    const urls = (await collectPrecache(dir, '/tabletop/')).map(e => e.url);
    const sw = boot(urls, version, { base: '/tabletop/' });
    await sw.run('install');
    expect([...sw.store.keys()]).toEqual([scoped('/tabletop/', version)]);
  });

  it('failed install rejects, writes nothing, and keeps the old cache', async () => {
    await loadTemplate();
    const old = { '/index.html': { ok: true, body: 'old shell' } };
    const sw = boot(URLS, 'v2', { preCaches: { 'ga-scope-app:%2F:v1': old }, responses: { '/assets/app-1.js': { ok: false, status: 404, type: 'basic' } } });
    await expect(sw.run('install')).rejects.toThrow(/Precache failed/);
    expect([...sw.store.keys()]).toEqual(['ga-scope-app:%2F:v1']);
    expect(sw.store.get('ga-scope-app:%2F:v1').get('/index.html').body).toBe('old shell');
  });

  it('drains each download body before starting the next fetch', async () => {
    await loadTemplate();
    const sw = boot(URLS, 'v1');
    await sw.run('install');
    expect(sw.fetched.length).toBe(URLS.length);
    expect(sw.state.outstandingAtFetch).toEqual(URLS.map(() => 0));
    expect(sw.state.outstanding).toBe(0);
  });

  it('caches the downloaded bytes with status, statusText and headers preserved', async () => {
    await loadTemplate();
    const headers = { 'content-type': 'application/javascript', etag: 'abc' };
    const sw = boot(URLS, 'v1', { responses: { '/assets/app-1.js': { body: 'console.log(1)', status: 200, statusText: 'Fine', headers } } });
    await sw.run('install');
    const cached = sw.store.get('ga-scope-app:%2F:v1').get('/assets/app-1.js');
    expect(cached.body).toBe('console.log(1)');
    expect(cached.status).toBe(200);
    expect(cached.statusText).toBe('Fine');
    expect(cached.headers).toBe(headers);
    expect(cached.type).toBe('basic');
    expect(cached.url).toBe(ORIGIN + '/assets/app-1.js');
    expect(sw.store.get('ga-scope-app:%2F:v1').get('/index.html').body).toBe('net:/index.html');
  });

  it('a failed body read aborts install, writes nothing, and keeps the old cache', async () => {
    await loadTemplate();
    const old = { '/index.html': { ok: true, body: 'old shell' } };
    const sw = boot(URLS, 'v2', { preCaches: { 'ga-scope-app:%2F:v1': old }, responses: { '/assets/app-1.js': { body: 'x', bodyError: true } } });
    await expect(sw.run('install')).rejects.toThrow(/body read failed/);
    expect([...sw.store.keys()]).toEqual(['ga-scope-app:%2F:v1']);
    expect(sw.store.get('ga-scope-app:%2F:v1').get('/index.html').body).toBe('old shell');
    expect(sw.fetched).toEqual(['/index.html', '/assets/app-1.js']); // stopped; manifest never fetched
  });

  it('only an explicit message activates a waiting worker', async () => {
    await loadTemplate();
    const sw = boot(URLS, 'v1');
    await sw.run('message', { data: { type: 'other' } });
    await sw.run('message', { data: null });
    expect(sw.state.skipWaiting).toBe(0);
    await sw.run('message', { data: { type: 'GA_SKIP_WAITING' } });
    expect(sw.state.skipWaiting).toBe(1);
  });

  it('activation claims, prunes old own caches only when alone, never touches other caches', async () => {
    await loadTemplate();
    const pre = { 'ga-scope-app:%2F:v1': {}, 'other-app-cache': {}, 'ga-scope-app:%2F:v2': {} };
    const alone = boot(URLS, 'v2', { preCaches: pre, clients: 1 });
    await alone.run('activate');
    expect(alone.state.claimed).toBe(1);
    expect([...alone.store.keys()].sort()).toEqual(['ga-scope-app:%2F:v2', 'other-app-cache']);
    const shared = boot(URLS, 'v2', { preCaches: { ...pre }, clients: 2 });
    await shared.run('activate');
    expect([...shared.store.keys()].sort()).toEqual(['ga-scope-app:%2F:v1', 'ga-scope-app:%2F:v2', 'other-app-cache']);
  });

  it('activation never prunes sibling-scope or legacy caches, even when alone', async () => {
    await loadTemplate();
    const legacy = 'ga-app-0123456789abcdef';
    const pre = {
      [scoped('/tabletop/', 'a1')]: { '/tabletop/index.html': { ok: true, body: 'closed sibling' } },
      [scoped('/', 'r1')]: {},
      [scoped('/TTDefense/', 'old')]: {},
      [scoped('/TTDefense/', 'new')]: {},
      [legacy]: {},
      'ga-app-v1': {},
      'other-app-cache': {},
    };
    const sw = boot(['/TTDefense/index.html'], 'new', { base: '/TTDefense/', preCaches: pre, clients: 1 });
    await sw.run('activate');
    expect([...sw.store.keys()].sort()).toEqual([
      'ga-app-v1', legacy, scoped('/', 'r1'), scoped('/TTDefense/', 'new'), scoped('/tabletop/', 'a1'), 'other-app-cache',
    ].sort());
    expect(sw.store.get(scoped('/tabletop/', 'a1')).get('/tabletop/index.html').body).toBe('closed sibling');
  });

  it('serves the cached shell for root navigation and leaves unrelated traffic alone', async () => {
    await loadTemplate();
    const sw = boot(URLS, 'v1');
    await sw.run('install');
    sw.fetched.length = 0;
    const shell = await sw.run('fetch', nav('/'));
    expect(shell.response.body).toBe('net:/index.html');
    expect(sw.fetched).toEqual([]); // came from cache
    expect((await sw.run('fetch', nav('/index.html'))).responded).toBe(true);
    expect((await sw.run('fetch', nav('/somewhere/else'))).responded).toBe(false);
    expect((await sw.run('fetch', { request: { method: 'POST', mode: 'cors', url: ORIGIN + '/assets/app-1.js' } })).responded).toBe(false);
    expect((await sw.run('fetch', get('https://cdn.other.example/assets/app-1.js'))).responded).toBe(false);
    expect((await sw.run('fetch', get('/api/scores'))).responded).toBe(false);
  });

  it('old tabs still resolve their hashed assets from older app caches; unknown assets go to network', async () => {
    await loadTemplate();
    const sw = boot(URLS, 'v2', { preCaches: { 'ga-scope-app:%2F:v1': { '/assets/old-9.js': { ok: true, body: 'old js' } } } });
    await sw.run('install');
    expect((await sw.run('fetch', get('/assets/old-9.js'))).response.body).toBe('old js');
    sw.fetched.length = 0;
    expect((await sw.run('fetch', get('/assets/never-seen.js'))).response.body).toBe('net:' + ORIGIN + '/assets/never-seen.js');
    expect(sw.fetched.length).toBe(1);
  });

  it('old tabs read current-scope hashed assets from legacy caches without mutating them; siblings are not returned', async () => {
    await loadTemplate();
    const legacy = 'ga-app-0123456789abcdef';
    const legacyFiles = {
      '/tabletop/assets/old-9.js': { ok: true, body: 'tabletop js' },
      '/TTDefense/assets/old-9.js': { ok: true, body: 'ttdefense js' },
    };
    const sw = boot(['/tabletop/index.html'], 'v2', {
      base: '/tabletop/',
      preCaches: { [legacy]: legacyFiles, [scoped('/TTDefense/', 'x')]: { '/TTDefense/assets/only-sib.js': { ok: true, body: 'sib' } } },
      clients: 1,
    });
    await sw.run('install');
    await sw.run('activate'); // alone, yet legacy must survive
    expect(sw.store.has(legacy)).toBe(true);
    expect([...sw.store.get(legacy).keys()].sort()).toEqual(Object.keys(legacyFiles).sort());
    expect((await sw.run('fetch', get('/tabletop/assets/old-9.js'))).response.body).toBe('tabletop js');
    // Same filename only cached under another scope: network, not the sibling's body.
    sw.fetched.length = 0;
    expect((await sw.run('fetch', get('/tabletop/assets/only-sib.js'))).response.body).toBe('net:' + ORIGIN + '/tabletop/assets/only-sib.js');
    expect(sw.fetched.length).toBe(1);
    // Sibling-path requests are not intercepted at all.
    expect((await sw.run('fetch', get('/TTDefense/assets/old-9.js'))).responded).toBe(false);
  });

  it('prefers current cache, then same-scope older, then legacy', async () => {
    await loadTemplate();
    const legacy = 'ga-app-0123456789abcdef';
    const f = body => ({ '/assets/a.js': { ok: true, body } });
    const sw = boot(URLS, 'v3', { preCaches: { [legacy]: f('legacy'), 'ga-scope-app:%2F:v2': f('older') }, clients: 1 });
    await sw.run('install');
    sw.store.get('ga-scope-app:%2F:v3').set('/assets/a.js', { ok: true, body: 'current' });
    expect((await sw.run('fetch', get('/assets/a.js'))).response.body).toBe('current');
    sw.store.get('ga-scope-app:%2F:v3').delete('/assets/a.js');
    expect((await sw.run('fetch', get('/assets/a.js'))).response.body).toBe('older');
    sw.store.delete('ga-scope-app:%2F:v2');
    expect((await sw.run('fetch', get('/assets/a.js'))).response.body).toBe('legacy');
  });

  it('supports subpath deployments like /TTDefense/ cleanly', async () => {
    await loadTemplate();
    const dir = await makeDist({
      'index.html': '<script type="module" src="/TTDefense/assets/index-abc.js"></script><link rel="manifest" href="./manifest.webmanifest">',
    });
    const entries = await collectPrecache(dir, '/TTDefense/');
    expect(entries.map(e => e.url)).toContain('/TTDefense/index.html');
    expect(entries.map(e => e.url)).toContain('/TTDefense/assets/index-abc.js');
    expect(entries.map(e => e.url)).toContain('/TTDefense/manifest.webmanifest');

    const subUrls = ['/TTDefense/index.html', '/TTDefense/assets/app-1.js', '/TTDefense/manifest.webmanifest'];
    const store = new Map();
    const caches = {
      async open(name) {
        if (!store.has(name)) store.set(name, new Map());
        const m = store.get(name);
        return { async put(u, r) { m.set(u, r); }, async match(u) { return m.get(u); } };
      },
      async keys() { return [...store.keys()]; },
      async delete(n) { return store.delete(n); },
    };
    const handlers = {};
    const self = {
      location: { origin: ORIGIN },
      addEventListener: (t, fn) => { handlers[t] = fn; },
      skipWaiting: () => {},
      clients: { claim: async () => {}, matchAll: async () => [{}] },
    };
    class Request { constructor(url) { this.url = url; } }
    const fetchFn = async req => netResponse({ body: 'net:' + String(req.url ?? req) });
    new Function('self', 'caches', 'fetch', 'Request', renderWorker(templateBody, 'sub1', subUrls, '/TTDefense/'))(self, caches, fetchFn, Request);
    const run = async (type, extra = {}) => {
      const out = { waits: [], response: undefined, responded: false };
      handlers[type]({ ...extra, waitUntil: p => out.waits.push(p), respondWith: p => { out.responded = true; out.response = p; } });
      await Promise.all(out.waits);
      out.response = await out.response;
      return out;
    };
    await run('install');
    expect((await run('fetch', nav('/TTDefense/'))).response.body).toBe('net:/TTDefense/index.html');
    expect((await run('fetch', nav('/TTDefense'))).response.body).toBe('net:/TTDefense/index.html');
    expect((await run('fetch', nav('/TTDefense/index.html'))).response.body).toBe('net:/TTDefense/index.html');
    expect((await run('fetch', nav('/'))).responded).toBe(false);
    expect((await run('fetch', get('/TTDefense/assets/app-1.js'))).response.body).toBe('net:/TTDefense/assets/app-1.js');
  });
});
