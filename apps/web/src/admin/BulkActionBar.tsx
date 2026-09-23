import { cn } from '@vyro/ui';
import { XIcon } from '@/components/icons';

export interface BulkAction {
  label: string;
  run: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

export function BulkActionBar({
  count,
  onClear,
  actions,
}: {
  count: number;
  onClear: () => void;
  actions: BulkAction[];
}) {
  if (count === 0) return null;
  return (
    <div
      role="region"
      aria-label="Bulk actions"
      className="fixed inset-x-0 bottom-5 z-40 flex justify-center px-4 pointer-events-none animate-fade-in"
    >
      <div className="pointer-events-auto flex max-w-full flex-wrap items-center gap-3 rounded-xl bg-ink px-3 py-2.5 text-paper shadow-4 sm:flex-nowrap">
        <span className="inline-flex items-center gap-2 whitespace-nowrap pl-1 text-sm font-medium">
          <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-volt px-1.5 text-xs font-semibold text-ink num-tabular">
            {count}
          </span>
          selected
        </span>
        <span className="hidden h-5 w-px bg-paper/15 sm:block" aria-hidden />
        <div className="flex flex-1 flex-wrap items-center gap-1.5">
          {actions.map((a) => (
            <button
              key={a.label}
              type="button"
              disabled={a.disabled}
              onClick={a.run}
              className={cn(
                'inline-flex h-8 items-center rounded-lg px-3 text-xs font-semibold transition-colors duration-200',
                a.destructive
                  ? 'bg-rose/20 text-rose hover:bg-rose hover:text-paper'
                  : 'bg-paper/10 text-paper hover:bg-volt hover:text-ink',
                a.disabled && 'pointer-events-none opacity-40',
              )}
            >
              {a.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear selection"
          className="flex size-8 shrink-0 items-center justify-center rounded-lg text-paper/60 transition-colors hover:bg-paper/10 hover:text-paper"
        >
          <XIcon size={15} />
        </button>
      </div>
    </div>
  );
}
