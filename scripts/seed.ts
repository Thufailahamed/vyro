// Seed wrangler D1 with categories + sample products for local dev.
// Also exports T1 admin fixtures for tests and e2e seeding.
// Usage: pnpm --filter @vyro/api exec wrangler d1 execute vyro --local --file=../../scripts/seed.sql
// Or run via: cd apps/api && pnpm exec wrangler d1 execute vyro --local --command "$(cat ../../scripts/seed.sql)"

import { mkdirSync, writeFileSync } from 'fs';
import { randomBytes, createHash } from 'crypto';
import { randomUUID } from 'crypto';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

export type SeedAdminRole = 'super_admin' | 'ops' | 'finance' | 'support';

export function adminFixture(opts: {
  role: SeedAdminRole;
  email?: string;
  id?: string;
}) {
  return {
    id: opts.id ?? `admin-${opts.role}-${Math.random().toString(36).slice(2, 8)}`,
    email: opts.email ?? `${opts.role}@vyro.test`,
    name: `${opts.role} admin`,
    passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$placeholder$placeholder',
    adminRole: opts.role,
    status: 'active',
    marketingOptIn: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function adminInviteFixture(opts: {
  role: SeedAdminRole;
  expiresIn?: number;
  accepted?: boolean;
  revoked?: boolean;
}) {
  const now = Date.now();
  return {
    id: randomUUID(),
    email: `${opts.role}-invite@vyro.test`,
    role: opts.role,
    tokenHash: createHash('sha256').update(randomBytes(32)).digest('hex'),
    invitedBy: 'admin-super_admin-seed',
    expiresAt: now + (opts.expiresIn ?? 7 * 24 * 60 * 60 * 1000),
    acceptedAt: opts.accepted ? now : null,
    revokedAt: opts.revoked ? now : null,
    createdAt: now,
  };
}

export function adminAuditLogFixture(opts: {
  actorId: string;
  action: string;
  targetType: string;
  targetId: string;
  before?: unknown;
  after?: unknown;
  createdAt?: number;
}) {
  return {
    id: randomUUID(),
    actorId: opts.actorId,
    action: opts.action,
    targetType: opts.targetType,
    targetId: opts.targetId,
    before: opts.before !== undefined ? JSON.stringify(opts.before) : null,
    after: opts.after !== undefined ? JSON.stringify(opts.after) : null,
    requestId: `seed-${Math.random().toString(36).slice(2, 10)}`,
    ip: '127.0.0.1',
    userAgent: 'seed/1.0',
    createdAt: opts.createdAt ?? Date.now(),
  };
}

export function categoryFixture(opts: {
  slug: string;
  name: string;
  parentId?: string | null;
  sortOrder?: number;
}) {
  return {
    id: `cat-${opts.slug}`,
    slug: opts.slug,
    name: opts.name,
    parentId: opts.parentId ?? null,
    active: 1,
    sortOrder: opts.sortOrder ?? 0,
  };
}

export function businessTypeFixture(opts: { slug: string; name: string }) {
  return {
    id: `bt-${opts.slug}`,
    slug: opts.slug,
    name: opts.name,
    active: 1,
  };
}

export function refundFixture(opts: {
  paymentId: string;
  amountCents: number;
  requestedByUserId: string;
  status?: 'pending' | 'processing' | 'completed' | 'failed';
  reason?: string;
}) {
  return {
    id: randomUUID(),
    paymentId: opts.paymentId,
    amountCents: opts.amountCents,
    reason: opts.reason ?? null,
    status: opts.status ?? 'pending',
    requestedByUserId: opts.requestedByUserId,
    requestedAt: Date.now(),
    processedAt: null,
    gatewayRefundId: null,
    failureReason: null,
  };
}

export function payoutBatchFixture(opts: {
  periodStart: number;
  periodEnd: number;
  payoutCount?: number;
  totalCents?: number;
  status?: 'pending' | 'approved' | 'rejected';
  createdByUserId: string;
}) {
  return {
    id: randomUUID(),
    periodStart: opts.periodStart,
    periodEnd: opts.periodEnd,
    payoutCount: opts.payoutCount ?? 0,
    totalCents: opts.totalCents ?? 0,
    status: opts.status ?? 'pending',
    createdByUserId: opts.createdByUserId,
    createdAt: Date.now(),
    approvedByUserId: null,
    approvedAt: null,
    notes: null,
  };
}

export function chargebackFixture(opts: {
  paymentId: string;
  reason: string;
  status?: 'open' | 'resolved' | 'cancelled';
}) {
  return {
    id: randomUUID(),
    paymentId: opts.paymentId,
    reason: opts.reason,
    status: opts.status ?? 'open',
    resolvedBy: null,
    resolvedAt: null,
    refundId: null,
    notes: null,
    createdAt: Date.now(),
  };
}

export function ledgerEntryFixture(opts: {
  accountType: 'business' | 'supplier' | 'platform';
  accountId: string;
  direction: 'credit' | 'debit';
  amountCents: number;
  refType: string;
  refId?: string;
  createdByUserId: string;
}) {
  return {
    id: randomUUID(),
    accountType: opts.accountType,
    accountId: opts.accountId,
    direction: opts.direction,
    amountCents: opts.amountCents,
    refType: opts.refType,
    refId: opts.refId ?? null,
    description: `${opts.direction} ${opts.refType}`,
    createdByUserId: opts.createdByUserId,
    createdAt: Date.now(),
  };
}

export function featuredProductFixture(opts: {
  id?: string;
  name: string;
  categoryId: string;
  unit?: string;
}) {
  return {
    id: opts.id ?? `p-${Math.random().toString(36).slice(2, 8)}`,
    name: opts.name,
    description: null,
    categoryId: opts.categoryId,
    brand: null,
    unit: opts.unit ?? 'pack',
    packSize: null,
    active: 1,
    featured: 1,
    moderationNotes: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    deletedAt: null,
  };
}

const __dirname = dirname(fileURLToPath(import.meta.url));

const SQL = `-- VYRO seed (idempotent inserts)
INSERT OR IGNORE INTO business_types (id, slug, name, active) VALUES
  ('bt-restaurant', 'restaurant', 'Restaurant', 1),
  ('bt-hotel',       'hotel',       'Hotel',       1),
  ('bt-cafe',        'cafe',        'Café',        1),
  ('bt-retail',      'retail',      'Retail & Supermarket', 1),
  ('bt-bakery',      'bakery',      'Bakery & Confectionery', 1),
  ('bt-catering',    'catering',    'Catering & Events', 1),
  ('bt-supplier-grocery', 'grocery-wholesaler', 'Grocery Wholesaler', 1),
  ('bt-supplier-beverage', 'beverage-distributor', 'Beverage Distributor', 1),
  ('bt-supplier-dairy', 'dairy-producer', 'Dairy & Cold Chain Producer', 1),
  ('bt-supplier-packaging', 'packaging-supplier', 'Packaging & Disposables Wholesaler', 1),
  ('bt-supplier-spices', 'spices-commodities', 'Spices & Agricultural Processing', 1),
  ('bt-supplier-meat', 'meat-seafood', 'Meat & Seafood Wholesale', 1);

INSERT OR IGNORE INTO categories (id, slug, name, parent_id, sort_order, active) VALUES
  ('cat-staples',   'staples',   'Staples',   NULL, 1, 1),
  ('cat-beverages', 'beverages', 'Beverages', NULL, 2, 1),
  ('cat-dairy',     'dairy',     'Dairy',     NULL, 3, 1);

INSERT OR IGNORE INTO products (id, name, description, category_id, brand, unit, pack_size, active, created_at, updated_at) VALUES
  ('p-rice-5kg', 'White Rice 5kg',  'Premium long-grain rice', 'cat-staples', 'Pussalla',     'bag',  '5kg',  1, 0, 0),
  ('p-sugar-1kg','White Sugar 1kg', 'Refined sugar',           'cat-staples', 'local',        'pack', '1kg',  1, 0, 0),
  ('p-tea-200g', 'Ceylon Tea 200g', 'High-grown tea',          'cat-beverages','Dilmah',      'pack', '200g', 1, 0, 0),
  ('p-milk-1l',  'Milk 1L',         'Fresh pasteurized milk',  'cat-dairy',    'Fonterra',    'carton','1L',   1, 0, 0);
`;

// Only run the SQL write when invoked directly (not when imported for fixtures).
const isMain =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isMain) {
  const out = resolve(__dirname, 'seed.sql');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, SQL);
  console.log('wrote', out);
}
