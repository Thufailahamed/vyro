import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { Button, Input, Label, Select } from '@/components/ui';
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
  bankAccountHolder: string | null;
  bankVerified: boolean;
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
    bankAccountHolder: null,
    bankVerified: false,
  };
  const [draft, setDraft] = useState<Settings>(initial);
  useEffect(() => {
    setDraft(initial);
  }, [q.data]);

  const dirty =
    draft.companyName !== initial.companyName ||
    draft.contactPhone !== initial.contactPhone ||
    draft.warehouseAddress !== initial.warehouseAddress ||
    draft.defaultLeadTimeDays !== initial.defaultLeadTimeDays ||
    draft.payoutMethod !== initial.payoutMethod ||
    draft.bankName !== initial.bankName ||
    draft.bankAccountNo !== initial.bankAccountNo ||
    draft.bankBranch !== initial.bankBranch ||
    draft.bankAccountHolder !== initial.bankAccountHolder;

  const save = useMutation({
    mutationFn: () =>
      api.patch(`/suppliers/${supplierId}/settings`, {
        companyName: draft.companyName ?? undefined,
        contactPhone: draft.contactPhone ?? undefined,
        warehouseAddress: draft.warehouseAddress ?? undefined,
        defaultLeadTimeDays: draft.defaultLeadTimeDays ?? undefined,
        payoutMethod: draft.payoutMethod ?? undefined,
        bankName: draft.bankName ?? undefined,
        bankAccountNo: draft.bankAccountNo ?? undefined,
        bankBranch: draft.bankBranch ?? undefined,
        bankAccountHolder: draft.bankAccountHolder ?? undefined,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['supplier-settings', supplierId] });
      toast.success('Settings saved');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Failed'),
  });

  if (q.isLoading) return <p className="text-sm text-ink-4">Loading…</p>;

  return (
    <div className="space-y-6">
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

      <Surface kind="elevated" className="p-6 space-y-4">
        <header className="flex items-end justify-between gap-4">
          <h2 className="vyro-display text-lg">Payout details</h2>
          {draft.bankVerified && (
            <span className="text-[11px] uppercase tracking-[0.12em] text-volt">Bank verified</span>
          )}
        </header>
        <p className="text-xs text-ink-4">
          Where to send your settlements. Bank details are stored encrypted at rest.
        </p>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="s-payout-method">Payout method</Label>
            <Select
              id="s-payout-method"
              value={draft.payoutMethod ?? ''}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  payoutMethod: (e.target.value === '' ? null : (e.target.value as 'bank' | 'cash')),
                })
              }
            >
              <option value="">Not set</option>
              <option value="bank">Bank transfer</option>
              <option value="cash">Cash pickup</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="s-bank-holder">Account holder name</Label>
            <Input
              id="s-bank-holder"
              value={draft.bankAccountHolder ?? ''}
              onChange={(e) => setDraft({ ...draft, bankAccountHolder: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="s-bank-name">Bank name</Label>
            <Input
              id="s-bank-name"
              value={draft.bankName ?? ''}
              onChange={(e) => setDraft({ ...draft, bankName: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="s-bank-branch">Branch</Label>
            <Input
              id="s-bank-branch"
              value={draft.bankBranch ?? ''}
              onChange={(e) => setDraft({ ...draft, bankBranch: e.target.value })}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="s-bank-account">Account number</Label>
            <Input
              id="s-bank-account"
              value={draft.bankAccountNo ?? ''}
              onChange={(e) => setDraft({ ...draft, bankAccountNo: e.target.value })}
            />
          </div>
        </div>
      </Surface>
    </div>
  );
}
