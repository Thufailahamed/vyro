#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Wraps `pnpm audit --json` and fails on critical/high advisories that can
 * reach production runtime.
 *
 * The B1 spec says: "no high-severity npm advisories in production
 * dependencies". Production runtime is the Worker bundle (apps/api +
 * packages/*). Build, test, lint and CLI tooling never ships there.
 *
 * How pnpm reports it
 * -------------------
 * Each advisory lists every dependency path that reaches the vulnerable
 * package, e.g.
 *
 *   apps/api > hono@4.13.5
 *   apps/api > vitest@2.1.9 > tinypool@1.1.1
 *
 * A path that only ever traverses build/test/CLI tooling can never run
 * inside the Worker, so it is not a production risk. A path that reaches the
 * vulnerable package without touching tooling IS production-reachable.
 *
 * An advisory is filtered out ONLY when EVERY one of its paths is
 * dev-only. If at least one path is production-reachable the advisory is
 * reported and counts towards the gate. Filtered advisories are always
 * printed with their reason, so nothing is silently dropped.
 *
 * If this filter ever masks a real vuln, drop it and use raw `pnpm audit`.
 */

/**
 * Packages that only ever appear as build/test/lint/CLI tooling.
 * A dependency path that traverses any of them is dev-only.
 */
const TOOLING_PACKAGES = new Set([
  // Test runners
  'vitest',
  '@vitest/runner',
  '@vitest/snapshot',
  '@vitest/mocker',
  '@vitest/expect',
  '@vitest/ui',
  'tinypool',
  // Bundlers / build
  'vite',
  'vite-node',
  'esbuild',
  '@esbuild-kit/esm-loader',
  '@esbuild-kit/core-utils',
  '@esbuild-plugins/node-globals-polyfill',
  '@esbuild-plugins/node-modules-polyfill',
  '@vitejs/plugin-react',
  'vite-tsconfig-paths',
  'rollup',
  // Cloudflare local emulation
  'wrangler',
  'miniflare',
  '@cloudflare/vitest-pool-workers',
  '@cloudflare/workers-types',
  'undici',
  'devalue',
  'selfsigned',
  '@fastify/busboy',
  // Linting
  'eslint',
  'eslint-config-expo',
  'eslint-plugin-import',
  'eslint-plugin-expo',
  'eslint-plugin-react',
  'eslint-plugin-react-hooks',
  'eslint-import-resolver-typescript',
  'eslint-module-utils',
  '@typescript-eslint/parser',
  '@typescript-eslint/eslint-plugin',
  '@typescript-eslint/utils',
  '@typescript-eslint/type-utils',
  '@eslint/config-array',
  '@eslint/eslintrc',
  'minimatch',
  'brace-expansion',
  'braces',
  'micromatch',
  'node-forge',
  // CSS / build pipeline
  'tailwindcss',
  'postcss',
  'postcss-nested',
  'postcss-selector-parser',
  'postcss-import',
  'postcss-js',
  'postcss-load-config',
  'autoprefixer',
  'source-map-js',
  'launch-editor',
  'drizzle-kit',
  // Expo / React Native CLI tooling
  '@expo/cli',
  '@expo/config',
  '@expo/config-plugins',
  '@expo/metro',
  '@expo/metro-config',
  '@expo/metro-runtime',
  '@expo/metro-file-map',
  '@expo/router-server',
  '@expo/log-box',
  '@expo/dom-webview',
  '@expo/code-signing-certificates',
  '@expo/inline-modules',
  '@expo/local-build-cache-provider',
  '@expo/prebuild-config',
  '@expo/devtools',
  'metro',
  'metro-file-map',
  'metro-config',
  'react-devtools-core',
  '@react-native/community-cli-plugin',
  'xcode',
  'query-string',
  'decode-uri-component',
  'sharp',
]);

/** Workspace package names that are shipped as production dependencies. */
const WORKSPACE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

/** Per-workspace-package dependency maps, keyed by the path prefix pnpm uses. */
export interface WorkspaceDeps {
  prod: Set<string>;
  dev: Set<string>;
}

export function collectWorkspaceDeps(root: string): Map<string, WorkspaceDeps> {
  const map = new Map<string, WorkspaceDeps>();
  const read = (key: string, pkgFile: string) => {
    try {
      const pkg = JSON.parse(readFileSync(pkgFile, 'utf8')) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      map.set(key, {
        prod: new Set(Object.keys(pkg.dependencies ?? {})),
        dev: new Set(Object.keys(pkg.devDependencies ?? {})),
      });
    } catch {
      // A malformed package.json must not silently widen the allow-list.
      map.set(key, { prod: new Set(['__unreadable__']), dev: new Set() });
    }
  };

  const rootPkg = join(root, 'package.json');
  if (existsSync(rootPkg)) read('.', rootPkg);
  for (const dir of ['apps', 'packages']) {
    const base = join(root, dir);
    if (!existsSync(base)) continue;
    for (const entry of readdirSync(base)) {
      const pkgFile = join(base, entry, 'package.json');
      if (existsSync(pkgFile)) read(`${dir}/${entry}`, pkgFile);
    }
  }
  return map;
}

/** Extract the package name from a dependency-path segment. */
export function segmentName(segment: string): string {
  const at = segment.indexOf('@', 1);
  return at > 0 ? segment.slice(0, at) : segment;
}

