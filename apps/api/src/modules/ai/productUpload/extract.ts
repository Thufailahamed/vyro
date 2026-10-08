import type { Env } from '../../../env';
import { parseCsvRecords } from '@vyro/shared';
import { IMPORT_COLUMNS } from '../../supplierProducts/importExport';

/**
 * AI product upload, tabular path (csv/tsv): parse deterministically with the
 * shared CSV engine, and only ask the (cheap) text model to map headers that
 * don't already match the 17-column import schema. The model never sees row
 * data — just the header names.
 */

export type SourceKind = 'csv' | 'tsv' | 'photo_pdf' | 'product_photo';

/** Route every AI call through the AI Gateway when configured. */
export function aiRunOpts(env: Partial<Env>): { gateway?: { id: string } } {
  const id = (env as any).VYRO_AI_GATEWAY as string | undefined;
  return id ? { gateway: { id } } : {};
}

const PHOTO_CT = new Set(['image/jpeg', 'image/png', 'image/webp']);
const DOC_CT = new Set(['application/pdf']);
const TSV_CT = new Set(['text/tab-separated-values']);
const CSV_CT = new Set(['text/csv', 'text/plain']);

/** Product photos are a distinct kind: classify, not extract prices. */
export function detectSourceKind(filename: string, contentType: string): SourceKind | null {
  if (DOC_CT.has(contentType)) return 'photo_pdf';
  if (PHOTO_CT.has(contentType)) {
    // Heuristic: document-ish filenames (scan, list, sheet, bill, catalog…)
    // point to a photographed price list; everything else is a product photo.
    return /price|invoice|list|sheet|scan|bill|order|catalog|book|page/i.test(filename)
      ? 'photo_pdf'
      : 'product_photo';
  }
  if (TSV_CT.has(contentType)) return 'tsv';
  if (CSV_CT.has(contentType)) return 'csv';
  return null;
}

export type CandidateRow = {
  rowIndex: number;
  raw: Record<string, string>;
  productName: string;
  supplierSku?: string | undefined;
  unit?: string | undefined;
  priceLkr?: number | undefined;
  minOrderQty?: number | undefined;
  leadTimeDays?: number | undefined;
  stockQty?: number | undefined;
  tier1MinQty?: number | undefined;
  tier1DiscountPct?: number | undefined;
  tier2MinQty?: number | undefined;
  tier2DiscountPct?: number | undefined;
  tier3MinQty?: number | undefined;
  tier3DiscountPct?: number | undefined;
  confidence: number;
};

const norm = (s: string) => s.trim().toLowerCase().replace(/[\s_-]+/g, '_');
const COLUMN_SET = new Set<string>(IMPORT_COLUMNS);
const MAX_UPLOAD_ROWS = 200;

function looksExact(headers: string[]): boolean {
  return headers.every((h) => COLUMN_SET.has(h) || !h) && headers.some((h) => COLUMN_SET.has(h));
}

/**
 * One AI text call: map foreign headers onto the import schema. Returns null
 * when the model or the response is unusable — callers then fall back to
 * fuzzy key matching in normalizeRow.
 */
async function mapHeaders(
  env: Partial<Env>,
  headers: string[],
): Promise<Record<string, string> | null> {
  if (!env.AI) return null;
  const schemaCols = IMPORT_COLUMNS.join(', ');
  const prompt =
    'You map spreadsheet headers to a fixed schema. Schema columns: ' +
    schemaCols +
    '. Headers: ' +
    JSON.stringify(headers) +
    '. Return ONLY JSON: ' +
    '{"mapping": {"<header>": "<schema column or ignore>"}}. Unmappable headers -> "ignore".';
  const model = (env as any).VYRO_AI_UPLOAD_MAP_MODEL ?? '@cf/zai-org/glm-5.3-flash';
  try {
    const out = await env.AI.run(model, {
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 512,
      ...aiRunOpts(env),
    });
    const text = (out as any)?.response ?? '';
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end <= start) return null;
    const parsed = JSON.parse(text.slice(start, end + 1));
    const mapping = parsed?.mapping;
    if (!mapping || typeof mapping !== 'object') return null;
    const clean: Record<string, string> = {};
    for (const h of headers) {
      const col = mapping[h] ?? mapping[norm(h)];
      const colNorm = col ? norm(String(col)) : '';
      if (colNorm !== 'ignore' && COLUMN_SET.has(colNorm)) clean[h] = colNorm;
    }
    return Object.keys(clean).length ? clean : null;
  } catch {
    return null;
  }
}

function num(v: string | undefined): number | undefined {
  if (!v) return undefined;
  const cleaned = v.replace(/[^0-9.]/g, '');
  if (!cleaned) return undefined;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : undefined;
}

