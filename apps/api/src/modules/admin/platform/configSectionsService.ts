import type { Context } from 'hono';
import { httpError } from '../../../lib/errors';
import { auditAdmin } from '../../admin/lib/audit';
import * as repo from './configSectionsRepository';

export async function read(d1: D1Database, section: string) {
  const row = await repo.getSection(d1, section);
  if (!row) {
    return { section, value: {}, version: 0 };
  }
  let value: unknown = {};
  try {
    value = JSON.parse(row.valueJson);
  } catch {
    value = {};
  }
  return { section, value, version: row.version };
}

export async function update(
  ctx: Context,
  section: string,
  value: unknown,
  expectedVersion: number,
) {
  const d1 = ctx.env.DB as D1Database;
  const before = await repo.getSection(d1, section);
  const valueJson = JSON.stringify(value);
  const out = await repo.upsertSection(
    d1,
    section,
    valueJson,
    expectedVersion,
    'admin',
  );
  if ('conflict' in out) {
    throw httpError(409, 'STALE_WRITE', `Section ${section} version mismatch`);
  }
  await auditAdmin({
    ctx,
    action: section === 'feature_flags' ? 'feature_flag.update' : 'email_template.update',
    target: { type: 'config_section', id: section },
    before: { version: before?.version ?? null, valueJson: before?.valueJson ?? null },
    after: { version: out.version, valueJson },
  });
  return out;
}
