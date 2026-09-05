import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui';
import { Surface } from '@/components/brand/Surface';
import { useToast } from '@vyro/ui';

type Outcome = 'refund_business' | 'release_supplier';

export function DisputeResolutionPanel({
  poId,
  onResolved,
}: {
  poId: string;
  onResolved?: () => void;
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const [note, setNote] = useState('');
  const mut = useMutation({
    mutationFn: (outcome: Outcome) =>
      api.post<{ ok: true; status: string }>(`/admin/disputes/${poId}/resolve`, {
        outcome,
        note: note || undefined,
      }),
    onSuccess: (data) => {
      toast.success(`Resolved → ${data.status}`);
      void qc.invalidateQueries({ queryKey: ['admin-disputes'] });
      onResolved?.();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Failed'),
  });

  return (
    <Surface kind="elevated" className="p-4 space-y-3">
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Resolution note (optional)"
        className="w-full h-20 rounded-xs border border-line bg-paper text-ink-1 p-2 text-body"
      />
      <div className="flex gap-2">
        <Button
          variant="primary"
          disabled={mut.isPending}
          onClick={() => mut.mutate('refund_business')}
        >
          Refund buyer
        </Button>
        <Button
          variant="ghost"
          disabled={mut.isPending}
          onClick={() => mut.mutate('release_supplier')}
        >
          Release supplier
        </Button>
      </div>
    </Surface>
  );
}
