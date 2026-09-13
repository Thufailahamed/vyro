import type { Env } from '../env';
import { sweepOverdue } from '../modules/credit/service';
import { notifyAdmins } from '../modules/notifications/dispatcher';

export async function handleCreditOverdue(env: Env): Promise<{ overdue: number }> {
  const now = Date.now();
  const overdue = await sweepOverdue(env.DB, now);
  if (overdue > 0) {
    await notifyAdmins(env, {
      role: 'finance',
      severity: 'warning',
      category: 'admin_alert',
      title: `${overdue} credit drawdown${overdue === 1 ? '' : 's'} overdue`,
      body: `${overdue} drawdown(s) passed due date at ${new Date(now).toISOString().slice(0, 16)}. New credit draws are blocked until repaid.`,
      link: '/admin/money',
      sourceRef: `credit:overdue:${now}`,
    }).catch(() => {});
  }
  return { overdue };
}
