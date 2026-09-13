import type {
  ComponentName,
  StatusEntry,
  StatusPayload,
  Incident,
} from '@vyro/shared';
import { STATUS_COMPONENTS } from '@vyro/shared';

export async function writeStatus(
  env: { ALERTS_KV: KVNamespace },
  component: ComponentName,
  partial: { status: StatusEntry['status']; detail?: string },
): Promise<void> {
  const entry: StatusEntry = {
    status: partial.status,
    detail: partial.detail,
    updatedAt: Date.now(),
  };
  await env.ALERTS_KV.put(`status:${component}`, JSON.stringify(entry), {
    expirationTtl: 3600,
  });
  await env.ALERTS_KV.put('status:updated_at', String(entry.updatedAt), {
    expirationTtl: 3600,
  });
}

export async function readStatus(
  env: { ALERTS_KV: KVNamespace },
  component: ComponentName,
): Promise<StatusEntry | null> {
  const raw = await env.ALERTS_KV.get(`status:${component}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StatusEntry;
  } catch {
    return null;
  }
}

export async function readStatusPayload(
  env: { ALERTS_KV: KVNamespace; VERSION?: string },
  incidents: Incident[],
  maxAgeMs = 30 * 60_000,
): Promise<StatusPayload> {
  const components: StatusPayload['components'] = {} as any;
  for (const c of STATUS_COMPONENTS) {
    const entry = await readStatus(env, c);
    if (!entry) {
      components[c] = { status: 'unknown', updatedAt: 0 };
      continue;
    }
    if (Date.now() - entry.updatedAt > maxAgeMs) {
      components[c] = { ...entry, status: 'unknown' };
    } else {
      components[c] = entry;
    }
  }
  return {
    components,
    incidents,
    updatedAt: Date.now(),
    version: env.VERSION ?? 'dev',
  };
}

export async function touchUpdatedAt(env: {
  ALERTS_KV: KVNamespace;
}): Promise<void> {
  await env.ALERTS_KV.put('status:updated_at', String(Date.now()), {
    expirationTtl: 3600,
  });
}

export async function readUpdatedAt(env: {
  ALERTS_KV: KVNamespace;
}): Promise<number | null> {
  const v = await env.ALERTS_KV.get('status:updated_at');
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}