import { describe, expect, it } from 'vitest';
import { makeD1, applyMigrations } from '../helpers/d1';

describe('invoice_product_aliases migration', () => {
  it('creates the scoped alias table and required columns', async () => {
    const db = makeD1();
    await applyMigrations(db);
    const result = await db.prepare('PRAGMA table_info(invoice_product_aliases)').all<{ name: string }>();
    const columns = (result.results ?? []).map((column) => column.name);
    expect(columns).toEqual(expect.arrayContaining([
      'business_id',
      'supplier_id',
      'normalized_alias',
      'product_id',
      'source_upload_id',
      'created_by_user_id',
      'created_at',
      'updated_at',
    ]));
  });
});
