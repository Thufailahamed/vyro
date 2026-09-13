export async function queryAe(
  env: { CF_ACCOUNT_ID?: string; CF_API_TOKEN?: string },
  sql: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ v: number }[]> {
  if (!env.CF_ACCOUNT_ID || !env.CF_API_TOKEN) {
    throw new Error('AE SQL requires CF_ACCOUNT_ID + CF_API_TOKEN');
  }
  const url = `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/analytics_engine/sql`;
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.CF_API_TOKEN}`,
      'Content-Type': 'text/plain',
    },
    body: sql,
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`AE SQL ${res.status}: ${txt.slice(0, 200)}`);
  }
  const body = (await res.json()) as {
    meta?: unknown[];
    data?: Record<string, unknown>[];
  };
  return (body.data ?? [])
    .map((r) => {
      const value = r.value ?? r.v ?? 0;
      return { v: Number(value) };
    })
    .filter((r) => Number.isFinite(r.v));
}