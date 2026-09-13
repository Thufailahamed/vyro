import hsData from '@vyro/db/data/hs-codes.json';

interface HsLine {
  hsCode: string;
  description: string;
  dutyRateBps: number;
}

const LINES: HsLine[] = hsData as HsLine[];
const INDEX = new Map(LINES.map((l) => [l.hsCode, l]));

export interface DutyResult {
  dutyCents: number;
  warning?: 'HS_CODE_UNKNOWN';
}

export async function estimateDuty(
  hsCode: string | null | undefined,
  _countryOfOrigin: string,
  declaredValueCents: number,
): Promise<DutyResult | null> {
  if (!hsCode || !Number.isFinite(declaredValueCents) || declaredValueCents < 0) return null;
  const line = INDEX.get(hsCode);
  if (!line) return { dutyCents: 0, warning: 'HS_CODE_UNKNOWN' };
  return { dutyCents: Math.round((declaredValueCents * line.dutyRateBps) / 10000) };
}

export function listKnownHsCodes(): HsLine[] {
  return [...LINES];
}