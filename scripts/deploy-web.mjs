#!/usr/bin/env node

import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
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

console.log(`\n🚀 Building VYRO Web + Admin (sha=${sha})...\n`);

try {
  run('pnpm --filter @vyro/web build');
  run('pnpm --filter @vyro/admin build');
  console.log(`\n✅ Build complete. Deploy with:`);
  console.log(`   wrangler pages deploy apps/web/dist --project-name vyro-web`);
  console.log(`   wrangler pages deploy apps/admin/dist --project-name vyro-admin`);
  console.log(`\nBundle SHA: ${sha}`);
} catch (e) {
  console.error(`\n❌ Build failed:`, e.message);
  process.exit(1);
}
