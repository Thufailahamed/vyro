#!/usr/bin/env node
/**
 * Load-test the observability sweep by hammering /api/metrics/web with
 * realistic RUM payloads. Confirms the endpoint stays under 50ms p95 over a
 * burst of N requests.
 *
 * Usage:
 *   node scripts/load/sweep.js [BASE] [N]
 *
 * Defaults: BASE=http://localhost:8787, N=200
 */
import http from 'node:http';

const BASE = process.argv[2] || 'http://localhost:8787';
const N = Number(process.argv[3] || 200);
const url = new URL(`${BASE}/api/metrics/web`);

const samples = [
  { route: '/', lcp_ms: 1234, inp_ms: 110, cls: 0.05 },
  { route: '/search', lcp_ms: 2100, inp_ms: 220, cls: 0.02 },
  { route: '/cart', lcp_ms: 980, inp_ms: 60, cls: 0.0 },
  { route: '/products/123', lcp_ms: 1700, inp_ms: 140, cls: 0.01 },
  { route: '/checkout', lcp_ms: 2900, inp_ms: 380, cls: 0.1 },
];

function post(payload) {
  return new Promise((resolve, reject) => {
    const t0 = process.hrtime.bigint();
    const body = JSON.stringify(payload);
    const req = http.request(
      {
        method: 'POST',
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(body),
        },
      },
      (res) => {
        const t1 = process.hrtime.bigint();
        res.resume();
        res.on('end', () => {
          resolve({
            status: res.statusCode,
            ms: Number(t1 - t0) / 1e6,
          });
        });
      },
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function pct(arr, p) {
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

const durations = [];
let ok = 0;
const startedAt = Date.now();

// Run all requests sequentially to keep the local wrangler / dev server
// honest about cold-start vs warm throughput. A real load test would
// parallelize — see scripts/load/parallel.js (TODO if needed).
for (let i = 0; i < N; i++) {
  const payload = samples[i % samples.length];
  try {
    const r = await post(payload);
    durations.push(r.ms);
    if (r.status === 204) ok++;
  } catch (err) {
    console.error('request error:', err.message);
  }
}

const elapsed = (Date.now() - startedAt) / 1000;
const summary = {
  total: N,
  ok,
  failed: N - ok,
  elapsedSec: Number(elapsed.toFixed(2)),
  ms_p50: Number(pct(durations, 0.5).toFixed(1)),
  ms_p95: Number(pct(durations, 0.95).toFixed(1)),
  ms_p99: Number(pct(durations, 0.99).toFixed(1)),
  ms_max: Number(pct(durations, 1).toFixed(1)),
  rps: Number((N / elapsed).toFixed(1)),
};
console.log(JSON.stringify(summary, null, 2));

if (ok !== N) {
  console.error(`FAIL: ${N - ok} requests returned non-204`);
  process.exit(1);
}
if (summary.ms_p95 > 50) {
  console.error(`FAIL: p95 ${summary.ms_p95}ms exceeds 50ms budget`);
  process.exit(2);
}
console.log('ok: all requests 204, p95 within budget');
