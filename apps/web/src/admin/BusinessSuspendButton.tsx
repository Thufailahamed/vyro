import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui';
import { useToast } from '@vyro/ui';

export function BusinessSuspendButton({
  businessId,
  status,
}: {
  businessId: string;
  status: string;
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: () =>
      status === 'suspended'
        ? api.post(`/admin/businesses/${businessId}/unfreeze`)
        : api.post(`/admin/businesses/${businessId}/freeze`, { reason: 'policy' }),
    onSuccess: () => {
      toast.success(status === 'suspended' ? 'Unsuspended' : 'Suspended');
      void qc.invalidateQueries({ queryKey: ['admin-business', businessId] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Failed'),
  });

  return (
    <Button
      variant={status === 'suspended' ? 'primary' : 'ghost'}
      onClick={() => mut.mutate()}
      disabled={mut.isPending}
    >
      {status === 'suspended' ? 'Unsuspend' : 'Suspend'}
    </Button>
  );
}
