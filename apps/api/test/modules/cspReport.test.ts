import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import cspReportRouter from '../../src/modules/cspReport/routes';

const sent: any[] = [];
const queue: Queue = {
  send: vi.fn(async (msg: any) => { sent.push(msg); }),
} as unknown as Queue;

const env = {
  DB: {} as D1Database,
  PRODUCTS: {} as R2Bucket,
  CACHE: {} as KVNamespace,
  AUDIT_QUEUE: queue,
  NOTIFICATIONS_QUEUE: {} as Queue,
  ENVIRONMENT: 'test',
  WEB_ORIGIN: 'http://localhost:5173',
  ADMIN_ORIGIN: 'http://localhost:5174',
  BETTER_AUTH_SECRET: 'x'.repeat(32),
  BETTER_AUTH_URL: 'http://localhost:8787',
} as any;

function buildApp() {
  const app = new Hono();
  app.route('/api/csp-report', cspReportRouter);
  return app;
}

beforeEach(() => { sent.length = 0; vi.clearAllMocks(); });

describe('POST /api/csp-report', () => {
  it('accepts a CSP report and queues it', async () => {
    const res = await buildApp().request('/api/csp-report', {
      method: 'POST',
      headers: { 'content-type': 'application/csp-report' },
      body: JSON.stringify({ 'csp-report': { 'document-uri': 'https://vyro.app/page', 'violated-directive': 'script-src' } }),
    }, env);
    expect(res.status).toBe(204);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ action: 'csp.violation', resourceType: 'csp_report' });
  });

  it('returns 204 with empty body', async () => {
    const res = await buildApp().request('/api/csp-report', {
      method: 'POST',
      headers: { 'content-type': 'application/csp-report' },
      body: JSON.stringify({}),
    }, env);
    expect(res.status).toBe(204);
  });

  it('accepts application/json content-type too', async () => {
    const res = await buildApp().request('/api/csp-report', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ 'csp-report': {} }),
    }, env);
    expect(res.status).toBe(204);
    expect(sent).toHaveLength(1);
  });
});