const KEY_ALIASES: Record<string, string[]> = {
  productName: ['product_name', 'name', 'item', 'description'],
  supplierSku: ['supplier_sku', 'sku', 'code'],
  unit: ['unit', 'uom'],
  priceLkr: ['price_lkr', 'price', 'unit_price', 'rate'],
  minOrderQty: ['min_order_qty', 'moq', 'min_qty'],
  leadTimeDays: ['lead_time_days', 'lead_time'],
  stockQty: ['stock_qty', 'stock', 'qty_available', 'available'],
  tier1MinQty: ['tier1_min_qty', 'tier_1_min_qty'],
  tier1DiscountPct: ['tier1_discount_pct', 'tier_1_discount_pct'],
  tier2MinQty: ['tier2_min_qty', 'tier_2_min_qty'],
  tier2DiscountPct: ['tier2_discount_pct', 'tier_2_discount_pct'],
  tier3MinQty: ['tier3_min_qty', 'tier_3_min_qty'],
  tier3DiscountPct: ['tier3_discount_pct', 'tier_3_discount_pct'],
};

function pick(rec: Record<string, string>, names: string[] | undefined): string {
  for (const n of names ?? []) {
    const hit = rec[n];
    if (hit !== undefined) return hit;
  }
  return '';
}

/**
 * normalizeRow is the deterministic fallback: it matches canonical and alias
 * keys directly (headers from parseCsvRecords are already normalized to
 * snake_case). mapHeaders output just renames keys before this step.
 */
function normalizeRow(rec: Record<string, string>, rowIndex: number): CandidateRow {
  const productName = pick(rec, KEY_ALIASES.productName).trim().slice(0, 200);
  const price = num(pick(rec, KEY_ALIASES.priceLkr));
  const filled = Object.values(rec).filter((v) => v && v.trim().length > 0).length;
  const base = Math.min(95, 40 + filled * 8);
  const confidence = Math.max(0, Math.min(100, price !== undefined ? base : base - 20));
  const roundInt = (names: string[] | undefined) => {
    const n = num(pick(rec, names));
    return n === undefined ? undefined : Math.round(n);
  };
  const pct = (names: string[] | undefined) => {
    const n = num(pick(rec, names));
    return n === undefined ? undefined : Math.max(0, Math.min(100, Math.round(n)));
  };
  return {
    rowIndex,
    raw: rec,
    productName,
    supplierSku: pick(rec, KEY_ALIASES.supplierSku).trim().slice(0, 80) || undefined,
    unit: pick(rec, KEY_ALIASES.unit).trim().slice(0, 20) || undefined,
    priceLkr: price,
    minOrderQty: roundInt(KEY_ALIASES.minOrderQty),
    leadTimeDays: roundInt(KEY_ALIASES.leadTimeDays),
    stockQty: roundInt(KEY_ALIASES.stockQty),
    tier1MinQty: roundInt(KEY_ALIASES.tier1MinQty),
    tier1DiscountPct: pct(KEY_ALIASES.tier1DiscountPct),
    tier2MinQty: roundInt(KEY_ALIASES.tier2MinQty),
    tier2DiscountPct: pct(KEY_ALIASES.tier2DiscountPct),
    tier3MinQty: roundInt(KEY_ALIASES.tier3MinQty),
    tier3DiscountPct: pct(KEY_ALIASES.tier3DiscountPct),
    confidence,
  };
}

/** RFC 4180 quoting doesn't apply to tab-separated price sheets. */
function parseTsvRecords(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const headers = lines[0]!.split('\t').map((h) => h.trim().toLowerCase().replace(/[\s_-]+/g, '_'));
  return lines.slice(1, 1 + MAX_UPLOAD_ROWS).map((line) => {
    const cells = line.split('\t');
    const rec: Record<string, string> = {};
    headers.forEach((h, i) => (rec[h] = (cells[i] ?? '').trim()));
    return rec;
  });
}

function throughMapping(
  rows: Record<string, string>[],
  mapping: Record<string, string>,
): Record<string, string>[] {
  return rows.map((r) => {
    const out: Record<string, string> = {};
    for (const [h, v] of Object.entries(r)) {
      const col = mapping[h];
      if (col && col !== 'ignore') out[col] = v;
    }
    return out;
  });
}

export async function extractFromTabular(
  env: Partial<Env>,
  text: string,
): Promise<{ rows: CandidateRow[]; headerMapping: Record<string, string> | null }> {
  const isTsv = text.includes('\t') && !text.includes(',');
  let records: Record<string, string>[];
  let headers: string[];
  if (isTsv) {
    records = parseTsvRecords(text);
    headers = Object.keys(records[0] ?? {});
  } else {
    const p = parseCsvRecords(text);
    headers = p.headers;
    records = p.records;
  }
  if (!headers.length || records.length === 0) return { rows: [], headerMapping: null };

  let rows = records;
  let headerMapping: Record<string, string> | null = null;
  if (!looksExact(headers)) {
    headerMapping = await mapHeaders(env, headers);
    if (headerMapping) rows = throughMapping(records, headerMapping);
  }
  return {
    rows: rows.map((r, i) => normalizeRow(r, i)).filter((r) => r.productName.length > 0).slice(0, MAX_UPLOAD_ROWS),
    headerMapping,
  };
}
