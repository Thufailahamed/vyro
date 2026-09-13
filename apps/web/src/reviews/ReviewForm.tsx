import { useState, type JSX } from 'react';

export interface ReviewFormProps {
  orderId: string;
  onSubmitted?: () => void;
}

export function ReviewForm({ orderId, onSubmitted }: ReviewFormProps): JSX.Element {
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setError(null);
    if (body.length > 2000) {
      setError('Review must be 2000 characters or fewer.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ orderId, rating, body }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: { code?: string } };
        setError(j?.error?.code ?? `Failed (${res.status})`);
        return;
      }
      setBody('');
      onSubmitted?.();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-3">
      <label className="block text-sm">
        Rating
        <select
          aria-label="Rating"
          value={rating}
          onChange={(e) => setRating(Number(e.target.value))}
          className="ml-2 border rounded px-2 py-1"
        >
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        Review
        <textarea
          aria-label="Review"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          className="block w-full border rounded px-2 py-1"
          maxLength={2000}
        />
        <span className="text-xs text-gray-500">{body.length}/2000</span>
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        onClick={submit}
        disabled={submitting || !body}
        className="px-3 py-1 rounded bg-blue-600 text-white text-sm disabled:opacity-50"
      >
        {submitting ? 'Submitting…' : 'Submit review'}
      </button>
    </div>
  );
}