import { Hono } from 'hono';
import type { Env } from '../../../env';
import { session } from '../../../middleware/session';
import { requirePermission } from '../../../middleware/rbac';
import { httpError } from '../../../lib/errors';
import {
  adminKycListQuery,
  adminKycIdParam,
  adminKycDecisionBody,
  adminKycCreateBody,
} from '@vyro/validation';
import * as svc from './kycService';
import { getDb } from '@vyro/db';
import { invoiceUploads } from '@vyro/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { getKyc } from './kycRepository';

const router = new Hono<{ Bindings: Env }>();
router.use('*', session());

router.get('/', requirePermission('kyc:read'), async (c) => {
  const parsed = adminKycListQuery.safeParse(c.req.query());
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid query');
  return c.json(
    await svc.list(c.env.DB, {
      ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
      ...(parsed.data.cursor !== undefined ? { cursor: parsed.data.cursor } : {}),
      ...(parsed.data.limit !== undefined ? { limit: parsed.data.limit } : {}),
    }),
  );
});

router.get('/:id', requirePermission('kyc:read'), async (c) => {
  const parsed = adminKycIdParam.safeParse(c.req.param());
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid id');
  return c.json(await svc.get(c.env.DB, parsed.data.id));
});

router.post('/', requirePermission('kyc:read'), async (c) => {
  const body = adminKycCreateBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid body');
  return c.json(
    await svc.create(c, {
      userId: body.data.userId,
      ...(body.data.documentsJson !== undefined ? { documentsJson: body.data.documentsJson } : {}),
    }),
    201,
  );
});

router.post('/:id/decision', requirePermission('kyc:review'), async (c) => {
  const parsed = adminKycIdParam.safeParse(c.req.param());
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid id');
  const body = adminKycDecisionBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid body');
  return c.json(
    await svc.decide(c, parsed.data.id, body.data.decision, body.data.notes),
  );
});

router.get('/:id/documents', requirePermission('kyc:read'), async (c) => {
  const parsed = adminKycIdParam.safeParse(c.req.param());
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid id');
  const row = await getKyc(c.env.DB, parsed.data.id);
  if (!row) throw httpError(404, 'NOT_FOUND', 'KYC review not found');
  let refIds: string[] = [];
  if (row.documentsJson) {
    try {
      const v: unknown = JSON.parse(row.documentsJson);
      if (Array.isArray(v)) refIds = v.filter((x): x is string => typeof x === 'string');
    } catch {
      refIds = [];
    }
  }
  const db = getDb(c.env.DB);
  const byRef = refIds.length
    ? await db.select().from(invoiceUploads).where(inArray(invoiceUploads.id, refIds)).all()
    : [];
  const byUser = await db
    .select()
    .from(invoiceUploads)
    .where(eq(invoiceUploads.uploadedByUserId, row.userId))
    .all();
  const seen = new Map(byRef.concat(byUser).map((r) => [r.id, r]));
  return c.json({
    documents: [...seen.values()].map((r) => ({
      id: r.id,
      filename: r.originalFilename,
      mimeType: r.mimeType,
      sizeBytes: r.sizeBytes,
      createdAt: r.createdAt,
    })),
  });
});

export default router;
