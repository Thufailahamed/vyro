import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { Button, Input, Label } from '@/components/ui';
import { Surface } from '@/components/brand/Surface';
import { useToast } from '@vyro/ui';

type Settings = {
  supplierId: string;
  companyName: string | null;
  registrationNo: string | null;
  taxId: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  warehouseAddress: string | null;
  warehouseCity: string | null;
  warehouseDistrict: string | null;
  defaultLeadTimeDays: number | null;
  payoutMethod: 'bank' | 'cash' | null;
  bankName: string | null;
  bankAccountNo: string | null;
  bankBranch: string | null;
};

export function SupplierSettingsForm({ supplierId }: { supplierId: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({
    queryKey: ['supplier-settings', supplierId],
    queryFn: () => api.get<{ settings: Settings }>(`/suppliers/${supplierId}/settings`),
  });

  const initial: Settings = q.data?.settings ?? {
    supplierId,
    companyName: null,
    registrationNo: null,
    taxId: null,
    contactEmail: null,
    contactPhone: null,
    warehouseAddress: null,
    warehouseCity: null,
    warehouseDistrict: null,
    defaultLeadTimeDays: null,
    payoutMethod: null,
    bankName: null,
    bankAccountNo: null,
    bankBranch: null,
  };
  const [draft, setDraft] = useState<Settings>(initial);
  useEffect(() => {
    setDraft(initial);
  }, [q.data]);

  const dirty =
    draft.companyName !== initial.companyName ||
    draft.contactPhone !== initial.contactPhone ||
    draft.warehouseAddress !== initial.warehouseAddress ||
    draft.defaultLeadTimeDays !== initial.defaultLeadTimeDays;

  const save = useMutation({
    mutationFn: () =>
      api.patch(`/suppliers/${supplierId}/settings`, {
        companyName: draft.companyName ?? undefined,
        contactPhone: draft.contactPhone ?? undefined,
        warehouseAddress: draft.warehouseAddress ?? undefined,
        defaultLeadTimeDays: draft.defaultLeadTimeDays ?? undefined,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['supplier-settings', supplierId] });
      toast.success('Settings saved');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Failed'),
  });

  if (q.isLoading) return <p className="text-sm text-ink-4">Loading…</p>;

  return (
    <Surface kind="elevated" className="p-6 space-y-4">
      <header className="flex items-end justify-between gap-4">
        <h2 className="vyro-display text-lg">Supplier profile</h2>
        <Button variant="primary" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? 'Saving…' : 'Save'}
        </Button>
      </header>
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="s-company">Company name</Label>
          <Input
            id="s-company"
            value={draft.companyName ?? ''}
            onChange={(e) => setDraft({ ...draft, companyName: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="s-phone">Contact phone</Label>
          <Input
            id="s-phone"
            value={draft.contactPhone ?? ''}
            onChange={(e) => setDraft({ ...draft, contactPhone: e.target.value })}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="s-addr">Warehouse address</Label>
          <Input
            id="s-addr"
            value={draft.warehouseAddress ?? ''}
            onChange={(e) => setDraft({ ...draft, warehouseAddress: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="s-lead">Default lead time (days)</Label>
          <Input
            id="s-lead"
            type="number"
            min={1}
            value={draft.defaultLeadTimeDays ?? ''}
            onChange={(e) =>
              setDraft({ ...draft, defaultLeadTimeDays: e.target.value ? Number(e.target.value) : null })
            }
          />
        </div>
      </div>
    </Surface>
  );
}
