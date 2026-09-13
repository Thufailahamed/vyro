export interface DedupeableSupplier {
  id: string;
  name: string;
  city?: string | null;
  verificationStatus?: string;
  activeListingsCount?: number;
}

function score(s: DedupeableSupplier): number {
  return (s.verificationStatus === 'verified' ? 10 : 0) + (s.activeListingsCount ?? 0);
}

/** Collapse duplicate facility rows (same id, or same trading name + city). */
export function dedupeSuppliers<T extends DedupeableSupplier>(suppliers: T[]): T[] {
  const byId = new Map<string, T>();
  for (const s of suppliers) byId.set(s.id, s);

  const byNameCity = new Map<string, T>();
  for (const s of byId.values()) {
    const key = `${s.name.trim().toLowerCase()}|${(s.city ?? '').trim().toLowerCase()}`;
    const prev = byNameCity.get(key);
    if (!prev || score(s) > score(prev)) byNameCity.set(key, s);
  }
  return [...byNameCity.values()];
}
