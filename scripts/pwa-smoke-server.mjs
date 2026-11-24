// Galactic Defense - bounded local PWA smoke fixture server (Node builtins + proto-web's installed Vite only).
//
//   node scripts/pwa-smoke-server.mjs [--port 4187] [--desktop-smoke]
// --desktop-smoke gives the generated manifest a unique test name to avoid OS shortcut-name collisions.
//
// Builds the CURRENT production app three times (Vite base '/', '/tabletop/', '/TTDefense/') into NEW unique
// .tasks/pwa-smoke-<stamp>-<rand>/ directories (never proto-web/dist, nothing is deleted), then for each base makes two
// fixtures A and B. A and B are the same current app with a SYNTHETIC revision marker
// (<meta name="ga-pwa-smoke" content="A|B"> in the generated index.html) so the real service worker sees an update. Each
// worker is generated with the existing generateWorker() and the current scripts template; A and B get genuinely
// different content-hash versions. Each also carries one small synthetic asset (assets/pwa-smoke-A.txt only in A,
// assets/pwa-smoke-B.txt only in B; URL and body in meta as probeUrl/probeBody) written before the worker is generated.
// A/B are NOT real released app versions.
//
// Serves only 127.0.0.1:<port>, exits by itself after 10 minutes or on POST /__pwa_fixture__/shutdown.
// Control routes: GET /__pwa_fixture__/meta, POST /__pwa_fixture__/select {"base":"/tabletop/","version":"A"|"B"},
// POST /__pwa_fixture__/shutdown. Prints ONE compact JSON ready line to stdout; progress goes to stderr.
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const PROTO = path.join(REPO, 'proto-web');
const TEMPLATE = path.join(PROTO, 'scripts', 'sw-template.js');
const HOST = '127.0.0.1';
const DEFAULT_PORT = 4187;
const MAX_LIFETIME_MS = 10 * 60 * 1000;
const BASES = ['/', '/tabletop/', '/TTDefense/'];
const CTRL = '/__pwa_fixture__/';
const log = (...a) => console.error('[pwa-smoke]', ...a);

function parsePort(argv) {
  let raw = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--port') raw = argv[++i];
    else if (a.startsWith('--port=')) raw = a.slice(7);
    else throw new Error(`unknown argument: ${a}`);
  }
  if (raw === null) return DEFAULT_PORT;
  if (!/^\d+$/.test(String(raw))) throw new Error(`invalid --port: ${raw}`);
  const n = Number(raw);
  if (n < 1024 || n > 65535) throw new Error(`--port must be 1024..65535, got ${n}`);
  return n;
}

