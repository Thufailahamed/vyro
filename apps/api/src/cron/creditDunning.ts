import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { creditDrawdowns, purchaseOrders } from '@vyro/db/schema';
import { NotificationType, NotificationCategory, formatLKR } from '@vyro/shared';
import type { Env } from '../env';
import { notifyBusinessOrg } from '../modules/notifications/dispatcher';

const DAY = 24 * 60 * 60 * 1000;

/**
 * Buyer-side collection cadence for Net14/Net30 drawdowns. Stages are ordered;
 * each drawdown receives each stage at most once (tracked in
 * `last_reminder_stage`), and a late first run jumps straight to the latest
 * applicable stage instead of replaying the whole sequence.
 */
export const DUNNING_STAGES = [
  { stage: 'due_soon', fromOffsetMs: -3 * DAY },
  { stage: 'due_today', fromOffsetMs: 0 },
  { stage: 'overdue_1', fromOffsetMs: 1 * DAY },
  { stage: 'overdue_7', fromOffsetMs: 7 * DAY },
  { stage: 'overdue_14', fromOffsetMs: 14 * DAY },
] as const;

export type DunningStage = (typeof DUNNING_STAGES)[number]['stage'];

/** Latest stage whose window has opened for this due date, or null. */
export function stageFor(dueAt: number, now: number): DunningStage | null {
  let current: DunningStage | null = null;
  for (const s of DUNNING_STAGES) {
    if (now >= dueAt + s.fromOffsetMs) current = s.stage;
  }
  return current;
}

function stageRank(stage: string | null): number {
  if (!stage) return -1;
  return DUNNING_STAGES.findIndex((s) => s.stage === stage);
}

function copyFor(stage: DunningStage, amount: string, poNumber: string, dueDate: string) {
  switch (stage) {
    case 'due_soon':
      return { title: `Payment of ${amount} due ${dueDate}`, body: `Your trade-credit payment for order ${poNumber} is due in 3 days. Pay on time to keep your credit line open.` };
    case 'due_today':
      return { title: `Payment of ${amount} is due today`, body: `Order ${poNumber} is due today. Settle it now to avoid your credit line being paused.` };
    case 'overdue_1':
      return { title: `Payment overdue: ${amount}`, body: `Order ${poNumber} was due ${dueDate}. New credit orders are paused until it is paid.` };
    case 'overdue_7':
      return { title: `Payment 7 days overdue: ${amount}`, body: `Order ${poNumber} is a week overdue. Please pay now or contact us to arrange a plan.` };
    case 'overdue_14':
      return { title: `Final reminder: ${amount} is 14 days overdue`, body: `Order ${poNumber} is 14 days overdue. Continued non-payment may lead to your credit facility being suspended.` };
  }
}

export async function handleCreditDunning(
  env: Env,
  opts: { now?: number } = {},
): Promise<{ scanned: number; reminded: number }> {
  const now = opts.now ?? Date.now();
  const db = getDb(env.DB);
  const rows = await db
    .select({
      id: creditDrawdowns.id,
      businessId: creditDrawdowns.businessId,
      purchaseOrderId: creditDrawdowns.purchaseOrderId,
      amountCents: creditDrawdowns.amountCents,
      repaidCents: creditDrawdowns.repaidCents,
      releasedCents: creditDrawdowns.releasedCents,
      dueAt: creditDrawdowns.dueAt,
      lastReminderStage: creditDrawdowns.lastReminderStage,
      poNumber: purchaseOrders.poNumber,
    })
    .from(creditDrawdowns)
    .innerJoin(purchaseOrders, eq(purchaseOrders.id, creditDrawdowns.purchaseOrderId))
    .where(and(inArray(creditDrawdowns.status, ['active', 'overdue'] as never[])))
    .all();

  const dateFmt = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', timeZone: 'Asia/Colombo' });
  let reminded = 0;
  for (const r of rows) {
    const outstanding = r.amountCents - r.releasedCents - r.repaidCents;
    if (outstanding <= 0) continue;
    const stage = stageFor(r.dueAt, now);
    if (!stage || stageRank(stage) <= stageRank(r.lastReminderStage)) continue;

    const copy = copyFor(stage, formatLKR(outstanding), r.poNumber, dateFmt.format(new Date(r.dueAt)));
    await notifyBusinessOrg(env.DB, env.NOTIFICATIONS_QUEUE, r.businessId, {
      type: NotificationType.CREDIT_PAYMENT_REMINDER,
      category: NotificationCategory.PAYMENT,
      title: copy.title,
      body: copy.body,
      link: `/orders/${r.purchaseOrderId}`,
    });
    await db
      .update(creditDrawdowns)
      .set({ lastReminderStage: stage, lastReminderAt: now })
      .where(eq(creditDrawdowns.id, r.id))
      .run();
    reminded++;
  }
  return { scanned: rows.length, reminded };
}
