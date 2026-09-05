import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

const lines: string[] = [];
beforeEach(() => {
  lines.length = 0;
  vi.spyOn(console, 'log').mockImplementation((l) => lines.push(String(l)));
});

import { accessLog } from '../../src/middleware/accessLog';

describe('accessLog middleware', () => {
  it('logs one line per request with method/path/status/latencyMs/requestId', async () => {
    const app = new Hono();
    app.use('*', (c, n) => { c.set('requestId', 'req-123'); return n(); });
    app.use('*', accessLog());
    app.get('/x', (c) => c.json({ ok: true }, 200));
    await app.fetch(new Request('http://localhost/x'));
    expect(lines.length).toBeGreaterThanOrEqual(1);
    const line = JSON.parse(lines[lines.length - 1]!);
    expect(line.msg).toBe('http.access');
    expect(line.method).toBe('GET');
    expect(line.path).toBe('/x');
    expect(line.status).toBe(200);
    expect(typeof line.latencyMs).toBe('number');
    expect(line.requestId).toBe('req-123');
  });
});
