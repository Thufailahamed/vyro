// apps/api/src/modules/admin/trustSafety/documentsAdmin.ts
import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../../../env';
import { session } from '../../../middleware/session';
import { requirePermission } from '../../../middleware/rbac';
import { httpError } from '../../../lib/errors';
import { getDb } from '@vyro/db';
import { invoiceUploads } from '@vyro/db/schema';
import { eq } from 'drizzle-orm';
import { auditAdmin } from '../lib/audit';

const router = new Hono<{ Bindings: Env }>();
router.use('*', session());

const idParam = z.object({ id: z.string().min(1) }).strict();

router.get('/:id/preview', requirePermission('kyc:read'), async (c) => {
  const parsed = idParam.safeParse(c.req.param());
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid id');
  const db = getDb(c.env.DB);
  const row = await db.select().from(invoiceUploads).where(eq(invoiceUploads.id, parsed.data.id)).get();
  if (!row) throw httpError(404, 'NOT_FOUND', 'Document not found');
  const obj = await c.env.INVOICES.get(row.r2Key);
  if (!obj) throw httpError(404, 'NOT_FOUND', 'File not found in storage');
  const download = c.req.query('download') === '1';
  if (download) {
    await auditAdmin({
      ctx: c,
      action: 'document.view',
      target: { type: 'document', id: row.id },
      after: { filename: row.originalFilename },
    });
  }
  return new Response(obj.body as ReadableStream, {
    headers: {
      'content-type': obj.httpMetadata?.contentType ?? row.mimeType,
      'content-disposition': `${download ? 'attachment' : 'inline'}; filename="${row.originalFilename}"`,
    },
  });
});

export default router;
