#!/usr/bin/env node

// Builds the SPA and deploys it together with the API Worker.
// The Worker serves apps/web/dist via [assets] in apps/api/wrangler.toml, so the
// web app and the API share one origin and relative /api/* calls work in production.

import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const buildOnly = args.includes('--build-only');

let sha = 'dev';
try {
  sha = execSync('git rev-parse --short HEAD', { cwd: rootDir }).toString().trim();
} catch {
  console.warn('⚠️  git SHA not available, using dev');
}
const env = { ...process.env, VITE_VERSION: sha, NODE_ENV: 'production' };

function run(cmd) {
  console.log(`➜ ${cmd}`);
  execSync(cmd, { stdio: 'inherit', cwd: rootDir, env });
}

console.log(`\n🚀 Building VYRO Web (incl. admin + supplier routes) (sha=${sha})...\n`);

try {
  run('pnpm --filter @vyro/web build');

  if (buildOnly) {
    console.log(`\n✅ Build complete (dist only). Deploy with: pnpm deploy:web`);
    process.exit(0);
  }

  console.log(`\n☁️  Deploying Worker + static assets (single origin)...\n`);
  run('npx wrangler deploy --env production --config ./apps/api/wrangler.toml');

  console.log(`\n✅ Deployed. SPA and API share one origin.`);
  console.log(`   Admin portal: /admin/*   Supplier portal: /supplier/*   API: /api/*`);
  console.log(`   Bundle SHA: ${sha}`);
} catch (e) {
  console.error(`\n❌ Deploy failed:`, e.message);
  process.exit(1);
}
