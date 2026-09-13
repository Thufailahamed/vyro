export type SilenceEntry = {
  silencedBy: string;
  reason: string;
  expiresAt: number;
};

export async function isSilenced(
  env: { ALERTS_KV: KVNamespace },
  ruleName: string,
): Promise<false | SilenceEntry> {
  const raw = await env.ALERTS_KV.get(`silenced:${ruleName}`);
  if (!raw) return false;
  try {
    return JSON.parse(raw) as SilenceEntry;
  } catch {
    return false;
  }
}

export async function silenceRule(
  env: { ALERTS_KV: KVNamespace },
  ruleName: string,
  silencedBy: string,
  reason: string,
  durationMinutes: number,
): Promise<SilenceEntry> {
  const entry: SilenceEntry = {
    silencedBy,
    reason,
    expiresAt: Date.now() + durationMinutes * 60_000,
  };
  await env.ALERTS_KV.put(`silenced:${ruleName}`, JSON.stringify(entry), {
    expirationTtl: durationMinutes * 60 + 60,
  });
  return entry;
}

export async function unsilenceRule(
  env: { ALERTS_KV: KVNamespace },
  ruleName: string,
): Promise<void> {
  await env.ALERTS_KV.delete(`silenced:${ruleName}`);
}