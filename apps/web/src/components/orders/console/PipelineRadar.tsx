import { Surface } from '@/components/brand/Surface';

export function PipelineRadar({
  incoming,
  accepted,
  preparing,
  dispatched,
  total,
}: {
  incoming: number;
  accepted: number;
  preparing: number;
  dispatched: number;
  total: number;
}) {
  const stages: Array<{ label: string; sub: string; count: number; active: string; ping: string; glow: string }> = [
    {
      label: 'Incoming',
      sub: 'Awaiting depot review',
      count: incoming,
      active: 'border-amber/50 bg-amber text-paper',
      ping: 'bg-amber/50',
      glow: 'shadow-[0_0_16px_rgba(196,132,58,0.45)]',
    },
    {
      label: 'Accepted',
      sub: 'Confirmed & queued',
      count: accepted,
      active: 'border-mint/50 bg-mint text-paper',
      ping: 'bg-mint/50',
      glow: 'shadow-[0_0_16px_rgba(61,139,110,0.45)]',
    },
    {
      label: 'Preparing',
      sub: 'Packaging & loading',
      count: preparing,
      active: 'border-volt-deep/40 bg-volt-deep text-paper',
      ping: 'bg-volt/60',
      glow: 'shadow-[0_0_16px_rgba(122,143,34,0.5)]',
    },
    {
      label: 'Dispatched',
      sub: 'With freight carrier',
      count: dispatched,
      active: 'border-copper/50 bg-copper text-paper',
      ping: 'bg-copper/50',
      glow: 'shadow-[0_0_16px_rgba(184,122,78,0.45)]',
    },
  ];

  // Progress along the connector = furthest stage with work in it.
  const lastActive = stages.reduce((acc, s, i) => (s.count > 0 ? i : acc), -1);
  const progress = lastActive > 0 ? (lastActive / (stages.length - 1)) * 100 : 0;

  return (
    <Surface kind="elevated" className="animate-fade-in p-6" style={{ animationDelay: '120ms' }}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3.5">
        <div className="flex items-center gap-2.5 text-xs font-mono font-bold uppercase tracking-[0.14em] text-ink">
          <span className="relative flex size-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-volt opacity-70" />
            <span className="relative inline-flex size-2 rounded-full bg-volt" />
          </span>
          Wholesale Fulfillment Stage Radar
        </div>
        <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-4">
          {total} Total Orders Logged
        </span>
      </div>

      <div className="relative mt-6 grid grid-cols-2 gap-y-7 md:grid-cols-4">
        {/* Connector track (desktop) — spans node center to node center */}
        <div aria-hidden className="absolute top-[18px] right-[12.5%] left-[12.5%] hidden md:block">
          <div className="h-px w-full bg-ink/10" />
          {progress > 0 && (
            <div
              className="absolute inset-y-0 left-0 h-px bg-gradient-to-r from-amber via-volt-deep to-copper transition-all duration-480 ease-vyro"
              style={{ width: `${progress}%` }}
            />
          )}
        </div>

        {stages.map((s, i) => {
          const isActive = s.count > 0;
          return (
            <div key={s.label} className="relative flex flex-col items-center text-center">
              <div
                className={`relative z-10 flex size-9 items-center justify-center rounded-full border font-mono text-xs font-bold transition-all duration-240 ease-vyro ${
                  isActive ? `${s.active} ${s.glow}` : 'border-line bg-paper text-ink-4'
                }`}
              >
                {isActive && (
                  <span aria-hidden className={`absolute inset-0 animate-ping rounded-full ${s.ping}`} />
                )}
                <span className="relative">{i + 1}</span>
              </div>
              <div className="mt-3 text-[10px] font-mono font-bold uppercase tracking-[0.16em] text-ink-4">
                {s.label}
              </div>
              <div className="vyro-metric mt-1 text-2xl leading-none text-ink">{s.count}</div>
              <div className="mt-1 text-[11px] text-ink-4">{s.sub}</div>
            </div>
          );
        })}
      </div>
    </Surface>
  );
}
