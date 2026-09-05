import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui';
import { useToast } from '@vyro/ui';

export function PaymentConfirmButton({
  paymentId,
  status,
}: {
  paymentId: string;
  status: string;
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: () => api.post(`/payments/${paymentId}/confirm`, { status: 'confirmed' }),
    onSuccess: () => {
      toast.success('Payment confirmed');
      void qc.invalidateQueries({ queryKey: ['supplier-payments'] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Failed'),
  });
  if (status !== 'pending') return null;
  return (
    <Button variant="primary" onClick={() => mut.mutate()} disabled={mut.isPending}>
      Confirm receipt
    </Button>
  );
}
