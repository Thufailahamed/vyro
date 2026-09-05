import type { Context } from 'hono';
import { httpError } from '../../../lib/errors';
import { auditAdmin } from '../../admin/lib/audit';
import * as repo from './abuseReportsRepository';

export async function list(
  d1: D1Database,
  opts: {
    status?: 'open' | 'investigating' | 'resolved' | 'dismissed' | undefined;
    unassigned?: boolean | undefined;
    assignedTo?: string | undefined;
    cursor?: string | undefined;
    limit?: number | undefined;
  },
) {
  return repo.listReports(d1, opts);
}

export async function get(d1: D1Database, id: string) {
  const row = await repo.getReport(d1, id);
  if (!row) throw httpError(404, 'NOT_FOUND', 'Report not found');
  return row;
}

export async function claim(ctx: Context, id: string, actorId: string) {
  const d1 = ctx.env.DB as D1Database;
  const before = await repo.getReport(d1, id);
  if (!before) throw httpError(404, 'NOT_FOUND', 'Report not found');
  if (before.status === 'resolved' || before.status === 'dismissed') {
    throw httpError(409, 'ABUSE_REPORT_NOT_OPEN', `Report is ${before.status}`);
  }
  const out = await repo.claimReport(d1, id, actorId);
  if (!out) throw httpError(404, 'NOT_FOUND', 'Report not found');
  await auditAdmin({
    ctx,
    action: 'abuse_report.claim',
    target: { type: 'abuse_report', id },
    before: { status: out.before.status, assignedTo: out.before.assignedTo },
    after: { status: out.after.status, assignedTo: out.after.assignedTo },
  });
  return out.after;
}

export async function addNote(ctx: Context, id: string, note: string) {
  const d1 = ctx.env.DB as D1Database;
  const before = await repo.getReport(d1, id);
  if (!before) throw httpError(404, 'NOT_FOUND', 'Report not found');
  const updatedAt = Date.now();
  await auditAdmin({
    ctx,
    action: 'abuse_report.note',
    target: { type: 'abuse_report', id },
    after: { note, at: updatedAt },
  });
  return { ok: true };
}

export async function resolve(
  ctx: Context,
  id: string,
  resolution: 'resolved' | 'dismissed',
  notes: string | undefined,
) {
  const d1 = ctx.env.DB as D1Database;
  const before = await repo.getReport(d1, id);
  if (!before) throw httpError(404, 'NOT_FOUND', 'Report not found');
  if (before.status === 'resolved' || before.status === 'dismissed') {
    throw httpError(409, 'ABUSE_REPORT_NOT_OPEN', `Report is ${before.status}`);
  }
  const out = await repo.resolveReport(d1, id, resolution, notes ?? null);
  if (!out) throw httpError(404, 'NOT_FOUND', 'Report not found');
  await auditAdmin({
    ctx,
    action: 'abuse_report.resolve',
    target: { type: 'abuse_report', id },
    before: { status: out.before.status },
    after: { status: out.after.status, notes: out.after.resolutionNotes },
  });
  return out.after;
}

export async function takedown(ctx: Context, id: string) {
  const d1 = ctx.env.DB as D1Database;
  const before = await repo.getReport(d1, id);
  if (!before) throw httpError(404, 'NOT_FOUND', 'Report not found');
  if (before.status === 'resolved' || before.status === 'dismissed') {
    throw httpError(409, 'ABUSE_REPORT_NOT_OPEN', `Report is ${before.status}`);
  }
  const after = await repo.setReportInactiveTarget(d1, id);
  if (!after) throw httpError(404, 'NOT_FOUND', 'Report not found');
  await auditAdmin({
    ctx,
    action: 'takedown.create',
    target: { type: before.targetType, id: before.targetId },
    before: { reportStatus: before.status },
    after: { reportStatus: after.status },
  });
  return after;
}
