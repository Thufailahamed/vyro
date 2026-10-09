import { useState } from 'react';
import { cn, useToast } from '@vyro/ui';
import { api } from '@/lib/api';
import { formatLKR } from '@/lib/format';
import { Surface } from '@/components/brand/Surface';
import {
  CheckIcon,
  SparklesIcon,
  TargetIcon,
  ScaleIcon,
  TrendingUpIcon,
  XIcon,
} from '@/components/icons';
import type { AiQuoteDraft, AiQuoteStrategy } from '@vyro/ai';

interface AiQuoteCopilotCardProps {
  rfqId: string;
  supplierId: string;
  onApplyDraft: (draft: AiQuoteDraft) => void;
}

const STRATEGIES: Array<{
  key: AiQuoteStrategy;
  label: string;
  hint: string;
  icon: typeof TargetIcon;
}> = [
  {
    key: 'win_deal',
    label: 'Win deal',
    hint: 'Sharp discount to undercut the target and win new accounts',
    icon: TargetIcon,
  },
  {
    key: 'balanced',
    label: 'Balanced',
    hint: 'Standard wholesale rate with volume tiers',
    icon: ScaleIcon,
  },
  {
    key: 'premium_margin',
    label: 'Margin',
    hint: 'Premium pricing and expedited dispatch',
    icon: TrendingUpIcon,
  },
];

export function AiQuoteCopilotCard({ rfqId, supplierId, onApplyDraft }: AiQuoteCopilotCardProps) {
  const toast = useToast();
  const [strategy, setStrategy] = useState<AiQuoteStrategy>('balanced');
  const [includeAlternatives, setIncludeAlternatives] = useState(true);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<AiQuoteDraft | null>(null);

  async function handleGenerate() {
    setLoading(true);
    try {
      const res = await api.post<{ draft: AiQuoteDraft }>(
        `/rfqs/${rfqId}/ai-quote-draft?supplierId=${supplierId}`,
        {
          strategy,
          includeAlternatives,
        },
      );
      setDraft(res.draft);
    } catch (e) {
      toast.show(toast.error(e instanceof Error ? e.message : 'Failed to draft AI quote'));
    } finally {
      setLoading(false);
    }
  }

  function handleApply() {
    if (!draft) return;
    onApplyDraft(draft);
    setDraft(null);
    toast.show(toast.success('Draft applied — review the prices before submitting'));
  }

  return (
    <Surface kind="ink" className="grain rounded-2xl p-0">
      <div
        className="pointer-events-none absolute -right-16 -top-24 size-64 rounded-full bg-volt/15 blur-3xl"
        aria-hidden
      />
      <div className="relative p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-volt text-ink shadow-[0_8px_24px_-10px_rgba(198,220,74,0.8)]">
              <SparklesIcon size={18} />
            </span>
            <div>
              <div className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-volt">
                VYRO copilot
              </div>
              <h3 className="mt-0.5 font-display text-lg font-bold text-paper">
                Draft this quote in one click
              </h3>
              <p className="mt-0.5 max-w-md text-xs leading-relaxed text-paper/55">
                Prices your catalog items, applies volume discounts and suggests in-stock
                substitutes. You review before sending.
              </p>
            </div>
          </div>

          <div
            role="radiogroup"
            aria-label="Pricing strategy"
            className="flex rounded-xl bg-paper/[0.06] p-1 ring-1 ring-inset ring-paper/10"
          >
            {STRATEGIES.map((s) => {
              const on = strategy === s.key;
              const Icon = s.icon;
              return (
                <button
                  key={s.key}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  title={s.hint}
                  onClick={() => setStrategy(s.key)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
                    on ? 'bg-paper text-ink' : 'text-paper/60 hover:text-paper',
                  )}
                >
                  <Icon size={12} />
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-dashed border-paper/15 pt-4">
          <label className="flex cursor-pointer items-center gap-2.5 text-xs text-paper/70">
            <button
              type="button"
              role="switch"
              aria-checked={includeAlternatives}
              onClick={() => setIncludeAlternatives((v) => !v)}
              className={cn(
                'relative h-5 w-9 rounded-full transition-colors',
                includeAlternatives ? 'bg-volt' : 'bg-paper/20',
              )}
            >
              <span
                className={cn(
                  'absolute top-0.5 size-4 rounded-full bg-ink transition-all',
                  includeAlternatives ? 'left-[18px]' : 'left-0.5',
                )}
              />
            </button>
            Suggest in-stock substitutes for items you don’t carry
          </label>
          <button
            type="button"
            onClick={() => void handleGenerate()}
            disabled={loading}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-volt px-4 text-xs font-bold text-ink transition-colors hover:bg-volt/90 disabled:opacity-60"
          >
            <SparklesIcon size={13} className={loading ? 'animate-spin' : ''} />
            {loading ? 'Reading your catalog…' : draft ? 'Regenerate' : 'Draft quote'}
          </button>
        </div>

        {draft ? (
          <div className="mt-4 rounded-xl bg-paper p-4 text-ink">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">Suggested pricing</div>
                <p className="mt-0.5 text-xs leading-relaxed text-ink-3">
                  {draft.summaryExplanation}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setDraft(null)}
                  className="inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-semibold text-ink-3 transition-colors hover:bg-ink/5 hover:text-ink"
                >
                  <XIcon size={12} /> Dismiss
                </button>
                <button
                  type="button"
                  onClick={handleApply}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-ink px-3 text-xs font-semibold text-paper transition-colors hover:bg-ink/90"
                >
                  <CheckIcon size={12} /> Apply to quote
                </button>
              </div>
            </div>
            <ul className="mt-3 divide-y divide-ink/[0.06]">
              {draft.items.map((it) => (
                <li
                  key={`${it.rfqItemId}-${it.description}`}
                  className="flex items-center justify-between gap-3 py-2 text-xs"
                  title={it.rationale}
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium text-ink-1">{it.description}</div>
                    <div className="truncate text-[11px] text-ink-4">{it.rationale}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {it.stockStatus === 'substitute' ? (
                      <span className="rounded-full bg-amber/15 px-2 py-0.5 text-[10px] font-semibold text-[#a86c28]">
                        Substitute
                      </span>
                    ) : it.stockStatus === 'unmatched' ? (
                      <span className="rounded-full bg-ink/[0.05] px-2 py-0.5 text-[10px] font-semibold text-ink-4">
                        Not in catalog
                      </span>
                    ) : it.discountCents > 0 ? (
                      <span className="rounded-full bg-copper/10 px-2 py-0.5 text-[10px] font-semibold text-copper-deep">
                        Discounted
                      </span>
                    ) : null}
                    <span className="font-mono font-semibold text-ink">
                      {it.unitPriceCents > 0
                        ? formatLKR(it.unitPriceCents - it.discountCents)
                        : 'Price manually'}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </Surface>
  );
}
