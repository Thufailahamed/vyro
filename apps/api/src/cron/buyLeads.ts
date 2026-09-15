import { buyLeads } from '../modules/buyLeads/service';
import type { Env } from '../env';

export async function runBuyLeadsDigest(env: Env): Promise<{ suppliersEmailed: number; rfqsSent: number }> {
  const result = await buyLeads.runDailyDigest(
    { DB: env.DB, NOTIFICATIONS_QUEUE: env.NOTIFICATIONS_QUEUE },
    env.DB,
  );
  // eslint-disable-next-line no-console
  console.log('[cron.buyLeads]', result);
  return result;
}
