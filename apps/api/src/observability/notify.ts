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
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  if (!env.RESEND_API_KEY || !env.OPS_EMAIL) return false;
  const subject = `[vyro][${ctx.severity}] ${ctx.ruleName}`;
  const html = `<h2>${subject}</h2><table><tr><th>Component</th><td>${ctx.component}</td></tr><tr><th>Value</th><td>${ctx.value}</td></tr><tr><th>Threshold</th><td>${ctx.threshold}</td></tr><tr><th>Window</th><td>${ctx.window}</td></tr></table><p>Silence: /admin/observability/alerts</p>`;
  const text = `${subject}\nComponent: ${ctx.component}\nValue: ${ctx.value}\nThreshold: ${ctx.threshold}\nWindow: ${ctx.window}\nSilence: /admin/observability/alerts`;
  const body = JSON.stringify({
    from: env.EMAIL_FROM ?? 'Vyro Ops <ops@vyro.lk>',
    to: [env.OPS_EMAIL],
    subject,
    html,
    text,
  });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetchImpl('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body,
      });
      if (res.ok) return true;
    } catch {
      // retry
    }
  }
  return false;
}