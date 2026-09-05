import app from './index';
import { handleAuditPurge } from './cron/audit-purge';
import type { Env } from './env';

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext) {
    if (event.cron === '0 3 * * *') {
      ctx.waitUntil(handleAuditPurge(env));
    }
  },
};
