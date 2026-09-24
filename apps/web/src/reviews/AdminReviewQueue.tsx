import { useEffect, useState, type JSX } from 'react';
import { api } from '@/lib/api';

interface FlagRow {
  id: string;
  reviewId: string;
  supplierId: string;
  reason: string;
  note: string | null;
  reporterUserId: string;
  status: string;
  createdAt: number;
}

export function AdminReviewQueue(): JSX.Element {
  const [flags, setFlags] = useState<FlagRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const j = await api.get<{ flags: FlagRow[] }>('/api/admin/reviews/flags?limit=50');
      setFlags(j.flags);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function resolve(flagId: string, action: 'keep' | 'remove') {
    await api.post(`/api/admin/reviews/flags/${flagId}/resolve`, { action }).catch(() => {});
    void load();
  }

  async function deleteReview(reviewId: string) {
    if (!confirm('Delete this review?')) return;
    await api.del(`/api/admin/reviews/${reviewId}`).catch(() => {});
    void load();
  }

  if (loading) return <p className="text-sm text-gray-500">Loading flags…</p>;
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!flags.length) return <p className="text-sm text-gray-500">No pending flags.</p>;

  return (
    <div className="space-y-3">
      {flags.map((f) => (
        <div key={f.id} className="border rounded p-3 bg-white shadow-sm space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-xs">{f.reason}</span>
            <span className="text-gray-500 text-xs">flag {f.id.slice(0, 8)}</span>
            <span className="text-gray-500 text-xs">review {f.reviewId.slice(0, 8)}</span>
          </div>
          {f.note && <p className="text-sm text-gray-700">{f.note}</p>}
          <div className="flex gap-2">
            <button
              onClick={() => resolve(f.id, 'keep')}
              className="px-3 py-1 rounded bg-green-600 text-white text-xs"
            >
              Keep review
            </button>
            <button
              onClick={() => resolve(f.id, 'remove')}
              className="px-3 py-1 rounded bg-gray-600 text-white text-xs"
            >
              Resolve flag only
            </button>
            <button
              onClick={() => deleteReview(f.reviewId)}
              className="px-3 py-1 rounded bg-red-600 text-white text-xs"
            >
              Delete review
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
