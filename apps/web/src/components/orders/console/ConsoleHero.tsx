import { Link } from 'react-router-dom';
import { ArrowRightIcon, RefreshCwIcon, ShoppingCartIcon } from '@/components/icons';
import { Surface } from '@/components/brand/Surface';

const ghostActionClass =
  'inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-paper/15 bg-paper/[0.06] px-3.5 text-xs font-semibold text-paper/85 backdrop-blur-sm transition-all duration-200 ease-vyro hover:border-paper/30 hover:bg-paper/[0.12] hover:text-paper disabled:opacity-50';

const primaryActionClass =
  'inline-flex h-9 items-center gap-1.5 rounded-lg bg-volt px-3.5 text-xs font-bold text-ink shadow-[0_10px_28px_-10px_rgba(198,220,74,0.55)] transition-all duration-200 ease-vyro hover:-translate-y-px hover:bg-volt-glow';

function HeroStat({ label, value, tone }: { label: string; value: number; tone: 'amber' | 'volt' | 'copper' }) {
  const dot = tone === 'amber' ? 'bg-amber' : tone === 'volt' ? 'bg-volt' : 'bg-copper';
  return (
    <div className="flex items-baseline gap-2">
      <span className={`size-1.5 self-center rounded-full ${dot}`} aria-hidden />
      <span className="vyro-metric text-lg leading-none text-paper">{value}</span>
      <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-paper/45">{label}</span>
    </div>
  );
}

export function ConsoleHero({
  supplierName,
  pending,
  inFulfillment,
  inTransit,
  isFetching,
  onRefresh,
}: {
  supplierName: string;
  pending: number;
  inFulfillment: number;
  inTransit: number;
  isFetching: boolean;
  onRefresh: () => void;
}) {
  return (
    <Surface kind="ink" className="grain animate-fade-in rounded-2xl shadow-soft-lg">
      <div aria-hidden className="pointer-events-none absolute -top-32 -right-24 size-96 rounded-full bg-volt/[0.13] blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-36 -left-24 size-80 rounded-full bg-copper/[0.22] blur-3xl" />

      <div className="relative p-6 sm:p-9">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="min-w-0 max-w-2xl">
            <div className="flex items-center gap-2 text-[11px] font-mono font-semibold uppercase tracking-[0.18em] text-volt">
              <ShoppingCartIcon size={13} />
              {supplierName} / Fulfillment Desk
            </div>
            <div className="mt-3.5 flex items-start gap-3.5">
              <span
                aria-hidden
                className="mt-1.5 h-10 w-1 shrink-0 rounded-full bg-volt shadow-[0_0_18px_rgba(198,220,74,0.55)]"
              />
              <h1 className="vyro-display text-3xl text-paper sm:text-4xl">Purchase Orders Console</h1>
            </div>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-paper/55">
              Accept commercial POs, manage preparation queues, and dispatch delivery freight.
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2.5">
            <span className="inline-flex items-center gap-2 rounded-full border border-mint/25 bg-mint/10 px-3 py-1.5">
              <span className="relative flex size-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-mint opacity-60" />
                <span className="relative inline-flex size-2 rounded-full bg-mint" />
              </span>
              <span className="font-mono text-xs font-semibold text-paper">Live Sync (30s)</span>
            </span>
            <button
              type="button"
              onClick={onRefresh}
              disabled={isFetching}
              className={ghostActionClass}
              title="Refresh order queue"
            >
              <RefreshCwIcon size={13} className={isFetching ? 'animate-spin' : ''} />
              Refresh
            </button>
            <Link to="/supplier/products/new" className={primaryActionClass}>
              Publish Listing
              <ArrowRightIcon size={13} />
            </Link>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-x-8 gap-y-3 border-t border-dashed border-paper/15 pt-5">
          <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-paper/45">
            Auto-polls every 30s for new purchase orders
          </span>
          <div className="flex flex-wrap items-center gap-x-7 gap-y-2">
            <HeroStat label="Pending" value={pending} tone="amber" />
            <HeroStat label="Fulfillment" value={inFulfillment} tone="volt" />
            <HeroStat label="Transit" value={inTransit} tone="copper" />
          </div>
        </div>
      </div>
    </Surface>
  );
}
