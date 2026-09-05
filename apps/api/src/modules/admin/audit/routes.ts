import { Hono } from 'hono';
import type { Env } from '../../../env';
import { session } from '../../../middleware/session';
import { requirePermission } from '../../../middleware/rbac';
import { httpError } from '../../../lib/errors';
import { adminAuditQuery } from './schema';
import { listAudit } from './repository';

const router = new Hono<{ Bindings: Env }>();
router.use('*', session());

router.get('/', requirePermission('audit:read'), async (c) => {
  const parsed = adminAuditQuery.safeParse(c.req.query());
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input');
  const out = await listAudit(c.env.DB, parsed.data);
  return c.json(out);
});

router.get('/export', requirePermission('audit:export'), async (c) => {
  const parsed = adminAuditQuery.safeParse(c.req.query());
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input');
  const softCap = 100_000;
  let count = 0;
  let cursor: string | undefined = parsed.data.cursor;
  c.header('Content-Type', 'text/csv; charset=utf-8');
  c.header('Content-Disposition', 'attachment; filename="admin-audit.csv"');
  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      controller.enqueue(
        enc.encode(
          'id,actor_id,actor_email,action,target_type,target_id,request_id,ip,created_at,before,after\n',
        ),
      );
      while (count < softCap) {
        const page = await listAudit(c.env.DB, { ...parsed.data, cursor, limit: 1000 });
        if (page.entries.length === 0) break;
        for (const row of page.entries) {
          controller.enqueue(enc.encode(toCsvRow(row) + '\n'));
          count++;
          if (count >= softCap) {
            controller.enqueue(enc.encode('# truncated at 100k\n'));
            break;
          }
        }
        if (!page.nextCursor) break;
        cursor = page.nextCursor;
      }
      controller.close();
    },
  });
  return c.body(stream as unknown as ReadableStream);
});

function toCsvRow(r: {
  id: string;
  actorId: string | null;
  actorEmail: string | null;
  action: string;
  targetType: string;
  targetId: string;
  requestId: string | null;
  ip: string | null;
  createdAt: number;
  before: string | null;
  after: string | null;
}): string {
  return [
    r.id,
    r.actorId ?? '',
    r.actorEmail ?? '',
    r.action,
    r.targetType,
    r.targetId,
    r.requestId ?? '',
    r.ip ?? '',
    new Date(r.createdAt).toISOString(),
    r.before ?? '',
    r.after ?? '',
  ]
    .map(csvField)
    .join(',');
}
function csvField(v: string): string {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

export default router;
