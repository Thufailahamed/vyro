// FX rate fetcher. CBSL first, exchangerate.host fallback.
// Rate stored as integer-scaled string (rate * 1e8) — no float drift.

import type { Env } from '../env';

const CBSL_URL = 'https://www.cbsl.gov.lk/api/v1/exchangerates';
const EXCHANGERATE_URL = 'https://api.exchangerate.host/latest';

export const FX_RATE_SCALE = 100_000_000; // 1e8

export type FxProvider = 'CBSL' | 'EXCHANGERATE_HOST';

export interface FxRateResult {
  rateScaled: string;
  provider: FxProvider;
}

function scaleRate(rate: number): string {
  return Math.round(rate * FX_RATE_SCALE).toString();
}

async function tryCbsl(base: string, quote: string): Promise<FxRateResult | null> {
  try {
    const res = await fetch(`${CBSL_URL}?base=${base}&quote=${quote}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { rates?: Record<string, number> };
    const rate = data.rates?.[quote];
    if (typeof rate !== 'number' || !Number.isFinite(rate)) return null;
    return { rateScaled: scaleRate(rate), provider: 'CBSL' };
  } catch {
    return null;
  }
}

async function tryExchangerateHost(base: string, quote: string): Promise<FxRateResult | null> {
  try {
    const res = await fetch(`${EXCHANGERATE_URL}?base=${base}&symbols=${quote}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { rates?: Record<string, number> };
    const rate = data.rates?.[quote];
    if (typeof rate !== 'number' || !Number.isFinite(rate)) return null;
    return { rateScaled: scaleRate(rate), provider: 'EXCHANGERATE_HOST' };
  } catch {
    return null;
  }
}

export async function fetchRate(base: string, quote: string, _env: Env): Promise<FxRateResult | null> {
  if (base === quote) return { rateScaled: FX_RATE_SCALE.toString(), provider: 'CBSL' };
  return (await tryCbsl(base, quote)) ?? (await tryExchangerateHost(base, quote));
}