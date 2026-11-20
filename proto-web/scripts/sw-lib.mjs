import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

export const SW_FILE = 'ga-sw.js';
export const REQUIRED_FILES = [
  'index.html', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png',
];

const sha = data => createHash('sha256').update(data).digest('hex');

export function normalizeBase(base = '/') {
  let b = String(base || '/').trim();
  if (!b.startsWith('/')) b = '/' + b;
  if (!b.endsWith('/')) b = b + '/';
  return b.replace(/\/+/g, '/');
}

async function walk(dir, base = dir, out = []) {
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) await walk(full, base, out);
    else out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out;
}

/** Everything in dist except the worker itself and sourcemaps, sorted, with content hashes. */
export async function collectPrecache(distDir, base = '/') {
  const normBase = normalizeBase(base);
  let files;
  try { files = await walk(distDir); } catch { throw new Error(`dist not found: ${distDir} (run vite build first)`); }
  const set = new Set(files);
  const missing = REQUIRED_FILES.filter(f => !set.has(f));
  if (missing.length) throw new Error(`Required build output missing: ${missing.join(', ')}`);
  if (!files.some(f => f.endsWith('.js') && f !== SW_FILE)) throw new Error('No JavaScript bundle found in dist');
  const entries = [];
  for (const f of files.filter(f => f !== SW_FILE && !f.endsWith('.map')).sort()) {
    entries.push({ url: normBase + f, hash: sha(await fs.readFile(path.join(distDir, f))) });
  }
  const html = await fs.readFile(path.join(distDir, 'index.html'), 'utf8');
  for (const m of html.matchAll(/(?:src|href)="((?:\.\/|\/)[^"#?]+)"/g)) {
    const raw = m[1];
    const resolved = raw.startsWith('./') ? normBase + raw.slice(2) : raw;
    if (!entries.some(e => e.url === resolved)) throw new Error(`index.html references missing file: ${raw}`);
  }
  return entries;
}

/** Deterministic: depends only on file paths/contents and the worker template. */
export function computeVersion(entries, template) {
  const h = createHash('sha256').update(template);
  for (const e of [...entries].sort((a, b) => a.url.localeCompare(b.url))) h.update(`\n${e.url}\0${e.hash}`);
  return h.digest('hex').slice(0, 16);
}

export function renderWorker(template, version, urls, base = '/') {
  const normBase = normalizeBase(base);
  if (!template.includes('__GA_VERSION__') || !template.includes('__GA_PRECACHE__')) throw new Error('Worker template placeholders missing');
  return template
    .replace('__GA_VERSION__', version)
    .replace('__GA_BASE__', normBase)
    .replace('__GA_PRECACHE__', JSON.stringify(urls, null, 2));
}

export async function generateWorker(distDir, templatePath, base = '/') {
  const normBase = normalizeBase(base);
  const template = await fs.readFile(templatePath, 'utf8');
  const entries = await collectPrecache(distDir, normBase);
  const version = computeVersion(entries, template);
  await fs.writeFile(path.join(distDir, SW_FILE), renderWorker(template, version, entries.map(e => e.url), normBase));
  return { version, count: entries.length, base: normBase };
}
