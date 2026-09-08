import type { ToolEntry } from '../hooks/useVyroAI';

export function ToolTimeline({ tools }: { tools: ToolEntry[] }) {
  if (!tools.length) return null;
  return (
    <ol className="mb-3 space-y-1 border-l border-stone-200 pl-3">
      {tools.map((t, i) => (
        <li
          key={`${t.name}-${i}`}
          className="flex items-baseline gap-2 text-xs text-stone-500"
          data-testid="tool-entry"
        >
          <span
            className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${
              t.ok === false ? 'bg-rose-400' : t.durationMs !== undefined ? 'bg-emerald-500' : 'bg-volt animate-pulse'
            }`}
          />
          <span className="font-medium text-stone-700">{t.label}</span>
          {t.durationMs !== undefined && (
            <span className="ml-auto font-mono tabular-nums text-stone-400">{t.durationMs}ms</span>
          )}
        </li>
      ))}
    </ol>
  );
}