// Resets the local D1 database for `wrangler dev --local`, applies all
// migrations, then seeds catalog data (staging seed + e2e-specific stock).
// Runs before the API webServer boots (see playwright.config.ts).

import { spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const apiDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../api');
const stateDir = resolve(apiDir, '.wrangler/state/v3/d1');
if (existsSync(stateDir)) {
  rmSync(stateDir, { recursive: true, force: true });
  console.log('[e2e] wiped local D1 state');
}

const run = (args) => {
  // stdin is piped (non-TTY) so wrangler skips its apply confirmation prompt.
  const r = spawnSync('pnpm', ['exec', 'wrangler', ...args], {
    cwd: apiDir,
    input: 'y\n',
    stdio: ['pipe', 'inherit', 'inherit'],
  });
  if (r.status !== 0) {
    console.error(`[e2e] wrangler ${args.join(' ')} failed (${r.status})`);
    process.exit(r.status ?? 1);
  }
};

run(['d1', 'migrations', 'apply', 'vyro', '--local']);
run(['d1', 'execute', 'vyro', '--local', '--file', '../../scripts/seed-staging.sql']);
run(['d1', 'execute', 'vyro', '--local', '--file', '../web/e2e/seed-e2e.sql']);
console.log('[e2e] local D1 migrated + seeded');
