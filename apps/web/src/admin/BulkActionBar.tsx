import { cn } from '@vyro/ui';

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
      className="fixed bottom-0 inset-x-0 z-40 bg-void text-paper px-4 py-3 flex items-center gap-3 border-t border-paper/20 shadow-lg"
    >
      <span className="text-sm font-mono whitespace-nowrap">{count} selected</span>
      <div className="flex-1 flex gap-2 flex-wrap">
        {actions.map((a) => (
          <button
            key={a.label}
            type="button"
            disabled={a.disabled}
            onClick={a.run}
            className={cn(
              'px-3 py-1 text-xs uppercase tracking-wide border rounded',
              a.destructive
                ? 'border-rose text-rose hover:bg-rose hover:text-paper'
                : 'border-paper/40 text-paper hover:border-volt hover:text-volt',
              a.disabled && 'opacity-40 cursor-not-allowed',
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
        className="text-paper/60 hover:text-paper text-sm"
      >
        ✕
      </button>
    </div>
  );
}
