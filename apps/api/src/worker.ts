import app from './index';
import { handleAuditPurge } from './cron/audit-purge';
import { handleAuditBatch } from './queue/audit';
import { handleNotificationsBatch } from './queue/notifications';
import type { Env } from './env';

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext) {
    if (event.cron === '0 3 * * *') {
      ctx.waitUntil(handleAuditPurge(env));
    }
  },
  async queue(batch: MessageBatch, env: Env, _ctx: ExecutionContext) {
    if (batch.queue === 'audit') {
      await handleAuditBatch(batch, env);
    } else if (batch.queue === 'notifications') {
      await handleNotificationsBatch(batch, env);
    } else {
      // Unknown queue — drain silently.
      for (const msg of batch.messages) msg.ack();
    }
  },
};
