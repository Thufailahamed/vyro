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

export interface SupplierTenure {
  supplierSinceYear: number | null;
  supplierSinceDate: string | null;
  supplierMemberYears: number | null;
}

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

export function getSupplierTenure(createdAt: unknown, now: number = Date.now()): SupplierTenure {
  const nulls: SupplierTenure = { supplierSinceYear: null, supplierSinceDate: null, supplierMemberYears: null };
  if (typeof createdAt !== 'number' || !Number.isFinite(createdAt)) return nulls;
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return nulls;
  if (createdAt > now) return nulls;
  return {
    supplierSinceYear: d.getUTCFullYear(),
    supplierSinceDate: d.toISOString(),
    supplierMemberYears: Math.max(0, Math.floor((now - createdAt) / YEAR_MS)),
  };
}
