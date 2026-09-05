export type CronJob = {
  name: string;
  schedule: string;
  description: string;
  handler: () => Promise<void>;
};

// Cloudflare Worker cron jobs registered in wrangler.toml `[triggers] crons`.
// Each handler is a no-op stub in this admin console; the real handler lives in apps/api/src/index.ts `scheduled`.
export const CRON_JOBS: CronJob[] = [
  {
    name: 'daily-purge',
    schedule: '0 3 * * *',
    description: 'Purge expired sessions, idempotency keys, soft-deleted records',
    handler: async () => undefined,
  },
  {
    name: 'webhook-retry',
    schedule: '*/15 * * * *',
    description: 'Retry failed webhook deliveries',
    handler: async () => undefined,
  },
  {
    name: 'session-cleanup',
    schedule: '0 * * * *',
    description: 'Prune expired sessions',
    handler: async () => undefined,
  },
];

export function getCronJob(name: string): CronJob | undefined {
  return CRON_JOBS.find((j) => j.name === name);
}
