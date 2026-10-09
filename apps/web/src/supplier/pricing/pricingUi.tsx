/**
 * Presentation pieces for the supplier Rate Cards page: the product tile,
 * the price "ladder" (base + three volume tiers) and tier sanity checks.
 */
import { cn } from '@vyro/ui';
import { PackageIcon } from '@/components/icons';
import { formatLKR } from '@/lib/format';

export interface LadderTier {
  label: string;
  qty: number;
  pct: number;
}

export function ProductTile({ name, imageUrl, size = 'md' }: { name: string; imageUrl?: string | null | undefined; size?: 'md' | 'lg' }) {
  const cls = size === 'lg' ? 'size-14 rounded-2xl' : 'size-11 rounded-xl';
  if (imageUrl) {
    return <img src={imageUrl} alt="" className={cn(cls, 'shrink-0 bg-bone object-cover shadow-[inset_0_0_0_1px_rgba(12,14,11,0.08)]')} />;
  }
  return (
    <span
      className={cn(
        cls,
        'flex shrink-0 items-center justify-center bg-gradient-to-br from-[#EFE7D8] to-[#DCCDB1] text-[#6B5634] shadow-[inset_0_0_0_1px_rgba(12,14,11,0.08),inset_0_1px_0_rgba(255,255,255,0.6)]',
      )}
      aria-hidden
    >
      {name ? <span className="font-display text-sm font-bold">{name.trim().slice(0, 2).toUpperCase()}</span> : <PackageIcon size={18} />}
    </span>
  );
}

/** Base price plus Tier 1–3 as four columns; each shows a bar sized by its price vs base. */
export function PriceLadder({
  baseCents,
  unit,
  moq,
  tiers,
  compact,
}: {
  baseCents: number;
  unit: string;
  moq: number;
  tiers: LadderTier[];
  compact?: boolean | undefined;
}) {
  const cells = [{ label: 'Base', qty: moq, pct: 0 }, ...tiers];
  const best = Math.max(...tiers.map((t) => t.pct), 0);
  return (
    <div className={cn('grid grid-cols-2 gap-2.5 sm:grid-cols-4', compact && 'gap-2')}>
      {cells.map((c, i) => {
        const price = Math.round(baseCents * (1 - c.pct / 100));
        const ratio = baseCents > 0 ? Math.max(8, (price / baseCents) * 100) : 100;
        const active = c.pct > 0;
        const isBest = active && c.pct === best;
        return (
          <div
            key={c.label}
            className={cn(
              'relative flex flex-col gap-2 rounded-xl p-3.5 transition-colors',
              active ? 'bg-mint/[0.08] shadow-[inset_0_0_0_1px_rgba(61,139,110,0.28)]' : 'bg-bone/50 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.07)]',
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-3">{c.label}</span>
              {active ? (
                <span className={cn('rounded-full px-1.5 text-[10px] font-bold leading-4', isBest ? 'bg-mint text-paper' : 'bg-mint/15 text-mint-deep')}>
                  −{c.pct}%
                </span>
              ) : i > 0 ? (
                <span className="text-[10px] text-ink-5">No discount</span>
              ) : null}
            </div>
            <div>
              <div className="font-display text-[15px] font-bold tracking-[-0.02em] text-ink">{formatLKR(price)}</div>
              <div className="text-[11px] text-ink-4">
                {i === 0 ? `from ${c.qty} ${unit}` : `≥ ${c.qty} ${unit}`}
              </div>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-ink/[0.06]">
              <div
                className={cn('h-full rounded-full transition-[width] duration-500 ease-vyro', active ? 'bg-mint' : 'bg-ink/25')}
                style={{ width: `${ratio}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Non-blocking sanity checks for a tier set. */
export function tierWarnings(tiers: LadderTier[]): string[] {
  const out: string[] = [];
  for (let i = 1; i < tiers.length; i++) {
    const prev = tiers[i - 1]!;
    const cur = tiers[i]!;
    if (cur.qty <= prev.qty) out.push(`${cur.label} quantity should be higher than ${prev.label} (${prev.qty}).`);
    if (cur.pct < prev.pct) out.push(`${cur.label} discount is lower than ${prev.label} — bigger orders should earn more.`);
  }
  if (tiers.some((t) => t.pct > 50)) out.push('Discounts above 50% are unusual — double-check.');
  return out;
}
