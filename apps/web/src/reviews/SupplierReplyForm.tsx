import { useState, type JSX } from 'react';

export interface SupplierReplyFormProps {
  supplierId: string;
  reviewId: string;
  onPosted?: () => void;
}

export function SupplierReplyForm({ supplierId, reviewId, onPosted }: SupplierReplyFormProps): JSX.Element {
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (body.length > 1000) {
      setError('Reply must be 1000 characters or fewer.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/suppliers/${supplierId}/reviews/${reviewId}/reply`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ body }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: { code?: string } };
        setError(j?.error?.code ?? `Failed (${res.status})`);
        return;
      }
      setBody('');
      onPosted?.();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-2">
      <textarea
        aria-label="Reply"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        maxLength={1000}
        className="block w-full border rounded px-2 py-1 text-sm"
        placeholder="Reply to this review…"
      />
      <div className="flex items-center gap-2">
        <button
          onClick={submit}
          disabled={submitting || !body}
          className="px-3 py-1 rounded bg-blue-600 text-white text-sm disabled:opacity-50"
        >
          {submitting ? 'Posting…' : 'Post reply'}
        </button>
        <span className="text-xs text-gray-500">{body.length}/1000</span>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}