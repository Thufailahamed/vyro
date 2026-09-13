import { useEffect, useState } from 'react';

export interface ReviewEligibility {
  canReview: boolean;
  reason: string | null;
  isLoading: boolean;
}

export function useReviewEligibility(orderId: string | null): ReviewEligibility {
  const [data, setData] = useState<{ canReview: boolean; reason: string | null }>({
    canReview: false,
    reason: null,
  });
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!orderId) return;
    let cancelled = false;
    setIsLoading(true);
    fetch(`/api/orders/${orderId}/eligibility`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: unknown) => {
        if (cancelled || !j || typeof j !== 'object') return;
        const obj = j as { canReview?: boolean; reason?: string | null };
        setData({
          canReview: obj.canReview === true,
          reason: obj.reason ?? null,
        });
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  return { ...data, isLoading };
}