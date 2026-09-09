import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { Button, Input, Label } from '@/components/ui';
import { useToast } from '@vyro/ui';
import { DELIVERY_STATUSES } from '@vyro/validation/delivery';
import { useSupplierId } from './useSupplierId';
import { TruckIcon, UserCheckIcon, ArrowRightIcon } from '@/components/icons';

const NEXT_BY_STATUS: Record<string, string | null> = {
  pending: 'assigned',
  assigned: 'picked_up',
  picked_up: 'in_transit',
  in_transit: 'delivered',
  failed: 'assigned',
  delivered: null,
};

const LABEL: Record<string, string> = {
  assigned: 'Assign Driver',
  picked_up: 'Confirm Picked Up',
  in_transit: 'Dispatch Transit',
  delivered: 'Mark Delivered',
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
  const { supplierId } = useSupplierId();
  const next = NEXT_BY_STATUS[status] ?? null;

  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [driverName, setDriverName] = useState('');
  const [driverPhone, setDriverPhone] = useState('');

  const mut = useMutation({
    mutationFn: (payload?: { driverName?: string; driverPhone?: string }) =>
      api.post(`/deliveries/${poId}/transitions`, {
        status: next,
        ...(payload?.driverName ? { driverName: payload.driverName } : {}),
        ...(payload?.driverPhone ? { driverPhone: payload.driverPhone } : {}),
      }),
    onSuccess: () => {
      toast.success(`Delivery advanced to ${LABEL[next!] ?? next}`);
      setAssignModalOpen(false);
      void qc.invalidateQueries({ queryKey: ['supplier', supplierId, 'deliveries'] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Failed to advance delivery'),
  });

  if (!next || !DELIVERY_STATUSES.includes(next as (typeof DELIVERY_STATUSES)[number])) return null;

  const handleClick = () => {
    if (next === 'assigned') {
      setAssignModalOpen(true);
    } else {
      mut.mutate();
    }
  };

  return (
    <>
      <Button
        variant={next === 'delivered' ? 'success' : 'secondary'}
        size="sm"
        onClick={handleClick}
        disabled={mut.isPending}
        loading={mut.isPending}
        className="text-xs gap-1 shadow-xs"
      >
        {next === 'assigned' ? <UserCheckIcon size={12} /> : <TruckIcon size={12} />}
        {LABEL[next] ?? `Advance → ${next}`}
      </Button>

      {assignModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/50 backdrop-blur-xs text-left"
          onClick={() => !mut.isPending && setAssignModalOpen(false)}
        >
          <div
            className="bg-paper border border-ink/20 rounded-md shadow-soft-xl max-w-sm w-full p-6 space-y-4 animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2">
              <div className="size-8 rounded bg-ink/5 flex items-center justify-center text-ink">
                <TruckIcon size={16} />
              </div>
              <h3 className="font-display font-bold text-base text-ink">Assign Dispatch Driver</h3>
            </div>
            <p className="text-xs text-ink-4">
              Enter driver contact details for order PO tracking.
            </p>

            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">Driver Full Name</Label>
                <Input
                  value={driverName}
                  onChange={(e) => setDriverName(e.target.value)}
                  placeholder="e.g. Sunil Perera"
                  className="text-xs"
                  autoFocus
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Driver Contact Phone</Label>
                <Input
                  value={driverPhone}
                  onChange={(e) => setDriverPhone(e.target.value)}
                  placeholder="e.g. +94 77 123 4567"
                  className="text-xs font-mono"
                />
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-2 border-t border-line">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setAssignModalOpen(false)}
                disabled={mut.isPending}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  if (!driverName.trim() || !driverPhone.trim()) {
                    toast.error('Driver name and phone are required');
                    return;
                  }
                  mut.mutate({ driverName: driverName.trim(), driverPhone: driverPhone.trim() });
                }}
                loading={mut.isPending}
              >
                Assign & Dispatch
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
