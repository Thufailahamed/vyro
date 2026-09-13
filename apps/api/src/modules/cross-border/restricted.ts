import type { Env } from '../../env';

const RESTRICTED_HS_PREFIXES: { prefix: string; reason: string }[] = [
  { prefix: '9301', reason: 'military_weapons' },
  { prefix: '9302', reason: 'firearms' },
  { prefix: '9303', reason: 'other_arms' },
  { prefix: '9304', reason: 'other_arms' },
  { prefix: '9305', reason: 'arms_parts' },
  { prefix: '2844', reason: 'radioactive_isotopes' },
  { prefix: '1211.20', reason: 'controlled_botanical' },
  { prefix: '1211.40', reason: 'controlled_botanical' },
];

export interface RestrictedResult {
  restricted: boolean;
  reason?: string;
}

export async function isProductRestricted(
  hsCode: string | null | undefined,
  _destCountry: string,
  _env: Env,
): Promise<RestrictedResult> {
  if (!hsCode) return { restricted: false };
  for (const r of RESTRICTED_HS_PREFIXES) {
    if (hsCode.startsWith(r.prefix)) return { restricted: true, reason: r.reason };
  }
  return { restricted: false };
}