import { defineConfig } from '@playwright/test';

// Full-stack browser e2e: Vite dev server (5173) proxying /api to a local
// `wrangler dev` worker (8787) backed by local D1. reset-d1.mjs wipes, migrates
// and seeds the DB before the API boots.
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: {
    // Port 5199 so e2e never collides with (or gets hijacked by) the dev
    // vite server on 5173 — the default proxy target there is production.
    baseURL: 'http://localhost:5199',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: 'node ../web/e2e/reset-d1.mjs && pnpm dev',
      cwd: '../api',
      url: 'http://127.0.0.1:8787/api/health',
      timeout: 180_000,
      // Must spawn fresh: reset-d1.mjs runs as part of this command, and a
      // reused server could be pointing at a stale (or remote) database.
      reuseExistingServer: false,
    },
    {
      command: 'pnpm exec vite --port 5199 --strictPort',
      cwd: '.',
      url: 'http://localhost:5199',
      env: { VITE_API_PROXY: 'http://127.0.0.1:8787' },
      timeout: 120_000,
      reuseExistingServer: false,
    },
  ],
});
