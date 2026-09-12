import { useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui';
import { Surface } from '@/components/brand/Surface';
import { useToast } from '@vyro/ui';
import type { AiQuoteDraft, AiQuoteStrategy } from '@vyro/ai';

interface AiQuoteCopilotCardProps {
  rfqId: string;
  supplierId: string;
  onApplyDraft: (draft: AiQuoteDraft) => void;
}

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
      toast.show(toast.success('AI quote draft generated!'));
    } catch (e) {
      toast.show(toast.error(e instanceof Error ? e.message : 'Failed to draft AI quote'));
    } finally {
      setLoading(false);
    }
  }

  function handleApply() {
    if (!draft) return;
    onApplyDraft(draft);
    toast.show(toast.success('AI quote applied to form! Review and adjust before submitting.'));
  }

  return (
    <Surface kind="elevated" className="mb-6 rounded-xl border border-mint/30 bg-mint/5 p-4 shadow-soft-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-mint text-sm text-paper font-bold shadow-sm">
            ✨
          </span>
          <div>
            <h3 className="text-sm font-semibold text-ink">AI Quoting Copilot</h3>
            <p className="text-xs text-ink-3">
              Auto-price catalog items, apply volume discounts, and suggest in-stock substitutes.
            </p>
          </div>
        </div>

        {/* Strategy Selector Pills */}
        <div className="flex items-center gap-1.5 rounded-lg border border-line bg-paper p-1 text-xs">
          <button
            type="button"
            onClick={() => setStrategy('win_deal')}
            className={`rounded px-2.5 py-1 font-medium transition ${
              strategy === 'win_deal' ? 'bg-ink text-paper' : 'text-ink-3 hover:text-ink'
            }`}
            title="Aggressive discount to undercut target and capture new accounts"
          >
            🎯 Win Deal
          </button>
          <button
            type="button"
            onClick={() => setStrategy('balanced')}
            className={`rounded px-2.5 py-1 font-medium transition ${
              strategy === 'balanced' ? 'bg-ink text-paper' : 'text-ink-3 hover:text-ink'
            }`}
            title="Standard catalog wholesale rate with volume tiers"
          >
            ⚖️ Balanced
          </button>
          <button
            type="button"
            onClick={() => setStrategy('premium_margin')}
            className={`rounded px-2.5 py-1 font-medium transition ${
              strategy === 'premium_margin' ? 'bg-ink text-paper' : 'text-ink-3 hover:text-ink'
            }`}
            title="Premium quality and expedited dispatch"
          >
            💎 Margin
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-line/40 pt-3 text-xs">
        <label className="flex items-center gap-2 cursor-pointer text-ink-2">
          <input
            type="checkbox"
            checked={includeAlternatives}
            onChange={(e) => setIncludeAlternatives(e.target.checked)}
            className="rounded border-line text-mint focus:ring-mint"
          />
          <span>Suggest in-stock substitutes for depleted/unstocked items</span>
        </label>

        <Button
          onClick={handleGenerate}
          loading={loading}
          disabled={loading}
          size="sm"
          className="bg-mint text-paper hover:bg-mint-deep font-semibold"
        >
          {loading ? 'Analyzing Catalog…' : '✨ Draft AI Quote'}
        </Button>
      </div>

      {/* Result Preview & 1-Click Fill Banner */}
      {draft && (
        <div className="mt-4 rounded-lg border border-line bg-paper p-3 text-xs">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="font-semibold text-ink">Quotation Summary</div>
              <p className="mt-0.5 text-ink-3">{draft.summaryExplanation}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setDraft(null)}
                className="rounded border border-line px-2.5 py-1 text-ink-3 hover:text-ink"
              >
                Dismiss
              </button>
              <button
                type="button"
                onClick={handleApply}
                className="rounded bg-mint px-3 py-1 font-semibold text-paper hover:bg-mint-deep shadow-sm"
              >
                Apply to Quote Form
              </button>
            </div>
          </div>

          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {draft.items.map((it) => (
              <span
                key={it.rfqItemId}
                className={`inline-flex items-center gap-1 rounded px-2 py-0.5 font-mono text-[11px] ${
                  it.stockStatus === 'substitute'
                    ? 'bg-amber-100 text-amber-900 border border-amber-300'
                    : it.stockStatus === 'unmatched'
                      ? 'bg-ink/5 text-ink-3 border border-line'
                      : it.discountCents > 0
                        ? 'bg-blue-50 text-blue-800 border border-blue-200'
                        : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                }`}
                title={it.rationale}
              >
                {it.stockStatus === 'substitute' && '🟡 Alternative: '}
                {it.description} —{' '}
                {it.unitPriceCents > 0
                  ? `Rs. ${((it.unitPriceCents - it.discountCents) / 100).toLocaleString()}`
                  : 'Manual price'}
              </span>
            ))}
          </div>
        </div>
      )}
    </Surface>
  );
}
