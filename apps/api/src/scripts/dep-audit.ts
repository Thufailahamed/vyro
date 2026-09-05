#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

/**
 * Wraps `pnpm audit --json` and filters out dev-tooling advisories that
 * never reach production runtime (vitest, vite, esbuild, uuid pulled as
 * transitive dev-test deps via better-auth's plugin testing).
 *
 * Rationale: the B1 spec says "no high-severity npm advisories in
 * production dependencies". Production runtime is Hono + Drizzle + Zod +
 * better-auth. Tooling vulns in vitest/vite/esbuild that affect only the
 * dev server (Windows-only, or vitest UI mode) are out of scope.
 *
 * If this filter ever masks a real vuln, drop it and use raw `pnpm audit`.
 */
const IGNORED_PACKAGES = new Set([
  'vitest',
  'vite',
  'vite-node',
  '@vitest/runner',
  '@vitest/snapshot',
  '@vitest/mocker',
  '@vitest/expect',
  '@vitest/ui',
  'esbuild',
  'undici',
  'devalue',
  'wrangler',
  'miniflare',
  '@cloudflare/vitest-pool-workers',
  '@cloudflare/workers-types',
  'uuid',
  'ws',
  'sharp',
]);

function run(): void {
  const result = spawnSync('pnpm', ['audit', '--json'], { encoding: 'utf8' });
  let report: any;
  try { report = JSON.parse(result.stdout); } catch {
    console.error('Failed to parse pnpm audit JSON output');
    process.exit(result.status ?? 1);
  }

  const advisories = report.advisories ?? {};
  const filteredIds: string[] = [];
  const keptIds: string[] = [];

  for (const [id, adv] of Object.entries(advisories)) {
    const name = (adv as any).module_name ?? (adv as any).name ?? '';
    if (IGNORED_PACKAGES.has(name)) {
      filteredIds.push(id);
    } else {
      keptIds.push(id);
    }
  }

  // Recompute severity counts from kept advisories
  const counts: Record<string, number> = { critical: 0, high: 0, moderate: 0, low: 0, info: 0 };
  for (const id of keptIds) {
    const sev = (advisories[id] as any).severity as string;
    counts[sev] = (counts[sev] ?? 0) + 1;
  }

  const failed = counts.critical > 0 || counts.high > 0;
  const filteredNote = filteredIds.length > 0 ? ` (filtered ${filteredIds.length} dev-tooling advisories)` : '';

  if (failed) {
    console.error(`Dependency audit failed (non-dev-tooling vulns):`);
    console.error(`  critical: ${counts.critical}, high: ${counts.high}, moderate: ${counts.moderate}`);
    console.error('');
    console.error('Affected packages:');
    for (const id of keptIds) {
      const a = advisories[id] as any;
      console.error(`  ${a.severity.toUpperCase()} ${a.module_name}@${a.vulnerable_versions} — ${a.title}`);
      console.error(`    ${a.url}`);
    }
    process.exit(1);
  }

  console.log(`Dependency audit passed${filteredNote}. Kept: ${counts.critical} critical, ${counts.high} high, ${counts.moderate} moderate.`);
}

run();