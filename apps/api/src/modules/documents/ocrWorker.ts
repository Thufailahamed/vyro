import type { Env } from '../../env';

export interface OcrItem {
  description: string;
  quantity?: number | undefined;
  unit?: string | undefined;
  unitPriceCents?: number | undefined;
  totalCents?: number | undefined;
}

export interface OcrResult {
  supplierName: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  totalCents: number | null;
  items: OcrItem[];
  confidence: number;
  rawProvider: string;
}

const STUB: OcrResult = {
  supplierName: null,
  invoiceNumber: null,
  invoiceDate: null,
  totalCents: null,
  items: [],
  confidence: 0,
  rawProvider: 'stub',
};

export async function runOcr(input: {
  env: Pick<Env, 'AI'> & Partial<Env>;
  bytes: Uint8Array;
  mimeType: string;
}): Promise<OcrResult> {
  if (!input.env.AI) return STUB;
  try {
    const model = (input.env as any).VYRO_AI_OCR_MODEL ?? '@cf/llava-hf/llava-1.5-7b-hf';
    const out = await input.env.AI.run(model, {
      image: Array.from(input.bytes),
      prompt:
        'Extract invoice data as JSON: { supplierName, invoiceNumber, invoiceDate (YYYY-MM-DD), totalCents (integer), items: [{description, quantity, unit, unitPriceCents, totalCents}] }. Return ONLY the JSON.',
      max_tokens: 1024,
    });
    const text = (out as any)?.response ?? '';
    const json = extractJson(text);
    if (!json) return { ...STUB, rawProvider: model };
    const confidence = clampConfidence(json);
    return {
      supplierName: stringOrNull(json.supplierName) ?? null,
      invoiceNumber: stringOrNull(json.invoiceNumber) ?? null,
      invoiceDate: stringOrNull(json.invoiceDate) ?? null,
      totalCents: intOrNull(json.totalCents),
      items: Array.isArray(json.items)
        ? (json.items as any[])
            .map((it) => ({
              description: String(it.description ?? '').slice(0, 200),
              quantity: numberOrUndef(it.quantity),
              unit: stringOrUndef(it.unit),
              unitPriceCents: intOrUndef(it.unitPriceCents),
              totalCents: intOrUndef(it.totalCents),
            }))
            .filter((it: OcrItem) => it.description.length > 0)
        : [],
      confidence,
      rawProvider: model,
    };
  } catch {
    return STUB;
  }
}

function extractJson(text: string): any | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

function clampConfidence(json: any): number {
  const keys = ['supplierName', 'invoiceNumber', 'invoiceDate', 'totalCents', 'items'];
  const present = keys.filter((k) => json[k] !== undefined && json[k] !== null).length;
  const itemBonus = Math.min(20, Array.isArray(json.items) ? json.items.length * 4 : 0);
  return Math.max(0, Math.min(100, present * 12 + itemBonus + 10));
}

function stringOrNull(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, 200) : null;
}

function stringOrUndef(v: unknown): string | undefined {
  const s = stringOrNull(v);
  return s ?? undefined;
}

function intOrNull(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.round(v);
  if (typeof v === 'string' && /^-?\d+$/.test(v.trim())) return parseInt(v, 10);
  return null;
}

function intOrUndef(v: unknown): number | undefined {
  const n = intOrNull(v);
  return n ?? undefined;
}

function numberOrUndef(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  return undefined;
}
