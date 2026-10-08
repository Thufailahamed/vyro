import { Input } from '@/components/ui';
import { SearchIcon } from '@/components/icons';
import type { QueueTab } from './types';

const TABS: Array<{ id: QueueTab; label: string }> = [
  { id: 'all', label: 'All Orders' },
  { id: 'incoming', label: 'Incoming' },
  { id: 'fulfillment', label: 'In Fulfillment' },
  { id: 'completed', label: 'Completed' },
];

export function QueueToolbar({
  tab,
  counts,
  onTabChange,
  searchQuery,
  onSearchChange,
}: {
  tab: QueueTab;
  counts: Record<QueueTab, number>;
  onTabChange: (tab: QueueTab) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}) {
  return (
    <div
      className="flex animate-fade-in flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center"
      style={{ animationDelay: '160ms' }}
    >
      <div className="inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-full border border-line bg-paper p-1 shadow-soft-sm">
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onTabChange(t.id)}
              className={`flex h-8 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-xs font-medium transition-all duration-200 ease-vyro ${
                active ? 'bg-ink text-paper shadow-sm' : 'text-ink-3 hover:bg-ink/[0.04] hover:text-ink'
              }`}
            >
              {t.label}
              <span
                className={`rounded-full px-1.5 py-0.5 font-mono text-[10px] font-bold leading-none ${
                  active ? 'bg-volt text-ink' : 'bg-ink/[0.06] text-ink-4'
                }`}
              >
                {counts[t.id]}
              </span>
            </button>
          );
        })}
      </div>

      <div className="relative w-full sm:w-80">
        <SearchIcon
          size={14}
          className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-4"
        />
        <Input
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search PO#, city, district…"
          className="h-10 pl-9 text-xs"
        />
      </div>
    </div>
  );
}
