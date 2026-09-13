export type CooldownCheck = {
  active: boolean;
  severity?: 'info' | 'warning' | 'critical';
  value?: number;
  windowBucket: number;
  firedAt?: number;
};

const SEVERITY_RANK: Record<string, number> = {
  info: 1,
  warning: 2,
  critical: 3,
};

function bucket(windowSec: number, now = Date.now()): number {
  return Math.floor(now / 1000 / windowSec);
}

function key(ruleName: string, bucket: number): string {
  return `cooldown:${ruleName}:${bucket}`;
}

export async function checkCooldown(
  env: { ALERTS_KV: KVNamespace },
  ruleName: string,
  cooldownSec: number,
  incomingSeverity: 'info' | 'warning' | 'critical' = 'warning',
): Promise<CooldownCheck> {
  const b = bucket(cooldownSec);
  const raw = await env.ALERTS_KV.get(key(ruleName, b));
  if (!raw) {
    return { active: false, windowBucket: b };
  }
  let parsed: {
    severity: 'info' | 'warning' | 'critical';
    value: number;
    firedAt: number;
  };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { active: false, windowBucket: b };
  }
  const existingRank = SEVERITY_RANK[parsed.severity] ?? 0;
  const incomingRank = SEVERITY_RANK[incomingSeverity] ?? 0;
  if (incomingRank > existingRank) {
    return { active: false, windowBucket: b };
  }
  return {
    active: true,
    severity: parsed.severity,
    value: parsed.value,
    windowBucket: b,
    firedAt: parsed.firedAt,
  };
}

export async function markFired(
  env: { ALERTS_KV: KVNamespace },
  ruleName: string,
  severity: 'info' | 'warning' | 'critical',
  value: number,
  cooldownSec: number,
): Promise<void> {
  const b = bucket(cooldownSec);
  const payload = JSON.stringify({ severity, value, firedAt: Date.now() });
  await env.ALERTS_KV.put(key(ruleName, b), payload, {
    expirationTtl: cooldownSec + 60,
  });
}