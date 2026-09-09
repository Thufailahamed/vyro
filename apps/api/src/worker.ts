import app from './index';
import { handleAuditPurge } from './cron/audit-purge';
import {
  handleDailyPurge,
  handleSessionCleanup,
  handleWebhookRetry,
  handleAuditExportRunner,
} from './cron/handlers';
import { handleQueueEventsPrune } from './cron/queue-events-prune';
import { handleAuditBatch } from './queue/audit';
import { handleNotificationsBatch } from './queue/notifications';
import type { Env } from './env';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    // API traffic is handled by Hono. Everything else is the SPA served from [assets].
    // run_worker_first = ["/api/*"] means only /api/* reaches this Worker in production,
    // but we keep the explicit split so `wrangler dev` and asset-less deploys behave the same.
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      return app.fetch(request, env, ctx);
    }
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return app.fetch(request, env, ctx);
  },
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext) {
    switch (event.cron) {
      case '0 3 * * *':
        // Audit retention: 365d. Then housekeeping that doesn't need its own slot.
        ctx.waitUntil(handleAuditPurge(env));
        ctx.waitUntil(handleDailyPurge(env));
        break;
      case '*/15 * * * *':
        ctx.waitUntil(handleWebhookRetry(env));
        break;
      case '0 * * * *':
        ctx.waitUntil(handleSessionCleanup(env));
        break;
      case '0 4 * * *':
        ctx.waitUntil(handleAuditExportRunner(env));
        break;
      case '0 5 * * *':
        ctx.waitUntil(handleQueueEventsPrune(env));
        break;
      case '17 7 * * *': {
        const { runAiInsights } = await import('./scheduled/aiInsights');
        ctx.waitUntil(runAiInsights(env));
        break;
      }
      default:
        // Unknown cron — log so operators see misconfigured triggers.
        // eslint-disable-next-line no-console
        console.warn('[cron] unknown schedule', event.cron);
    }
  },
  async queue(batch: MessageBatch, env: Env, _ctx: ExecutionContext) {
    if (batch.queue === 'audit') {
      await handleAuditBatch(batch, env);
    } else if (batch.queue === 'notifications') {
      await handleNotificationsBatch(batch, env);
    } else if (batch.queue === 'invoices') {
      const { handleInvoicesBatch } = await import('./queue/invoiceOcr');
      await handleInvoicesBatch(batch, env);
    } else {
      // Unknown queue — drain silently.
      for (const msg of batch.messages) msg.ack();
    }
  },
};
