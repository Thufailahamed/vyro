import { describe, expect, it, vi, afterEach } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { api, apiBase } from '../src/lib/api';

/**
 * The API client prepends `apiBase` (default `/api`) to every path, so a
 * path passed to `api.get`/`api.post`/... must be RELATIVE (`/ai/home`).
 * Passing an absolute `/api/...` path silently produces `/api/api/...`,
 * which 404s against the Worker.
 *
 * These tests lock the contract and scan the whole SPA so the mistake cannot
 * creep back in.
 */

const SRC = join(process.cwd(), 'src');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

describe('api base contract', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('defaults the base to /api', () => {
    expect(apiBase).toBe('/api');
  });

  it('prefixes a relative path exactly once', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await api.get('/ai/home');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/ai/home');
  });

  it('does not double-prefix on POST', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await api.post('/ai/confirm', { items: [] });

    expect(fetchMock.mock.calls[0]![0]).toBe('/api/ai/confirm');
  });

  it('no SPA call site passes an absolute /api path to the api client', () => {
    const offenders: string[] = [];
    const pattern = /api\s*\.\s*(get|post|put|patch|del)\s*(?:<[^>]*>)?\s*\(\s*[`'"]\/api\//g;

    for (const file of walk(SRC)) {
      const src = readFileSync(file, 'utf8');
      for (const m of src.matchAll(pattern)) {
        const line = src.slice(0, m.index).split('\n').length;
        offenders.push(`${file}:${line} ${m[0].replace(/\s+/g, ' ')}`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('no SPA call site concatenates VITE_API_URL with an /api path', () => {
    // `apiBase` already carries the "/api" segment, so appending "/api/…"
    // to VITE_API_URL would double it. Use `apiBase` + a relative path.
    const offenders: string[] = [];
    const pattern = /import\.meta\.env\.VITE_API_URL[^\n]*\+\s*['"`]\/api\//g;

    for (const file of walk(SRC)) {
      const src = readFileSync(file, 'utf8');
      for (const m of src.matchAll(pattern)) {
        const line = src.slice(0, m.index).split('\n').length;
        offenders.push(`${file}:${line} ${m[0].trim()}`);
      }
    }

    expect(offenders).toEqual([]);
  });
});
