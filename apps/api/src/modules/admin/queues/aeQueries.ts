import type { Env } from '../../../env';
import type { QueueName } from '../../../lib/queueInstrument';

export type QueueHealth = {
  queue: QueueName;
  backlog: number;
  ackLast1h: number;
  errLast1h: number;
  p50Ms: number;
  p95Ms: number;
};

export type ThroughputPoint = { ts: number; queue: QueueName; acks: number };

const QUEUES: QueueName[] = ['audit', 'notifications', 'invoices'];

async function runSql<T = any>(env: Env, sql: string, fetchImpl: typeof fetch): Promise<T[]> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/analytics_engine/sql`;
  const dataset = (env.METRICS as unknown as { dataset?: string })?.dataset ?? 'vyro_metrics';
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.CF_API_TOKEN}`,
      'Content-Type': 'text/plain',
    },
    body: `SELECT * FROM ${dataset} WHERE ${sql}`,
  });
  if (!res.ok) throw new Error(`AE SQL ${res.status}`);
  const json = (await res.json()) as { data: T[] };
  return json.data ?? [];
}

export async function queryQueueHealth(env: Env, fetchImpl: typeof fetch = fetch): Promise<QueueHealth[]> {
  const sql = `
    timestamp > NOW() - INTERVAL '1' HOUR
    AND blob1 LIKE 'queue.%'
    AND blob2 IN ('audit','notifications','invoices')
    GROUP BY blob2, blob3
    SELECT
      blob2 AS queue,
      blob3 AS event_type,
      count() AS cnt,
      quantile(double1, 0.5) AS p50,
      quantile(double1, 0.95) AS p95
  `;
  const rows = await runSql<{ queue: QueueName; event_type: string; cnt: number; p50?: number; p95?: number }>(env, sql, fetchImpl);
  const out: Record<QueueName, QueueHealth> = {
    audit: { queue: 'audit', backlog: 0, ackLast1h: 0, errLast1h: 0, p50Ms: 0, p95Ms: 0 },
    notifications: { queue: 'notifications', backlog: 0, ackLast1h: 0, errLast1h: 0, p50Ms: 0, p95Ms: 0 },
    invoices: { queue: 'invoices', backlog: 0, ackLast1h: 0, errLast1h: 0, p50Ms: 0, p95Ms: 0 },
  };
  for (const r of rows) {
    const q = out[r.queue];
    if (!q) continue;
    if (r.event_type === 'ack') {
      q.ackLast1h = r.cnt;
      q.p50Ms = Math.round(r.p50 ?? 0);
      q.p95Ms = Math.round(r.p95 ?? 0);
    } else if (r.event_type === 'retry' || r.event_type === 'dlq') {
      q.errLast1h += r.cnt;
    }
  }
  return QUEUES.map((q) => out[q]);
}

export async function queryThroughput(env: Env, fetchImpl: typeof fetch = fetch): Promise<ThroughputPoint[]> {
  const sql = `
    timestamp > NOW() - INTERVAL '24' HOUR
    AND blob3 = 'ack'
    GROUP BY bucket, blob2
    SELECT
      floor(timestamp / 300000) * 300000 AS bucket,
      blob2 AS queue,
      count() AS cnt
  `;
  const rows = await runSql<{ bucket: number; queue: QueueName; cnt: number }>(env, sql, fetchImpl);
  return rows.map((r) => ({ ts: r.bucket, queue: r.queue, acks: r.cnt }));
}