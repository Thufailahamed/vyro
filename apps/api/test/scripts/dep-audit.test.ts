import { describe, expect, it } from 'vitest';
import { classifyAdvisories, isDevOnlyPath, segmentName, collectWorkspaceDeps } from '../../src/scripts/dep-audit';

const workspaces = new Map([
  [
    'apps/api',
    { prod: new Set(['hono', 'uuid', 'zod', 'drizzle-orm']), dev: new Set(['vitest', 'wrangler']) },
  ],
  [
    'apps/web',
    { prod: new Set(['react', 'react-dom']), dev: new Set(['vite', 'typescript']) },
  ],
  [
    '.',
    { prod: new Set(['turbo', 'typescript']), dev: new Set(['eslint', 'prettier']) },
  ],
  [
    'apps/mobile',
    { prod: new Set(['expo', 'react-native']), dev: new Set(['eslint']) },
  ],
]);

describe('dep-audit path classification', () => {
  it('extracts package names from path segments', () => {
    expect(segmentName('hono@4.13.13')).toBe('hono');
    expect(segmentName('@vitest/mocker@2.1.9')).toBe('@vitest/mocker');
    expect(segmentName('@vyro/auth@link:../../packages/auth')).toBe('@vyro/auth');
  });

  it('treats a direct production dependency as production-reachable', () => {
    expect(isDevOnlyPath('apps/api > hono@4.13.13', workspaces)).toBe(false);
  });

  it('treats a direct dev dependency as dev-only', () => {
    expect(isDevOnlyPath('apps/api > vitest@2.1.9', workspaces)).toBe(true);
    expect(isDevOnlyPath('apps/api > wrangler@4.129.0', workspaces)).toBe(true);
  });

  it('treats a transitive path through tooling as dev-only', () => {
    expect(isDevOnlyPath('apps/api > vitest@2.1.9 > tinypool@1.1.1', workspaces)).toBe(true);
    expect(
      isDevOnlyPath('apps/api > @cloudflare/vitest-pool-workers@0.5.41 > miniflare@3.0.0 > undici@5.29.0', workspaces),
    ).toBe(true);
  });

  it('treats a transitive path through a runtime package as production-reachable', () => {
    expect(isDevOnlyPath('apps/api > @vyro/shared@link:../../packages/shared > uuid@10.0.0', workspaces)).toBe(
      false,
    );
  });

  it('treats a hoisted transitive path as dev-only when it is not a direct dependency', () => {
    // pnpm emits this "hoisted" path for transitively reachable packages.
    expect(isDevOnlyPath('apps/mobile > shell-quote@1.10.0', workspaces)).toBe(true);
  });

  it('treats an unknown workspace conservatively as production-reachable', () => {
    expect(isDevOnlyPath('apps/unknown > some-pkg@1.0.0', workspaces)).toBe(false);
  });
});

describe('dep-audit advisory classification', () => {
  it('keeps an advisory that has a production-reachable path', () => {
    const result = classifyAdvisories(
      {
        '1': {
          module_name: 'hono',
          severity: 'moderate',
          title: 'hono/jsx XSS',
          url: 'https://example.test/advisory',
          vulnerable_versions: '<4.13.7',
          findings: [{ version: '4.13.5', paths: ['apps/api > hono@4.13.5'] }],
        },
      },
      workspaces,
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.devOnly).toBe(false);
    expect(result[0]!.prodPaths).toEqual(['apps/api > hono@4.13.5']);
  });

  it('filters an advisory whose every path is dev-only', () => {
    const result = classifyAdvisories(
      {
        '2': {
          module_name: 'tinypool',
          severity: 'critical',
          title: 'Tinypool RCE',
          url: 'https://example.test/advisory',
          vulnerable_versions: '<=2.1.0',
          findings: [
            {
              version: '1.1.1',
              paths: ['apps/api > vitest@2.1.9 > tinypool@1.1.1', 'apps/web > vitest@2.1.9 > tinypool@1.1.1'],
            },
          ],
        },
      },
      workspaces,
    );
    expect(result[0]!.devOnly).toBe(true);
    expect(result[0]!.prodPaths).toEqual([]);
  });
});

describe('collectWorkspaceDeps', () => {
  it('reads the real workspace packages', () => {
    const deps = collectWorkspaceDeps(process.cwd() + '/../..');
    expect(deps.has('apps/api')).toBe(true);
    expect(deps.has('packages/shared')).toBe(true);
    expect(deps.get('apps/api')!.prod.has('hono')).toBe(true);
    expect(deps.get('apps/api')!.dev.has('vitest')).toBe(true);
  });
});
