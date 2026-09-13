export function generateSlug(city: string | null, name: string | null): string {
  const raw = `${city ?? ''} ${name ?? ''}`.toLowerCase();
  const cleaned = raw
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  return cleaned;
}

export function ensureUniqueSlug(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  let counter = 2;
  while (counter < 10000) {
    const suffix = `-${counter}`;
    const candidate = `${base}`.slice(0, 60 - suffix.length) + suffix;
    if (!taken.has(candidate)) return candidate;
    counter++;
  }
  return `${base}-${Date.now()}`;
}
