import { getDb } from '@vyro/db';
import { auditLogs } from '@vyro/db/schema';
import { newId } from '@vyro/shared';

export interface AiAuditEntry {
  userId: string;
  businessId?: string;
  intent: string;
  provider: string;
  model: string;
  latencyMs: number;
  tokensIn?: number;
  tokensOut?: number;
  ok: boolean;
  errorCode?: string;
  requestId: string;
  slots?: Record<string, unknown>;
  toolName?: string;
}

export interface AiAuditRow {
  id: string;
  actorUserId: string;
  action: 'ai.request';
  resourceType: 'ai_request';
  resourceId: string;
  metadata: string;
  ip: null;
  userAgent: null;
  createdAt: number;
  intent: string;
}

/**
 * buildAiAuditRow: produce the row to insert. Pure, no IO.
 *
 * STRUCTURED ONLY. Metadata contains intent/provider/model/latency/ok plus
 * slot keys (never slot values). Raw prompt and raw result are NEVER included.
 */
export function buildAiAuditRow(entry: AiAuditEntry, now: number = Date.now()): AiAuditRow {
  const metadata: Record<string, unknown> = {
    provider: entry.provider,
    model: entry.model,
    latencyMs: entry.latencyMs,
    ok: entry.ok,
  };
  if (entry.errorCode) metadata.errorCode = entry.errorCode;
  if (entry.toolName) metadata.toolName = entry.toolName;
  if (entry.slots) metadata.slotKeys = Object.keys(entry.slots);
  return {
    id: newId(),
    actorUserId: entry.userId,
    action: 'ai.request',
    resourceType: 'ai_request',
    resourceId: entry.requestId,
    metadata: JSON.stringify(metadata),
    ip: null,
    userAgent: null,
    createdAt: now,
    intent: entry.intent,
  };
}

/**
 * writeAiAudit: append an audit row to audit_logs.
 * Real D1 insert path; tested via buildAiAuditRow unit tests (Drizzle requires
 * real D1 client for its query chain).
 */
export async function writeAiAudit(env: { DB: D1Database }, entry: AiAuditEntry): Promise<void> {
  const db = getDb(env.DB);
  const row = buildAiAuditRow(entry);
  await db.insert(auditLogs).values(row as any);
}