/**
 * A path is dev-only when the vulnerable package (the last segment) is only
 * reachable through build/test/CLI tooling.
 *
 *   apps/api > vitest@2.1.9 > tinypool@1.1.1            → dev-only (parent vitest)
 *   apps/api > @cloudflare/vitest-pool-workers > devalue  → dev-only (parent is tooling)
 *   apps/api > hono@4.13.5                                → production (direct dep)
 *
 * The vulnerable package is always the LAST segment of a pnpm dependency
 * path, and the segment before it is the direct importer. If that importer
 * is tooling, the vulnerable code is only ever loaded by a build/test/CLI
 * tool and never by the Worker.
 *
 * pnpm also emits a two-segment "hoisted" path (`apps/mobile > shell-quote@1.10.0`)
 * for packages that are only transitively reachable. Those are production
 * paths ONLY when the package is a direct production dependency of that
 * workspace package; otherwise the hoisted path is an artefact of pnpm's
 * node_modules layout and the real importer chain (which is always reported
 * too) decides.
 */
export function isDevOnlyPath(path: string, workspaces: Map<string, WorkspaceDeps>): boolean {
  const segments = path.split(' > ').map((s) => s.trim()).filter(Boolean);
  if (segments.length === 0) return false;
  const names = segments.map(segmentName);
  const vulnerable = names[names.length - 1]!;

  if (TOOLING_PACKAGES.has(vulnerable)) return true;

  if (names.length >= 3) {
    const parent = names[names.length - 2]!;
    return TOOLING_PACKAGES.has(parent);
  }

  // Two-segment path: direct/hoisted from a workspace package.
  const ws = workspaces.get(segments[0]!);
  if (!ws) return false;
  if (ws.dev.has(vulnerable)) return true;
  return !ws.prod.has(vulnerable);
}

export interface AdvisoryClassification {
  id: string;
  moduleName: string;
  severity: string;
  title: string;
  url: string;
  vulnerableVersions: string;
  devOnly: boolean;
  prodPaths: string[];
}

/** Classify every advisory by whether any of its paths is production-reachable. */
export function classifyAdvisories(
  advisories: Record<string, any>,
  workspaces: Map<string, WorkspaceDeps>,
): AdvisoryClassification[] {
  const out: AdvisoryClassification[] = [];
  for (const [id, adv] of Object.entries(advisories)) {
    const paths = new Set<string>();
    for (const finding of adv.findings ?? []) {
      for (const p of finding.paths ?? []) {
        if (typeof p === 'string') paths.add(p);
      }
    }
    for (const p of adv.paths ?? []) {
      if (p && typeof p.path === 'string') paths.add(p.path);
    }
    const all = [...paths];
    const prodPaths = all.filter((p) => !isDevOnlyPath(p, workspaces));
    out.push({
      id,
      moduleName: adv.module_name ?? adv.name ?? '',
      severity: adv.severity ?? 'unknown',
      title: adv.title ?? '',
      url: adv.url ?? '',
      vulnerableVersions: adv.vulnerable_versions ?? '',
      devOnly: prodPaths.length === 0,
      prodPaths,
    });
  }
  return out;
}

function run(): void {
  // `pnpm audit --json` output grows with the advisory count and comfortably
  // exceeds spawnSync's 1 MiB default maxBuffer — without raising it the
  // child is killed and stdout comes back truncated, which fails the parse.
  const result = spawnSync('pnpm', ['audit', '--json'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  let report: any;
  try {
    report = JSON.parse(result.stdout);
  } catch {
    console.error('Failed to parse pnpm audit JSON output');
    process.exit(result.status ?? 1);
  }

  const advisories = report.advisories ?? {};
  const workspaces = collectWorkspaceDeps(WORKSPACE_ROOT);
  const classified = classifyAdvisories(advisories, workspaces);

  const kept = classified.filter((c) => !c.devOnly);
  const filtered = classified.filter((c) => c.devOnly);

  const counts: Record<string, number> = { critical: 0, high: 0, moderate: 0, low: 0, info: 0 };
  for (const c of kept) counts[c.severity] = (counts[c.severity] ?? 0) + 1;

  const failed = counts.critical > 0 || counts.high > 0;

  if (filtered.length > 0) {
    console.log(`Dev-tooling advisories not counted (${filtered.length}):`);
    for (const c of filtered) {
      console.log(`  ${c.severity.toUpperCase()} ${c.moduleName} — ${c.title}`);
    }
    console.log('');
  }

  if (failed) {
    console.error(`Dependency audit failed (production-reachable vulns):`);
    console.error(`  critical: ${counts.critical}, high: ${counts.high}, moderate: ${counts.moderate}`);
    console.error('');
    console.error('Affected packages:');
    for (const c of kept) {
      console.error(`  ${c.severity.toUpperCase()} ${c.moduleName}@${c.vulnerableVersions} — ${c.title}`);
      console.error(`    ${c.url}`);
      for (const p of c.prodPaths.slice(0, 3)) console.error(`    via ${p}`);
    }
    process.exit(1);
  }

  console.log(
    `Dependency audit passed. Production-reachable: ${counts.critical} critical, ${counts.high} high, ${counts.moderate} moderate. ` +
      `Dev-tooling filtered: ${filtered.length}.`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run();
}
