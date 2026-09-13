import { Link } from 'react-router-dom';
import type { ComponentEnvelope, Action } from '@vyro/ai';
import { cn } from '@vyro/ui';
import { ConfirmationPanel } from './ConfirmationPanel';
import { displayChipLabel } from '../displayChipLabel';
import { Surface } from '@/components/brand/Surface';
import { StoreIcon, TrendingUpIcon, ArrowRightIcon } from '@/components/icons';

export function formatLKR(cents: number | null | undefined): string {
  if (cents == null) return '—';
  return `Rs. ${(cents / 100).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function CardShell({
  children,
  className,
  kind = 'flat',
}: {
  children: React.ReactNode;
  className?: string;
  kind?: 'flat' | 'elevated' | 'ink';
}) {
  return (
    <Surface kind={kind} className={cn('p-4 sm:p-5', className)}>
      {children}
    </Surface>
  );
}

function Source({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 text-[11px] leading-snug text-ink-4">{children}</p>;
}

function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-mono font-bold uppercase tracking-[0.14em] text-copper">{children}</div>
  );
}

function ActionRow({ actions }: { actions: Action[] }) {
  if (!actions?.length) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {actions.map((a, i) => (
        <Link
          key={i}
          to={a.href}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-ink/15 bg-paper px-3 text-xs font-medium text-ink hover:border-ink"
        >
          <span>{a.label}</span>
          <ArrowRightIcon size={11} className="text-ink-4" />
        </Link>
      ))}
    </div>
  );
}

function leadText(days: number | null | undefined): string | null {
  if (days == null) return null;
  return days === 1 ? '1 day dispatch' : `${days} days dispatch`;
}

function rowHref(row: { productId?: string; supplierId?: string }): string | null {
  if (row.productId) return `/products/${row.productId}`;
  if (row.supplierId) return `/suppliers/${row.supplierId}`;
  return null;
}

function NameLink({
  href,
  children,
  className,
}: {
  href: string | null;
  children: React.ReactNode;
  className?: string;
}) {
  if (!href) return <span className={className}>{children}</span>;
  return (
    <Link to={href} className={cn(className, 'hover:underline')}>
      {children}
    </Link>
  );
}

export function RecommendationCard({ data }: { data: any }) {
  const lines: Array<{ supplierName?: string; coverage?: number; invited?: boolean }> = data.lines ?? [];
  const isNotice = !data.supplierName && (data.message || data.disclaimer || data.title) && !data.productName;

  if (isNotice || (data.message && !data.supplierName && !data.productName)) {
    return (
      <CardShell>
        {data.title ? <div className="font-display text-base font-semibold text-ink">{data.title}</div> : null}
        <p className="text-sm leading-relaxed text-ink-2">{data.message ?? data.disclaimer ?? 'Nothing to show yet.'}</p>
        {lines.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {lines.map((line, i) => (
              <li key={i} className="flex items-center justify-between gap-3 text-sm">
                <span className="font-medium text-ink">{line.supplierName}</span>
                <span className="text-xs text-ink-3">
                  {[line.coverage != null ? `${line.coverage}% coverage` : null, line.invited ? 'already invited' : null]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        {data.disclaimer && data.message ? (
          <p className="mt-2 text-xs leading-relaxed text-ink-3">{data.disclaimer}</p>
        ) : null}
      </CardShell>
    );
  }

  if (data.message && !data.supplierName) {
    const href = data.productId ? `/products/${data.productId}` : null;
    return (
      <CardShell>
        <Kicker>Catalog</Kicker>
        <NameLink href={href} className="mt-1 block font-display text-base font-semibold text-ink">
          {data.productName ?? 'Notice'}
        </NameLink>
        <p className="mt-1 text-sm leading-relaxed text-ink-3">{data.message}</p>
      </CardShell>
    );
  }

  const reasons: string[] = [];
  if (data.offerCount && data.offerCount > 1) reasons.push(`Lowest of ${data.offerCount} live quotes`);
  if (data.savingVsHighestCents > 0) reasons.push(`${formatLKR(data.savingVsHighestCents)} below the highest quote`);
  if (data.deliveryAvailable) reasons.push('Delivery available');
  else if (data.deliveryAvailable === false) reasons.push('Pickup only');
  if (data.leadTimeDays != null) reasons.push(leadText(data.leadTimeDays)!);
  if (data.availabilityStatus === 'low') reasons.push('Low stock — order soon');
  if (data.minOrderQty > 1) reasons.push(`Minimum order ${data.minOrderQty}`);

  const productHref = data.productId ? `/products/${data.productId}` : null;
  const millHref = data.supplierId ? `/suppliers/${data.supplierId}` : null;

  return (
    <CardShell className="p-0 sm:p-0">
      <div className="flex items-start justify-between gap-3 border-b border-ink/10 px-4 py-4 sm:px-5">
        <div className="min-w-0">
          {data.offerCount > 1 ? <Kicker>Best price</Kicker> : <Kicker>Quote</Kicker>}
          <NameLink href={productHref} className="mt-0.5 block font-display text-lg font-semibold tracking-tight text-ink">
            {data.productName}
          </NameLink>
        </div>
        <div className="shrink-0 text-right">
          <div className="vyro-metric text-2xl font-bold text-ink num-tabular">{formatLKR(data.priceCents)}</div>
          <div className="text-[11px] text-ink-4">per unit</div>
        </div>
      </div>

      <div className="space-y-3 px-4 py-4 sm:px-5">
        {data.supplierName ? (
          <div className="flex items-center gap-1.5 text-sm text-ink-2">
            <StoreIcon size={13} className="shrink-0 text-copper" />
            <NameLink href={millHref} className="font-medium text-ink">
              {data.supplierName}
            </NameLink>
          </div>
        ) : null}

        {reasons.length > 0 ? (
          <ul className="space-y-1.5">
            {reasons.slice(0, 3).map((r) => (
              <li key={r} className="flex items-start gap-2 text-sm text-ink-2">
                <span aria-hidden className="mt-0.5 text-mint">
                  ✓
                </span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        ) : null}

        <Source>Live catalog prices{data.offerCount > 1 ? ` · ${data.offerCount} suppliers` : ''}.</Source>
      </div>
    </CardShell>
  );
}

export function SupplierListCard({ data }: { data: any }) {
  const suppliers: Array<any> | undefined = data.suppliers;
  const hits: Array<any> | undefined = data.hits;
  const isSearch = !suppliers && !!hits;
  const list: Array<any> = suppliers ?? hits ?? [];

  return (
    <CardShell className="p-0 sm:p-0">
      <div className="px-4 pt-4 sm:px-5 sm:pt-5">
        <Kicker>{isSearch ? 'Matches' : 'Quotes'}</Kicker>
        <div className="mt-1 font-display text-base font-semibold text-ink">
          {data.title ?? (isSearch ? 'Catalog matches' : 'Compare quotes')}
        </div>
      </div>

      <div className="mt-3 divide-y divide-ink/10">
        {list.map((row, i) => {
          const href = rowHref(row);
          const mill =
            row.bestSupplierName ?? (row.productName && row.supplierName ? row.supplierName : null);
          const meta = [
            mill ? (row.bestSupplierName ? `via ${mill}` : mill) : null,
            row.leadTimeDays != null ? leadText(row.leadTimeDays) : null,
            row.deliveryAvailable === true ? 'delivery' : row.deliveryAvailable === false ? 'pickup' : null,
            row.minOrderQty > 1 ? `min ${row.minOrderQty}` : null,
            row.savingVsHighestCents > 0 ? `saves ${formatLKR(row.savingVsHighestCents)}` : null,
            typeof row.fillRate === 'number' ? `${Math.round(row.fillRate * 100)}% fill` : null,
          ].filter(Boolean);

          const inner = (
            <>
              <div className="min-w-0 space-y-0.5">
                <div className="flex items-center gap-2">
                  {row.rank != null && !isSearch ? (
                    <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-md bg-bone text-[10px] font-mono font-bold text-ink-3">
                      {row.rank}
                    </span>
                  ) : null}
                  <span className="truncate text-sm font-semibold text-ink">
                    {row.productName ?? row.supplierName}
                  </span>
                  {row.badge ? (
                    <span className="shrink-0 rounded-md bg-volt/25 px-1.5 py-0.5 text-[10px] font-medium text-ink">
                      {displayChipLabel(String(row.badge).replace(/_/g, ' '))}
                    </span>
                  ) : null}
                </div>
                {meta.length ? <div className="truncate text-[11px] text-ink-4">{meta.join(' · ')}</div> : null}
              </div>
              <div className="shrink-0 text-right">
                <div className="font-mono text-sm font-bold text-ink num-tabular">
                  {formatLKR(row.priceCents ?? row.bestPriceCents)}
                </div>
              </div>
            </>
          );

          const rowClass =
            'flex items-center justify-between gap-3 px-4 py-3 text-sm sm:px-5 hover:bg-bone/50 transition-colors';

          return href ? (
            <Link key={i} to={href} className={rowClass}>
              {inner}
            </Link>
          ) : (
            <div key={i} className={rowClass}>
              {inner}
            </div>
          );
        })}
        {!list.length ? (
          <div className="px-4 py-6 text-sm text-ink-4 sm:px-5">No matching quotes right now.</div>
        ) : null}
      </div>
      <div className="px-4 pb-4 sm:px-5 sm:pb-5">
        <Source>{isSearch ? 'From the live catalog.' : 'Ranked by unit price.'}</Source>
      </div>
    </CardShell>
  );
}

export function SpendSummaryCard({ data }: { data: any }) {
  if (data.scope === 'price_changes') {
    return (
      <CardShell>
        <Kicker>Price moves</Kicker>
        <div className="mt-1 font-display text-base font-semibold text-ink">What changed</div>
        <div className="mt-3 space-y-2">
          {(data.movers ?? []).map((m: any, i: number) => (
            <div key={i} className="flex items-center justify-between gap-3 rounded-lg bg-bone/50 px-3 py-2.5">
              <span className="text-sm font-medium text-ink">{m.productName}</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-ink-4 num-tabular">
                  {formatLKR(m.from)} → {formatLKR(m.to)}
                </span>
                <span
                  className={cn(
                    'rounded-md px-1.5 py-0.5 text-[11px] font-mono font-bold num-tabular',
                    m.pct >= 0 ? 'bg-rose/10 text-rose' : 'bg-mint/15 text-mint',
                  )}
                >
                  {m.pct >= 0 ? '+' : ''}
                  {m.pct}%
                </span>
              </div>
            </div>
          ))}
          {(!data.movers || data.movers.length === 0) && (
            <div className="text-sm text-ink-4">No price changes in this period.</div>
          )}
        </div>
        <Source>From settled orders in the last {data.period ?? 'month'}.</Source>
      </CardShell>
    );
  }

  const title =
    data.scope === 'product' ? 'Product spend' : data.scope === 'supplier' ? 'Supplier spend' : 'Total spend';

  return (
    <CardShell kind="ink" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10px] font-mono font-bold uppercase tracking-[0.14em] text-volt">{title}</span>
        <span className="text-[11px] text-paper/55">Last {data.period || '30 days'}</span>
      </div>
      <div className="vyro-metric text-4xl font-bold tracking-tight text-paper num-tabular">
        {formatLKR(data.totalCents)}
      </div>
      {(data.productName || data.supplierName) && (
        <div className="text-sm text-paper/80">{data.productName ?? data.supplierName}</div>
      )}
      <p className="border-t border-paper/15 pt-3 text-[11px] text-paper/55">
        {data.orderCount ?? 0} settled order{data.orderCount === 1 ? '' : 's'}.
      </p>
    </CardShell>
  );
}

export function SavingsCard({ data }: { data: any }) {
  const opps: any[] = data.opportunities ?? [];
  return (
    <CardShell>
      <div className="flex items-center justify-between gap-3">
        <Kicker>Where you can save</Kicker>
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-mint">
          <TrendingUpIcon size={11} />
          Cheaper quotes
        </span>
      </div>

      <div className="mt-3 space-y-2">
        {opps.slice(0, 5).map((o: any, i: number) => (
          <div key={i} className="rounded-lg bg-bone/50 px-3 py-3">
            <div className="flex items-baseline justify-between gap-2">
              <div className="font-display text-sm font-semibold text-ink">{o.productName}</div>
              <div className="shrink-0 font-mono text-sm font-bold text-mint num-tabular">
                −{formatLKR(o.savingCents)}
              </div>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-ink-3">
              {formatLKR(o.currentPriceCents)} at {o.currentSupplierName}
              <span className="text-ink-4"> → </span>
              <span className="font-medium text-ink">
                {formatLKR(o.alternativePriceCents)} at {o.alternativeSupplierName}
              </span>
            </p>
          </div>
        ))}
        {!opps.length ? <div className="text-sm text-ink-4">No cheaper quotes on your usual items right now.</div> : null}
      </div>

      {data.disclaimer ? <p className="mt-2 text-[11px] text-ink-4">{data.disclaimer}</p> : null}
      <Source>Compared with your last invoice vs live mill rates.</Source>
    </CardShell>
  );
}

export function ProcurementPlanCard({ data }: { data: any }) {
  const lines: any[] = data.lines ?? [];
  return (
    <CardShell>
      <Kicker>Suggested reorder</Kicker>
      <div className="mt-1 font-display text-base font-semibold text-ink">
        {data.title ?? 'Based on what you usually buy'}
      </div>
      <ul className="mt-3 divide-y divide-ink/10">
        {lines.map((l: any, i: number) => (
          <li key={i} className="flex items-center justify-between gap-3 py-2.5 text-sm">
            <span className="font-medium text-ink">{l.productName}</span>
            <span className="shrink-0 font-mono text-xs font-semibold text-ink-3">× {l.typicalQuantity}</span>
          </li>
        ))}
        {!lines.length ? <li className="py-3 text-sm text-ink-4">No reorder items to suggest.</li> : null}
      </ul>
      {data.disclaimer ? <p className="mt-2 text-[11px] text-ink-4">{data.disclaimer}</p> : null}
      <Source>Quantities follow your past deliveries. Review before adding to cart.</Source>
    </CardShell>
  );
}

export function ClarificationCard({ data, onPick }: { data: any; onPick?: ((opt: string) => void) | undefined }) {
  const options: string[] = data.options ?? [];
  return (
    <CardShell>
      <p className="font-display text-base font-semibold leading-snug text-ink">
        {data.question ?? 'What do you need help with?'}
      </p>
      {options.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {options.map((o: string, i: number) =>
            onPick ? (
              <button
                key={i}
                type="button"
                onClick={() => onPick(o)}
                className="inline-flex min-h-11 items-center rounded-lg border border-ink/15 bg-paper px-3 text-xs font-medium text-ink hover:border-ink"
              >
                {displayChipLabel(o)}
              </button>
            ) : (
              <span
                key={i}
                className="inline-flex min-h-11 items-center rounded-lg border border-ink/15 bg-bone px-3 text-xs text-ink"
              >
                {displayChipLabel(o)}
              </span>
            ),
          )}
        </div>
      ) : null}
    </CardShell>
  );
}

export { ToolTimeline } from './ToolTimeline';
export { ConfirmationPanel } from './ConfirmationPanel';
export { ActionRow };

export function WhyCard({ data }: { data: any }) {
  const evidence: Array<{ label: string; value: string }> = data.evidence ?? [];
  return (
    <CardShell>
      <div className="font-display text-lg font-semibold tracking-tight text-ink">{data.question ?? 'Why?'}</div>
      <p className="mt-2 text-sm leading-relaxed text-ink-2">{data.answer ?? ''}</p>
      {evidence.length > 0 ? (
        <dl className="mt-3 space-y-1.5 border-t border-ink/10 pt-3">
          {evidence.map((e, i) => (
            <div key={i} className="flex items-baseline justify-between gap-3 text-sm">
              <dt className="text-ink-4">{e.label}</dt>
              <dd className="font-mono font-semibold text-ink num-tabular">{e.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {data.recommendation ? (
        <p className="mt-3 border-t border-ink/10 pt-3 text-sm text-ink-2">{data.recommendation}</p>
      ) : null}
      <Source>From your order history and current mill quotes.</Source>
    </CardShell>
  );
}

export function SimulationCard({ data }: { data: any }) {
  const saving = (data.monthlyDeltaCents ?? 0) < 0;
  const monthly = Math.abs(Number(data.monthlyDeltaCents ?? 0) / 100);
  const annual = Math.abs(Number(data.annualDeltaCents ?? 0) / 100);
  const pct = Number(data.savingsPct ?? 0);
  const leadDelta = Number(data.leadDeltaDays ?? 0);
  return (
    <CardShell>
      <Kicker>If you switch</Kicker>
      <div className="mt-1 font-display text-lg font-semibold tracking-tight text-ink">
        {data.productName ?? 'This product'}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 border-y border-ink/10 py-3">
        <div>
          <div className="text-[11px] text-ink-4">Now</div>
          <div className="text-sm font-display font-semibold text-ink">{data.currentSupplier ?? '—'}</div>
        </div>
        <div>
          <div className="text-[11px] text-ink-4">Alternative</div>
          <div className="text-sm font-display font-semibold text-ink">{data.alternativeSupplier ?? '—'}</div>
        </div>
      </div>
      <div className="mt-3 flex items-baseline justify-between gap-3">
        <div>
          <div className="text-[11px] text-ink-4">{saving ? 'Estimated saving' : 'Estimated extra cost'}</div>
          <div className={cn('font-display text-3xl font-bold tracking-tight num-tabular', saving ? 'text-mint' : 'text-rose')}>
            {`${pct.toFixed(1)}%`}
          </div>
        </div>
        <div className="space-y-0.5 text-right text-xs text-ink-2">
          <div>
            Monthly{' '}
            <span className="font-mono font-bold num-tabular">
              Rs. {monthly.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div>
            Annual{' '}
            <span className="font-mono font-bold num-tabular">
              Rs. {annual.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-ink-4">
        Lead time {leadDelta >= 0 ? '+' : ''}
        {leadDelta}d · {data.monthlyQuantity ?? 0} units/month
      </p>
      <Source>Uses your usual cadence and live mill rates — review before switching.</Source>
    </CardShell>
  );
}

export function renderComponent(env: ComponentEnvelope, idx: number, onPick?: (opt: string) => void) {
  const data = env.data as any;
  switch (env.type) {
    case 'recommendation_card':
      return <RecommendationCard key={idx} data={data} />;
    case 'supplier_list_card':
      return <SupplierListCard key={idx} data={data} />;
    case 'spend_summary_card':
      return <SpendSummaryCard key={idx} data={data} />;
    case 'savings_card':
      return <SavingsCard key={idx} data={data} />;
    case 'procurement_plan_card':
      return <ProcurementPlanCard key={idx} data={data} />;
    case 'clarification_card':
      return <ClarificationCard key={idx} data={data} onPick={onPick} />;
    case 'confirmation_card':
      return <ConfirmationPanel key={idx} card={{ id: String(idx), ...(env as object), data } as any} />;
    case 'why_card':
      return <WhyCard key={idx} data={data} />;
    case 'simulation_card':
      return <SimulationCard key={idx} data={data} />;
  }
  return null;
}

/**
 * MetricTile: small numeric readout for dashboards. Neutral language; never
 * labels a value as "AI performance" — these are operational counters.
 */
export function MetricTile({
  kicker,
  value,
  suffix,
}: {
  kicker: string;
  value: string;
  suffix?: string;
}) {
  return (
    <div className="rounded-xl border border-ink/15 bg-paper p-3 shadow-xs">
      <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-ink-3">{kicker}</div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="vyro-metric text-2xl text-ink tabular-nums">{value}</span>
        {suffix && <span className="text-[10px] font-mono text-ink-3">{suffix}</span>}
      </div>
    </div>
  );
}
