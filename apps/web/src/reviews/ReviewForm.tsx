import { useState, type JSX } from 'react';

export interface ReviewFormProps {
  orderId: string;
  initialRating?: number;
  initialBody?: string;
  reviewId?: string;
  onSubmitted?: () => void;
}

export function ReviewForm({ orderId, initialRating, initialBody, reviewId, onSubmitted }: ReviewFormProps): JSX.Element {
  const [rating, setRating] = useState(initialRating ?? 5);
  const [body, setBody] = useState(initialBody ?? '');
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function uploadPhotos(selected: File[]): Promise<string[]> {
    const keys: string[] = [];
    for (const f of selected.slice(0, 3)) {
      if (!f.type.startsWith('image/')) throw new Error('image only');
      if (f.size > 5 * 1024 * 1024) throw new Error('max 5MB per photo');
      const form = new FormData();
      form.append('file', f);
      const res = await fetch('/api/reviews/images/upload-direct', {
        method: 'POST',
        credentials: 'include',
        body: form,
      });
      if (!res.ok) throw new Error(`upload failed (${res.status})`);
      const j = (await res.json()) as { r2Key?: string };
      if (j.r2Key) keys.push(j.r2Key);
    }
    return keys;
  }

  async function submit() {
    setError(null);
    if (body.length > 2000) {
      setError('Review must be 2000 characters or fewer.');
      return;
    }
    if (files.length > 3) {
      setError('Max 3 photos.');
      return;
    }
    setSubmitting(true);
    try {
      if (reviewId) {
        const res = await fetch(`/api/reviews/${reviewId}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ rating, body }),
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: { code?: string } };
          setError(j?.error?.code ?? `Failed (${res.status})`);
          return;
        }
        onSubmitted?.();
        return;
      }
      let imageR2Keys: string[] = [];
      try {
        imageR2Keys = await uploadPhotos(files);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Photo upload failed');
        return;
      }
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ orderId, rating, body, ...(imageR2Keys.length ? { imageR2Keys } : {}) }),
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
      {!reviewId && (
        <label className="block text-sm">
          Photos (max 3, 5MB each)
          <input
            type="file"
            aria-label="Photos"
            accept="image/*"
            multiple
            onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 3))}
            className="block mt-1 text-sm"
          />
          {files.length > 0 && <span className="text-xs text-gray-500">{files.length} selected</span>}
        </label>
      )}
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