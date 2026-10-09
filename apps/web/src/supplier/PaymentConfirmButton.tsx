import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui';
import { useToast } from '@vyro/ui';
import { useSupplierId } from './useSupplierId';

export function PaymentConfirmButton({
  paymentId,
  status,
  method,
}: {
  paymentId: string;
  status: string;
  method?: string;
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const { supplierId } = useSupplierId();
  const mut = useMutation({
    mutationFn: () => api.post(`/payments/${paymentId}/confirm`, { status: 'confirmed' }),
    onSuccess: () => {
      toast.success('Payment confirmed');
      void qc.invalidateQueries({ queryKey: ['supplier', supplierId, 'payments'] });
      void qc.invalidateQueries({ queryKey: ['supplier', supplierId, 'balance'] });
      void qc.invalidateQueries({ queryKey: ['supplier', supplierId, 'statement'] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Failed'),
  });
  if (status !== 'pending') return null;
  // Bank transfers are paid into VYRO's account and verified by VYRO finance.
  if (method === 'bank_transfer' || method === 'online') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber/10 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-amber">
        <span className="size-1.5 animate-pulse rounded-full bg-amber" />
        VYRO verifying
      </span>
    );
  }
  return (
    <Button variant="primary" size="sm" onClick={() => mut.mutate()} disabled={mut.isPending} loading={mut.isPending}>
      Confirm receipt
    </Button>
  );
}
