import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';

vi.mock('/Users/thufailahamed/Downloads/project-5/apps/api/src/env', () => ({ env: {} }));

const state = vi.hoisted(() => ({
  balance: 0,
  page: null as null | { entries: any[]; nextCursor: number | null; openingBalanceCents: number; closingBalanceCents: number },
}));

vi.mock('@vyro/db', () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          get: () => ({ credit: 0, debit: 0 }),
          orderBy: () => ({
            limit: () => ({
              all: () => state.page?.entries ?? [],
            }),
          }),
          all: () => state.page?.entries ?? [],
        }),
      }),
    }),
  }),
}));

vi.mock('/Users/thufailahamed/Downloads/project-5/apps/api/src/middleware/session', () => ({
  session: () => async (c: any, n: any) => {
    c.set('ctx', { userId: 'u-1', isAdmin: true });
    await n();
  },
}));

import accountsRouter from '../../src/modules/accounts/routes';
import { errorEnvelope } from '../../src/lib/errors';

const app = new Hono();
app.onError((err, c) => {
  const env = errorEnvelope(err);
  return c.json(env.body, env.status as any);
});
app.route('/api/accounts', accountsRouter);

describe('GET /api/accounts/balance', () => {
  it('requires accountType and accountId', async () => {
    const res = await app.fetch(new Request('http://localhost/api/accounts/balance'), { DB: {} } as any);
    expect(res.status).toBe(400);
  });
});

describe('GET /api/accounts/statement', () => {
  it('returns CSV when format=csv', async () => {
    state.page = {
      entries: [
        {
          id: 'e1',
          direction: 'credit',
          amountCents: 1000,
          refType: 'payment',
          refId: 'p1',
          description: 'Test entry',
          createdAt: 1700000000000,
          runningBalanceCents: 1000,
        },
      ],
      nextCursor: null,
      openingBalanceCents: 0,
      closingBalanceCents: 1000,
    };
    const res = await app.fetch(
      new Request('http://localhost/api/accounts/statement?accountType=supplier&accountId=sup-1&format=csv'),
      { DB: {} } as any,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');
    const text = await res.text();
    expect(text).toContain('createdAt,direction');
    expect(text).toContain('Test entry');
  });
});
