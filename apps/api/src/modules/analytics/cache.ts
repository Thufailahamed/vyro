type Entry<T> = { value: T; expiresAt: number };
const store = new Map<string, Entry<unknown>>();

export function clearCache(): void {
  store.clear();
}

export async function cached<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  const hit = store.get(key) as Entry<T> | undefined;
  if (hit && hit.expiresAt > now) return hit.value;
  const value = await loader();
  store.set(key, { value, expiresAt: now + ttlMs });
  if (store.size > 256) {
    const oldestKey = store.keys().next().value;
    if (oldestKey !== undefined) store.delete(oldestKey);
  }
  return value;
}
