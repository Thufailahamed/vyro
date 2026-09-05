#!/usr/bin/env node

import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const shouldSeed = args.includes('--seed');
const isLocal = args.includes('--local');
const envFlag = isLocal ? '--local' : '--remote';

let sha = 'dev';
try {
  sha = execSync('git rev-parse --short HEAD').toString().trim();
} catch {}
const deployedAt = new Date().toISOString();

console.log(`\n🚀 Deploying VYRO Database & Backend (${isLocal ? 'LOCAL' : 'CLOUDFLARE LIVE'})...\n`);
console.log(`   sha=${sha} deployedAt=${deployedAt}\n`);

function run(command) {
  console.log(`➜ ${command}`);
  execSync(command, { stdio: 'inherit', cwd: rootDir, env: { ...process.env, VERSION: sha, DEPLOYED_AT: deployedAt } });
}

try {
  // 1. Apply D1 database migrations
  console.log(`\n📦 Applying database migrations...`);
  run(`npx wrangler d1 migrations apply vyro ${envFlag} --config ./apps/api/wrangler.toml`);

  // 2. Optional: Seed data
  if (shouldSeed) {
    console.log(`\n🌱 Seeding initial data...`);
    run(`npx wrangler d1 execute vyro ${envFlag} --file="./apps/api/scripts/seed.sql" -y`);
  }

  // 3. Deploy Cloudflare Worker API
  if (!isLocal) {
    console.log(`\n☁️ Deploying API Cloudflare Worker...`);
    run(`npx wrangler deploy --config ./apps/api/wrangler.toml`);
  }

  console.log(`\n✅ Deployment completed successfully!\n`);
} catch (error) {
  console.error(`\n❌ Deployment failed:`, error.message);
  process.exit(1);
}
