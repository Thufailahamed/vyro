#!/usr/bin/env node
/**
 * Cross-check the SPA against the Worker's route table.
 *
 * Every API path the SPA calls must exist on the Worker with a matching
 * HTTP method. This catches the class of bug where a client builds a URL
 * that the server never serves (a 404 that only shows up at runtime).
 *
 * How it works
 * ------------
 * 1. Parse `apps/api/src/index.ts` for `app.route(prefix, router)` mounts and
 *    resolve each router to its source file (including directory indexes that
 *    re-export `./routes`).
 * 2. Collect every `router.get/post/put/patch/delete('path')` in those files.
 * 3. Collect every API call the SPA makes — the `api.*` client, raw
 *    `fetch('/api/…')` calls, and `apiBase + '/api/…'` concatenations.
 * 4. Match each SPA call against the route table (`:param` matches one
 *    segment). Unmatched calls are reported.
 *
 * Usage:  node scripts/route-crosscheck.mjs [repoRoot]
 * Exit:   0 when every SPA call resolves, 1 otherwise.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.argv[2] || process.cwd();
const API = join(ROOT, 'apps/api/src');
const WEB = join(ROOT, 'apps/web/src');

function existsFile(p) {
  try {
    statSync(p);
    return true;
  } catch {
    return false;
  }
}

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const full = join(dir, e);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(e) && !/\.test\.(ts|tsx)$/.test(e)) out.push(full);
  }
  return out;
}

// ---- 1. Route table ----------------------------------------------------
const indexSrc = readFileSync(join(API, 'index.ts'), 'utf8');

const varToFile = new Map();
for (const m of indexSrc.matchAll(/import\s+(\w+)\s*,\s*\{([^}]*)\}\s*from\s*'\.\/([^']+)'/g)) {
  varToFile.set(m[1], m[3]);
  for (const raw of m[2].split(',')) {
    const name = raw.trim().split(/\s+as\s+/).pop()?.trim();
    if (name) varToFile.set(name, m[3]);
  }
}
for (const m of indexSrc.matchAll(/import\s+(\w+)\s+from\s*'\.\/([^']+)'/g)) varToFile.set(m[1], m[2]);
for (const m of indexSrc.matchAll(/import\s+\{([^}]*)\}\s*from\s*'\.\/([^']+)'/g)) {
  for (const raw of m[1].split(',')) {
    const name = raw.trim().split(/\s+as\s+/).pop()?.trim();
    if (name) varToFile.set(name, m[2]);
  }
}

const mounts = [];
for (const m of indexSrc.matchAll(/app\.route\(\s*'([^']+)'\s*,\s*(\w+)\s*\)/g)) mounts.push([m[1], m[2]]);

function resolveRouterFile(rel) {
  if (rel.endsWith('.ts')) return existsFile(join(API, rel)) ? rel : null;
  if (existsFile(join(API, `${rel}.ts`))) return `${rel}.ts`;
  if (existsFile(join(API, rel, 'index.ts'))) {
    const idx = readFileSync(join(API, rel, 'index.ts'), 'utf8');
    const m = /export\s*\{\s*default\s*\}\s*from\s*'\.\/([^']+)'/.exec(idx);
    if (m) {
      const inner = `${rel}/${m[1]}`.replace(/\/\.\//, '/');
      const withExt = inner.endsWith('.ts') ? inner : `${inner}.ts`;
      return existsFile(join(API, withExt)) ? withExt : null;
    }
  }
  return null;
}

const routeTable = [];
const seenFiles = new Set();
const nestedMounts = [];

function scanRouterFile(file, exportName) {
  const key = `${file}::${exportName ?? 'default'}`;
  if (seenFiles.has(key)) return;
  seenFiles.add(key);
  const src = readFileSync(join(API, file), 'utf8');
  // A file may export more than one router (e.g. `aiRouter` + `aiAdminRouter`).
  let routerVars = null;
  if (exportName && exportName !== 'default') {
    if (new RegExp(`(?:const|let|var)\\s+${exportName}\\s*=\\s*new Hono`).test(src)) routerVars = [exportName];
  }
  for (const m of src.matchAll(/\b(\w+)\.(get|post|put|patch|delete|all)\(\s*'([^']+)'/g)) {
    if (routerVars && !routerVars.includes(m[1])) continue;
    routeTable.push({ method: m[2].toUpperCase(), path: m[3], file });
  }
  for (const m of src.matchAll(/\b(\w+)\.route\(\s*'([^']+)'\s*,\s*(\w+)\s*\)/g)) {
    nestedMounts.push([file, m[2], m[3]]);
  }
}

function mountAll(entries) {
  for (const [prefix, varName] of entries) {
    const rel = varToFile.get(varName);
    if (!rel) continue;
    const file = resolveRouterFile(rel);
    if (!file) continue;
    const before = routeTable.length;
    scanRouterFile(file, varName);
    for (let i = before; i < routeTable.length; i++) routeTable[i].prefix = prefix;
  }
}
mountAll(mounts);
mountAll(nestedMounts.map(([, prefix, varName]) => [prefix, varName]));

// ---- 2. SPA calls ------------------------------------------------------
const calls = [];
for (const file of walk(WEB)) {
  const src = readFileSync(file, 'utf8');
  const rel = file.replace(ROOT + '/', '');
  for (const m of src.matchAll(/\bapi\s*\.\s*(get|post|put|patch|del)\s*(?:<[^>]*>)?\s*\(\s*[`'"](\/[^`'"?]*)/g)) {
    calls.push({ method: m[1] === 'del' ? 'DELETE' : m[1].toUpperCase(), path: m[2], file: rel });
  }
  for (const m of src.matchAll(/\bfetch\(\s*[`'"](\/api\/[^`'"?]*)[`'"]([\s\S]{0,300}?)\)\s*(;|,|\)|$)/g)) {
    const opts = m[2] || '';
    const literal = /method\s*:\s*['"]([A-Z]+)['"]/i.exec(opts)?.[1]?.toUpperCase();
    // `method: on ? 'DELETE' : 'POST'` — the method is chosen at runtime, so
    // the call can only be checked for path existence.
    const method = literal ?? (/method\s*:/.test(opts) ? '*' : 'GET');
    calls.push({ method, path: m[1], file: rel });
  }
  for (const m of src.matchAll(/\+\s*'(\/api\/[^'?]*)([\s\S]{0,240}?)\)\s*(;|,|\)|$)/g)) {
    const method = /method\s*:\s*['"]([A-Z]+)['"]/i.exec(m[2] || '')?.[1]?.toUpperCase() ?? 'GET';
    calls.push({ method, path: m[1], file: rel });
  }
}

// ---- 3. Match ----------------------------------------------------------
function toRegex(apiPath) {
  const esc = apiPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/:[A-Za-z0-9_]+/g, '[^/]+');
  return new RegExp('^' + esc + '$');
}

const normalized = routeTable
  .filter((r) => r.prefix !== undefined)
  .map((r) => ({ ...r, full: (r.prefix + r.path).replace(/\/+$/, '') || '/' }));

const misses = calls.filter((c) => {
  if (!c.path.startsWith('/api/')) return false;
  const target = c.path.replace(/\/+$/, '') || '/';
  return !normalized.some(
    (r) => (c.method === '*' || r.method === c.method || r.method === 'ALL') && toRegex(r.full).test(target),
  );
});

console.log(`route-crosscheck: ${normalized.length} API routes indexed, ${calls.length} SPA calls analysed`);
if (misses.length > 0) {
  console.error(`\n${misses.length} SPA call(s) do not match any Worker route:`);
  for (const m of misses) {
    console.error(`  ${m.method.padEnd(6)} ${m.path.padEnd(58)} ${m.file}`);
  }
  process.exit(1);
}
console.log('route-crosscheck: every SPA API call resolves to a Worker route.');
