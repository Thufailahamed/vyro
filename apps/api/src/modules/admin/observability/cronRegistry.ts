export type CronJob = {
  name: string;
  schedule: string;
  description: string;
  handler: () => Promise<void>;
};

// Cloudflare Worker cron jobs registered in wrangler.toml `[triggers] crons`.
// Each handler is a no-op stub in this admin console; the real handler lives in apps/api/src/index.ts `scheduled`.
import { runObservabilitySweep } from '../../../cron/observabilitySweep';
import type { Env } from '../../../env';

export const CRON_JOBS: CronJob[] = [
  {
    name: 'observabilitySweep',
    schedule: '*/5 * * * *',
    description: 'Evaluate SLO rules against AE/D1/KV; refresh /status.json',
    handler: async () => {
      // Real handler invoked when admin triggers manually.
      // The Cloudflare scheduled handler also calls this directly.
      // We rely on the caller passing Env via closure for manual triggers.
    },
  },
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
  {
    name: 'audit-export-runner',
    schedule: '0 4 * * *',
    description: 'Run scheduled audit exports (stub: no delivery in v1)',
    handler: async () => undefined,
  },
  {
    name: 'queue-events-prune',
    schedule: '0 5 * * *',
    description: 'Prune queue_events rows older than QUEUE_EVENTS_RETENTION_DAYS',
    handler: async () => undefined,
  },
  {
    name: 'buyLeads.dailyDigest',
    schedule: '30 1 * * *',
    description: 'Daily BuyLeads digest emailed to subscribed suppliers',
    handler: async () => undefined,
  },
  {
    name: 'trustSeal.expiry',
    schedule: '30 1 * * *',
    description: 'Expire past-due TrustSEAL subs + 30d/7d renewal reminders',
    handler: async () => undefined,
  },
];

export function getCronJob(name: string): CronJob | undefined {
  return CRON_JOBS.find((j) => j.name === name);
}
