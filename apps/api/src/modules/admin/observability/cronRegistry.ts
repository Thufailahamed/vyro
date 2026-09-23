import type { Env } from '../../../env';

export type CronJob = {
  name: string;
  schedule: string;
  description: string;
  /** Real handler — the same function the Worker `scheduled()` export calls. */
  handler: (env: Env) => Promise<unknown>;
};

// Cloudflare Worker cron jobs registered in wrangler.toml `[triggers] crons`
// and dispatched by apps/api/src/worker.ts `scheduled`. Handlers are imported
// lazily so the admin router doesn't pull every cron module into its graph.
const handlers = () => import('../../../cron/handlers');

export const CRON_JOBS: CronJob[] = [
  {
    name: 'order-lifecycle',
    schedule: '0 * * * *',
    description: 'Auto-cancel unanswered orders, auto-complete delivered orders, escalate returns, flag SLA breaches',
    handler: async (env) => (await import('../../../cron/orderLifecycle')).handleOrderLifecycle(env),
  },
  {
    name: 'observabilitySweep',
    schedule: '*/5 * * * *',
    description: 'Evaluate SLO rules against AE/D1/KV; refresh /status.json',
    handler: async (env) => (await import('../../../cron/observabilitySweep')).runObservabilitySweep(env),
  },
  {
    name: 'daily-purge',
    schedule: '0 3 * * *',
    description: 'Purge expired sessions, idempotency keys, soft-deleted records',
    handler: async (env) => (await handlers()).handleDailyPurge(env),
  },
  {
    name: 'webhook-retry',
    schedule: '*/15 * * * *',
    description: 'Retry failed webhook deliveries',
    handler: async (env) => (await handlers()).handleWebhookRetry(env),
  },
  {
    name: 'session-cleanup',
    schedule: '0 * * * *',
    description: 'Prune expired sessions',
    handler: async (env) => (await handlers()).handleSessionCleanup(env),
  },
  {
    name: 'credit-overdue',
    schedule: '0 * * * *',
    description: 'Mark past-due credit drawdowns overdue and alert finance',
    handler: async (env) => (await import('../../../cron/creditOverdue')).handleCreditOverdue(env),
  },
  {
    name: 'credit-dunning',
    schedule: '30 1 * * *',
    description: 'Buyer payment reminders: 3 days before due, due today, then 1/7/14 days overdue',
    handler: async (env) => (await import('../../../cron/creditDunning')).handleCreditDunning(env),
  },
  {
    name: 'trust-signals-rebuild',
    schedule: '13 * * * *',
    description: 'Rebuild cached supplier trust signals',
    handler: async (env) => (await handlers()).handleTrustSignalsRebuild(env),
  },
  {
    name: 'fx-refresh',
    schedule: '0 2 * * *',
    description: 'Refresh FX rates (sanctions list refreshes Mondays)',
    handler: async (env) => (await handlers()).handleFxRefresh(env),
  },
  {
    name: 'weekly-payout-batch',
    schedule: '30 21 * * 4',
    description: 'Weekly supplier payout batch (no-op unless PAYOUTS_CRON_ENABLED)',
    handler: async (env) => (await handlers()).handleWeeklyPayoutBatch(env),
  },
  {
    name: 'audit-export-runner',
    schedule: '0 4 * * *',
    description: 'Run scheduled audit exports (stub: no delivery in v1)',
    handler: async (env) => (await handlers()).handleAuditExportRunner(env),
  },
  {
    name: 'queue-events-prune',
    schedule: '0 5 * * *',
    description: 'Prune queue_events rows older than QUEUE_EVENTS_RETENTION_DAYS',
    handler: async (env) => (await import('../../../cron/queue-events-prune')).handleQueueEventsPrune(env),
  },
  {
    name: 'buyLeads.dailyDigest',
    schedule: '30 1 * * *',
    description: 'Daily BuyLeads digest emailed to subscribed suppliers',
    handler: async (env) => (await import('../../../cron/buyLeads')).runBuyLeadsDigest(env),
  },
  {
    name: 'trustSeal.expiry',
    schedule: '30 1 * * *',
    description: 'Expire past-due TrustSEAL subs + 30d/7d renewal reminders',
    handler: async (env) => (await import('../../../cron/trustSeal')).handleTrustSealExpiry(env),
  },
];

export function getCronJob(name: string): CronJob | undefined {
  return CRON_JOBS.find((j) => j.name === name);
}
