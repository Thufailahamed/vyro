import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { PageHeader, Button, Input, Label, Select, Badge } from '@/components/ui';
import { Surface } from '@/components/brand/Surface';
import { useAuth } from '@/lib/auth';
import { useToast } from '@vyro/ui';
import { useSupplierId } from './useSupplierId';
import { SupplierErrorState, SupplierLoadingState } from './SupplierPageState';
import {
  Building2Icon,
  WarehouseIcon,
  BanknoteIcon,
  BellIcon,
  CheckCircle2Icon,
  SaveIcon,
  AlertCircleIcon,
  CopyIcon,
  CheckCheckIcon,
  UserIcon,
  ShieldCheckIcon,
  LogOutIcon,
  ClockIcon,
  MapPinIcon,
  PhoneIcon,
  MailIcon,
  UsersIcon,
} from '@/components/icons';

type Supplier = { id: string; name: string; description: string | null; createdAt: number };

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
      className="flex items-center justify-between gap-4 border border-ink/10 bg-paper p-4 cursor-pointer hover:border-ink/25 transition-colors rounded-md shadow-xs"
    >
      <div>
        <div className="text-sm font-semibold text-ink">{label}</div>
        {description && <div className="text-xs text-ink-4 mt-0.5">{description}</div>}
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

type TabKey = 'general' | 'logistics' | 'payouts' | 'notifications' | 'team';

