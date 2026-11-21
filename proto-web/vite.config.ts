import { defineConfig } from 'vitest/config';

const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
const now = new Date();
const pad2 = (n: number) => String(n).padStart(2, '0');
const buildVersion = `${now.getFullYear()}.${pad2(now.getMonth() + 1)}.${pad2(now.getDate())}.${pad2(now.getHours())}${pad2(now.getMinutes())}`;

// Canonical data lives in ../shared-data and is imported directly as JSON modules,
// so the dev server must be allowed to serve files from the parent directory.
export default defineConfig({
  base: env?.VITE_BASE || '/',
  define: { __APP_VERSION__: JSON.stringify(buildVersion) },
  server: { fs: { allow: ['..'] } },
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
  test: { include: ['tests/**/*.test.{ts,mjs}'], environment: 'node' },
});
