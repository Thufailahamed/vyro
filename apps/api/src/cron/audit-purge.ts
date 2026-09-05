import { purgeExpired } from '../modules/admin/audit/repository';

export async function handleAuditPurge(env: { DB: D1Database }): Promise<{ deleted: number }> {
  const deleted = await purgeExpired(env.DB, 365 * 24 * 60 * 60 * 1000);
  console.log('[audit-purge] deleted', deleted);
  return { deleted };
}
