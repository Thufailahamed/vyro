import type { ToolEntry } from '../hooks/useVyroAI';

export function ToolTimeline({ tools }: { tools: ToolEntry[] }) {
  if (!tools.length) return null;
  return (
    <ol className="space-y-1.5" aria-label="What VYRO is checking">
      {tools.map((t, i) => (
        <li
          key={`${t.name}-${i}`}
          className="flex items-center gap-2 text-xs text-ink-3"
          data-testid="tool-entry"
        >
          <span
            className={`size-1.5 shrink-0 rounded-full ${
              t.ok === false
                ? 'bg-rose'
                : t.durationMs !== undefined
                  ? 'bg-mint'
                  : 'bg-volt motion-safe:animate-pulse'
            }`}
          />
          <span>{t.label}</span>
        </li>
      ))}
    </ol>
  );
}