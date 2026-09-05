import { useCallback, useEffect, useState } from 'react';
import {
  list as listViews,
  save as saveView,
  remove as removeView,
  type SavedView,
  type SavedViewPage,
} from './lib/savedViews';

export function useSavedViews(page: SavedViewPage) {
  const [views, setViews] = useState<SavedView[]>([]);

  useEffect(() => {
    setViews(listViews(page));
  }, [page]);

  const save = useCallback(
    (name: string, filters: Record<string, unknown>) => {
      const v = saveView(page, name, filters);
      setViews((cur) => [...cur, v]);
      return v;
    },
    [page],
  );

  const remove = useCallback(
    (id: string) => {
      removeView(page, id);
      setViews((cur) => cur.filter((v) => v.id !== id));
    },
    [page],
  );

  return { views, save, remove };
}
