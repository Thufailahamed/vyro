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
  /** Optional coarse role classification of the requesting user. */
  role?: 'admin' | 'member' | 'viewer';
}

export interface AiAuditRow {
  id: string;
  actorUserId: string;
  action: 'ai.request' | 'ai.feedback';
  resourceType: string;
  resourceId: string;
  metadata: string;
  ip: null;
  userAgent: null;
  createdAt: number;
}

export type FeedbackReason =
  | 'wrong_product'
  | 'wrong_supplier'
  | 'price_incorrect'
  | 'not_relevant'
  | 'other';

export interface FeedbackAuditEntry {
  userId: string;
  businessId: string;
  requestId: string;
  helpful: boolean;
  reason?: FeedbackReason;
  intentHint?: string;
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
    intent: entry.intent,
    latencyMs: entry.latencyMs,
    ok: entry.ok,
  };
  if (entry.businessId) metadata.businessId = entry.businessId;
  if (typeof entry.tokensIn === 'number' && entry.tokensIn > 0) metadata.tokensIn = entry.tokensIn;
  if (typeof entry.tokensOut === 'number' && entry.tokensOut > 0) metadata.tokensOut = entry.tokensOut;
  if (entry.role) metadata.role = entry.role;
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
  };
}

/**
 * buildFeedbackAudit: append-only feedback row. Captures helpful + reason
 * for offline evaluation. NEVER triggers a model retrain.
 */
export function buildFeedbackAudit(entry: FeedbackAuditEntry, now: number = Date.now()): AiAuditRow {
  const metadata: Record<string, unknown> = {
    kind: 'feedback',
    helpful: entry.helpful,
  };
  if (entry.reason) metadata.reason = entry.reason;
  if (entry.intentHint) metadata.intentHint = entry.intentHint;
  return {
    id: newId(),
    actorUserId: entry.userId,
    action: 'ai.feedback',
    resourceType: 'ai_request',
    resourceId: entry.requestId,
    metadata: JSON.stringify(metadata),
    ip: null,
    userAgent: null,
    createdAt: now,
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

export async function writeFeedbackAudit(env: { DB: D1Database }, entry: FeedbackAuditEntry): Promise<void> {
  const db = getDb(env.DB);
  const row = buildFeedbackAudit(entry);
  await db.insert(auditLogs).values(row as any);
}
