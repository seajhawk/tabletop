import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateWorker, normalizeBase } from './sw-lib.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = normalizeBase(process.env.VITE_BASE || '/');
try {
  const { version, count } = await generateWorker(path.join(root, 'dist'), path.join(root, 'scripts', 'sw-template.js'), base);
  console.log(`ga-sw.js generated: version ${version}, base ${base}, ${count} precached files`);
} catch (err) {
  console.error(`generate-sw failed: ${err.message}`);
  process.exit(1);
}
