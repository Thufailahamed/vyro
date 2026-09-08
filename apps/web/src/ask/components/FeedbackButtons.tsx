import { useState } from 'react';

export type FeedbackReason =
  | 'wrong_product'
  | 'wrong_supplier'
  | 'price_incorrect'
  | 'not_relevant'
  | 'other';

const REASON_LABEL: Record<FeedbackReason, string> = {
  wrong_product: 'Wrong product',
  wrong_supplier: 'Wrong supplier',
  price_incorrect: 'Price is off',
  not_relevant: 'Not relevant',
  other: 'Other',
};

interface FeedbackState {
  helpful: boolean;
  reason?: FeedbackReason;
}

/**
 * 👍 / 👎 with an optional reason dropdown when negative. POSTs once to
 * /api/ai/feedback and locks UI to the chosen value. Never blocks the page.
 */
export function FeedbackButtons({ requestId, intentHint }: { requestId: string; intentHint?: string }) {
  const [sent, setSent] = useState<FeedbackState | null>(null);
  const [showReason, setShowReason] = useState(false);
  const [sending, setSending] = useState(false);

  async function sendFeedback(helpful: boolean, reason?: FeedbackReason) {
    if (sent || sending || !requestId) return;
    setSending(true);
    try {
      await fetch('/api/ai/feedback', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          requestId,
          helpful,
          ...(reason ? { reason } : {}),
          ...(intentHint ? { intentHint } : {}),
        }),
      });
    } catch {
      // network errors are silent — feedback never blocks the buyer
    } finally {
      setSent({ helpful, ...(reason ? { reason } : {}) });
      setSending(false);
      setShowReason(false);
    }
  }

  if (sent) {
    return (
      <div className="mt-2 text-[10px] font-mono uppercase tracking-wider text-mint">
        Thanks — feedback captured{sent.reason ? ` (${REASON_LABEL[sent.reason]})` : ''}.
      </div>
    );
  }

  return (
    <div className="mt-2 inline-flex items-center gap-2 text-[11px] font-mono text-ink-3">
      <span className="text-[10px] uppercase tracking-wider">Helpful?</span>
      <button
        type="button"
        aria-label="Helpful"
        disabled={sending}
        onClick={() => sendFeedback(true)}
        className="px-2 py-0.5 border border-ink/15 hover:border-mint hover:text-mint transition-colors"
      >
        Yes
      </button>
      <button
        type="button"
        aria-label="Not helpful"
        disabled={sending}
        onClick={() => setShowReason((s) => !s)}
        className="px-2 py-0.5 border border-ink/15 hover:border-rose hover:text-rose transition-colors"
      >
        No
      </button>
      {showReason && (
        <select
          aria-label="Reason"
          className="text-[11px] border border-ink/20 bg-paper px-2 py-0.5"
          onChange={(e) => {
            const r = e.target.value as FeedbackReason | '';
            if (r) sendFeedback(false, r);
          }}
          defaultValue=""
        >
          <option value="" disabled>
            Why?
          </option>
          {(Object.keys(REASON_LABEL) as FeedbackReason[]).map((r) => (
            <option key={r} value={r}>
              {REASON_LABEL[r]}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
