// Sanctions service. KV-cached list of sanctioned country codes.
// Source: OFAC SDN + UN Consolidated (manual refresh via cron; see sanctionsRefresh.ts).
// Seed list covers only the most-restrictive jurisdictions; comprehensive
// weekly refresh runs in cron.

const KV_KEY = 'sanctions:list';
const TTL_SECONDS = 604800; // 7 days

const SEED: string[] = ['RU', 'IR', 'KP', 'SY', 'CU'];

export type SanctionsFetcher = () => Promise<string[]>;

export async function getSanctionedList(env: Env): Promise<string[]> {
  const cached = await env.CROSS_BORDER_KV.get(KV_KEY);
  if (cached) return JSON.parse(cached) as string[];
  await env.CROSS_BORDER_KV.put(KV_KEY, JSON.stringify(SEED), { expirationTtl: TTL_SECONDS });
  return SEED;
}

export async function isCountrySanctioned(code: string, env: Env): Promise<boolean> {
  if (!code) return false;
  const list = await getSanctionedList(env);
  return list.includes(code.toUpperCase());
}

export async function refreshSanctionsList(env: Env, fetcher: SanctionsFetcher = defaultFetcher): Promise<number> {
  const list = await fetcher();
  await env.CROSS_BORDER_KV.put(KV_KEY, JSON.stringify(list), { expirationTtl: TTL_SECONDS });
  return list.length;
}

// Default fetcher: in v1 returns the seed list. Production refresh fetches
// OFAC SDN CSV + UN consolidated XML, extracts country codes, dedupes.
// Implementation deferred to task 10 (sanctionsRefresh cron) once the
// shape is finalized.
async function defaultFetcher(): Promise<string[]> {
  return SEED;
}