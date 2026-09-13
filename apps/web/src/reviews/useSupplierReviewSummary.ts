import { useEffect, useState } from 'react';
import type { Distribution } from './RatingDistribution';

export interface ReviewSummary {
  count: number;
  avg: number | null;
  distribution: Distribution;
  lastReviewAt: number | null;
  isLoading: boolean;
}

const empty: Distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

export function useSupplierReviewSummary(supplierId: string | null): ReviewSummary {
  const [data, setData] = useState<Omit<ReviewSummary, 'isLoading'>>({
    count: 0,
    avg: null,
    distribution: empty,
    lastReviewAt: null,
  });
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!supplierId) return;
    let cancelled = false;
    setIsLoading(true);
    fetch(`/api/suppliers/${supplierId}/review-summary`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: unknown) => {
        if (cancelled || !j || typeof j !== 'object') return;
        const obj = j as {
          count?: number;
          avg?: number | null;
          distribution?: Distribution;
          lastReviewAt?: number | null;
        };
        setData({
          count: obj.count ?? 0,
          avg: obj.avg ?? null,
          distribution: obj.distribution ?? empty,
          lastReviewAt: obj.lastReviewAt ?? null,
        });
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [supplierId]);

  return { ...data, isLoading };
}