import type { ReactNode } from 'react';
import { Badge } from '@/components/ui';
import { MetricNumber } from '@/components/brand/Surface';
import { ClockIcon, ShoppingCartIcon, TrendingUpIcon, TruckIcon } from '@/components/icons';
import { formatCompactLKR, formatLKR } from '@/lib/format';

const cardHover =
  'transition-all duration-240 ease-vyro hover:-translate-y-0.5 hover:shadow-soft-md';

function KpiCard({
  icon,
  chip,
  label,
  value,
  sub,
}: {
  icon: ReactNode;
  chip: ReactNode;
  label: string;
  value: ReactNode;
  sub: string;
}) {
  return (
    <div className={`vyro-surface p-5 ${cardHover}`}>
      <div className="flex items-center justify-between">
        {icon}
        {chip}
      </div>
      <div className="mt-4">
        <div className="text-[10px] font-mono font-bold uppercase tracking-[0.16em] text-ink-4">{label}</div>
        <MetricNumber size="md" className="mt-1.5 text-ink">
          {value}
        </MetricNumber>
        <div className="mt-1.5 text-xs text-ink-4">{sub}</div>
      </div>
    </div>
  );
}

function IconChip({ tint, children }: { tint: 'copper' | 'ink' | 'volt'; children: ReactNode }) {
  const styles = {
    copper: 'bg-copper/15 text-copper',
    ink: 'bg-ink/[0.07] text-ink',
    volt: 'bg-volt/25 text-volt-deep',
  }[tint];
  return (
    <div className={`flex size-9 items-center justify-center rounded-lg ${styles}`}>{children}</div>
  );
}

const quietChip = 'font-mono text-[10px] uppercase tracking-[0.12em] text-ink-4';

export function KpiMatrix({
  pending,
  inFulfillment,
  inTransit,
  revenueCents,
}: {
  pending: number;
  inFulfillment: number;
  inTransit: number;
  revenueCents: number;
}) {
  return (
    <div
      className="grid animate-fade-in grid-cols-2 gap-4 lg:grid-cols-4"
      style={{ animationDelay: '60ms' }}
    >
      <KpiCard
        icon={
          <IconChip tint="copper">
            <ShoppingCartIcon size={15} />
          </IconChip>
        }
        chip={
          pending > 0 ? (
            <Badge variant="warning" className="font-mono">
              <span className="size-1 animate-pulse rounded-full bg-amber" />
              {pending} Action Req.
            </Badge>
          ) : (
            <span className="flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-mint">
              <span className="size-1 rounded-full bg-mint" />
              Queue Clear
            </span>
          )
        }
        label="Incoming POs"
        value={pending}
        sub="Awaiting acceptance"
      />

      <KpiCard
        icon={
          <IconChip tint="ink">
            <ClockIcon size={15} />
          </IconChip>
        }
        chip={<span className={quietChip}>Preparing</span>}
        label="In Fulfillment"
        value={inFulfillment}
        sub="Pack & stage at depot"
      />

      <KpiCard
        icon={
          <IconChip tint="volt">
            <TruckIcon size={15} />
          </IconChip>
        }
        chip={<span className={quietChip}>In Transit</span>}
        label="Out for Delivery"
        value={inTransit}
        sub="En route with driver"
      />

      {/* Focal card: inverted ink surface for the money metric */}
      <div
        className={`relative overflow-hidden rounded-xl bg-ink p-5 text-paper shadow-soft-md ${cardHover} hover:shadow-soft-lg`}
      >
        <div aria-hidden className="pointer-events-none absolute -top-16 -right-16 size-44 rounded-full bg-volt/[0.14] blur-2xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-20 -left-14 size-40 rounded-full bg-copper/20 blur-2xl" />
        <div className="relative">
          <div className="flex items-center justify-between">
            <div className="flex size-9 items-center justify-center rounded-lg bg-volt/15 text-volt">
              <TrendingUpIcon size={15} />
            </div>
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-paper/50">Total Net</span>
          </div>
          <div className="mt-4">
            <div className="text-[10px] font-mono font-bold uppercase tracking-[0.16em] text-paper/50">
              Order Book Revenue
            </div>
            <MetricNumber size="md" className="mt-1.5 text-volt">
              {formatCompactLKR(revenueCents)}
            </MetricNumber>
            <div className="mt-1.5 truncate font-mono text-[11px] text-paper/45">{formatLKR(revenueCents)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
