import { describe, it, expect, vi, beforeEach } from 'vitest';

const state = vi.hoisted(() => ({
  inserted: [] as any[],
  queued: [] as any[],
  audited: [] as any[],
  usersReturned: [] as any[],
}));

vi.mock('@vyro/db', () => ({
  getDb: () => {
    const chain = {
      from: () => chain,
      where: () => chain,
      all: () => state.usersReturned,
    };
    return {
      select: () => chain,
      insert: () => ({ values: (v: any) => { state.inserted.push(v); return { run: async () => {} }; } }),
    };
  },
}));

vi.mock('@vyro/db/schema', () => ({
  notifications: {},
  users: {},
  adminAuditLogs: {},
}));

vi.mock('../../../src/lib/queue', () => ({
  queueSend: async (env: any, q: any, p: any) => { state.queued.push({ q, p }); },
}));

vi.mock('../../../src/modules/admin/lib/audit', () => ({
  auditAdminFromDb: async (opts: any) => { state.audited.push(opts); },
}));

import { notifyAdmins } from '../../../src/modules/notifications/dispatcher';

function makeEnv() {
  const chain = {
    from: () => chain,
    where: () => chain,
    all: () => state.usersReturned,
  };
  const db = {
    select: () => chain,
    insert: () => ({
      values: (v: any) => {
        // notifications table has `severity`; audit logs do not.
        if ('severity' in v) state.inserted.push(v);
        else state.audited.push({ mockKey: 'audit', v });
        return { run: async () => {} };
      },
    }),
  };
  return { DB: 'stub' } as any;
}

describe('notifyAdmins', () => {
  beforeEach(() => {
    state.inserted = [];
    state.queued = [];
    state.audited = [];
    state.usersReturned = [
      { id: 'u1', email: 'a@x' },
      { id: 'u2', email: 'b@x' },
    ];
  });

  it('inserts one row per admin in role + audits + no email enqueue for info', async () => {
    const out = await notifyAdmins(makeEnv(), {
      role: 'finance', severity: 'info', category: 'admin_alert',
      title: 't', body: 'b', sourceRef: 'refund:r1',
    });
    expect(out.recipients).toBe(2);
    expect(state.inserted).toHaveLength(2);
    expect(state.inserted[0].severity).toBe('info');
    expect(state.inserted[0].recipientRole).toBe('finance');
    expect(state.inserted[0].userId).toBe('u1');
    expect(state.inserted[0].source).toBe('admin');
    expect(state.queued).toHaveLength(0);
    expect(state.audited[0].action).toBe('notification.broadcast');
    expect(state.audited[0].metadata.recipients).toBe(2);
  });

  it('enqueues one email job per recipient for severity=critical', async () => {
    await notifyAdmins(makeEnv(), {
      role: 'ops', severity: 'critical', category: 'admin_alert',
      title: 't', body: 'b',
    });
    expect(state.queued).toHaveLength(2);
    expect(state.queued[0].q).toBe('notifications');
    expect(state.queued[0].p.kind).toBe('admin_alert_email');
    expect(state.queued[0].p.recipientUserId).toBe('u1');
  });

  it('emits audit log even with zero recipients', async () => {
    state.usersReturned = [];
    const out = await notifyAdmins(makeEnv(), {
      role: 'support', severity: 'warning', category: 'admin_alert',
      title: 't', body: 'b',
    });
    expect(out.recipients).toBe(0);
    expect(state.audited).toHaveLength(1);
    expect(state.audited[0].metadata.recipients).toBe(0);
  });
});
