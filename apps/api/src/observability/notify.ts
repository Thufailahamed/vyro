export type AlertContext = {
  ruleName: string;
  severity: 'info' | 'warning' | 'critical';
  component: 'api' | 'payments' | 'queues' | 'cron' | 'web';
  value: number;
  threshold: number;
  window: string;
};

function slackPayload(ctx: AlertContext) {
  return {
    text: `🚨 [${ctx.severity}] ${ctx.ruleName}`,
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `[${ctx.severity}] ${ctx.ruleName}`,
        },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Component*\n${ctx.component}` },
          { type: 'mrkdwn', text: `*Value*\n${ctx.value}` },
          { type: 'mrkdwn', text: `*Threshold*\n${ctx.threshold}` },
          { type: 'mrkdwn', text: `*Window*\n${ctx.window}` },
        ],
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: 'Silence: /admin/observability/alerts',
          },
        ],
      },
    ],
  };
}

export async function notifySlack(
  env: { ALERT_SLACK_WEBHOOK_URL?: string },
  ctx: AlertContext,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  if (!env.ALERT_SLACK_WEBHOOK_URL) return false;
  const body = JSON.stringify(slackPayload(ctx));
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetchImpl(env.ALERT_SLACK_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      if (res.ok) return true;
    } catch {
      // retry
    }
  }
  return false;
}

export async function notifyEmail(
  env: { RESEND_API_KEY?: string; OPS_EMAIL?: string; EMAIL_FROM?: string },
  ctx: AlertContext,
): Promise<boolean> {
  if (!env.RESEND_API_KEY || !env.OPS_EMAIL) return false;
  const { sendEmail } = await import('../lib/email/client');
  const { renderAdminAlert } = await import('../lib/email/templates');
  const { subject, html, text } = renderAdminAlert({
    title: ctx.ruleName,
    body: `Component: ${ctx.component}\nValue: ${ctx.value}\nThreshold: ${ctx.threshold}\nWindow: ${ctx.window}\nSilence: /admin/observability/alerts`,
    link: '/admin/observability/alerts',
    severity:
      ctx.severity === 'critical' ? 'critical' : ctx.severity === 'warning' ? 'warning' : 'info',
  });
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await sendEmail(env as any, { to: env.OPS_EMAIL, subject, html, text });
    if (r.ok) return true;
  }
  return false;
}