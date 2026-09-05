import { hasPermission, type AdminRole } from '@vyro/auth';
import { searchAll, type SearchResults } from './searchRepository';

export type FilteredResults = Partial<SearchResults>;

export async function search(
  d1: D1Database,
  q: string,
  limit: number,
  role: AdminRole | null,
): Promise<FilteredResults> {
  if (q.length < 2) return {};
  const all = await searchAll(d1, q, limit);

  const visible: FilteredResults = {};
  if (hasPermission(role, 'user:read')) visible.users = all.users;
  if (hasPermission(role, 'supplier:read')) visible.suppliers = all.suppliers;
  if (hasPermission(role, 'business:read')) visible.businesses = all.businesses;
  if (hasPermission(role, 'product:read')) visible.products = all.products;
  if (hasPermission(role, 'dispute:read')) visible.orders = all.orders;
  if (hasPermission(role, 'abuse_report:read')) visible.abuseReports = all.abuseReports;

  return visible;
}
