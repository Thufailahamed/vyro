import { getDb } from '@vyro/db';
import { productUploadRows, productUploadSessions } from '@vyro/db/schema';
import { eq } from 'drizzle-orm';
import { newId } from '@vyro/shared';
import type { Env } from '../../../env';
import { extractFromTabular, type CandidateRow } from './extract';
import { runVisionPriceList, runVisionProductPhoto } from './vision';
import { matchRows, type MatchResult } from './matcher';

/**
 * AI product upload pipeline: pending session → extract candidates → fuzzy
 * match against the catalog → stage rows for the review screen. Sessions set
 * status=failed with a reason on error; the row itself is the retry surface
 * (the upload route can re-enqueue).
 */

const LOW_CONFIDENCE = 60;
/** Test-only hook: unit-test sessions prefix r2Key with this to skip R2. */
const INLINE_TEST_PREFIX = 'test-inline:';

export async function processUploadSession(env: Env, sessionId: string): Promise<void> {
  const db = getDb(env.DB);
  const session = await db.select().from(productUploadSessions).where(eq(productUploadSessions.id, sessionId)).get();
  if (!session || session.status !== 'pending') return;

  await db
    .update(productUploadSessions)
    .set({ status: 'extracting', updatedAt: Date.now() })
    .where(eq(productUploadSessions.id, sessionId));
  try {
    let bytes: Uint8Array;
    let text: string;
    if (session.r2Key.startsWith(INLINE_TEST_PREFIX)) {
      text = session.r2Key.slice(INLINE_TEST_PREFIX.length);
      bytes = new TextEncoder().encode(text);
    } else {
      const obj = await env.PRODUCTS.get(session.r2Key);
      if (!obj) throw new Error('R2 object missing');
      bytes = new Uint8Array(await obj.arrayBuffer());
      text = new TextDecoder().decode(bytes);
    }

    let candidates: CandidateRow[] = [];
    if (session.sourceKind === 'csv' || session.sourceKind === 'tsv') {
      candidates = (await extractFromTabular(env, text)).rows;
    } else if (session.sourceKind === 'photo_pdf') {
      candidates = (await runVisionPriceList(env, bytes)).rows;
    } else {
      candidates = [await runVisionProductPhoto(env, bytes)];
    }

    const matches: MatchResult[] = await matchRows(db, session.supplierId, candidates);
    const now = Date.now();
    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i]!;
      const m = matches[i]!;
      await db.insert(productUploadRows).values({
        id: newId(),
        sessionId,
        rowIndex: i,
        rawJson: JSON.stringify(c.raw),
        productName: c.productName,
        supplierSku: c.supplierSku ?? null,
        unit: c.unit ?? null,
        priceLkr: c.priceLkr ?? null,
        minOrderQty: c.minOrderQty ?? null,
        leadTimeDays: c.leadTimeDays ?? null,
        stockQty: c.stockQty ?? null,
        tier1MinQty: c.tier1MinQty ?? null,
        tier1DiscountPct: c.tier1DiscountPct ?? null,
        tier2MinQty: c.tier2MinQty ?? null,
        tier2DiscountPct: c.tier2DiscountPct ?? null,
        tier3MinQty: c.tier3MinQty ?? null,
        tier3DiscountPct: c.tier3DiscountPct ?? null,
        confidence: c.confidence,
        matchType: c.productName ? m.matchType : 'none',
        matchProductId: m.productId ?? null,
        matchScore: m.matchScore,
        // Everything lands on the review screen; low-confidence rows start
        // as 'edited' (unconfirmed) so the supplier must look at them.
        decision: c.confidence >= LOW_CONFIDENCE ? 'accepted' : 'edited',
        createdAt: now,
        updatedAt: now,
      });
    }
    await db
      .update(productUploadSessions)
      .set({ status: 'extracted', updatedAt: now })
      .where(eq(productUploadSessions.id, sessionId));
  } catch (err) {
    await db
      .update(productUploadSessions)
      .set({
        status: 'failed',
        errorMessage: (err instanceof Error ? err.message : 'extraction failed').slice(0, 500),
        updatedAt: Date.now(),
      })
      .where(eq(productUploadSessions.id, sessionId));
  }
}
