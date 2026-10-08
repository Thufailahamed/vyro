import { getDb } from '@vyro/db';
import { invoiceUploads, purchaseOrders, reconciliationExceptions } from '@vyro/db/schema';
import { eq } from 'drizzle-orm';
import { newId } from '@vyro/shared';
import type { Env } from '../../env';
import { runThreeWayReconciliation } from '../reconciliation/reconciliationService';
import { notifyBusinessOrg } from '../notifications/dispatcher';

/**
 * Auto-reconciliation for PO-linked invoice uploads. Runs the existing 3-way
 * matcher, persists the outcome on the upload row, and on discrepancy fans
 * out a buyer notification plus a finance-queue exception row. Every failure
 * degrades into reconciliationStatus 'failed' — this path never throws into
 * the queue consumer's retry loop.
 */
export async function reconcileIfLinked(env: Env, uploadId: string): Promise<void> {
  const db = getDb(env.DB);
  const upload = await db.select().from(invoiceUploads).where(eq(invoiceUploads.id, uploadId)).get();
  if (!upload?.purchaseOrderId) return;

  const po = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, upload.purchaseOrderId)).get();
  try {
    if (!po) throw new Error('Purchase order no longer exists');
    if (po.status !== 'delivered' && po.status !== 'completed') {
      throw new Error('Order must be delivered before invoice reconciliation');
    }

    const result = await runThreeWayReconciliation(env, upload.purchaseOrderId, { invoiceUploadId: uploadId });
    const mismatches = result.lines.filter((l) => l.status !== 'matched');
    const status = mismatches.length === 0 && result.netDifferenceCents === 0 ? 'passed' : 'discrepancy';

    await db
      .update(invoiceUploads)
      .set({
        reconciliationStatus: status,
        reconciliationJson: JSON.stringify(result),
      })
      .where(eq(invoiceUploads.id, uploadId));

    if (status === 'discrepancy') {
      await notifyBusinessOrg(env.DB, env.NOTIFICATIONS_QUEUE as never, po.businessId, {
        type: 'order.reconciliation.discrepancy',
        title: `Invoice mismatch on PO ${po.poNumber}`,
        body: `Automated invoice check found a difference of Rs. ${(Math.abs(result.netDifferenceCents) / 100).toFixed(2)} vs the approved order. Review before release.`,
        link: `/orders/${po.id}`,
      });
      // One open exception per PO, idempotent across queue re-deliveries.
      const existing = await db
        .select({ id: reconciliationExceptions.id })
        .from(reconciliationExceptions)
        .where(eq(reconciliationExceptions.entityId, po.id))
        .get();
      if (!existing) {
        await db.insert(reconciliationExceptions).values({
          id: newId(),
          kind: 'amount_mismatch',
          severity: Math.abs(result.netDifferenceCents) > 500_000 ? 'critical' : 'warning',
          entityType: 'purchase_order',
          entityId: po.id,
          expectedCents: result.poTotalCents,
          actualCents: result.invoiceTotalCents,
          differenceCents: result.netDifferenceCents,
          currency: po.currency,
          detail: JSON.stringify({ source: 'auto_reconcile', uploadId }),
          status: 'open',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
    }
  } catch (err) {
    await db
      .update(invoiceUploads)
      .set({
        reconciliationStatus: 'failed',
        reconciliationJson: JSON.stringify({ error: err instanceof Error ? err.message : 'reconcile failed' }),
      })
      .where(eq(invoiceUploads.id, uploadId));
  }
}
