#!/usr/bin/env node
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// __dirname = apps/api/src/scripts (or compiled equivalent). Walk up to find apps/api/src/modules.
const APPS_API_MODULES = join(__dirname, '..', 'modules');
if (!existsSync(APPS_API_MODULES)) {
  // Fallback for tests that resolve through pnpm: resolve relative to monorepo root via cwd
  const candidates = [
    join(process.cwd(), 'apps/api/src/modules'),
    join(process.cwd(), 'src/modules'),
  ];
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error(`Could not locate apps/api/src/modules from ${process.cwd()}`);
  // Use cwd-relative as ROOT
  var ROOT = found;
} else {
  var ROOT = APPS_API_MODULES;
}
const MUTATING = new Set(['post', 'patch', 'put', 'delete']);
const EXEMPT_PREFIXES = ['/api/health', '/api/csp-report'];
const EXEMPT_EXACT = new Set(['/api/health', '/api/csp-report']);
const EXEMPT_FILES = ['auth', 'cspReport'];

export interface Gap {
  file: string;
  method: string;
  path: string;
}

async function* walk(dir: string): AsyncGenerator<string> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) yield* walk(full);
    else if (e.isFile() && e.name === 'routes.ts') yield full;
  }
}

function isExempt(path: string): boolean {
  if (EXEMPT_EXACT.has(path)) return true;
  return EXEMPT_PREFIXES.some((p) => path.startsWith(p));
}

export async function auditRbac(): Promise<{ gaps: Gap[] }> {
  const gaps: Gap[] = [];
  for await (const file of walk(ROOT)) {
    const src = await readFile(file, 'utf8');
    const fileIsExempt = EXEMPT_FILES.some((name) => file.includes(`/modules/${name}/routes.ts`) || file.endsWith(`/${name}/routes.ts`));
    const calls = [...src.matchAll(/\.(get|post|patch|put|delete)\(\s*['"`]([^'"`]+)['"`]/g)];
    for (const m of calls) {
      const method = m[1]!.toLowerCase();
      const path = m[2]!;
      if (!MUTATING.has(method)) continue;
      if (fileIsExempt) continue;
      if (isExempt(path)) continue;
      const idx = (m.index ?? 0) + m[0].length;
      const tail = src.slice(idx, idx + 600);
      const hasRequireRole = /requireRole\(/.test(tail);
      const fileHasSession = /\bsession\(/.test(src);
      if (!hasRequireRole && !fileHasSession) {
        gaps.push({ file: relative(process.cwd(), file), method: method.toUpperCase(), path });
      }
    }
  }
  return { gaps };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await auditRbac();
  if (result.gaps.length > 0) {
    console.error(`RBAC audit failed. ${result.gaps.length} gap(s) found:`);
    for (const g of result.gaps) {
      console.error(`  ${g.file} ${g.method} ${g.path}`);
    }
    process.exit(1);
  }
  console.log('RBAC audit passed.');
}