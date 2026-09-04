import { migrate } from 'drizzle-orm/d1/migrator';
import { getDb } from './getDb';

export async function runMigrations(d1: D1Database): Promise<void> {
  const db = getDb(d1);
  await migrate(db, { migrationsFolder: './migrations' });
}
