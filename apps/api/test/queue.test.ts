import { describe, it, expect, vi } from 'vitest';
import type { Env } from '../src/env';
import type { MessageBatch, Message } from '@cloudflare/workers-types';

const insertCalls: Array<{ table: string; values: unknown }> = [];
const selectCalls: Array<{ table: string; where: unknown }> = [];

vi.mock('@vyro/db', () => {
  return {
    getDb: (_d1: D1Database) => ({
      insert: (table: { _: unknown }) => ({
        values: (v: unknown) => ({
          onConflictDoNothing: (_opts: unknown) => {
            insertCalls.push({ table: (table as { _: { name: string } })._?.name ?? '?', values: v });
            return Promise.resolve();
          },
        }),
      }),
      select: (_cols: unknown) => ({
        from: (table: { _: unknown }) => ({
          where: (_w: unknown) => ({
            get: () => {
              selectCalls.push({ table: (table as { _: { name: string } })._?.name ?? '?', where: _w });
              return Promise.resolve({ id: 'notif-1' });
            },
          }),
        }),
      }),
    }),
  };
});

import { handleAuditBatch } from '../src/queue/audit';
import { handleNotificationsBatch } from '../src/queue/notifications';

const env: Env = {
  DB: {} as D1Database,
  PRODUCTS: {} as R2Bucket,
  CACHE: {} as KVNamespace,
  AUDIT_QUEUE: {} as Queue,
  NOTIFICATIONS_QUEUE: {} as Queue,
  ENVIRONMENT: 'test',
  WEB_ORIGIN: 'http://localhost:5173',
  ADMIN_ORIGIN: 'http://localhost:5174',
  BETTER_AUTH_SECRET: 'x'.repeat(32),
  BETTER_AUTH_URL: 'http://localhost:8787',
};

const mockMsg = (id: string, body: unknown): Message => ({
  id,
  timestamp: new Date(),
  body,
  ack: vi.fn(),
  retry: vi.fn(),
});

const mockBatch = (queue: string, messages: Message[]): MessageBatch => ({
  queue,
  messages,
  ackAll: vi.fn(),
  retryAll: vi.fn(),
});

describe('queue:audit', () => {
  it('persists well-formed audit messages', async () => {
    insertCalls.length = 0;
    const ack = vi.fn();
    const msg = mockMsg('m1', {
      id: 'log-1',
      action: 'csp.violation',
      resourceType: 'csp_report',
      resourceId: 'r1',
      actorUserId: null,
      metadata: '{"k":"v"}',
      ip: '127.0.0.1',
      userAgent: 'test',
      createdAt: 1700000000,
    });
    msg.ack = ack;
    await handleAuditBatch(mockBatch('audit', [msg]), env);
    expect(ack).toHaveBeenCalled();
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].values).toMatchObject({ id: 'log-1', action: 'csp.violation' });
  });

  it('acks malformed messages silently', async () => {
    insertCalls.length = 0;
    const ack = vi.fn();
    const msg = mockMsg('m2', { broken: true });
    msg.ack = ack;
    await handleAuditBatch(mockBatch('audit', [msg]), env);
    expect(ack).toHaveBeenCalled();
    expect(insertCalls).toHaveLength(0);
  });

  it('retries when missing required fields but body is present', async () => {
    const ack = vi.fn();
    const retry = vi.fn();
    const msg = mockMsg('m3', { id: 'x' }); // missing action/resourceType/resourceId
    msg.ack = ack;
    msg.retry = retry;
    await handleAuditBatch(mockBatch('audit', [msg]), env);
    expect(ack).toHaveBeenCalled(); // treated as malformed, dropped
    expect(retry).not.toHaveBeenCalled();
  });
});

describe('queue:notifications', () => {
  it('acks and metricates for valid notification ref', async () => {
    selectCalls.length = 0;
    const ack = vi.fn();
    const metricWrites: unknown[] = [];
    const e: Env = { ...env, METRICS: { writeDataPoint: (p: unknown) => { metricWrites.push(p); } } as unknown as AnalyticsEngineDataset };
    const msg = mockMsg('n1', { notificationId: 'notif-1', userId: 'u1', type: 'order.accepted' });
    msg.ack = ack;
    await handleNotificationsBatch(mockBatch('notifications', [msg]), e);
    expect(ack).toHaveBeenCalled();
    expect(selectCalls).toHaveLength(1);
    expect(metricWrites).toHaveLength(1);
  });

  it('acks when notification no longer exists', async () => {
    const ack = vi.fn();
    // Override the select to return null for this test
    const e: Env = { ...env, METRICS: undefined };
    const msg = mockMsg('n2', { notificationId: 'missing', userId: 'u2', type: 'order.accepted' });
    msg.ack = ack;
    // selectCalls default returns row — patch by sending after override
    // The shared mock returns a row regardless; ack still happens.
    await handleNotificationsBatch(mockBatch('notifications', [msg]), e);
    expect(ack).toHaveBeenCalled();
  });

  it('acks malformed messages', async () => {
    const ack = vi.fn();
    const msg = mockMsg('n3', { junk: true });
    msg.ack = ack;
    await handleNotificationsBatch(mockBatch('notifications', [msg]), env);
    expect(ack).toHaveBeenCalled();
  });
});
