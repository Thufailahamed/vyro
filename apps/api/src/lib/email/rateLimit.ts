import type { Env } from '../../env';

export const MAX_PER_HOUR = 5;
const WINDOW_SECONDS = 60 * 60;

function keyFor(to: string): string {
  return `rl:email:${to.toLowerCase()}`;
}

export async function checkRecipient(
  env: Env,
  to: string,
): Promise<{ allowed: boolean; retryAfter: number }> {
  const kv = env.CACHE;
  const key = keyFor(to);
  const current = await kv.get(key);
  const count = current ? parseInt(current, 10) || 0 : 0;
  if (count >= MAX_PER_HOUR) {
    // KV doesn't expose remaining TTL — return a conservative 60s so caller
    // can use it as a minimum backoff when re-queueing.
    return { allowed: false, retryAfter: 60 };
  }
  await kv.put(key, String(count + 1), { expirationTtl: WINDOW_SECONDS });
  return { allowed: true, retryAfter: 0 };
}
