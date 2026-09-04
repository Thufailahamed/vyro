import { cn } from '@vyro/ui';

export type FlowNode = {
  label: string;
  hint?: string;
  state?: 'done' | 'active' | 'idle';
};

export function FlowLine({
  nodes,
  className,
  tone = 'ink',
}: {
  nodes: FlowNode[];
  className?: string;
  tone?: 'ink' | 'paper' | 'volt';
}) {
  const line = tone === 'paper' ? 'bg-paper/25' : tone === 'volt' ? 'bg-volt/50' : 'bg-ink/15';
  const active = tone === 'paper' ? 'bg-volt' : 'bg-ink';
  const idle = tone === 'paper' ? 'bg-paper/40' : 'bg-mist';
  const label = tone === 'paper' ? 'text-paper/70' : 'text-ink-4';
  const labelActive = tone === 'paper' ? 'text-volt' : 'text-ink';

  return (
    <ol className={cn('flex items-start w-full', className)} aria-label={nodes.map((n) => n.label).join(' to ')}>
      {nodes.map((node, i) => {
        const isActive = node.state === 'active';
        const isDone = node.state === 'done';
        return (
          <li key={node.label} className="flex-1 min-w-0 flex items-start">
            <div className="flex flex-col items-start gap-2 min-w-0 w-full">
              <div className="flex items-center w-full">
                <span
                  className={cn(
                    'relative z-[1] size-2.5 rotate-45 shrink-0',
                    isActive || isDone ? active : idle,
                    isActive && 'animate-mark-pulse',
                  )}
                />
                {i < nodes.length - 1 && (
                  <span className={cn('relative mx-2 h-px flex-1 overflow-hidden', line)}>
                    <span
                      className={cn(
                        'absolute inset-y-0 left-0 w-1/2 bg-volt',
                        (isDone || isActive) && 'w-full',
                      )}
                    />
                  </span>
                )}
              </div>
              <div className="min-w-0 pr-3">
                <div className={cn('text-[11px] font-semibold tracking-wide', isActive ? labelActive : label)}>
                  {node.label}
                </div>
                {node.hint && <div className="text-[10px] text-ink-4 mt-0.5 truncate">{node.hint}</div>}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function FlowCanvas({
  className,
  tone = 'ink',
  density = 'default',
}: {
  className?: string;
  tone?: 'ink' | 'paper';
  density?: 'default' | 'dense' | 'hero';
}) {
  const stroke = tone === 'paper' ? 'rgba(198,220,74,0.55)' : 'rgba(12,14,11,0.28)';
  const copper = 'rgba(184,122,78,0.45)';
  const fill = tone === 'paper' ? '#C6DC4A' : '#0C0E0B';
  const h = density === 'hero' ? 320 : density === 'dense' ? 88 : 140;

  return (
    <svg
      viewBox="0 0 800 320"
      className={cn('w-full pointer-events-none', className)}
      style={{ height: h }}
      aria-hidden
      preserveAspectRatio="none"
    >
      <path
        className="motion-safe:animate-flow-dash"
        d="M-20 220 C 120 220, 160 60, 320 70 S 520 250, 680 160 S 820 80, 860 80"
        fill="none"
        stroke={stroke}
        strokeWidth="1.2"
        strokeDasharray="6 10"
      />
      <path
        className="motion-safe:animate-flow-dash"
        d="M-40 80 C 140 90, 180 260, 360 250 S 560 40, 760 110"
        fill="none"
        stroke={copper}
        strokeWidth="1"
        strokeDasharray="4 12"
        style={{ animationDuration: '11s' }}
      />
      <circle cx="160" cy="118" r="3" fill={fill} />
      <circle cx="360" cy="250" r="3" fill="#B87A4E" />
      <circle cx="680" cy="160" r="3" fill="#C6DC4A" />
    </svg>
  );
}

export function FlowPathMini({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 16" className={cn('w-full h-4', className)} aria-hidden>
      <path
        d="M2 12 C 24 12, 30 4, 58 4 S 90 13, 118 8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        className="motion-safe:animate-flow-dash"
        strokeDasharray="4 6"
      />
      <circle cx="2" cy="12" r="2" fill="currentColor" />
      <circle cx="58" cy="4" r="2" fill="currentColor" />
      <circle cx="118" cy="8" r="2" fill="currentColor" />
    </svg>
  );
}
