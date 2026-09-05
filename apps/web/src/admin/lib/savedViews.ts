export type SavedView = {
  id: string;
  name: string;
  filters: Record<string, unknown>;
  createdAt: number;
};

export type SavedViewPage = 'refunds' | 'payouts' | 'abuse' | 'kyc' | 'sessions' | 'chargebacks';

function key(page: SavedViewPage): string {
  return `vyro.admin.savedViews.${page}`;
}

export function list(page: SavedViewPage): SavedView[] {
  if (typeof localStorage === 'undefined') return [];
  const raw = localStorage.getItem(key(page));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SavedView[]) : [];
  } catch {
    return [];
  }
}

export function save(page: SavedViewPage, name: string, filters: Record<string, unknown>): SavedView {
  const current = list(page);
  const view: SavedView = {
    id: crypto.randomUUID(),
    name,
    filters,
    createdAt: Date.now(),
  };
  const next = [...current, view];
  localStorage.setItem(key(page), JSON.stringify(next));
  return view;
}

export function remove(page: SavedViewPage, id: string): void {
  const next = list(page).filter((v) => v.id !== id);
  localStorage.setItem(key(page), JSON.stringify(next));
}

export function clear(page: SavedViewPage): void {
  localStorage.removeItem(key(page));
}
