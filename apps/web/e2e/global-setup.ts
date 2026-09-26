// Playwright global setup — runs after the web+API webServers are up.
// Creates the two e2e personas (buyer business owner + supplier owner) through
// the real sign-up/onboard APIs, links the seeded offer to the new supplier,
// and persists session storage state for the specs.

import { request, type APIRequestContext, type FullConfig } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = 'http://localhost:5199';
const CSRF_ORIGIN = { origin: BASE }; // verifyCsrf requires an allowed Origin on authed POSTs

const e2eDir = dirname(fileURLToPath(import.meta.url));
const apiDir = resolve(e2eDir, '../../api');
const authDir = resolve(e2eDir, '.auth');

const BUYER = { email: 'e2e-buyer@vyro.test', password: 'E2eBuyer!12345', name: 'E2E Buyer' };
const SUPPLIER = { email: 'e2e-supplier@vyro.test', password: 'E2eSupplier!12345', name: 'E2E Supplier' };

function d1(sql: string) {
  const r = spawnSync(
    'pnpm',
    ['exec', 'wrangler', 'd1', 'execute', 'vyro', '--local', '--command', sql],
    { cwd: apiDir, input: 'y\n', encoding: 'utf8' },
  );
  if (r.status !== 0) throw new Error(`d1 execute failed: ${r.stderr || r.stdout}`);
}

async function signUp(u: typeof BUYER): Promise<APIRequestContext> {
  const ctx = await request.newContext({ baseURL: BASE, extraHTTPHeaders: CSRF_ORIGIN });
  const res = await ctx.post('/api/auth/sign-up', { data: u });
  if (!res.ok() && res.status() !== 409) {
    throw new Error(`sign-up ${u.email} failed: ${res.status()} ${await res.text()}`);
  }
  if (!res.ok()) {
    const login = await ctx.post('/api/auth/sign-in', { data: { email: u.email, password: u.password } });
    if (!login.ok()) throw new Error(`sign-in ${u.email} failed: ${login.status()} ${await login.text()}`);
  }
  return ctx;
}

export default async function globalSetup(_config: FullConfig) {
  mkdirSync(authDir, { recursive: true });

  // ── Buyer: sign up + onboard a business ──
  const buyer = await signUp(BUYER);
  const biz = await buyer.post('/api/businesses/onboard', {
    data: {
      name: 'E2E Restaurant Group',
      businessTypeSlug: 'restaurant',
      contactPerson: 'E2E Buyer',
      phone: '+94 77 111 2233',
      email: BUYER.email,
      address: '10 E2E Lane',
      city: 'Colombo',
      district: 'Colombo',
      description: 'Playwright e2e buyer',
    },
  });
  if (!biz.ok() && biz.status() !== 409) {
    throw new Error(`business onboard failed: ${biz.status()} ${await biz.text()}`);
  }
  const bizBody = (await biz.json().catch(() => ({}))) as { id?: string; businessId?: string };
  const me = await buyer.get('/api/auth/me');
  const meBody = (await me.json()) as { user: { memberships?: Array<{ businessId: string }> } | null };
  const businessId = meBody.user?.memberships?.[0]?.businessId ?? bizBody.id ?? bizBody.businessId;
  if (!businessId) throw new Error('buyer has no business membership after onboard');
  await buyer.storageState({ path: resolve(authDir, 'buyer.json') });

  // ── Supplier: sign up + onboard a supplier ──
  const supplier = await signUp(SUPPLIER);
  const sup = await supplier.post('/api/suppliers/onboard', {
    data: {
      name: 'E2E Wholesale Co',
      businessTypeSlug: 'grocery-wholesaler',
      contactPerson: 'E2E Supplier',
      phone: '+94 77 444 5566',
      email: SUPPLIER.email,
      address: '99 E2E Depot Rd',
      city: 'Colombo',
      district: 'Colombo',
      description: 'Playwright e2e supplier',
      categories: ['wholesale'],
    },
  });
  if (!sup.ok() && sup.status() !== 409) {
    throw new Error(`supplier onboard failed: ${sup.status()} ${await sup.text()}`);
  }
  const supMe = await supplier.get('/api/auth/me');
  const supMeBody = (await supMe.json()) as {
    user: { supplierMemberships?: Array<{ supplierId: string }> } | null;
  };
  const supplierId = supMeBody.user?.supplierMemberships?.[0]?.supplierId;
  if (!supplierId) throw new Error('supplier user has no supplier membership after onboard');
  await supplier.storageState({ path: resolve(authDir, 'supplier.json') });

  // Link the seeded offer to the e2e supplier and mark the supplier verified so
  // it looks like a fully onboarded vendor everywhere.
  d1(`UPDATE suppliers SET verification_status='verified' WHERE id='${supplierId}'`);
  d1(`UPDATE supplier_products SET supplier_id='${supplierId}' WHERE id='sp-rice-colombo'`);

  writeFileSync(
    resolve(authDir, 'state.json'),
    JSON.stringify({ businessId, supplierId, buyer: BUYER, supplier: SUPPLIER }, null, 2),
  );
  console.log(`[e2e] seeded personas — business ${businessId}, supplier ${supplierId}`);
}
