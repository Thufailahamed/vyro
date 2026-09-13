import { describe, it, expect, vi } from 'vitest';
import { queryAe } from '../../src/observability/aeClient';

describe('queryAe', () => {
  it('POSTs to Analytics Engine SQL API with bearer token', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ meta: [], data: [{ v: 0.12 }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const env = {
      CF_ACCOUNT_ID: 'acct',
      CF_API_TOKEN: 'tok',
    } as any;
    const rows = await queryAe(env, 'SELECT 1', fetchMock as any);
    expect(rows).toEqual([{ v: 0.12 }]);
    const [calledUrl, calledInit] = fetchMock.mock.calls[0];
    expect(String(calledUrl)).toContain(
      '/accounts/acct/analytics_engine/sql',
    );
    expect(calledInit.method).toBe('POST');
    expect(calledInit.headers.Authorization).toBe('Bearer tok');
  });

  it('throws on 4xx response', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response('bad sql', { status: 400 }),
    );
    const env = {
      CF_ACCOUNT_ID: 'acct',
      CF_API_TOKEN: 'tok',
    } as any;
    await expect(
      queryAe(env, 'SELECT bad', fetchMock as any),
    ).rejects.toThrow(/AE SQL 400/);
  });

  it('returns empty array on no data', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ meta: [], data: [] }), { status: 200 }),
    );
    const env = {
      CF_ACCOUNT_ID: 'acct',
      CF_API_TOKEN: 'tok',
    } as any;
    expect(await queryAe(env, 'SELECT 1', fetchMock as any)).toEqual([]);
  });

  it('throws when credentials missing', async () => {
    await expect(queryAe({}, 'SELECT 1')).rejects.toThrow(
      /CF_ACCOUNT_ID/,
    );
  });
});