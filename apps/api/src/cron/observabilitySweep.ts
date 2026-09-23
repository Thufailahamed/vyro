import { INITIAL_RULES, SloRule, newId } from '@vyro/shared';
import { evaluateRule } from '../observability/evaluator';
import {
  checkCooldown,
  markFired,
} from '../observability/cooldown';
import { isSilenced } from '../observability/silence';
import {
  notifySlack,
  notifyEmail,
} from '../observability/notify';
import {
  writeStatus,
  touchUpdatedAt,
} from '../observability/status';
import { metric } from '../lib/metrics';
import { getDb } from '@vyro/db';
import {
  notifications,
  users,
  auditLogs,
} from '@vyro/db/schema';
import { and, eq, inArray } from 'drizzle-orm';
import type { Env } from '../env';

export type SweepResult = {
  evaluated: number;
  failed: number;
  errors: number;
};

type ComponentStatusMap = Record<
  string,
  'operational' | 'degraded' | 'down'
>;

export async function runObservabilitySweep(
  env: Env,
  fetchImpl: typeof fetch = fetch,
): Promise<SweepResult> {
  const t0 = Date.now();
  let evaluated = 0;
  let failed = 0;
  let errors = 0;
  const componentStatus: ComponentStatusMap = {
    api: 'operational',
    payments: 'operational',
    queues: 'operational',
    cron: 'operational',
    web: 'operational',
  };

  for (const rule of INITIAL_RULES) {
    evaluated++;
    try {
      const silence = await isSilenced(env, rule.name);
      if (silence) {
        metric(env, 'sweep.rule_evaluations', 1, {
          rule: rule.name,
          verdict: 'silenced',
        });
        continue;
      }
      const verdict = await evaluateRule(env, rule, fetchImpl);
      metric(env, 'sweep.rule_evaluations', 1, {
        rule: rule.name,
        verdict: verdict.ok ? 'ok' : 'fail',
      });

      if (verdict.ok) {
        // healthy — leave component operational
      } else {
        const cd = await checkCooldown(
          env,
          rule.name,
          rule.cooldownSec,
          rule.severity,
        );
        if (!cd.active) {
          await fireAlert(env, rule, verdict.value ?? 0);
          await markFired(
            env,
            rule.name,
            rule.severity,
            verdict.value ?? 0,
            rule.cooldownSec,
          );
          failed++;
        }
        if (rule.component in componentStatus) {
          componentStatus[rule.component] =
            rule.severity === 'critical' ? 'down' : 'degraded';
        }
      }
    } catch (err) {
      errors++;
      metric(env, 'sweep.rule_errors', 1, { rule: rule.name });
      console.warn('[sweep] rule error', rule.name, err);
    }
  }

  for (const [c, s] of Object.entries(componentStatus)) {
    await writeStatus(env, c as any, { status: s });
  }
  await touchUpdatedAt(env);
  metric(env, 'sweep.duration_ms', Date.now() - t0);

  return { evaluated, failed, errors };
}

async function fireAlert(
  env: Env,
  rule: SloRule,
  value: number,
): Promise<void> {
  const ctx = {
    ruleName: rule.name,
    severity: rule.severity,
    component: rule.component,
    value,
    threshold: rule.threshold,
    window: rule.window,
  };
  const db = getDb(env.DB);

  if (rule.channels.includes('in_app') && rule.recipients.length > 0) {
    const roles = Array.from(
      new Set(rule.recipients.map((r) => r.role)),
    ) as Array<'ops' | 'super_admin' | 'finance' | 'support'>;
    const recipients = await db
      .select({ id: users.id })
      .from(users)
      .where(
        and(eq(users.status, 'active'), inArray(users.adminRole, roles)),
      )
      .all();
    for (const role of roles) {
      for (const r of recipients.filter(
        (rec) => rec.id,
      )) {
        await db
          .insert(notifications)
          .values({
            id: newId(),
            userId: r.id,
            recipientRole: role,
            type: 'observability_alert',
            title: rule.name,
            body: `${rule.description} — value=${value}, threshold=${rule.threshold}`,
            link: '/admin/observability/alerts',
            // D1 CHECK (migration 0020) only allows 'system'|'ai'; admin rows are identified by recipient_role.
            source: 'system',
            sourceRef: rule.name,
            severity: rule.severity,
            createdAt: Date.now(),
          })
          .run();
      }
    }
  }

  if (rule.channels.includes('slack')) {
    const ok = await notifySlack(env, ctx);
    if (!ok)
      metric(env, 'alert.send_failure', 1, {
        channel: 'slack',
        rule: rule.name,
      });
  }
  if (rule.channels.includes('email')) {
    const ok = await notifyEmail(env, ctx);
    if (!ok)
      metric(env, 'alert.send_failure', 1, {
        channel: 'email',
        rule: rule.name,
      });
  }

  try {
    await db
      .insert(auditLogs)
      .values({
        id: newId(),
        actorUserId: null,
        action: 'observability.alert.fired',
        resourceType: 'rule',
        resourceId: rule.name,
        metadata: JSON.stringify(ctx),
        createdAt: Date.now(),
      })
      .run();
  } catch (err) {
    console.warn('[sweep] audit insert failed', err);
  }
}