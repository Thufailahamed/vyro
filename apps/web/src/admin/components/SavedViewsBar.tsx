import { useState } from 'react';
import { useSavedViews } from '../useSavedViews';
import type { SavedViewPage } from '../lib/savedViews';
import { Button } from '@/components/ui';

export function SavedViewsBar({
  page,
  currentFilters,
  onApply,
}: {
  page: SavedViewPage;
  currentFilters: Record<string, unknown>;
  onApply: (filters: Record<string, unknown>) => void;
}) {
  const { views, save, remove } = useSavedViews(page);
  const [name, setName] = useState('');

  function onSave() {
    const trimmed = name.trim();
    if (!trimmed) return;
    save(trimmed, currentFilters);
    setName('');
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs text-ink-500">Saved views:</span>
      {views.length === 0 ? (
        <span className="text-xs text-ink-500">none</span>
      ) : (
        views.map((v) => (
          <span
            key={v.id}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-ink/20 text-xs"
          >
            <button onClick={() => onApply(v.filters)} className="hover:text-volt">
              {v.name}
            </button>
            <button
              onClick={() => remove(v.id)}
              aria-label={`Delete saved view ${v.name}`}
              className="text-ink-500 hover:text-ink"
            >
              ×
            </button>
          </span>
        ))
      )}
      <div className="flex items-center gap-1 ml-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Save current as…"
          className="text-xs border border-ink/20 rounded px-1 py-0.5 w-32"
        />
        <Button size="sm" variant="ghost" onClick={onSave} disabled={!name.trim()}>
          Save
        </Button>
      </div>
    </div>
  );
}
