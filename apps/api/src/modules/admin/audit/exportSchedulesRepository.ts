import { getDb } from '@vyro/db';
import { auditExportSchedules } from '@vyro/db/schema';
import { eq, desc, and } from 'drizzle-orm';

export type ScheduleRow = {
  id: string;
  requestedBy: string;
  frequency: 'daily' | 'weekly' | 'monthly';
  email: string;
  format: 'csv' | 'json';
  nextRunAt: number;
  active: boolean;
  lastRunAt: number | null;
  createdAt: number;
  updatedAt: number;
};

export async function list(d1: D1Database, requestedBy: string): Promise<ScheduleRow[]> {
  const db = getDb(d1);
  return (await db
    .select()
    .from(auditExportSchedules)
    .where(eq(auditExportSchedules.requestedBy, requestedBy))
    .orderBy(desc(auditExportSchedules.createdAt))
    .all()) as ScheduleRow[];
}

export async function insert(
  d1: D1Database,
  row: ScheduleRow,
): Promise<ScheduleRow> {
  const db = getDb(d1);
  await db.insert(auditExportSchedules).values(row).run();
  return row;
}

export async function cancel(d1: D1Database, id: string, requestedBy: string): Promise<{ before: ScheduleRow; after: ScheduleRow } | null> {
  const db = getDb(d1);
  const before = (await db
    .select()
    .from(auditExportSchedules)
    .where(and(eq(auditExportSchedules.id, id), eq(auditExportSchedules.requestedBy, requestedBy)))
    .get()) as ScheduleRow | undefined;
  if (!before) return null;
  const after: ScheduleRow = { ...before, active: false, updatedAt: Date.now() };
  await db
    .update(auditExportSchedules)
    .set({ active: false, updatedAt: after.updatedAt })
    .where(eq(auditExportSchedules.id, id))
    .run();
  return { before, after };
}
