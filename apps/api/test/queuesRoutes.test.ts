import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import * as svc from '../src/modules/admin/queues/queuesService';

const insertCalls: Array<{ values: unknown }> = [];

vi.mock('@vyro/db', () => ({
  getDb: () => ({
    insert: () => ({
      values: (v: unknown) => ({
        onConflictDoNothing: () => {
          insertCalls.push({ values: v });
          return Promise.resolve();
        },
      }),
    }),
    select: () => ({ from: () => ({ where: () => ({ get: () => null, all: () => [] }) }) }),
  }),
}));

vi.mock('../src/modules/admin/lib/audit', () => ({
  auditAdmin: () => Promise.resolve(),
}));

vi.mock('../src/middleware/session', () => ({
  session: () => async (_c: any, next: any) => {
    _c.set('ctx', {
      userId: _c.get('__testUserId') ?? 'u-1',
      adminRole: _c.get('__testRole') ?? 'super_admin',
      isAdmin: true,
      businesses: [],
      suppliers: [],
    });
    await next();
  },
}));

vi.mock('../src/middleware/rbac', () => {
  const httpErr = (status: number, code: string, msg: string) => {
    const e: any = new Error(msg);
    e.status = status;
    e.code = code;
    return e;
  };
  return {
    requireRole: () => async (c: any, next: any) => {
      const role = c.get('ctx')?.adminRole;
      if (!role) throw httpErr(401, 'UNAUTHORIZED', 'no ctx');
      await next();
    },
    requirePermission: (perm: string) => async (c: any, next: any) => {
      const perms: string[] = c.get('__testPerms') ?? [];
      if (!perms.includes(perm)) {
        throw httpErr(403, 'FORBIDDEN', `Missing permission: ${perm}`);
      }
      await next();
    },
  };
});

import { queuesRoutes } from '../src/modules/admin/queues/queuesRoutes';

function app(permissions: string[], role = 'super_admin') {
  const a = new Hono<{ Bindings: any; Variables: any }>();
  a.use('*', async (c, n) => {
    c.set('__testPerms', permissions);
    c.set('__testRole', role);
    await n();
  });
  a.onError((err, c) => {
    const status = (err as any)?.status ?? 500;
    return c.json({ error: (err as Error).message }, status as any);
  });
  a.route('/queues', queuesRoutes);
  return a;
}

describe('queuesRoutes', () => {
  it('GET /health returns health array', async () => {
    vi.spyOn(svc, 'getHealth').mockResolvedValue([{ queue: 'audit', backlog: 0, ackLast1h: 1, errLast1h: 0, p50Ms: 1, p95Ms: 2 }]);
    const res = await app(['queues:read']).fetch(new Request('http://x/queues/health'));
    expect(res.status).toBe(200);
    const j = (await res.json()) as any;
    expect(j.queues[0].queue).toBe('audit');
  });

  it('POST /retry/:id returns newMsgId', async () => {
    vi.spyOn(svc, 'retryEvent').mockResolvedValue({ newMsgId: 'm2' });
    const res = await app(['queues:write']).fetch(
      new Request('http://x/queues/retry/e1', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ editedPayload: { x: 1 } }),
      }),
    );
    expect(res.status).toBe(200);
    const j = (await res.json()) as any;
    expect(j.newMsgId).toBe('m2');
  });

  it('POST /retry/:id maps NOT_FOUND to 404', async () => {
    vi.spyOn(svc, 'retryEvent').mockRejectedValue(Object.assign(new Error('nf'), { code: 'NOT_FOUND' }));
    const res = await app(['queues:write']).fetch(
      new Request('http://x/queues/retry/missing', { method: 'POST', body: '{}' }),
    );
    expect(res.status).toBe(404);
  });

  it('POST /enqueue returns msgId + eventId', async () => {
    vi.spyOn(svc, 'manualEnqueue').mockResolvedValue({ msgId: 'm', eventId: 'e' });
    const res = await app(['queues:write']).fetch(
      new Request('http://x/queues/enqueue', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ queue: 'audit', payload: { a: 1 } }),
      }),
    );
    expect(res.status).toBe(200);
    const j = (await res.json()) as any;
    expect(j).toEqual({ ok: true, msgId: 'm', eventId: 'e' });
  });

  it('POST /enqueue rejects without queues:write', async () => {
    const a = app(['queues:read'], 'support');
    const res = await a.fetch(
      new Request('http://x/queues/enqueue', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ queue: 'audit', payload: {} }),
      }),
    );
    expect(res.status).toBe(403);
  });
});