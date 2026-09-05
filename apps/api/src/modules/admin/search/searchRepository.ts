import { getDb } from '@vyro/db';
import { users, suppliers, businesses, products, purchaseOrders, abuseReports } from '@vyro/db/schema';
import { sql, like, or, eq } from 'drizzle-orm';

export type SearchResults = {
  users: Array<{ id: string; email: string; name: string; role: string }>;
  suppliers: Array<{ id: string; name: string; email: string }>;
  businesses: Array<{ id: string; name: string; email: string }>;
  products: Array<{ id: string; name: string }>;
  orders: Array<{ id: string; poNumber: string; status: string }>;
  abuseReports: Array<{ id: string; reason: string; status: string }>;
};

export async function searchAll(d1: D1Database, q: string, limit: number): Promise<SearchResults> {
  const db = getDb(d1);
  const pattern = `%${q}%`;

  const userRows = (await db
    .select({ id: users.id, email: users.email, name: users.name, role: users.adminRole })
    .from(users)
    .where(or(like(users.email, pattern), like(users.name, pattern)))
    .limit(limit)
    .all()) as Array<{ id: string; email: string; name: string; role: string | null }>;

  const supplierRows = (await db
    .select({ id: suppliers.id, name: suppliers.name, email: suppliers.email })
    .from(suppliers)
    .where(or(like(suppliers.name, pattern), like(suppliers.email, pattern)))
    .limit(limit)
    .all()) as Array<{ id: string; name: string; email: string }>;

  const businessRows = (await db
    .select({ id: businesses.id, name: businesses.name, email: businesses.email })
    .from(businesses)
    .where(or(like(businesses.name, pattern), like(businesses.email, pattern)))
    .limit(limit)
    .all()) as Array<{ id: string; name: string; email: string }>;

  const productRows = (await db
    .select({ id: products.id, name: products.name })
    .from(products)
    .where(like(products.name, pattern))
    .limit(limit)
    .all()) as Array<{ id: string; name: string }>;

  const orderRows = (await db
    .select({ id: purchaseOrders.id, poNumber: purchaseOrders.poNumber, status: purchaseOrders.status })
    .from(purchaseOrders)
    .where(like(purchaseOrders.poNumber, pattern))
    .limit(limit)
    .all()) as Array<{ id: string; poNumber: string; status: string }>;

  const reportRows = (await db
    .select({ id: abuseReports.id, reason: abuseReports.reason, status: abuseReports.status })
    .from(abuseReports)
    .where(eq(abuseReports.status, 'open'))
    .limit(limit)
    .all()) as Array<{ id: string; reason: string; status: string }>;

  return {
    users: userRows.map((r) => ({ id: r.id, email: r.email, name: r.name, role: r.role ?? 'user' })),
    suppliers: supplierRows,
    businesses: businessRows,
    products: productRows,
    orders: orderRows,
    abuseReports: reportRows,
  };
}

// Query has been validated
void sql;
