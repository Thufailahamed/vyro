import { httpError } from '../../lib/errors';
import { isCountrySanctioned } from './sanctions';
import { isProductRestricted } from './restricted';
import { snapshotRate } from './fx';
import { requiredFields, type Incoterm } from './incoterms';
import { logger } from '../../lib/logger';
import type { Db } from '@vyro/db';
import type { Env } from '../../env';

export type OrderDirection = 'domestic' | 'export' | 'import';

export interface PreOrderInput {
  buyerCountry: string;
  supplierCountry: string;
  hsCodes: string[];
  env: Env;
  db: Db;
}

export interface PreOrderResult {
  direction: OrderDirection;
  fxSnapshotId: string | null;
}

function deriveDirection(buyerCountry: string, supplierCountry: string): OrderDirection {
  const buyerIsLanka = buyerCountry === 'LK';
  const supplierIsLanka = supplierCountry === 'LK';
  if (buyerIsLanka && supplierIsLanka) return 'domestic';
  if (supplierIsLanka && !buyerIsLanka) return 'export';
  return 'import';
}

function quoteCurrencyFor(buyerCountry: string): string {
  // Map country code → common FX quote. Unknown countries default to USD.
  const map: Record<string, string> = {
    US: 'USD', GB: 'GBP', IN: 'INR', AE: 'AED', SG: 'SGD', AU: 'AUD',
    DE: 'EUR', FR: 'EUR', JP: 'JPY', CN: 'CNY',
  };
  return map[buyerCountry] ?? 'USD';
}

export async function preOrderCreateCheck(input: PreOrderInput): Promise<PreOrderResult> {
  const direction = deriveDirection(input.buyerCountry, input.supplierCountry);

  if (await isCountrySanctioned(input.buyerCountry, input.env)) {
    logger.warn('cross_border.sanctions.blocked', { country: input.buyerCountry, role: 'buyer' });
    throw httpError(422, 'COUNTRY_SANCTIONED', 'Buyer country is sanctioned');
  }
  if (await isCountrySanctioned(input.supplierCountry, input.env)) {
    logger.warn('cross_border.sanctions.blocked', { country: input.supplierCountry, role: 'supplier' });
    throw httpError(422, 'COUNTRY_SANCTIONED', 'Supplier country is sanctioned');
  }

  for (const hs of input.hsCodes) {
    const r = await isProductRestricted(hs, input.buyerCountry, input.env);
    if (r.restricted) {
      logger.warn('cross_border.restricted.blocked', { hs, dest: input.buyerCountry, reason: r.reason });
      throw httpError(422, 'PRODUCT_RESTRICTED', `Product restricted: ${r.reason}`);
    }
  }

  let fxSnapshotId: string | null = null;
  if (direction !== 'domestic') {
    const quoteCcy = quoteCurrencyFor(input.buyerCountry);
    const snap = await snapshotRate('LKR', quoteCcy, input.db, input.env);
    fxSnapshotId = snap.id;
  }

  return { direction, fxSnapshotId };
}

export interface PreConfirmInput {
  incoterms: Incoterm;
  declaredShippingCostCents: number | null;
}

export async function preOrderConfirmCheck(args: PreConfirmInput): Promise<void> {
  const required = requiredFields(args.incoterms);
  if (required.includes('declaredShippingCostCents') && args.declaredShippingCostCents == null) {
    throw httpError(422, 'INVALID_INCOTERMS', `${args.incoterms} requires declared shipping cost`);
  }
}