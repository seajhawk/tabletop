import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const manifest = JSON.parse(await readFile(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8'));
const origin = 'https://example.test';
const bases = ['/', '/tabletop/', '/TTDefense/'];

// Manifest id resolves against the start URL's ORIGIN; missing id defaults to start_url.
// https://www.w3.org/TR/appmanifest/#id-member
// Chrome confirmed the old id:"./" collapsed all three installations to the origin root.
const identity = base => {
  const start = new URL(manifest.start_url, origin + base + 'manifest.webmanifest');
  return new URL(manifest.id ?? start.href, start.origin + '/').href;
};

describe('install identities across deployment bases', () => {
  it.each(bases)('keeps %s app identity and launch URL in its deployment', base => {
    const manifestUrl = origin + base + 'manifest.webmanifest';
    expect(identity(base)).toBe(origin + base);
    expect(new URL(manifest.start_url, manifestUrl).href).toBe(origin + base);
    expect(new URL(manifest.scope, manifestUrl).href).toBe(origin + base);
  });

  it('allows all three apps to coexist on one origin', () => {
    expect(new Set(bases.map(identity)).size).toBe(bases.length);
  });
});