const slug = b => (b === '/' ? 'root' : b.replace(/\//g, ''));
const MARK_RE = /<meta name="ga-pwa-smoke" content="[AB]"\s*\/?>/;

async function setMarker(dir, version) {
  const file = path.join(dir, 'index.html');
  let html = await fs.readFile(file, 'utf8');
  const tag = `<meta name="ga-pwa-smoke" content="${version}" />`;
  if (MARK_RE.test(html)) html = html.replace(MARK_RE, tag);
  else if (html.includes('</head>')) html = html.replace('</head>', `    ${tag}\n  </head>`);
  else throw new Error('index.html has no </head> to hold the synthetic marker');
  await fs.writeFile(file, html);
}

// Per-revision synthetic asset: assets/pwa-smoke-A.txt exists only in fixture A, pwa-smoke-B.txt only in B. Lets a browser
// test prove genuine old-asset fallback through the real worker. Not part of the production app.
const PROBE_DIR = 'assets';
const PROBE_PREFIX = 'pwa-smoke-';

async function setProbe(dir, base, version) {
  const body = `ga-pwa-smoke probe for revision ${version} (${randomBytes(6).toString('hex')})\n`;
  await fs.mkdir(path.join(dir, PROBE_DIR), { recursive: true });
  await fs.writeFile(path.join(dir, PROBE_DIR, `${PROBE_PREFIX}${version}.txt`), body);
  return { probeUrl: `${base}${PROBE_DIR}/${PROBE_PREFIX}${version}.txt`, probeBody: body };
}

async function describe(dir, base, version, count, template) {
  const sw = await fs.readFile(path.join(dir, 'ga-sw.js'), 'utf8');
  const html = await fs.readFile(path.join(dir, 'index.html'), 'utf8');
  const m = template.match(/CACHE_PREFIX\s*=\s*'([^']*)'\s*\+\s*encodeURIComponent\(GA_BASE\)\s*\+\s*'([^']*)'/);
  const prefix = m ? m[1] + encodeURIComponent(base) + m[2] : null; // derived from the actual template text, not hardcoded
  const swVersion = (sw.match(/const GA_VERSION = '([^']+)'/) || [])[1];
  if (swVersion !== version) throw new Error(`generated worker version mismatch for ${base} ${dir}`);
  const mainSrc = [...html.matchAll(/<script[^>]*type="module"[^>]*src="([^"]+)"/g)].map(x => x[1])[0] || null;
  return {
    version, precacheCount: count, cachePrefix: prefix, cacheName: prefix ? prefix + version : null,
    shellUrl: base + 'index.html', manifestUrl: base + 'manifest.webmanifest', mainJsUrl: mainSrc,
    dir,
  };
}

async function buildAll(outRoot, installTestName = null) {
  const protoRequire = createRequire(path.join(PROTO, 'package.json'));
  const vitePkg = protoRequire.resolve('vite/package.json');
  const vite = await import(pathToFileURL(path.join(path.dirname(vitePkg), 'dist', 'node', 'index.js')).href);
  const { generateWorker, normalizeBase } = await import(pathToFileURL(path.join(PROTO, 'scripts', 'sw-lib.mjs')).href);
  const template = await fs.readFile(TEMPLATE, 'utf8'); // same file generateWorker reads, so the prefix parse matches
  const out = {};
  for (const raw of BASES) {
    const base = normalizeBase(raw);
    const dirA = path.join(outRoot, slug(base), 'A');
    const dirB = path.join(outRoot, slug(base), 'B');
    await fs.mkdir(path.dirname(dirA), { recursive: true });
    log(`vite build base=${base}`);
    await vite.build({
      root: PROTO, base, logLevel: 'warn', mode: 'production',
      build: { outDir: dirA, emptyOutDir: false },
    });
    await setMarker(dirA, 'A');
    if (installTestName) {
      const manifestPath = path.join(dirA, 'manifest.webmanifest');
      const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
      manifest.name = installTestName;
      manifest.short_name = installTestName;
      await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
    }
    const probeA = await setProbe(dirA, base, 'A'); // before generateWorker so it is precached (and versioned) for A
    const a = await generateWorker(dirA, TEMPLATE, base);
    await fs.cp(dirA, dirB, { recursive: true, errorOnExist: true, force: false });
    await setMarker(dirB, 'B');
    await fs.unlink(path.join(dirB, PROBE_DIR, PROBE_PREFIX + 'A.txt')); // exact file, inside the NEW B fixture only
    const probeB = await setProbe(dirB, base, 'B');
    const b = await generateWorker(dirB, TEMPLATE, base);
    if (a.version === b.version) throw new Error(`A and B versions are identical for ${base}`);
    out[base] = {
      A: { ...(await describe(dirA, base, a.version, a.count, template)), ...probeA },
      B: { ...(await describe(dirB, base, b.version, b.count, template)), ...probeB },
    };
  }
  return out;
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.map': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
};
const NO_CACHE = { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0', Pragma: 'no-cache', Expires: '0' };

async function main() {
  const args = process.argv.slice(2);
  const desktopSmoke = args.includes('--desktop-smoke');
  const port = parsePort(args.filter(a => a !== '--desktop-smoke'));
  const installTestName = desktopSmoke ? 'TTDefense Test ' + randomBytes(5).toString('hex') : null;
  const origin = `http://${HOST}:${port}`;
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const outRoot = path.join(REPO, '.tasks', `pwa-smoke-${stamp}-${randomBytes(4).toString('hex')}`);
  await fs.mkdir(path.dirname(outRoot), { recursive: true });
  await fs.mkdir(outRoot); // non-recursive: fails rather than reuse an existing directory
  const fixtures = await buildAll(outRoot, installTestName);
  const selected = Object.fromEntries(BASES.map(b => [b, 'A']));
  const startedAt = Date.now();

  const meta = () => ({
    origin, buildDir: outRoot, startedAt, expiresAt: startedAt + MAX_LIFETIME_MS, selected, installTestName,
    synthetic: 'A/B differ by a synthetic meta marker and per-revision probe asset; they are NOT released app versions',
    bases: Object.fromEntries(BASES.map(b => [b, {
      A: { ...fixtures[b].A, dir: undefined }, B: { ...fixtures[b].B, dir: undefined },
    }])),
  });
  const send = (res, code, body, headers = {}) => {
    res.writeHead(code, { ...NO_CACHE, ...headers });
    res.end(body);
  };
  const json = (res, code, obj) => send(res, code, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8' });

  const server = http.createServer(async (req, res) => {
    try {
      if (req.headers.host !== `${HOST}:${port}`) return json(res, 403, { error: 'bad host' });
      const url = new URL(req.url, origin);
      let pathname;
      try { pathname = decodeURIComponent(url.pathname); } catch { return json(res, 400, { error: 'bad path' }); }

      if (pathname.startsWith(CTRL)) {
        const name = pathname.slice(CTRL.length);
        if (req.method === 'GET' && name === 'meta') return json(res, 200, meta());
        if (req.method === 'POST') {
          if (req.headers.origin && req.headers.origin !== origin) return json(res, 403, { error: 'bad origin' });
          if (name === 'shutdown') {
            json(res, 200, { ok: true, shuttingDown: true });
            setTimeout(() => shutdown(0), 50);
            return;
          }
          if (name === 'select') {
            let raw = '';
            for await (const c of req) { raw += c; if (raw.length > 4096) return json(res, 413, { error: 'too large' }); }
            let body;
            try { body = JSON.parse(raw); } catch { return json(res, 400, { error: 'invalid JSON' }); }
            if (!body || !BASES.includes(body.base) || (body.version !== 'A' && body.version !== 'B')) {
              return json(res, 400, { error: `need {base: one of ${BASES.join(' ')}, version: 'A'|'B'}` });
            }
            selected[body.base] = body.version;
            return json(res, 200, { ok: true, base: body.base, version: body.version, selected });
          }
        }
        return json(res, 404, { error: 'unknown control route' });
      }

      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'method not allowed', { Allow: 'GET, HEAD' });

      // Sub-bases first; '/' is the fallback owner of everything else.
      let base = '/';
      for (const b of ['/TTDefense/', '/tabletop/']) {
        if (pathname === b || pathname === b.slice(0, -1) || pathname.startsWith(b)) { base = b; break; }
      }
      const rel = base === '/' ? pathname.slice(1) : pathname.slice(base.length);
      const dir = fixtures[base][selected[base]].dir;
      const target = path.resolve(dir, rel === '' ? 'index.html' : rel);
      if (target !== dir && !target.startsWith(dir + path.sep)) return send(res, 404, 'not found');
      let st;
      try { st = await fs.stat(target); } catch { return send(res, 404, 'not found'); }
      if (!st.isFile()) return send(res, 404, 'not found');
      const headers = { 'Content-Type': MIME[path.extname(target).toLowerCase()] || 'application/octet-stream', 'Content-Length': st.size };
      if (path.basename(target) === 'ga-sw.js' && path.dirname(target) === dir) headers['Service-Worker-Allowed'] = base;
      res.writeHead(200, { ...NO_CACHE, ...headers });
      if (req.method === 'HEAD') return res.end();
      res.end(await fs.readFile(target));
    } catch (err) {
      if (!res.headersSent) json(res, 500, { error: String(err && err.message || err) });
      else res.destroy();
    }
  });

  let closing = false;
  function shutdown(code) {
    if (closing) return;
    closing = true;
    server.close(() => process.exit(code));
    server.closeAllConnections?.();
    setTimeout(() => process.exit(code), 2000).unref();
  }
  setTimeout(() => { log('max lifetime reached, exiting'); shutdown(0); }, MAX_LIFETIME_MS).unref();
  process.on('SIGINT', () => shutdown(0));
  process.on('SIGTERM', () => shutdown(0));

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, HOST, resolve);
  });
  const summary = {};
  for (const b of BASES) {
    summary[b] = { A: { version: fixtures[b].A.version, files: fixtures[b].A.precacheCount }, B: { version: fixtures[b].B.version, files: fixtures[b].B.precacheCount } };
  }
  console.log(JSON.stringify({
    ready: true, origin, buildDir: outRoot, bases: summary, maxLifetimeMs: MAX_LIFETIME_MS,
    synthetic: true, note: 'A/B = same current app + synthetic meta marker + distinct probe asset, not released versions',
  }));
}

main().catch(err => {
  console.error(`pwa-smoke-server failed: ${err && err.stack || err}`);
  process.exit(1);
});
