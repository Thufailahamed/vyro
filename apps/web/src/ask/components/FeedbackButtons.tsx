import { useState } from 'react';
import { api } from '@/lib/api';

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
      await api.post('/api/ai/feedback', {
        requestId,
        helpful,
        ...(reason ? { reason } : {}),
        ...(intentHint ? { intentHint } : {}),
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
      <div className="text-[11px] text-ink-4">
        Thanks{sent.reason ? ` — ${REASON_LABEL[sent.reason].toLowerCase()}` : ''}.
      </div>
    );
  }

  return (
    <div className="inline-flex flex-wrap items-center gap-1 text-[11px] text-ink-4">
      <span>Useful?</span>
      <button
        type="button"
        aria-label="Helpful"
        disabled={sending}
        onClick={() => sendFeedback(true)}
        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg px-2 hover:bg-ink/5 hover:text-ink"
      >
        Yes
      </button>
      <button
        type="button"
        aria-label="Not helpful"
        disabled={sending}
        onClick={() => setShowReason((s) => !s)}
        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg px-2 hover:bg-ink/5 hover:text-ink"
      >
        No
      </button>
      {showReason && (
        <select
          aria-label="Reason"
          className="h-11 rounded-lg border border-ink/15 bg-paper px-2 text-[11px] text-ink"
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
