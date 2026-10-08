import type { Env } from '../../../env';
import { aiRunOpts, type CandidateRow } from './extract';

/**
 * AI product upload, vision path: photographed price lists (or PDF scans)
 * and single product photos. One Workers AI call per image through the AI
 * Gateway; the response is JSON scraped out of free text and re-normalized
 * into CandidateRow shape — model output is never trusted raw.
 */

const DEFAULT_VISION = '@cf/llava-hf/llava-1.5-7b-hf';

const PRICE_PROMPT =
  'This is a wholesale price list (photo or PDF page). Extract every product row as JSON: ' +
  '{"rows": [{"productName": "...", "supplierSku": "...", "unit": "...", "priceLkr": 0, "minOrderQty": 0, "stockQty": 0}]}, ' +
  'plus a top-level "confidence" (0-100, your legibility). Return ONLY the JSON.';

const PHOTO_PROMPT =
  'Identify this wholesale product photo. Return ONLY JSON: ' +
  '{"productName": "...", "unit": "bottle|kg|box|bag", "confidence": 0-100}.';

function extractJson(text: string): any | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

const clamp = (n: unknown): number => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));

function rowFromJsonObject(
  obj: Record<string, unknown>,
  rowIndex: number,
  fallbackConfidence: number,
): CandidateRow {
  const price = Number(obj.priceLkr ?? NaN);
  const optionalString = (key: string, max: number): string | undefined => {
    const v = obj[key];
    return v === undefined || v === null ? undefined : String(v).trim().slice(0, max) || undefined;
  };
  const optionalInt = (key: string): number | undefined => {
    const v = obj[key];
    if (v === undefined || v === null || v === '') return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? Math.round(n) : undefined;
  };
  return {
    rowIndex,
    raw: obj as Record<string, string>,
    productName: String(obj.productName ?? '').trim().slice(0, 200),
    supplierSku: optionalString('supplierSku', 80),
    unit: optionalString('unit', 20),
    priceLkr: Number.isFinite(price) ? price : undefined,
    minOrderQty: optionalInt('minOrderQty'),
    stockQty: optionalInt('stockQty'),
    confidence: obj.confidence !== undefined && obj.confidence !== '' ? clamp(obj.confidence) : fallbackConfidence,
  };
}

export async function runVisionPriceList(
  env: Partial<Env>,
  bytes: Uint8Array,
): Promise<{ rows: CandidateRow[]; confidence: number }> {
  if (!env.AI) return { rows: [], confidence: 0 };
  const model = (env as any).VYRO_AI_UPLOAD_VISION_MODEL ?? DEFAULT_VISION;
  try {
    const out = await env.AI.run(model, {
      image: Array.from(bytes),
      prompt: PRICE_PROMPT,
      max_tokens: 2048,
      ...aiRunOpts(env),
    });
    const json = extractJson((out as any)?.response ?? '');
    if (!json || !Array.isArray(json.rows)) return { rows: [], confidence: 0 };
    const fallback = clamp(json.confidence ?? 70);
    const rows = (json.rows as Array<Record<string, unknown>>)
      .map((r, i) => rowFromJsonObject(r, i, fallback))
      .filter((r) => r.productName.length > 0)
      .slice(0, 200);
    return {
      rows,
      confidence: rows.length ? Math.round(rows.reduce((s, r) => s + r.confidence, 0) / rows.length) : 0,
    };
  } catch {
    return { rows: [], confidence: 0 };
  }
}

export async function runVisionProductPhoto(env: Partial<Env>, bytes: Uint8Array): Promise<CandidateRow> {
  const empty: CandidateRow = { rowIndex: 0, raw: {}, productName: '', confidence: 0 };
  if (!env.AI) return empty;
  const model = (env as any).VYRO_AI_UPLOAD_VISION_MODEL ?? DEFAULT_VISION;
  try {
    const out = await env.AI.run(model, {
      image: Array.from(bytes),
      prompt: PHOTO_PROMPT,
      max_tokens: 256,
      ...aiRunOpts(env),
    });
    const json = extractJson((out as any)?.response ?? '');
    if (!json) return empty;
    return rowFromJsonObject(json, 0, clamp(json.confidence ?? 70));
  } catch {
    return empty;
  }
}
