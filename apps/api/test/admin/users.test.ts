import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

vi.mock('../../src/env', () => ({
  env: {
    WEB_ORIGIN: 'http://localhost:5173',
    ADMIN_ORIGIN: 'http://localhost:5174',
    BETTER_AUTH_SECRET: 'x'.repeat(32),
    BETTER_AUTH_URL: 'http://localhost:8787',
    ENVIRONMENT: 'test',
  },
}));

const state = vi.hoisted(() => ({
  users: new Map<string, any>(),
  audit: [] as any[],
  respond: [] as any[],
  nextSelectCall: 0,
}));

vi.mock('@vyro/db', () => ({
  getDb: () => ({
    select: () => ({
      from: (_table: any) => {
        const queue: any[] = [];
        return {
          where: (_cond: any) => {
            queue.push(state.respond.shift() ?? []);
            return {
              orderBy: (_o: any) => ({
                limit: (_l: number) => ({
                  all: async () => queue.pop() ?? [],
                }),
              }),
              all: async () => queue.pop() ?? [],
            };
          },
          all: async () => [],
        };
      },
    }),
    update: (_table: any) => ({
      set: (vals: any) => ({
        where: (_cond: any) => ({
          run: async () => {
            for (const u of state.users.values()) {
              Object.assign(u, vals);
            }
          },
        }),
      }),
    }),
    delete: (_table: any) => ({
      where: (_cond: any) => ({ run: async () => {} }),
    }),
    insert: (_table: any) => ({
      values: (vals: any) => ({
        run: async () => {
          state.audit.push(vals);
        },
      }),
    }),
  }),
}));

vi.mock('../../src/middleware/session', () => ({
  session: () => async (c: any, next: any) => {
    c.set('ctx', { userId: 'admin-1', isAdmin: true });
    await next();
  },
}));

vi.mock('../../src/middleware/rbac', () => ({
  requireRole: () => async (_c: any, next: any) => {
    await next();
  },
}));

import adminUsersRouter from '../../src/modules/admin/users';
import { errorEnvelope } from '../../src/lib/errors';

function buildApp() {
  const app = new Hono();
  app.onError((err, c) => {
    const env = errorEnvelope(err);
    return c.json(env.body, env.status as any);
  });
  app.route('/api/admin/users', adminUsersRouter);
  return app;
}

describe('admin users endpoints', () => {
  beforeEach(() => {
    state.users.clear();
    state.audit.length = 0;
    state.respond = [];
    state.users.set('u-1', {
      id: 'u-1',
      email: 'a@x.example',
      name: 'Alice',
      phone: null,
      isPlatformAdmin: 0,
      status: 'active',
      createdAt: 1000,
    });
  });

  const env = {
    DB: {} as any,
    WEB_ORIGIN: 'http://localhost:5173',
    ADMIN_ORIGIN: 'http://localhost:5174',
    BETTER_AUTH_SECRET: 'x'.repeat(32),
    BETTER_AUTH_URL: 'http://localhost:8787',
    ENVIRONMENT: 'test',
  } as any;

  it('GET / returns user rows', async () => {
    state.respond = [[...state.users.values()], [], []];
    const app = buildApp();
    const res = await app.fetch(new Request('http://localhost/api/admin/users'), env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.items).toHaveLength(1);
    expect(body.items[0].email).toBe('a@x.example');
  });

  it('POST /:id/suspend flips status + writes audit', async () => {
    const app = buildApp();
    const res = await app.fetch(
      new Request('http://localhost/api/admin/users/u-1/suspend', { method: 'POST' }),
      env,
    );
    if (res.status !== 200) console.error('suspend body:', await res.clone().text());
    expect(res.status).toBe(200);
    expect(state.users.get('u-1').status).toBe('suspended');
    expect(state.audit[0].action).toBe('user.suspend');
  });

  it('POST /:id/unsuspend flips status back', async () => {
    state.users.get('u-1').status = 'suspended';
    const app = buildApp();
    const res = await app.fetch(
      new Request('http://localhost/api/admin/users/u-1/unsuspend', { method: 'POST' }),
      env,
    );
    expect(res.status).toBe(200);
    expect(state.users.get('u-1').status).toBe('active');
  });
});
