import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

vi.mock('../../../src/env', () => ({
  env: { WEB_ORIGIN: 'x', ADMIN_ORIGIN: 'x', BETTER_AUTH_SECRET: 'x'.repeat(32), BETTER_AUTH_URL: 'x', ENVIRONMENT: 'test' },
}));

const state = vi.hoisted(() => ({
  messages: [] as any[],
  notifications: [] as any[],
  isBizMember: true,
  isAdmin: false,
}));

const T = vi.hoisted(() => ({
  po: {},
  biz: {},
  sup: {},
  bizMem: {},
  supMem: {},
  msg: {},
  notif: {},
}));

vi.mock('@vyro/db', () => ({
  getDb: () => {
    const makeChain = (kind: string) => {
      const exec = async () => {
        if (kind === 'po') return { id: 'po-1', businessId: 'b-1', supplierId: 's-1', poNumber: 'PO-001' };
        if (kind === 'biz') return state.isBizMember ? { id: 'b-1' } : undefined;
        if (kind === 'sup') return state.isBizMember ? { id: 's-1' } : undefined;
        if (kind === 'bizMem') return state.isBizMember ? [{ userId: 'u-1' }] : [];
        if (kind === 'supMem') return state.isBizMember ? [] : [];
        if (kind === 'msg') return state.messages;
        if (kind === 'notif') return [];
        return null;
      };
      const obj: any = {};
      obj.get = exec;
      obj.all = exec;
      obj.run = async () => {};
      obj.where = () => obj;
      obj.orderBy = () => obj;
      obj.innerJoin = () => obj;
      obj.set = () => obj;
      return obj;
    };
    return {
      select: () => ({
        from: (t: any) => {
          if (t === T.po) return makeChain('po');
          if (t === T.biz) return makeChain('biz');
          if (t === T.sup) return makeChain('sup');
          if (t === T.msg) return makeChain('msg');
          if (t === T.bizMem) return makeChain('bizMem');
          if (t === T.supMem) return makeChain('supMem');
          return makeChain('po');
        },
      }),
      insert: (t: any) => ({
        values: (v: any) => ({
          run: async () => {
            if (t === T.msg) state.messages.push(v);
            if (t === T.notif) state.notifications.push(v);
          },
        }),
      }),
      update: () => ({
        set: () => ({
          where: () => ({ run: async () => {} }),
        }),
      }),
    };
  },
}));

vi.mock('@vyro/db/schema', () => ({
  poMessages: T.msg,
  purchaseOrders: T.po,
  businesses: T.biz,
  suppliers: T.sup,
  businessMembers: T.bizMem,
  supplierMembers: T.supMem,
  notifications: T.notif,
}));

vi.mock('../../../src/middleware/session', () => ({
  session: () => async (c: any, n: any) => {
    c.set('ctx', { userId: 'u-1', isAdmin: state.isAdmin });
    await n();
  },
}));

import messagesRouter from '../../../src/modules/purchaseOrders/messages';
import { errorEnvelope } from '../../../src/lib/errors';

function buildApp() {
  const app = new Hono();
  app.onError((err, c) => {
    const env = errorEnvelope(err);
    return c.json(env.body, env.status as any);
  });
  app.route('/api/purchase-orders', messagesRouter);
  return app;
}

const env = { DB: {} as any, WEB_ORIGIN: 'x', ADMIN_ORIGIN: 'x', BETTER_AUTH_SECRET: 'x'.repeat(32), BETTER_AUTH_URL: 'x', ENVIRONMENT: 'test' } as any;

beforeEach(() => {
  state.messages = [];
  state.notifications = [];
  state.isBizMember = true;
  state.isAdmin = false;
});

describe('PO messages', () => {
  it('POST 201 inserts message + queues notification', async () => {
    const res = await buildApp().fetch(new Request('http://localhost/api/purchase-orders/po-1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ body: 'hello' }),
    }), env);
    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    expect(body.id).toBeDefined();
    expect(body.createdAt).toBeGreaterThan(0);
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0].body).toBe('hello');
  });

  it('POST 400 on empty body', async () => {
    const res = await buildApp().fetch(new Request('http://localhost/api/purchase-orders/po-1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ body: '' }),
    }), env);
    expect(res.status).toBe(400);
  });

  it('GET 200 returns ordered messages', async () => {
    state.messages = [
      { id: 'm-1', purchaseOrderId: 'po-1', senderUserId: 'u-2', body: 'a', createdAt: 1, readAt: null },
      { id: 'm-2', purchaseOrderId: 'po-1', senderUserId: 'u-1', body: 'b', createdAt: 2, readAt: null },
    ];
    const res = await buildApp().fetch(new Request('http://localhost/api/purchase-orders/po-1/messages'), env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.messages).toHaveLength(2);
  });

  it('non-participant gets 403', async () => {
    state.isBizMember = false;
    const res = await buildApp().fetch(new Request('http://localhost/api/purchase-orders/po-1/messages'), env);
    expect(res.status).toBe(403);
  });
});
