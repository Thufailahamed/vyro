import { getDb } from '@vyro/db';
import { dataExportRequests } from '@vyro/db/schema';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';

export type DataExportRow = {
  id: string;
  userId: string;
  requestedBy: string;
  status: 'pending' | 'ready' | 'failed' | 'expired';
  downloadUrl: string | null;
  expiresAt: number | null;
  createdAt: number;
};

export async function create(
  d1: D1Database,
  body: { userId: string; requestedBy: string },
): Promise<DataExportRow> {
  const row: DataExportRow = {
    id: randomUUID(),
    userId: body.userId,
    requestedBy: body.requestedBy,
    status: 'pending',
    downloadUrl: null,
    expiresAt: null,
    createdAt: Date.now(),
  };
  await getDb(d1).insert(dataExportRequests).values(row).run();
  return row;
}

export async function getExport(d1: D1Database, id: string): Promise<DataExportRow | null> {
  const db = getDb(d1);
  const row = (await db
    .select()
    .from(dataExportRequests)
    .where(eq(dataExportRequests.id, id))
    .get()) as DataExportRow | undefined;
  return row ?? null;
}

export async function markReady(
  d1: D1Database,
  id: string,
  downloadUrl: string,
  expiresAt: number,
): Promise<void> {
  await getDb(d1)
    .update(dataExportRequests)
    .set({ status: 'ready', downloadUrl, expiresAt })
    .where(eq(dataExportRequests.id, id))
    .run();
}
