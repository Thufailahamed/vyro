#!/usr/bin/env node
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ROOT_CANDIDATES = [
  join(__dirname, '..', '..', '..', '..'),
  join(process.cwd()),
];
const ROOT = ROOT_CANDIDATES.find((p) => existsSync(join(p, 'wrangler.toml'))) ?? process.cwd();

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.turbo', '.wrangler', '.next', 'coverage', '.claude']);
const ALLOW_PATTERNS = [
  /^wrangler\.toml$/,
  /^wrangler\..*\.toml$/,
  /\.example$/,
  /\.(test|spec)\.[jt]sx?$/,
  /^apps\/api\/test\//,
  /^scripts\/test\//,
  /^apps\/api\/src\/scripts\//,
];
const PATTERNS = [
  /\bBETTER_AUTH_SECRET\s*=\s*['"][^'"]{16,}['"]/,
  /\bR2_ACCESS_KEY\s*=\s*['"][^'"]{8,}['"]/,
  /\bR2_SECRET_KEY\s*=\s*['"][^'"]{8,}['"]/,
  /\b(?:PRIVATE|API)_KEY\s*=\s*['"][^'"]{16,}['"]/,
];

export interface Hit { file: string; line: number; match: string }

async function* walk(dir: string): AsyncGenerator<string> {
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) yield* walk(full);
    else if (e.isFile()) yield full;
  }
}

function isAllowed(rel: string): boolean {
  return ALLOW_PATTERNS.some((p) => p.test(rel));
}

export async function scanSecrets(): Promise<{ hits: Hit[] }> {
  const hits: Hit[] = [];
  for await (const full of walk(ROOT)) {
    const rel = relative(ROOT, full);
    if (isAllowed(rel)) continue;
    let src: string;
    try { src = await readFile(full, 'utf8'); } catch { continue; }
    const lines = src.split('\n');
    for (let i = 0; i < lines.length; i++) {
      for (const pat of PATTERNS) {
        const m = lines[i]!.match(pat);
        if (m) hits.push({ file: rel, line: i + 1, match: m[0] });
      }
    }
  }
  return { hits };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await scanSecrets();
  if (result.hits.length > 0) {
    console.error(`Secret scan failed. ${result.hits.length} hit(s):`);
    for (const h of result.hits) console.error(`  ${h.file}:${h.line}: ${h.match}`);
    process.exit(1);
  }
  console.log('Secret scan passed.');
}