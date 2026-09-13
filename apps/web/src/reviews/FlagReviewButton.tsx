import { useState, type JSX } from 'react';

const REASONS = ['abuse', 'spam', 'off_topic', 'pii', 'other'] as const;
type Reason = (typeof REASONS)[number];

export function FlagReviewButton({
  supplierId,
  reviewId,
  onFlagged,
}: {
  supplierId: string;
  reviewId: string;
  onFlagged?: () => void;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<Reason>('spam');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      const res = await fetch(`/api/suppliers/${supplierId}/reviews/${reviewId}/flag`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ reason, note: note || undefined }),
      });
      if (res.ok) {
        setOpen(false);
        onFlagged?.();
      }
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-xs text-red-600 underline">
        Flag
      </button>
    );
  }

  return (
    <div className="border rounded p-3 space-y-2 bg-white shadow-sm">
      <label className="block text-sm">
        Reason
        <select
          value={reason}
          onChange={(e) => setReason(e.target.value as Reason)}
          className="ml-2 border rounded px-2 py-1"
        >
          {REASONS.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
      </label>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Optional note"
        rows={2}
        maxLength={500}
        className="block w-full border rounded px-2 py-1 text-sm"
      />
      <div className="flex gap-2">
        <button
          onClick={submit}
          disabled={busy}
          className="px-3 py-1 rounded bg-red-600 text-white text-sm disabled:opacity-50"
        >
          Submit flag
        </button>
        <button onClick={() => setOpen(false)} className="px-3 py-1 rounded border text-sm">
          Cancel
        </button>
      </div>
    </div>
  );
}