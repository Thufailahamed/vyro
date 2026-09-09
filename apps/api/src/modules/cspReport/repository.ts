import type { Env } from '../../env';
import { queueSend } from '../../lib/queue';

export async function queueCspViolation(env: Env, report: Record<string, unknown>): Promise<void> {
  await queueSend(env, 'audit', {
    id: crypto.randomUUID(),
    action: 'csp.violation',
    resourceType: 'csp_report',
    resourceId: null,
    actorUserId: null,
    metadata: JSON.stringify({ report }),
    ip: null,
    userAgent: null,
    createdAt: Date.now(),
  });
}