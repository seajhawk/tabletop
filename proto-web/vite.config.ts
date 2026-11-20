import { defineConfig } from 'vitest/config';

const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;

// Canonical data lives in ../shared-data and is imported directly as JSON modules,
// so the dev server must be allowed to serve files from the parent directory.
export default defineConfig({
  base: env?.VITE_BASE || '/',
  server: { fs: { allow: ['..'] } },
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
  test: { include: ['tests/**/*.test.{ts,mjs}'], environment: 'node' },
});
