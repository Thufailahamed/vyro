import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui';
import { useToast } from '@vyro/ui';
import { DELIVERY_STATUSES } from '@vyro/validation/delivery';

const NEXT_BY_STATUS: Record<string, string | null> = {
  pending: 'assigned',
  assigned: 'picked_up',
  picked_up: 'in_transit',
  in_transit: 'delivered',
};

export function DeliveryTransitionButtons({
  poId,
  status,
}: {
  poId: string;
  status: string;
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const next = NEXT_BY_STATUS[status] ?? null;
  const mut = useMutation({
    mutationFn: () => api.post(`/deliveries/${poId}/transitions`, { status: next }),
    onSuccess: () => {
      toast.success(`Moved to ${next}`);
      void qc.invalidateQueries({ queryKey: ['supplier-deliveries'] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Failed'),
  });
  if (!next || !DELIVERY_STATUSES.includes(next as any)) return null;
  return (
    <Button variant="ghost" onClick={() => mut.mutate()} disabled={mut.isPending}>
      Advance → {next}
    </Button>
  );
}
