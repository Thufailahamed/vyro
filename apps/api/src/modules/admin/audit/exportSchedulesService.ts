import { randomUUID } from 'node:crypto';
import * as repo from './exportSchedulesRepository';
import type { ScheduleRow } from './exportSchedulesRepository';

export async function listSchedules(d1: D1Database, requestedBy: string): Promise<ScheduleRow[]> {
  return repo.list(d1, requestedBy);
}

function computeNextRunAt(frequency: 'daily' | 'weekly' | 'monthly'): number {
  const now = Date.now();
  switch (frequency) {
    case 'daily': return now + 24 * 60 * 60 * 1000;
    case 'weekly': return now + 7 * 24 * 60 * 60 * 1000;
    case 'monthly': return now + 30 * 24 * 60 * 60 * 1000;
  }
}

export async function createSchedule(
  d1: D1Database,
  input: { requestedBy: string; frequency: ScheduleRow['frequency']; email: string; format: ScheduleRow['format'] },
): Promise<ScheduleRow> {
  const now = Date.now();
  const row: ScheduleRow = {
    id: randomUUID(),
    requestedBy: input.requestedBy,
    frequency: input.frequency,
    email: input.email,
    format: input.format,
    nextRunAt: computeNextRunAt(input.frequency),
    active: true,
    lastRunAt: null,
    createdAt: now,
    updatedAt: now,
  };
  return repo.insert(d1, row);
}

export async function cancelSchedule(
  d1: D1Database,
  id: string,
  requestedBy: string,
): Promise<{ before: ScheduleRow; after: ScheduleRow } | null> {
  return repo.cancel(d1, id, requestedBy);
}
