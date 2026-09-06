import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { Button, Input, Label, Select, Badge } from '@/components/ui';
import { Surface } from '@/components/brand/Surface';
import { useToast } from '@vyro/ui';
import { SupplierErrorState, SupplierLoadingState } from './SupplierPageState';
import {
  Building2Icon,
  WarehouseIcon,
  BanknoteIcon,
  BellIcon,
  CheckCircle2Icon,
  SaveIcon,
  AlertCircleIcon,
} from '@/components/icons';

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
  notifyNewOrders: boolean;
  notifyLowStock: boolean;
  notifyPaymentReceived: boolean;
};

function emptySettings(supplierId: string): Settings {
  return {
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
    notifyNewOrders: true,
    notifyLowStock: true,
    notifyPaymentReceived: true,
  };
}

function Toggle({
  id,
  label,
  description,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      htmlFor={id}
      className="flex items-center justify-between gap-4 border border-ink/10 bg-paper px-4 py-3 cursor-pointer hover:border-ink/25 transition-colors rounded"
    >
      <div>
        <div className="text-sm font-medium text-ink">{label}</div>
        {description && <div className="text-xs text-ink-4">{description}</div>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={
          'relative h-6 w-11 shrink-0 rounded-full transition-colors ' +
          (checked ? 'bg-emerald-800' : 'bg-ink/20')
        }
      >
        <span
          className={
            'absolute top-0.5 size-5 bg-paper rounded-full transition-transform shadow-xs ' +
            (checked ? 'translate-x-5' : 'translate-x-0.5')
          }
        />
      </button>
    </label>
  );
}

export function SupplierSettingsForm({ supplierId }: { supplierId: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({
    queryKey: ['supplier-settings', supplierId],
    queryFn: () => api.get<{ settings: Settings }>(`/suppliers/${supplierId}/settings`),
  });

  const initial: Settings = q.data?.settings
    ? {
        ...emptySettings(supplierId),
        ...q.data.settings,
        notifyNewOrders: Boolean(q.data.settings.notifyNewOrders ?? true),
        notifyLowStock: Boolean(q.data.settings.notifyLowStock ?? true),
        notifyPaymentReceived: Boolean(q.data.settings.notifyPaymentReceived ?? true),
      }
    : emptySettings(supplierId);

  const [draft, setDraft] = useState<Settings>(initial);
  useEffect(() => {
    setDraft(initial);
  }, [q.data]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);

  const save = useMutation({
    mutationFn: () =>
      api.patch(`/suppliers/${supplierId}/settings`, {
        companyName: draft.companyName || undefined,
        registrationNo: draft.registrationNo || undefined,
        taxId: draft.taxId || undefined,
        contactEmail: draft.contactEmail || undefined,
        contactPhone: draft.contactPhone || undefined,
        warehouseAddress: draft.warehouseAddress || undefined,
        warehouseCity: draft.warehouseCity || undefined,
        warehouseDistrict: draft.warehouseDistrict || undefined,
        defaultLeadTimeDays: draft.defaultLeadTimeDays ?? undefined,
        payoutMethod: draft.payoutMethod ?? undefined,
        bankName: draft.bankName || undefined,
        bankAccountNo: draft.bankAccountNo || undefined,
        bankBranch: draft.bankBranch || undefined,
        bankAccountHolder: draft.bankAccountHolder || undefined,
        notifyNewOrders: draft.notifyNewOrders,
        notifyLowStock: draft.notifyLowStock,
        notifyPaymentReceived: draft.notifyPaymentReceived,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['supplier-settings', supplierId] });
      toast.success('Facility settings saved successfully');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Failed to save settings'),
  });

  if (q.isLoading) return <SupplierLoadingState label="Loading facility settings" />;
  if (q.isError) {
    return (
      <SupplierErrorState message="Could not load settings." onRetry={() => void q.refetch()} />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between sticky top-14 z-10 py-2.5 px-4 bg-bone/90 backdrop-blur-sm border border-line rounded shadow-xs">
        <div className="text-xs text-ink-3">
          {dirty ? (
            <span className="text-amber font-medium flex items-center gap-1">
              <AlertCircleIcon size={13} /> You have unsaved configuration changes
            </span>
          ) : (
            <span className="text-emerald-800 font-medium flex items-center gap-1">
              <CheckCircle2Icon size={13} /> All settings synchronized
            </span>
          )}
        </div>
        <Button
          variant="primary"
          disabled={!dirty || save.isPending}
          loading={save.isPending}
          onClick={() => save.mutate()}
          className="gap-1.5 shadow-xs"
        >
          <SaveIcon size={14} />
          {save.isPending ? 'Saving…' : dirty ? 'Save Changes' : 'Saved'}
        </Button>
      </div>

      {/* Company Profile */}
      <Surface kind="elevated" className="p-6 space-y-4 border border-ink/10">
        <div className="flex items-center gap-2 border-b border-line pb-3">
          <Building2Icon size={18} className="text-copper" />
          <div>
            <h2 className="vyro-display text-base font-semibold text-ink">Facility & Legal Entity</h2>
            <p className="text-xs text-ink-4">Commercial registration and tax identity.</p>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4 pt-1">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="s-company" className="text-xs">Trading / Company Name</Label>
            <Input
              id="s-company"
              value={draft.companyName ?? ''}
              onChange={(e) => setDraft({ ...draft, companyName: e.target.value })}
              placeholder="e.g. Ceylon Agro Commodities Ltd"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="s-reg" className="text-xs">Business Registration Number</Label>
            <Input
              id="s-reg"
              value={draft.registrationNo ?? ''}
              onChange={(e) => setDraft({ ...draft, registrationNo: e.target.value })}
              placeholder="e.g. PV-12345"
              className="font-mono text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="s-tax" className="text-xs">SVAT / Tax Identification Number</Label>
            <Input
              id="s-tax"
              value={draft.taxId ?? ''}
              onChange={(e) => setDraft({ ...draft, taxId: e.target.value })}
              placeholder="e.g. 104567890-7000"
              className="font-mono text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="s-email" className="text-xs">Dispatch Contact Email</Label>
            <Input
              id="s-email"
              type="email"
              value={draft.contactEmail ?? ''}
              onChange={(e) => setDraft({ ...draft, contactEmail: e.target.value })}
              placeholder="orders@facility.lk"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="s-phone" className="text-xs">Dispatch Hotline Phone</Label>
            <Input
              id="s-phone"
              value={draft.contactPhone ?? ''}
              onChange={(e) => setDraft({ ...draft, contactPhone: e.target.value })}
              placeholder="+94 11 234 5678"
              className="font-mono text-xs"
            />
          </div>
        </div>
      </Surface>

      {/* Warehouse Logistics */}
      <Surface kind="elevated" className="p-6 space-y-4 border border-ink/10">
        <div className="flex items-center gap-2 border-b border-line pb-3">
          <WarehouseIcon size={18} className="text-copper" />
          <div>
            <h2 className="vyro-display text-base font-semibold text-ink">Depot & Dispatch Facility</h2>
            <p className="text-xs text-ink-4">Physical hub where commercial carriers collect freight.</p>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4 pt-1">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="s-addr" className="text-xs">Depot Street Address</Label>
            <Input
              id="s-addr"
              value={draft.warehouseAddress ?? ''}
              onChange={(e) => setDraft({ ...draft, warehouseAddress: e.target.value })}
              placeholder="e.g. 45 Industrial Zone, Orugodawatta"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="s-city" className="text-xs">City / Hub</Label>
            <Input
              id="s-city"
              value={draft.warehouseCity ?? ''}
              onChange={(e) => setDraft({ ...draft, warehouseCity: e.target.value })}
              placeholder="Colombo"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="s-district" className="text-xs">District</Label>
            <Input
              id="s-district"
              value={draft.warehouseDistrict ?? ''}
              onChange={(e) => setDraft({ ...draft, warehouseDistrict: e.target.value })}
              placeholder="Western Province"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="s-lead" className="text-xs">Default Dispatch Turnaround (Days)</Label>
            <Input
              id="s-lead"
              type="number"
              min={0}
              value={draft.defaultLeadTimeDays ?? ''}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  defaultLeadTimeDays: e.target.value ? Number(e.target.value) : null,
                })
              }
              placeholder="1"
              className="font-mono text-xs max-w-xs"
            />
          </div>
        </div>
      </Surface>

      {/* Payout Bank Account */}
      <Surface kind="elevated" className="p-6 space-y-4 border border-ink/10">
        <div className="flex items-center justify-between border-b border-line pb-3">
          <div className="flex items-center gap-2">
            <BanknoteIcon size={18} className="text-copper" />
            <div>
              <h2 className="vyro-display text-base font-semibold text-ink">Settlement Bank Account</h2>
              <p className="text-xs text-ink-4">Encrypted at rest for automated weekly bank payouts.</p>
            </div>
          </div>
          {draft.bankVerified ? (
            <Badge variant="success" className="gap-1 font-mono text-[11px]">
              <CheckCircle2Icon size={12} />
              Bank Verified
            </Badge>
          ) : (
            <Badge variant="warning" className="font-mono text-[11px]">
              Verification Pending
            </Badge>
          )}
        </div>

        <div className="grid sm:grid-cols-2 gap-4 pt-1">
          <div className="space-y-1.5">
            <Label htmlFor="s-payout-method" className="text-xs">Disbursement Mode</Label>
            <Select
              id="s-payout-method"
              value={draft.payoutMethod ?? ''}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  payoutMethod: e.target.value === '' ? null : (e.target.value as 'bank' | 'cash'),
                })
              }
            >
              <option value="">Not configured</option>
              <option value="bank">Direct Bank Transfer (SLIPS / CEFT)</option>
              <option value="cash">Depot Cash on Delivery / Counter</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="s-bank-holder" className="text-xs">Beneficiary Account Name</Label>
            <Input
              id="s-bank-holder"
              value={draft.bankAccountHolder ?? ''}
              onChange={(e) => setDraft({ ...draft, bankAccountHolder: e.target.value })}
              placeholder="e.g. Ceylon Agro Commodities Pvt Ltd"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="s-bank-name" className="text-xs">Bank Name</Label>
            <Input
              id="s-bank-name"
              value={draft.bankName ?? ''}
              onChange={(e) => setDraft({ ...draft, bankName: e.target.value })}
              placeholder="e.g. Commercial Bank of Ceylon / Hatton National Bank"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="s-bank-branch" className="text-xs">Branch Name</Label>
            <Input
              id="s-bank-branch"
              value={draft.bankBranch ?? ''}
              onChange={(e) => setDraft({ ...draft, bankBranch: e.target.value })}
              placeholder="e.g. Kollupitiya Corporate Branch"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="s-bank-account" className="text-xs">Bank Account Number</Label>
            <Input
              id="s-bank-account"
              value={draft.bankAccountNo ?? ''}
              onChange={(e) => setDraft({ ...draft, bankAccountNo: e.target.value })}
              placeholder="e.g. 100012345678"
              className="font-mono text-xs"
            />
          </div>
        </div>
      </Surface>

      {/* Notifications */}
      <Surface kind="elevated" className="p-6 space-y-4 border border-ink/10">
        <div className="flex items-center gap-2 border-b border-line pb-3">
          <BellIcon size={18} className="text-copper" />
          <div>
            <h2 className="vyro-display text-base font-semibold text-ink">Fulfillment Notifications</h2>
            <p className="text-xs text-ink-4">Trigger transactional alerts to your team.</p>
          </div>
        </div>

        <div className="space-y-2 pt-1">
          <Toggle
            id="n-orders"
            label="Incoming Purchase Orders"
            description="Notify when a wholesale buyer places a new PO awaiting acceptance"
            checked={draft.notifyNewOrders}
            onChange={(v) => setDraft({ ...draft, notifyNewOrders: v })}
          />
          <Toggle
            id="n-stock"
            label="Inventory Depletion Warning"
            description="Alert when a published commodity SKU reaches low stock status"
            checked={draft.notifyLowStock}
            onChange={(v) => setDraft({ ...draft, notifyLowStock: v })}
          />
          <Toggle
            id="n-pay"
            label="Payment & Payout Remittances"
            description="Receive email notification on payment confirmation or bank payout release"
            checked={draft.notifyPaymentReceived}
            onChange={(v) => setDraft({ ...draft, notifyPaymentReceived: v })}
          />
        </div>
      </Surface>
    </div>
  );
}
