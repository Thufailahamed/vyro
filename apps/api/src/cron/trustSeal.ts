import { getDb } from '@vyro/db';
import { trustSealSubscriptions, supplierMembers, users } from '@vyro/db/schema';
import { and, eq } from 'drizzle-orm';
import type { Env } from '../env';
import { trustSealRepository } from '../modules/trustSeal/repository';

export async function handleTrustSealExpiry(env: Env): Promise<{ expired: number; reminders: number }> {
  const now = Date.now();
  const { expired } = await trustSealRepository.expireDue(env.DB, now);
  const db = getDb(env.DB);
  const upcoming = await db.select().from(trustSealSubscriptions).where(eq(trustSealSubscriptions.status, 'active')).all();
  let reminders = 0;
  for (const sub of upcoming) {
    if (sub.expiresAt == null) continue;
    const daysLeft = Math.ceil((sub.expiresAt - now) / (24 * 3600 * 1000));
    if (daysLeft !== 30 && daysLeft !== 7) continue;
    const owners = await db
      .select({ userId: supplierMembers.userId, email: users.email })
      .from(supplierMembers)
      .innerJoin(users, eq(users.id, supplierMembers.userId))
      .where(and(eq(supplierMembers.supplierId, sub.supplierId), eq(supplierMembers.role, 'owner')))
      .all();
    for (const o of owners) {
      await (env.NOTIFICATIONS_QUEUE as any)?.send?.({
        kind: 'trustseal_renewal',
        recipientUserId: o.userId,
        recipientEmail: (o as any).email,
        subject: `TrustSEAL expires in ${daysLeft} days`,
        body: `Your TrustSEAL badge expires in ${daysLeft} days. Renew in Supplier Verification to keep priority ranking.`,
        link: '/supplier/verification',
      });
      reminders++;
    }
  }
  return { expired, reminders };
}