export function SupplierSettingsPage() {
  const { supplierId, role, supplierName } = useSupplierId();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();

  const [tab, setTab] = useState<TabKey>('general');
  const [copied, setCopied] = useState(false);

  const detail = useQuery({
    queryKey: ['supplier', supplierId, 'detail'],
    queryFn: () => api.get<{ supplier: Supplier }>(`/suppliers/${supplierId}`),
    retry: false,
  });

  const settingsQuery = useQuery({
    queryKey: ['supplier-settings', supplierId],
    queryFn: () => api.get<{ settings: Settings }>(`/suppliers/${supplierId}/settings`),
  });

  const initial: Settings = settingsQuery.data?.settings
    ? {
        ...emptySettings(supplierId),
        ...settingsQuery.data.settings,
        notifyNewOrders: Boolean(settingsQuery.data.settings.notifyNewOrders ?? true),
        notifyLowStock: Boolean(settingsQuery.data.settings.notifyLowStock ?? true),
        notifyPaymentReceived: Boolean(settingsQuery.data.settings.notifyPaymentReceived ?? true),
      }
    : emptySettings(supplierId);

  const [draft, setDraft] = useState<Settings>(initial);
  useEffect(() => {
    setDraft(initial);
  }, [settingsQuery.data]);

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

  const handleCopyId = () => {
    void navigator.clipboard.writeText(supplierId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  if (settingsQuery.isLoading || detail.isLoading) {
    return <SupplierLoadingState label="Loading facility settings" />;
  }

  if (settingsQuery.isError) {
    return (
      <SupplierErrorState
        message="Could not load settings."
        onRetry={() => void settingsQuery.refetch()}
      />
    );
  }

  const facilityName = detail.data?.supplier.name ?? supplierName ?? 'Facility';
  const initialLetter = facilityName.charAt(0).toUpperCase() || 'F';

  return (
    <div className="space-y-8 max-w-6xl pb-16">
      {/* Header with Save State Actions */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-line pb-6">
        <div>
          <div className="text-[11px] font-mono uppercase tracking-[0.16em] text-copper font-semibold">
            Operations / Facility Configuration
          </div>
          <h1 className="vyro-display text-2xl sm:text-3xl font-bold text-ink mt-1">
            Facility Settings
          </h1>
          <p className="text-sm text-ink-3 mt-1">
            Manage legal entity credentials, depot dispatch parameters, settlement accounts, and notifications.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {dirty ? (
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDraft(initial)}
                disabled={save.isPending}
                className="text-xs text-ink-4 hover:text-ink"
              >
                Discard
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => save.mutate()}
                loading={save.isPending}
                className="bg-volt text-ink hover:bg-volt-glow font-bold gap-1.5 shadow-soft-sm"
              >
                <SaveIcon size={14} />
                Save Changes
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-800 border border-emerald-800/20 rounded-md text-xs font-medium">
              <CheckCircle2Icon size={13} />
              All settings synced
            </div>
          )}
        </div>
      </header>

      {/* Facility Identity Hero Card */}
      <Surface kind="ink" className="p-6 relative overflow-hidden grain rounded-lg shadow-soft-sm">
        <div className="absolute inset-0 opacity-25 pointer-events-none bg-[radial-gradient(ellipse_at_top_right,rgba(198,220,74,0.35),transparent_60%)]" />
        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-start sm:items-center gap-4">
            <div className="size-14 rounded-md bg-volt/15 border border-volt/30 flex items-center justify-center font-display text-2xl font-bold text-volt shrink-0 shadow-inner">
              {initialLetter}
            </div>
            <div className="space-y-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="font-display text-xl sm:text-2xl font-bold text-paper truncate">
                  {facilityName}
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-400 border border-emerald-500/30 font-mono text-[10px] uppercase tracking-wider font-semibold">
                  <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Active Depot
                </span>
                <Badge variant="neutral" className="bg-paper/10 text-paper/80 border-paper/15 font-mono text-[10px] uppercase">
                  {role}
                </Badge>
              </div>
              <p className="text-xs text-paper/60 max-w-xl line-clamp-1">
                {detail.data?.supplier.description || 'Commercial wholesale depot on the Vyro network.'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-3 md:pt-0 border-t md:border-t-0 border-paper/10">
            <div className="bg-paper/5 border border-paper/10 rounded px-3 py-1.5 space-y-0.5">
              <div className="text-[10px] uppercase font-mono tracking-wider text-paper/40">Facility ID</div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-paper/90 truncate max-w-[150px]">
                  {supplierId}
                </span>
                <button
                  type="button"
                  onClick={handleCopyId}
                  className="text-paper/50 hover:text-volt transition-colors p-0.5"
                  title="Copy Facility ID"
                >
                  {copied ? <CheckCheckIcon size={14} className="text-volt" /> : <CopyIcon size={14} />}
                </button>
              </div>
            </div>
          </div>
        </div>
      </Surface>

      {/* Settings Navigation Tabs */}
      <div className="border-b border-line flex items-center gap-2 overflow-x-auto scrollbar-none">
        {[
          { key: 'general', label: 'General & Legal', icon: Building2Icon },
          { key: 'logistics', label: 'Depot & Logistics', icon: WarehouseIcon },
          { key: 'payouts', label: 'Payouts & Banking', icon: BanknoteIcon },
          { key: 'notifications', label: 'Notifications', icon: BellIcon },
          { key: 'team', label: 'Team & Session', icon: UsersIcon },
        ].map((t) => {
          const Icon = t.icon;
          const isActive = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key as TabKey)}
              className={`flex items-center gap-2 px-4 py-3 text-xs uppercase tracking-wider font-semibold border-b-2 -mb-px transition-colors whitespace-nowrap ${
                isActive
                  ? 'border-ink text-ink font-bold'
                  : 'border-transparent text-ink-4 hover:text-ink hover:border-ink/30'
              }`}
            >
              <Icon size={14} className={isActive ? 'text-copper' : 'text-ink-4'} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab 1: General & Legal */}
      {tab === 'general' && (
        <div className="grid lg:grid-cols-3 gap-8">
          <div className="space-y-2">
            <h2 className="vyro-display text-lg font-bold text-ink flex items-center gap-2">
              <Building2Icon size={18} className="text-copper" />
              Corporate Identity
            </h2>
            <p className="text-xs text-ink-3 leading-relaxed">
              Your registered business name, corporate registration number, and SVAT tax identity appear on wholesale buyer purchase orders and digital tax receipts.
            </p>
            <div className="p-3 bg-mist/30 border border-line rounded-md text-xs text-ink-4 mt-3">
              <span className="font-semibold text-ink">SVAT Note:</span> Enter your 12-digit Inland Revenue registration code to enable zero-rated wholesale invoices for registered buyers.
            </div>
          </div>

          <div className="lg:col-span-2 space-y-6">
            <Surface kind="elevated" className="p-6 sm:p-7 border border-ink/10 shadow-soft-sm space-y-5 rounded-lg">
              <div className="space-y-1.5">
                <Label htmlFor="s-company" className="text-xs font-semibold text-ink">
                  Trading / Company Name
                </Label>
                <div className="relative">
                  <Input
                    id="s-company"
                    value={draft.companyName ?? ''}
                    onChange={(e) => setDraft({ ...draft, companyName: e.target.value })}
                    placeholder="e.g. Ceylon Agro Commodities Pvt Ltd"
                    className="text-sm font-medium"
                  />
                </div>
                <p className="text-[11px] text-ink-4">Legal entity name printed on commercial packing slips.</p>
              </div>

              <div className="grid sm:grid-cols-2 gap-4 pt-1">
                <div className="space-y-1.5">
                  <Label htmlFor="s-reg" className="text-xs font-semibold text-ink">
                    Business Registration No. (BRN)
                  </Label>
                  <Input
                    id="s-reg"
                    value={draft.registrationNo ?? ''}
                    onChange={(e) => setDraft({ ...draft, registrationNo: e.target.value })}
                    placeholder="e.g. PV-12345"
                    className="font-mono text-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="s-tax" className="text-xs font-semibold text-ink">
                    SVAT / Tax Identification No.
                  </Label>
                  <Input
                    id="s-tax"
                    value={draft.taxId ?? ''}
                    onChange={(e) => setDraft({ ...draft, taxId: e.target.value })}
                    placeholder="e.g. 104567890-7000"
                    className="font-mono text-xs"
                  />
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4 pt-1 border-t border-line">
                <div className="space-y-1.5">
                  <Label htmlFor="s-email" className="text-xs font-semibold text-ink flex items-center gap-1.5">
                    <MailIcon size={13} className="text-copper" />
                    Dispatch Contact Email
                  </Label>
                  <Input
                    id="s-email"
                    type="email"
                    value={draft.contactEmail ?? ''}
                    onChange={(e) => setDraft({ ...draft, contactEmail: e.target.value })}
                    placeholder="dispatch@facility.lk"
                    className="text-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="s-phone" className="text-xs font-semibold text-ink flex items-center gap-1.5">
                    <PhoneIcon size={13} className="text-copper" />
                    Dispatch Hotline Phone
                  </Label>
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
          </div>
        </div>
      )}

      {/* Tab 2: Depot & Logistics */}
      {tab === 'logistics' && (
        <div className="grid lg:grid-cols-3 gap-8">
          <div className="space-y-2">
            <h2 className="vyro-display text-lg font-bold text-ink flex items-center gap-2">
              <WarehouseIcon size={18} className="text-copper" />
              Depot Logistics
            </h2>
            <p className="text-xs text-ink-3 leading-relaxed">
              Physical depot address where commercial logistics carriers and verified buyer transport fleets collect freight consignments.
            </p>
            <div className="p-3 bg-mist/30 border border-line rounded-md text-xs text-ink-4 mt-3">
              <span className="font-semibold text-ink">Turnaround:</span> Default turnaround days are used by buyer checkout to compute delivery date estimates.
            </div>
          </div>

          <div className="lg:col-span-2 space-y-6">
            <Surface kind="elevated" className="p-6 sm:p-7 border border-ink/10 shadow-soft-sm space-y-5 rounded-lg">
              <div className="space-y-1.5">
                <Label htmlFor="s-addr" className="text-xs font-semibold text-ink flex items-center gap-1.5">
                  <MapPinIcon size={13} className="text-copper" />
                  Depot Physical Street Address
                </Label>
                <Input
                  id="s-addr"
                  value={draft.warehouseAddress ?? ''}
                  onChange={(e) => setDraft({ ...draft, warehouseAddress: e.target.value })}
                  placeholder="e.g. 45 Industrial Zone Road, Orugodawatta"
                  className="text-sm"
                />
              </div>

              <div className="grid sm:grid-cols-2 gap-4 pt-1">
                <div className="space-y-1.5">
                  <Label htmlFor="s-city" className="text-xs font-semibold text-ink">
                    City / Logistics Hub
                  </Label>
                  <Input
                    id="s-city"
                    value={draft.warehouseCity ?? ''}
                    onChange={(e) => setDraft({ ...draft, warehouseCity: e.target.value })}
                    placeholder="Colombo"
                    className="text-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="s-district" className="text-xs font-semibold text-ink">
                    District / Province
                  </Label>
                  <Input
                    id="s-district"
                    value={draft.warehouseDistrict ?? ''}
                    onChange={(e) => setDraft({ ...draft, warehouseDistrict: e.target.value })}
                    placeholder="Western Province"
                    className="text-xs"
                  />
                </div>
              </div>

              <div className="pt-2 border-t border-line space-y-1.5">
                <Label htmlFor="s-lead" className="text-xs font-semibold text-ink flex items-center gap-1.5">
                  <ClockIcon size={13} className="text-copper" />
                  Default Preparation & Lead Time (Days)
                </Label>
                <div className="flex items-center gap-3">
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
                    className="font-mono text-xs max-w-[120px]"
                  />
                  <span className="text-xs text-ink-4">
                    Orders confirmed today will be marked ready for collection in{' '}
                    <strong className="text-ink">{draft.defaultLeadTimeDays ?? 1} day(s)</strong>.
                  </span>
                </div>
              </div>
            </Surface>
          </div>
        </div>
      )}

      {/* Tab 3: Payouts & Banking */}
      {tab === 'payouts' && (
        <div className="grid lg:grid-cols-3 gap-8">
          <div className="space-y-2">
            <h2 className="vyro-display text-lg font-bold text-ink flex items-center gap-2">
              <BanknoteIcon size={18} className="text-copper" />
              Settlement Account
            </h2>
            <p className="text-xs text-ink-3 leading-relaxed">
              Wholesale buyer payments held in Vyro escrow are automatically swept into this commercial bank account on weekly settlement dates.
            </p>
            <div className="p-3 bg-mist/30 border border-line rounded-md text-xs text-ink-4 mt-3">
              <span className="font-semibold text-ink">Bank Encryption:</span> Account credentials are encrypted with AES-256 at rest and verified against SLIPS / CEFT clearing networks.
            </div>
          </div>

          <div className="lg:col-span-2 space-y-6">
            <Surface kind="elevated" className="p-6 sm:p-7 border border-ink/10 shadow-soft-sm space-y-5 rounded-lg">
              <div className="flex items-center justify-between border-b border-line pb-4">
                <div>
                  <div className="text-xs font-semibold text-ink">Bank Verification Status</div>
                  <div className="text-[11px] text-ink-4">Authorized for automated payouts</div>
                </div>
                {draft.bankVerified ? (
                  <Badge variant="success" className="gap-1 font-mono text-[11px]">
                    <CheckCircle2Icon size={12} />
                    Verified Bank Account
                  </Badge>
                ) : (
                  <Badge variant="warning" className="font-mono text-[11px]">
                    Verification Pending
                  </Badge>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="s-payout-method" className="text-xs font-semibold text-ink">
                  Payout Disbursement Mode
                </Label>
                <Select
                  id="s-payout-method"
                  value={draft.payoutMethod ?? ''}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      payoutMethod: e.target.value === '' ? null : (e.target.value as 'bank' | 'cash'),
                    })
                  }
                  className="text-xs"
                >
                  <option value="">Select disbursement mode…</option>
                  <option value="bank">Direct Commercial Bank Transfer (CEFT / SLIPS)</option>
                  <option value="cash">Depot Cash on Delivery / Counter Collection</option>
                </Select>
              </div>

              <div className="grid sm:grid-cols-2 gap-4 pt-1">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="s-bank-holder" className="text-xs font-semibold text-ink">
                    Beneficiary Account Holder Name
                  </Label>
                  <Input
                    id="s-bank-holder"
                    value={draft.bankAccountHolder ?? ''}
                    onChange={(e) => setDraft({ ...draft, bankAccountHolder: e.target.value })}
                    placeholder="Must match official company bank records"
                    className="text-sm font-medium"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="s-bank-name" className="text-xs font-semibold text-ink">
                    Bank Name
                  </Label>
                  <Input
                    id="s-bank-name"
                    value={draft.bankName ?? ''}
                    onChange={(e) => setDraft({ ...draft, bankName: e.target.value })}
                    placeholder="e.g. Commercial Bank of Ceylon / HNB"
                    className="text-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="s-bank-branch" className="text-xs font-semibold text-ink">
                    Branch Name / Code
                  </Label>
                  <Input
                    id="s-bank-branch"
                    value={draft.bankBranch ?? ''}
                    onChange={(e) => setDraft({ ...draft, bankBranch: e.target.value })}
                    placeholder="e.g. Kollupitiya Branch (071)"
                    className="text-xs"
                  />
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="s-bank-account" className="text-xs font-semibold text-ink">
                    Bank Account Number
                  </Label>
                  <Input
                    id="s-bank-account"
                    value={draft.bankAccountNo ?? ''}
                    onChange={(e) => setDraft({ ...draft, bankAccountNo: e.target.value })}
                    placeholder="e.g. 100012345678"
                    className="font-mono text-sm"
                  />
                </div>
              </div>
            </Surface>
          </div>
        </div>
      )}

      {/* Tab 4: Notifications */}
      {tab === 'notifications' && (
        <div className="grid lg:grid-cols-3 gap-8">
          <div className="space-y-2">
            <h2 className="vyro-display text-lg font-bold text-ink flex items-center gap-2">
              <BellIcon size={18} className="text-copper" />
              Fulfillment Alerts
            </h2>
            <p className="text-xs text-ink-3 leading-relaxed">
              Control real-time email and in-app alerts sent to your operations and sales staff.
            </p>
          </div>

          <div className="lg:col-span-2 space-y-4">
            <Toggle
              id="n-orders"
              label="Incoming Purchase Orders"
              description="Receive an immediate notification whenever a commercial buyer places a new purchase order awaiting acceptance."
              checked={draft.notifyNewOrders}
              onChange={(v) => setDraft({ ...draft, notifyNewOrders: v })}
            />
            <Toggle
              id="n-stock"
              label="Inventory Depletion Alert"
              description="Notify dispatch manager when a commodity SKU reaches low stock status to prevent unexpected stockouts."
              checked={draft.notifyLowStock}
              onChange={(v) => setDraft({ ...draft, notifyLowStock: v })}
            />
            <Toggle
              id="n-pay"
              label="Payment & Payout Remittances"
              description="Alert finance team upon buyer escrow confirmation or release of scheduled weekly bank payout sweeps."
              checked={draft.notifyPaymentReceived}
              onChange={(v) => setDraft({ ...draft, notifyPaymentReceived: v })}
            />
          </div>
        </div>
      )}

      {/* Tab 5: Team & Session */}
      {tab === 'team' && (
        <div className="grid lg:grid-cols-3 gap-8">
          <div className="space-y-2">
            <h2 className="vyro-display text-lg font-bold text-ink flex items-center gap-2">
              <UsersIcon size={18} className="text-copper" />
              Team & Privileges
            </h2>
            <p className="text-xs text-ink-3 leading-relaxed">
              Overview of team members linked to this facility and active account session status.
            </p>
          </div>

          <div className="lg:col-span-2 space-y-6">
            <Surface kind="elevated" className="p-6 border border-ink/10 shadow-soft-sm rounded-lg space-y-4">
              <div className="flex items-center justify-between border-b border-line pb-3">
                <h3 className="font-display font-semibold text-base text-ink">Active Facility Members</h3>
                <span className="text-xs text-ink-4">1 Member</span>
              </div>

              <div className="flex items-center justify-between p-3.5 bg-mist/20 border border-line rounded-md">
                <div className="flex items-center gap-3">
                  <div className="size-10 rounded-full bg-ink text-paper font-bold flex items-center justify-center text-sm">
                    {user?.name?.charAt(0) || 'U'}
                  </div>
                  <div>
                    <div className="font-semibold text-sm text-ink">{user?.name || 'Authorized Member'}</div>
                    <div className="text-xs text-ink-4">{user?.email}</div>
                  </div>
                </div>
                <div className="text-right">
                  <Badge variant="neutral" className="uppercase font-mono text-[10px]">
                    {role}
                  </Badge>
                  <div className="text-[10px] text-ink-4 mt-0.5">Full Administrative Rights</div>
                </div>
              </div>

              <p className="text-xs text-ink-4 pt-1">
                Multi-seat team invitation management will be available in the next platform release.
                To add additional dispatchers or warehouse clerks, contact your platform administrator.
              </p>
            </Surface>

            <Surface kind="elevated" className="p-6 border-l-4 border-l-rose border border-ink/10 shadow-soft-sm rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-display font-semibold text-base text-ink">Current Session</h3>
                  <p className="text-xs text-ink-4 mt-0.5">
                    Sign out of your VYRO account on this browser.
                  </p>
                </div>
                <Button variant="danger" size="sm" onClick={handleSignOut} className="gap-1.5">
                  <LogOutIcon size={14} />
                  Sign Out
                </Button>
              </div>
            </Surface>
          </div>
        </div>
      )}

      {/* Floating Save Dock (Shopify / Linear style) */}
      {dirty && (
        <div className="fixed bottom-6 inset-x-0 z-40 flex justify-center px-4 animate-slide-up">
          <div className="bg-ink text-paper px-6 py-3.5 rounded-full shadow-2xl border border-paper/15 flex items-center gap-4 backdrop-blur-md">
            <span className="flex items-center gap-2 text-xs font-mono font-medium text-volt">
              <span className="size-2 rounded-full bg-volt animate-ping" />
              Unsaved changes pending
            </span>
            <div className="h-4 w-px bg-paper/20" />
            <button
              type="button"
              onClick={() => setDraft(initial)}
              disabled={save.isPending}
              className="text-xs text-paper/70 hover:text-paper font-medium transition-colors"
            >
              Reset
            </button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => save.mutate()}
              loading={save.isPending}
              className="bg-volt text-ink hover:bg-volt-glow font-bold text-xs py-1.5 px-4 rounded-full shadow-xs"
            >
              Save Changes
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
