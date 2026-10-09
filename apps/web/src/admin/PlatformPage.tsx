import { useState, useMemo, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { cn } from '@vyro/ui';
import {
  SearchIcon,
  ClockIcon,
  ShieldCheckIcon,
  FileTextIcon,
  Trash2Icon,
  PlusIcon,
  MailIcon,
  BellIcon,
  EyeIcon,
  EyeOffIcon,
  AlertTriangleIcon,
  CheckCircle2Icon,
  XCircleIcon,
  SparklesIcon,
} from '@/components/icons';
import { usePermission } from './lib/permissions';
import {
  useFeatureFlags,
  useUpdateFeatureFlags,
  useEmailTemplates,
  useUpdateEmailTemplates,
  useWebhooks,
  useCreateWebhook,
  useDisableWebhook,
  useUpdateWebhook,
  useWebhookDeliveries,
  useRetryDelivery,
  type WebhookDeliveryRow,
  type WebhookRow,
} from './useAdminPlatformConfig';
import {
  AdminPage,
  AdminPageHeader,
  Callout,
  Card,
  DetailList,
  EmptyBlock,
  Panel,
  Pill,
  Segmented,
  StatusPill,
  TableCard,
  TableSkeleton,
  Tabs,
  controlClass,
} from './ui';
import { Monogram, relativeTime, SegmentBar } from './registryUi';
import { Button, ControlHero, CopyButton, FieldLabel, Modal, RolloutSlider, SaveBar, Switch } from './platformUi';

const textareaClass = cn(controlClass, 'h-auto w-full py-2.5 leading-relaxed');

type Tab = 'flags' | 'templates' | 'webhooks';

interface FeatureFlagItem {
  key: string;
  enabled: boolean;
  rollout?: number;
  notes?: string;
}

interface EmailTemplateItem {
  key: string;
  subject: string;
  body: string;
  locale: string;
}

const DEFAULT_FEATURE_FLAGS: Record<string, { enabled: boolean; rollout: number; notes: string }> = {
  maintenance_mode: {
    enabled: false,
    rollout: 0,
    notes: 'Emergency platform-wide read-only maintenance window for database upgrades.',
  },
  promotions_v2: {
    enabled: true,
    rollout: 100,
    notes: 'Dynamic multi-tier discount and automatic basket voucher calculation engine.',
  },
  express_checkout: {
    enabled: true,
    rollout: 100,
    notes: 'One-tap checkout with saved shipping addresses and default payment methods.',
  },
  ai_recommendations: {
    enabled: true,
    rollout: 50,
    notes: 'Vector similarity ML product suggestions on Product Detail Pages and cart drawers.',
  },
  strict_kyc_enforcement: {
    enabled: false,
    rollout: 0,
    notes: 'Blocks high-value order creation for accounts without verified identity.',
  },
  instant_supplier_payouts: {
    enabled: true,
    rollout: 100,
    notes: 'Direct automated settlement via payment rail upon order delivery confirmation.',
  },
};

const DEFAULT_EMAIL_TEMPLATES: Record<string, { subject: string; body: string; locale: string }> = {
  order_confirmation: {
    subject: 'Your VYRO Order #{{orderId}} is Confirmed',
    body: 'Hi {{customerName}},\n\nThank you for choosing VYRO. Your order #{{orderId}} containing {{itemCount}} item(s) has been confirmed and forwarded to the supplier for preparation.\n\nTotal: LKR {{totalAmount}}\nDelivery Address: {{deliveryAddress}}\n\nTrack your order: {{trackingUrl}}\n\nWarm regards,\nVYRO Team',
    locale: 'en',
  },
  order_shipped: {
    subject: 'Your VYRO Order #{{orderId}} is On Its Way!',
    body: 'Hi {{customerName}},\n\nGreat news! Your package is now in transit with our delivery partner.\n\nCarrier: {{carrierName}}\nTracking Code: {{trackingCode}}\nEstimated Delivery: {{estimatedDelivery}}\n\nTrack live: {{trackingUrl}}\n\nWarm regards,\nVYRO Team',
    locale: 'en',
  },
  kyc_approved: {
    subject: 'Your VYRO Merchant Verification is Approved',
    body: 'Hi {{merchantName}},\n\nCongratulations! Your business identity documents have been reviewed and approved by our compliance department. You can now publish catalog items and receive payouts.\n\nMerchant Dashboard: {{dashboardUrl}}\n\nBest,\nVYRO Trust & Safety',
    locale: 'en',
  },
  kyc_rejected: {
    subject: 'Action Required: Your VYRO KYC Submission',
    body: 'Hi {{merchantName}},\n\nOur compliance team reviewed your submission but could not complete verification. Reason: {{rejectionReason}}.\n\nPlease upload revised documents at: {{resubmitUrl}}\n\nBest,\nVYRO Trust & Safety',
    locale: 'en',
  },
  admin_invitation: {
    subject: 'Invitation to VYRO Admin Control',
    body: 'Hello,\n\nYou have been invited to join the VYRO administrative control plane with the {{role}} tier.\n\nAccept your invitation and configure your credentials:\n{{inviteUrl}}\n\nNote: This security link expires in 7 days.',
    locale: 'en',
  },
};

const WEBHOOK_EVENT_CATALOG = [
  'order.created',
  'order.status_updated',
  'order.delivered',
  'order.cancelled',
  'payment.completed',
  'payment.failed',
  'user.suspended',
  'kyc.approved',
  'abuse_report.created',
];


const SECTION_LABEL = 'text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-4';

const HIGH_IMPACT = /maintenance|kyc|payout|kill/i;

const SAMPLE_VARS: Record<string, string> = {
  customerName: 'Thufail Ahamed',
  orderId: 'VY-8921',
  itemCount: '3',
  totalAmount: '14,500.00',
  deliveryAddress: '12 Galle Road, Colombo 03',
  trackingUrl: 'https://vyro.lk/orders/track/VY-8921',
  carrierName: 'VYRO Express Logistics',
  trackingCode: 'LK-902198',
  estimatedDelivery: 'Tomorrow by 5:00 PM',
  merchantName: 'Lanka Wholesale Traders',
  dashboardUrl: 'https://vyro.lk/supplier',
  rejectionReason: 'Business registration document unreadable',
  resubmitUrl: 'https://vyro.lk/supplier/kyc',
  role: 'Operations Admin',
  inviteUrl: 'https://vyro.lk/admin/invite/8f2a…',
};

const EVENT_GROUPS: Array<{ label: string; events: string[] }> = [
  { label: 'Orders', events: WEBHOOK_EVENT_CATALOG.filter((e) => e.startsWith('order.')) },
  { label: 'Payments', events: WEBHOOK_EVENT_CATALOG.filter((e) => e.startsWith('payment.')) },
  { label: 'Trust & safety', events: WEBHOOK_EVENT_CATALOG.filter((e) => /^(user|kyc|abuse)/.test(e)) },
];

function parseJsonList(s: string): string[] {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function hostOf(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function toFlagItems(raw: Record<string, unknown> | undefined): FeatureFlagItem[] {
  return Object.entries(raw ?? {}).map(([k, val]) => {
    if (typeof val === 'object' && val !== null) {
      const obj = val as { enabled?: boolean; rollout?: number; notes?: string };
      return { key: k, enabled: Boolean(obj.enabled), rollout: typeof obj.rollout === 'number' ? obj.rollout : 100, notes: obj.notes ?? '' };
    }
    return { key: k, enabled: Boolean(val), rollout: 100, notes: '' };
  });
}

function toTemplateItems(raw: Record<string, unknown> | undefined): EmailTemplateItem[] {
  return Object.entries(raw ?? {}).map(([k, val]) => {
    const obj = (typeof val === 'object' && val !== null ? val : {}) as { subject?: string; body?: string; locale?: string };
    return { key: k, subject: obj.subject ?? '', body: obj.body ?? '', locale: obj.locale ?? 'en' };
  });
}

function usePulse() {
  const [on, setOn] = useState(false);
  const fire = () => {
    setOn(true);
    setTimeout(() => setOn(false), 3000);
  };
  return [on, fire] as const;
}

function ModeSwitch({ mode, onChange, visualLabel }: { mode: 'visual' | 'json'; onChange: (m: 'visual' | 'json') => void; visualLabel: string }) {
  return (
    <Segmented
      ariaLabel="Editor mode"
      value={mode}
      onChange={onChange}
      items={[
        { key: 'visual', label: visualLabel },
        { key: 'json', label: 'Raw JSON' },
      ]}
    />
  );
}

function SearchField({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative min-w-0 flex-1 sm:max-w-xs">
      <SearchIcon size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-4" />
      <input
        type="text"
        placeholder={placeholder}
        aria-label={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(controlClass, 'w-full pl-9')}
      />
    </div>
  );
}

function JsonEditor({
  title,
  version,
  value,
  onChange,
  disabled,
  onFormat,
}: {
  title: string;
  version: number;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  onFormat?: (() => void) | undefined;
}) {
  const lines = value.split('\n').length;
  return (
    <Panel
      title={title}
      description={`Schema version v${version} · ${lines} lines — validated before saving.`}
      icon={<FileTextIcon size={16} />}
      actions={
        onFormat ? (
          <Button size="sm" variant="secondary" onClick={onFormat}>
            Format JSON
          </Button>
        ) : undefined
      }
    >
      <div className="overflow-hidden rounded-xl bg-charcoal shadow-[inset_0_0_0_1px_rgba(250,247,240,0.08)]">
        <div className="flex items-center gap-1.5 border-b border-paper/[0.08] px-4 py-2.5">
          <span className="size-2.5 rounded-full bg-rose/70" />
          <span className="size-2.5 rounded-full bg-amber/70" />
          <span className="size-2.5 rounded-full bg-mint/70" />
          <span className="ml-2 font-mono text-[11px] text-paper/40">config.json</span>
        </div>
        <textarea
          spellCheck={false}
          aria-label={title}
          className="block h-[26rem] w-full resize-y bg-transparent p-4 font-mono text-xs leading-relaxed text-paper/90 outline-none placeholder:text-paper/30 disabled:opacity-60"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        />
      </div>
    </Panel>
  );
}

export function PlatformPage() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab');
  const tab: Tab = raw === 'templates' || raw === 'webhooks' ? raw : 'flags';

  const switchTab = (next: string) => {
    const p = new URLSearchParams(params);
    p.set('tab', next);
    setParams(p);
  };

  const flagsQuery = useFeatureFlags();
  const templatesQuery = useEmailTemplates();
  const webhooksQuery = useWebhooks();

  const flagItems = toFlagItems(flagsQuery.data?.value);
  const flagCount = flagItems.length;
  const liveFlags = flagItems.filter((f) => f.enabled).length;
  const templateCount = Object.keys(templatesQuery.data?.value ?? {}).length;
  const webhookCount = webhooksQuery.data?.length ?? 0;
  const activeWebhookCount = (webhooksQuery.data ?? []).filter((w) => w.active === 1).length;
  const kpisLoading = flagsQuery.isLoading || templatesQuery.isLoading || webhooksQuery.isLoading;

  return (
    <AdminPage>
      <AdminPageHeader
        kicker="System & Platform Control"
        title="Platform Configuration"
        description="Runtime control plane for feature toggles, customer notification templates, and real-time webhook event relays."
        meta={
          <>
            <Pill tone="brand" dot>
              Changes apply on save
            </Pill>
            <Pill tone="neutral" icon={<ClockIcon size={11} />}>
              Optimistic concurrency
            </Pill>
          </>
        }
      />

      <ControlHero
        metrics={[
          {
            label: 'Feature flags',
            value: flagCount,
            sub: `${liveFlags} live · schema v${flagsQuery.data?.version ?? 0}`,
            icon: <ShieldCheckIcon size={16} />,
            status: flagCount ? 'ok' : 'idle',
            loading: kpisLoading,
          },
          {
            label: 'Email templates',
            value: templateCount,
            sub: `Transactional copy · schema v${templatesQuery.data?.version ?? 0}`,
            icon: <MailIcon size={16} />,
            status: templateCount ? 'ok' : 'idle',
            loading: kpisLoading,
          },
          {
            label: 'Active webhooks',
            value: activeWebhookCount,
            sub:
              webhookCount === 0
                ? 'No endpoints registered'
                : activeWebhookCount === webhookCount
                  ? `All ${webhookCount} endpoints live`
                  : `${webhookCount - activeWebhookCount} of ${webhookCount} disabled`,
            icon: <BellIcon size={16} />,
            status: webhookCount === 0 ? 'idle' : activeWebhookCount === webhookCount ? 'ok' : 'warn',
            loading: kpisLoading,
          },
          {
            label: 'Concurrency',
            value: <span className="text-[1.75rem]">Optimistic</span>,
            sub: 'Stale writes are rejected by version check',
            icon: <ClockIcon size={16} />,
            status: 'ok',
          },
        ]}
      />

      <Tabs
        items={[
          { key: 'flags', label: 'Feature flags', icon: <ShieldCheckIcon size={15} />, count: flagCount },
          { key: 'templates', label: 'Email templates', icon: <MailIcon size={15} />, count: templateCount },
          { key: 'webhooks', label: 'Webhooks & deliveries', icon: <BellIcon size={15} />, count: webhookCount },
        ]}
        value={tab}
        onChange={switchTab}
        ariaLabel="Platform configuration sections"
      />

      {tab === 'flags' ? <FlagsTab /> : null}
      {tab === 'templates' ? <TemplatesTab /> : null}
      {tab === 'webhooks' ? <WebhooksTab /> : null}
    </AdminPage>
  );
}

// ----------------------------------------------------------------------
// 1. FEATURE FLAGS TAB
// ----------------------------------------------------------------------
function FlagsTab() {
  const canRead = usePermission('feature_flag:read');
  const canWrite = usePermission('feature_flag:write');
  const q = useFeatureFlags();
  const update = useUpdateFeatureFlags();

  const baseline = useMemo(() => toFlagItems(q.data?.value), [q.data]);
  const baselineJson = useMemo(() => JSON.stringify(q.data?.value ?? {}, null, 2), [q.data]);

  const [mode, setMode] = useState<'visual' | 'json'>('visual');
  const [items, setItems] = useState<FeatureFlagItem[]>([]);
  const [jsonDraft, setJsonDraft] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'on' | 'off'>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [newKey, setNewKey] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [newRollout, setNewRollout] = useState(100);
  const [newEnabled, setNewEnabled] = useState(true);
  const [saveSuccess, flashSaved] = usePulse();
  const [jsonError, setJsonError] = useState<string | null>(null);

  useEffect(() => {
    if (q.data?.value) {
      setItems(toFlagItems(q.data.value));
      setJsonDraft(JSON.stringify(q.data.value, null, 2));
    }
  }, [q.data]);

  const baseByKey = useMemo(() => new Map(baseline.map((f) => [f.key, f])), [baseline]);
  const isChanged = (f: FeatureFlagItem) => {
    const b = baseByKey.get(f.key);
    return !b || b.enabled !== f.enabled || (b.rollout ?? 100) !== (f.rollout ?? 100);
  };
  const changedCount =
    items.filter(isChanged).length + baseline.filter((b) => !items.some((f) => f.key === b.key)).length;
  const dirty = mode === 'visual' ? changedCount > 0 : jsonDraft !== baselineJson;

  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items.filter((f) => {
      if (filter === 'on' && !f.enabled) return false;
      if (filter === 'off' && f.enabled) return false;
      return !term || f.key.toLowerCase().includes(term) || (f.notes ?? '').toLowerCase().includes(term);
    });
  }, [items, search, filter]);

  if (!canRead) {
    return (
      <Callout tone="warning" title="Insufficient permissions">
        You need the <span className="font-mono text-xs">feature_flag:read</span> permission to view flags.
      </Callout>
    );
  }

  const patchFlag = (key: string, patch: Partial<FeatureFlagItem>) =>
    setItems((prev) => prev.map((f) => (f.key === key ? { ...f, ...patch } : f)));

  const save = (value: Record<string, unknown>) =>
    update.mutate({ value, expectedVersion: q.data?.version ?? 0 }, { onSuccess: () => { setJsonError(null); flashSaved(); } });

  const handleSave = () => {
    if (mode === 'visual') {
      const valueMap: Record<string, unknown> = {};
      items.forEach((i) => {
        valueMap[i.key] = { enabled: i.enabled, rollout: i.rollout ?? 100, notes: i.notes ?? '' };
      });
      save(valueMap);
      return;
    }
    try {
      const parsed = JSON.parse(jsonDraft);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        setJsonError('Feature flags must be a valid JSON object');
        return;
      }
      save(parsed as Record<string, unknown>);
    } catch {
      setJsonError('Invalid JSON syntax. Please verify commas and quotes.');
    }
  };

  const handleDiscard = () => {
    setItems(baseline);
    setJsonDraft(baselineJson);
    setJsonError(null);
  };

  const formattedKey = newKey.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
  const keyTaken = items.some((f) => f.key === formattedKey);

  const handleCreateNewFlag = () => {
    if (!formattedKey) return;
    setItems((prev) => [
      ...prev.filter((f) => f.key !== formattedKey),
      { key: formattedKey, enabled: newEnabled, rollout: newRollout, notes: newNotes.trim() },
    ]);
    setShowAddModal(false);
    setNewKey('');
    setNewNotes('');
    setNewRollout(100);
    setNewEnabled(true);
  };

  const onCount = items.filter((f) => f.enabled).length;

  return (
    <div className="space-y-4">
      {q.isError ? <Callout tone="danger">{(q.error as Error).message}</Callout> : null}
      {update.isError ? <Callout tone="danger">{(update.error as Error).message}</Callout> : null}
      {jsonError ? <Callout tone="danger">{jsonError}</Callout> : null}
      {saveSuccess ? <Callout tone="success">Feature flags saved — now at v{q.data?.version}.</Callout> : null}

      <Card padded={false} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2.5">
          <SearchField value={search} onChange={setSearch} placeholder="Search feature flags…" />
          {mode === 'visual' ? (
            <Segmented
              ariaLabel="Filter flags"
              value={filter}
              onChange={setFilter}
              items={[
                { key: 'all', label: `All ${items.length}` },
                { key: 'on', label: `On ${onCount}` },
                { key: 'off', label: `Off ${items.length - onCount}` },
              ]}
            />
          ) : null}
          <Pill tone="neutral" className="font-mono">
            v{q.data?.version ?? 0}
          </Pill>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ModeSwitch mode={mode} onChange={setMode} visualLabel="Visual cards" />
          {canWrite && mode === 'visual' ? (
            <Button variant="secondary" icon={<PlusIcon size={14} />} onClick={() => setShowAddModal(true)}>
              New flag
            </Button>
          ) : null}
        </div>
      </Card>

      {mode === 'visual' ? (
        q.isLoading ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <Card key={i} className="h-48 animate-pulse bg-ink/[0.03]" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <Card>
            <EmptyBlock
              icon={<ShieldCheckIcon size={22} />}
              title="No feature flags defined"
              description="The configuration store is empty. Initialize the standard VYRO e-commerce flags or create a custom one."
              action={
                canWrite ? (
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <Button variant="primary" icon={<SparklesIcon size={14} />} loading={update.isPending} onClick={() => save(DEFAULT_FEATURE_FLAGS)}>
                      Initialize standard flags
                    </Button>
                    <Button variant="secondary" onClick={() => setShowAddModal(true)}>
                      Create custom flag
                    </Button>
                  </div>
                ) : undefined
              }
            />
          </Card>
        ) : filteredItems.length === 0 ? (
          <Card>
            <EmptyBlock
              icon={<SearchIcon size={22} />}
              title="No matching flags"
              description={search ? `No feature flags match "${search}".` : 'No flags in this state.'}
              action={
                <Button
                  variant="secondary"
                  onClick={() => {
                    setSearch('');
                    setFilter('all');
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {filteredItems.map((flag) => {
              const changed = isChanged(flag);
              const impact = HIGH_IMPACT.test(flag.key);
              return (
                <article
                  key={flag.key}
                  className={cn(
                    'vyro-surface group relative flex flex-col overflow-hidden transition-all duration-300 ease-vyro hover:-translate-y-0.5 hover:shadow-[inset_0_0_0_1px_rgba(12,14,11,0.1),0_14px_30px_-14px_rgba(12,14,11,0.2)]',
                    changed && 'ring-2 ring-amber/40',
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      'absolute inset-y-0 left-0 w-1 transition-colors duration-300',
                      flag.enabled ? (impact ? 'bg-amber' : 'bg-volt-deep') : 'bg-ink/10',
                    )}
                  />
                  <div className="flex items-start justify-between gap-4 p-5 pl-6">
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <code className="break-all font-mono text-[13px] font-bold tracking-tight text-ink">{flag.key}</code>
                        <Pill tone={flag.enabled ? 'success' : 'neutral'} dot>
                          {flag.enabled ? 'Active' : 'Disabled'}
                        </Pill>
                        {impact ? (
                          <Pill tone="warning" icon={<AlertTriangleIcon size={10} />}>
                            High impact
                          </Pill>
                        ) : null}
                        {changed ? <Pill tone="info">Unsaved</Pill> : null}
                      </div>
                      <p className="text-[13px] leading-relaxed text-ink-4">
                        {flag.notes || <span className="italic text-ink-5">No operational documentation provided for this flag.</span>}
                      </p>
                    </div>
                    <Switch
                      checked={flag.enabled}
                      disabled={!canWrite}
                      label={`${flag.enabled ? 'Disable' : 'Enable'} ${flag.key}`}
                      onChange={() => patchFlag(flag.key, { enabled: !flag.enabled })}
                    />
                  </div>

                  <div className="border-t border-ink/[0.07] bg-bone/40 px-5 py-4 pl-6">
                    <RolloutSlider
                      value={flag.rollout ?? 100}
                      disabled={!flag.enabled}
                      readOnly={!canWrite}
                      onChange={(v) => patchFlag(flag.key, { rollout: v })}
                    />
                  </div>

                  {canWrite ? (
                    <div className="flex justify-end border-t border-ink/[0.07] px-4 py-2 pl-6">
                      <button
                        type="button"
                        onClick={() => setPendingDelete(flag.key)}
                        className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-ink-4 transition-colors hover:bg-rose/10 hover:text-rose"
                      >
                        <Trash2Icon size={12} />
                        Delete
                      </button>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )
      ) : (
        <JsonEditor
          title="Direct JSON editor"
          version={q.data?.version ?? 0}
          value={jsonDraft}
          onChange={setJsonDraft}
          disabled={!canWrite}
          onFormat={() => {
            try {
              setJsonDraft(JSON.stringify(JSON.parse(jsonDraft), null, 2));
              setJsonError(null);
            } catch {
              setJsonError('Invalid JSON syntax');
            }
          }}
        />
      )}

      <SaveBar
        visible={canWrite && dirty}
        summary={
          mode === 'visual'
            ? `${changedCount} unsaved ${changedCount === 1 ? 'change' : 'changes'}`
            : 'Unsaved JSON edits'
        }
        onDiscard={handleDiscard}
        onSave={handleSave}
        saving={update.isPending}
      />

      {showAddModal ? (
        <Modal
          title="Create feature flag"
          sub="Added locally — save to publish"
          icon={<ShieldCheckIcon size={18} />}
          onClose={() => setShowAddModal(false)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setShowAddModal(false)}>
                Cancel
              </Button>
              <Button variant="primary" disabled={!formattedKey} onClick={handleCreateNewFlag}>
                {keyTaken ? 'Replace flag' : 'Add flag'}
              </Button>
            </>
          }
        >
          <div className="space-y-5">
            <div>
              <FieldLabel htmlFor="new-flag-key" hint="snake_case">
                Flag key
              </FieldLabel>
              <input
                id="new-flag-key"
                autoFocus
                placeholder="e.g. instant_supplier_settlement"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                className={cn(controlClass, 'w-full font-mono')}
              />
              {formattedKey ? (
                <p className="mt-1.5 font-mono text-[11px] text-ink-4">
                  Saved as <span className="font-semibold text-ink">{formattedKey}</span>
                  {keyTaken ? <span className="text-amber"> · already exists, will be replaced</span> : null}
                </p>
              ) : null}
            </div>
            <div>
              <FieldLabel htmlFor="new-flag-notes">Operational notes</FieldLabel>
              <textarea
                id="new-flag-notes"
                placeholder="Explain what this flag gates…"
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                rows={2}
                className={textareaClass}
              />
            </div>
            <div className="flex items-center justify-between gap-4 rounded-xl bg-bone/60 p-4 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.06)]">
              <div>
                <div className="text-sm font-semibold text-ink">Enabled on creation</div>
                <div className="text-xs text-ink-4">Turn off to stage the flag without exposing it.</div>
              </div>
              <Switch checked={newEnabled} onChange={() => setNewEnabled((v) => !v)} label="Enabled on creation" />
            </div>
            <RolloutSlider value={newRollout} onChange={setNewRollout} disabled={!newEnabled} />
          </div>
        </Modal>
      ) : null}

      {pendingDelete ? (
        <Modal
          size="sm"
          tone="danger"
          title="Delete feature flag?"
          sub={pendingDelete}
          icon={<Trash2Icon size={18} />}
          onClose={() => setPendingDelete(null)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setPendingDelete(null)}>
                Keep flag
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  setItems((prev) => prev.filter((f) => f.key !== pendingDelete));
                  setPendingDelete(null);
                }}
              >
                Delete flag
              </Button>
            </>
          }
        >
          <p className="text-sm leading-relaxed text-ink-3">
            Code reading <code className="font-mono text-xs font-semibold text-ink">{pendingDelete}</code> will fall back to its default.
            The deletion is staged — nothing changes until you save.
          </p>
        </Modal>
      ) : null}
    </div>
  );
}

// ----------------------------------------------------------------------
// 2. EMAIL TEMPLATES TAB
// ----------------------------------------------------------------------
function renderBody(body: string) {
  return body.split(/(\{\{\s*\w+\s*\}\})/g).map((part, i) => {
    const m = part.match(/^\{\{\s*(\w+)\s*\}\}$/);
    if (!m) return <span key={i}>{part}</span>;
    const sample = SAMPLE_VARS[m[1]!];
    return sample ? (
      <mark key={i} className="rounded bg-volt/35 px-0.5 font-medium text-ink">
        {sample}
      </mark>
    ) : (
      <mark key={i} className="rounded bg-amber/20 px-0.5 font-mono text-[0.92em] text-[#a86c28]" title="No sample value for this variable">
        {part}
      </mark>
    );
  });
}

function TemplatesTab() {
  const canRead = usePermission('email_template:read');
  const canWrite = usePermission('email_template:write');
  const q = useEmailTemplates();
  const update = useUpdateEmailTemplates();

  const baseline = useMemo(() => toTemplateItems(q.data?.value), [q.data]);
  const baselineJson = useMemo(() => JSON.stringify(q.data?.value ?? {}, null, 2), [q.data]);

  const [mode, setMode] = useState<'visual' | 'json'>('visual');
  const [templates, setTemplates] = useState<EmailTemplateItem[]>([]);
  const [activeKey, setActiveKey] = useState('');
  const [jsonDraft, setJsonDraft] = useState('');
  const [listSearch, setListSearch] = useState('');
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [saveSuccess, flashSaved] = usePulse();
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addKey, setAddKey] = useState('');
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (q.data?.value) {
      const parsed = toTemplateItems(q.data.value);
      setTemplates(parsed);
      setActiveKey((cur) => (cur && parsed.some((t) => t.key === cur) ? cur : (parsed[0]?.key ?? '')));
      setJsonDraft(JSON.stringify(q.data.value, null, 2));
    }
  }, [q.data]);

  const baseByKey = useMemo(() => new Map(baseline.map((t) => [t.key, t])), [baseline]);
  const isChanged = (t: EmailTemplateItem) => {
    const b = baseByKey.get(t.key);
    return !b || b.subject !== t.subject || b.body !== t.body || b.locale !== t.locale;
  };
  const changedCount = templates.filter(isChanged).length + baseline.filter((b) => !templates.some((t) => t.key === b.key)).length;
  const dirty = mode === 'visual' ? changedCount > 0 : jsonDraft !== baselineJson;

  const visibleTemplates = useMemo(() => {
    const term = listSearch.trim().toLowerCase();
    return term ? templates.filter((t) => t.key.includes(term) || t.subject.toLowerCase().includes(term)) : templates;
  }, [templates, listSearch]);

  const activeTemplate = templates.find((t) => t.key === activeKey) ?? templates[0];
  const usedVars = useMemo(
    () => [...new Set([...(activeTemplate?.subject + ' ' + activeTemplate?.body).matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]!))],
    [activeTemplate],
  );

  if (!canRead) {
    return (
      <Callout tone="warning" title="Insufficient permissions">
        You need the <span className="font-mono text-xs">email_template:read</span> permission to view templates.
      </Callout>
    );
  }

  const patchActive = (patch: Partial<EmailTemplateItem>) => {
    if (!activeTemplate) return;
    setTemplates((prev) => prev.map((t) => (t.key === activeTemplate.key ? { ...t, ...patch } : t)));
  };

  const insertVar = (name: string) => {
    if (!activeTemplate || !canWrite) return;
    const token = `{{${name}}}`;
    const el = bodyRef.current;
    const body = activeTemplate.body;
    const start = el?.selectionStart ?? body.length;
    const end = el?.selectionEnd ?? body.length;
    patchActive({ body: body.slice(0, start) + token + body.slice(end) });
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const save = (value: Record<string, unknown>) =>
    update.mutate({ value, expectedVersion: q.data?.version ?? 0 }, { onSuccess: () => { setJsonError(null); flashSaved(); } });

  const handleSave = () => {
    if (mode === 'visual') {
      const valueMap: Record<string, unknown> = {};
      templates.forEach((t) => {
        valueMap[t.key] = { subject: t.subject, body: t.body, locale: t.locale };
      });
      save(valueMap);
      return;
    }
    try {
      save(JSON.parse(jsonDraft) as Record<string, unknown>);
    } catch {
      setJsonError('Invalid JSON syntax');
    }
  };

  const formattedAddKey = addKey.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
  const addKeyTaken = templates.some((t) => t.key === formattedAddKey);

  const handleAdd = () => {
    if (!formattedAddKey || addKeyTaken) return;
    setTemplates((prev) => [
      ...prev,
      {
        key: formattedAddKey,
        subject: 'Notification from VYRO',
        body: 'Hello {{customerName}},\n\nYour message here.\n\nBest,\nVYRO Team',
        locale: 'en',
      },
    ]);
    setActiveKey(formattedAddKey);
    setShowAdd(false);
    setAddKey('');
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;
    const next = templates.filter((t) => t.key !== pendingDelete);
    setTemplates(next);
    if (activeKey === pendingDelete) setActiveKey(next[0]?.key ?? '');
    setPendingDelete(null);
  };

  return (
    <div className="space-y-4">
      {q.isError ? <Callout tone="danger">{(q.error as Error).message}</Callout> : null}
      {update.isError ? <Callout tone="danger">{(update.error as Error).message}</Callout> : null}
      {jsonError ? <Callout tone="danger">{jsonError}</Callout> : null}
      {saveSuccess ? <Callout tone="success">Email templates saved — now at v{q.data?.version}.</Callout> : null}

      <Card padded={false} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="font-display text-[0.9375rem] font-bold tracking-[-0.01em] text-ink">Template studio</span>
          <Pill tone="neutral" className="font-mono">
            v{q.data?.version ?? 0} · {templates.length} templates
          </Pill>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ModeSwitch mode={mode} onChange={setMode} visualLabel="Visual designer" />
          {canWrite && mode === 'visual' ? (
            <Button variant="secondary" icon={<PlusIcon size={14} />} onClick={() => setShowAdd(true)}>
              Add template
            </Button>
          ) : null}
        </div>
      </Card>

      {mode === 'visual' ? (
        q.isLoading ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            <Card className="h-72 animate-pulse bg-ink/[0.03] lg:col-span-4" />
            <Card className="h-72 animate-pulse bg-ink/[0.03] lg:col-span-8" />
          </div>
        ) : templates.length === 0 ? (
          <Card>
            <EmptyBlock
              icon={<MailIcon size={22} />}
              title="No email templates configured"
              description="There are no transactional notification templates yet."
              action={
                canWrite ? (
                  <Button variant="primary" icon={<SparklesIcon size={14} />} loading={update.isPending} onClick={() => save(DEFAULT_EMAIL_TEMPLATES)}>
                    Load default templates
                  </Button>
                ) : undefined
              }
            />
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
            <Card padded={false} className="h-fit overflow-hidden lg:sticky lg:top-4 lg:col-span-4">
              <div className="space-y-2.5 border-b border-ink/[0.07] p-3">
                <div className="flex items-center justify-between px-1">
                  <span className={SECTION_LABEL}>Templates</span>
                  <span className="font-mono text-[10px] text-ink-4">{visibleTemplates.length}</span>
                </div>
                <SearchField value={listSearch} onChange={setListSearch} placeholder="Filter templates…" />
              </div>
              <div className="max-h-[28rem] space-y-1 overflow-y-auto p-2 scrollbar-thin">
                {visibleTemplates.length === 0 ? (
                  <p className="px-3 py-6 text-center text-xs text-ink-4">No templates match.</p>
                ) : (
                  visibleTemplates.map((tmpl) => {
                    const active = activeTemplate?.key === tmpl.key;
                    return (
                      <button
                        key={tmpl.key}
                        type="button"
                        onClick={() => setActiveKey(tmpl.key)}
                        aria-current={active ? 'true' : undefined}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-xl p-2.5 text-left transition-all duration-200',
                          active
                            ? 'bg-charcoal text-paper shadow-[0_8px_20px_-10px_rgba(12,14,11,0.6)]'
                            : 'text-ink hover:bg-ink/[0.045]',
                        )}
                      >
                        <Monogram name={tmpl.key.replace(/_/g, ' ')} size="sm" />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center justify-between gap-2">
                            <span className="truncate font-mono text-xs font-semibold">{tmpl.key}</span>
                            <span className="flex shrink-0 items-center gap-1.5">
                              {isChanged(tmpl) ? <span className="size-1.5 rounded-full bg-amber" title="Unsaved changes" /> : null}
                              <span
                                className={cn(
                                  'rounded px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase',
                                  active ? 'bg-volt text-ink' : 'bg-ink/[0.07] text-ink-4',
                                )}
                              >
                                {tmpl.locale}
                              </span>
                            </span>
                          </span>
                          <span className={cn('mt-0.5 block truncate text-[11px]', active ? 'text-paper/60' : 'text-ink-4')}>
                            {tmpl.subject || 'No subject set'}
                          </span>
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </Card>

            {activeTemplate ? (
              <div className="space-y-5 lg:col-span-8">
                <Panel
                  title={<span className="font-mono">{activeTemplate.key}</span>}
                  description={`${activeTemplate.body.length} characters · ${usedVars.length} variables`}
                  icon={<MailIcon size={16} />}
                  actions={
                    canWrite ? (
                      <Button variant="ghost" size="sm" className="text-rose hover:bg-rose/10" icon={<Trash2Icon size={13} />} onClick={() => setPendingDelete(activeTemplate.key)}>
                        Delete
                      </Button>
                    ) : undefined
                  }
                >
                  <div className="space-y-5">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
                      <div className="sm:col-span-3">
                        <FieldLabel htmlFor="tpl-subject">Subject line</FieldLabel>
                        <input
                          id="tpl-subject"
                          className={cn(controlClass, 'w-full')}
                          value={activeTemplate.subject}
                          onChange={(e) => patchActive({ subject: e.target.value })}
                          disabled={!canWrite}
                        />
                      </div>
                      <div>
                        <FieldLabel htmlFor="tpl-locale">Locale</FieldLabel>
                        <select
                          id="tpl-locale"
                          className={cn(controlClass, 'w-full')}
                          value={activeTemplate.locale}
                          onChange={(e) => patchActive({ locale: e.target.value })}
                          disabled={!canWrite}
                        >
                          <option value="en">English (en)</option>
                          <option value="si">Sinhala (si)</option>
                          <option value="ta">Tamil (ta)</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <FieldLabel htmlFor="tpl-body" hint="Plain text · markdown">
                        Email body
                      </FieldLabel>
                      <textarea
                        id="tpl-body"
                        ref={bodyRef}
                        rows={9}
                        className={cn(textareaClass, 'font-mono text-xs')}
                        value={activeTemplate.body}
                        onChange={(e) => patchActive({ body: e.target.value })}
                        disabled={!canWrite}
                      />
                      {canWrite ? (
                        <div className="mt-3">
                          <span className={cn(SECTION_LABEL, 'mb-2 block')}>Insert variable</span>
                          <div className="flex flex-wrap gap-1.5">
                            {Object.keys(SAMPLE_VARS).map((v) => {
                              const used = usedVars.includes(v);
                              return (
                                <button
                                  key={v}
                                  type="button"
                                  onClick={() => insertVar(v)}
                                  className={cn(
                                    'rounded-md px-2 py-1 font-mono text-[11px] transition-colors',
                                    used
                                      ? 'bg-volt-soft text-ink shadow-[inset_0_0_0_1px_rgba(120,140,20,0.3)]'
                                      : 'bg-ink/[0.045] text-ink-3 hover:bg-ink/10 hover:text-ink',
                                  )}
                                >
                                  {`{{${v}}}`}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </Panel>

                <Card padded={false} className="overflow-hidden bg-bone/50">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/[0.07] px-5 py-3">
                    <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-3">
                      <EyeIcon size={13} />
                      Live inbox preview
                    </span>
                    <Segmented
                      ariaLabel="Preview device"
                      value={device}
                      onChange={setDevice}
                      items={[
                        { key: 'desktop', label: 'Desktop' },
                        { key: 'mobile', label: 'Mobile' },
                      ]}
                    />
                  </div>
                  <div className="p-4 sm:p-6">
                    <div
                      className={cn(
                        'mx-auto overflow-hidden rounded-xl bg-paper shadow-[0_0_0_1px_rgba(12,14,11,0.08),0_18px_40px_-20px_rgba(12,14,11,0.3)] transition-all duration-500 ease-vyro',
                        device === 'mobile' ? 'max-w-[22rem]' : 'max-w-2xl',
                      )}
                    >
                      <div className="flex items-center gap-1.5 border-b border-ink/[0.07] bg-bone/70 px-4 py-2.5">
                        <span className="size-2.5 rounded-full bg-rose/60" />
                        <span className="size-2.5 rounded-full bg-amber/60" />
                        <span className="size-2.5 rounded-full bg-mint/60" />
                        <span className="ml-3 text-[11px] text-ink-4">Inbox</span>
                      </div>
                      <div className="space-y-4 p-5">
                        <div className="flex items-start gap-3">
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-charcoal font-display text-xs font-bold text-volt">V</span>
                          <div className="min-w-0">
                            <div className="text-sm font-bold leading-snug text-ink">
                              {renderBody(activeTemplate.subject) || 'No subject'}
                            </div>
                            <div className="mt-0.5 text-[11px] text-ink-4">
                              VYRO Notifications &lt;notifications@vyro.lk&gt; · to me
                            </div>
                          </div>
                        </div>
                        <div className="whitespace-pre-wrap border-t border-ink/[0.07] pt-4 text-[13px] leading-relaxed text-ink-2">
                          {renderBody(activeTemplate.body)}
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>
              </div>
            ) : null}
          </div>
        )
      ) : (
        <JsonEditor title="Direct JSON editor" version={q.data?.version ?? 0} value={jsonDraft} onChange={setJsonDraft} disabled={!canWrite} />
      )}

      <SaveBar
        visible={canWrite && dirty}
        summary={mode === 'visual' ? `${changedCount} ${changedCount === 1 ? 'template' : 'templates'} with unsaved changes` : 'Unsaved JSON edits'}
        onDiscard={() => {
          setTemplates(baseline);
          setJsonDraft(baselineJson);
          setJsonError(null);
        }}
        onSave={handleSave}
        saving={update.isPending}
      />

      {showAdd ? (
        <Modal
          title="Add email template"
          sub="Starts from a blank layout"
          icon={<MailIcon size={18} />}
          onClose={() => setShowAdd(false)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setShowAdd(false)}>
                Cancel
              </Button>
              <Button variant="primary" disabled={!formattedAddKey || addKeyTaken} onClick={handleAdd}>
                Create template
              </Button>
            </>
          }
        >
          <FieldLabel htmlFor="tpl-new-key" hint="snake_case">
            Template key
          </FieldLabel>
          <input
            id="tpl-new-key"
            autoFocus
            placeholder="e.g. delivery_delayed"
            value={addKey}
            onChange={(e) => setAddKey(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            className={cn(controlClass, 'w-full font-mono')}
          />
          {formattedAddKey ? (
            <p className={cn('mt-1.5 font-mono text-[11px]', addKeyTaken ? 'text-rose' : 'text-ink-4')}>
              {addKeyTaken ? `“${formattedAddKey}” already exists` : `Saved as ${formattedAddKey}`}
            </p>
          ) : null}
        </Modal>
      ) : null}

      {pendingDelete ? (
        <Modal
          size="sm"
          tone="danger"
          title="Delete template?"
          sub={pendingDelete}
          icon={<Trash2Icon size={18} />}
          onClose={() => setPendingDelete(null)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setPendingDelete(null)}>
                Keep template
              </Button>
              <Button variant="danger" onClick={confirmDelete}>
                Delete template
              </Button>
            </>
          }
        >
          <p className="text-sm leading-relaxed text-ink-3">
            Emails that use this template will stop sending until it is restored. The deletion is staged — nothing changes until you save.
          </p>
        </Modal>
      ) : null}
    </div>
  );
}

// ----------------------------------------------------------------------
// 3. WEBHOOKS TAB
// ----------------------------------------------------------------------
function generateSecret() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return `whsec_${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

function EndpointCard({
  hook,
  selected,
  revealed,
  canWrite,
  busy,
  onSelect,
  onReveal,
  onToggleActive,
}: {
  hook: WebhookRow;
  selected: boolean;
  revealed: boolean;
  canWrite: boolean;
  busy: boolean;
  onSelect: () => void;
  onReveal: () => void;
  onToggleActive: () => void;
}) {
  const events = parseJsonList(hook.eventTypesJson);
  const live = hook.active === 1;
  return (
    <article
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={onSelect}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onSelect())}
      className={cn(
        'vyro-surface relative cursor-pointer space-y-4 p-5 transition-all duration-300 ease-vyro focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-volt/40',
        selected ? 'ring-2 ring-ink shadow-[0_16px_34px_-16px_rgba(12,14,11,0.35)]' : 'hover:-translate-y-0.5 hover:shadow-[0_12px_28px_-14px_rgba(12,14,11,0.25)]',
        !live && 'opacity-80',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Monogram name={hook.name} seed={hook.id} badge={<span className={cn('block size-3 rounded-full border-2 border-paper', live ? 'bg-mint' : 'bg-ink/30')} />} />
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-ink">{hook.name}</h3>
            <p className="truncate font-mono text-[11px] text-ink-4" title={hook.url}>
              {hostOf(hook.url)}
            </p>
          </div>
        </div>
        <Pill tone={live ? 'success' : 'neutral'} dot>
          {live ? 'Active' : 'Disabled'}
        </Pill>
      </div>

      <div className="flex flex-wrap gap-1">
        {events.slice(0, 3).map((ev) => (
          <Pill key={ev} tone="neutral" className="font-mono">
            {ev}
          </Pill>
        ))}
        {events.length > 3 ? (
          <Pill tone="neutral" title={events.slice(3).join(', ')}>
            +{events.length - 3} more
          </Pill>
        ) : null}
        {events.length === 0 ? <span className="text-xs text-ink-4">No events subscribed</span> : null}
      </div>

      <div
        className="flex items-center justify-between gap-2 rounded-lg bg-bone/70 py-1 pl-3 pr-1 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.06)]"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <span className="min-w-0 truncate font-mono text-xs text-ink-3">{revealed ? hook.secret : '•••••••••••••••••••'}</span>
        <span className="flex shrink-0 items-center">
          <button
            type="button"
            onClick={onReveal}
            className="rounded-md p-1.5 text-ink-4 transition-colors hover:bg-ink/5 hover:text-ink"
            aria-label={revealed ? 'Hide secret' : 'Reveal secret'}
          >
            {revealed ? <EyeOffIcon size={13} /> : <EyeIcon size={13} />}
          </button>
          <CopyButton text={hook.secret} label="Copy signing secret" />
        </span>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-ink/[0.07] pt-3">
        <span className="text-[11px] text-ink-4">Added {relativeTime(hook.createdAt)}</span>
        {canWrite ? (
          <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
            <Button
              size="sm"
              variant="ghost"
              className={live ? 'text-rose hover:bg-rose/10' : 'text-mint hover:bg-mint/10'}
              loading={busy}
              onClick={onToggleActive}
            >
              {live ? 'Disable' : 'Re-enable'}
            </Button>
          </span>
        ) : null}
      </div>
    </article>
  );
}

function WebhooksTab() {
  const canRead = usePermission('webhook:read');
  const canWrite = usePermission('webhook:write');
  const canRetry = usePermission('webhook:retry');

  const list = useWebhooks();
  const create = useCreateWebhook();
  const disable = useDisableWebhook();
  const update = useUpdateWebhook();
  const retry = useRetryDelivery();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [selectedEvents, setSelectedEvents] = useState<string[]>(['order.created']);
  const [secret, setSecret] = useState('');
  const [revealedSecrets, setRevealedSecrets] = useState<Record<string, boolean>>({});

  const [selectedWebhookId, setSelectedWebhookId] = useState<string | null>(null);
  const hooks = list.data ?? [];
  const selectedId = selectedWebhookId ?? hooks[0]?.id ?? null;
  const selectedHook = hooks.find((h) => h.id === selectedId);
  const deliveries = useWebhookDeliveries(selectedId);
  const [inspectDelivery, setInspectDelivery] = useState<WebhookDeliveryRow | null>(null);

  const rows = deliveries.data ?? [];
  const ok = rows.filter((d) => d.status === 'success').length;
  const failed = rows.filter((d) => d.status === 'failed').length;
  const pending = rows.filter((d) => d.status === 'pending').length;
  const rate = rows.length ? Math.round((ok / rows.length) * 100) : null;

  const urlValid = /^https?:\/\//i.test(url.trim());
  const canSubmit = name.trim() && urlValid && selectedEvents.length > 0 && secret.length >= 8;

  const closeCreate = () => {
    setShowCreateModal(false);
    setName('');
    setUrl('');
    setSecret('');
    setSelectedEvents(['order.created']);
  };

  const handleCreate = () => {
    if (!canSubmit) return;
    create.mutate({ name: name.trim(), url: url.trim(), eventTypes: selectedEvents, secret }, { onSuccess: closeCreate });
  };

  const toggleEvents = (evs: string[], on: boolean) =>
    setSelectedEvents((prev) => (on ? [...new Set([...prev, ...evs])] : prev.filter((e) => !evs.includes(e))));

  if (!canRead) {
    return (
      <Callout tone="warning" title="Insufficient permissions">
        You need the <span className="font-mono text-xs">webhook:read</span> permission to view webhooks.
      </Callout>
    );
  }

  return (
    <div className="space-y-6">
      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-bold tracking-[-0.02em] text-ink">Webhook endpoints</h2>
            <p className="mt-0.5 text-xs text-ink-4">Outbound event triggers dispatched via signed HTTP POST. Select an endpoint to inspect its deliveries.</p>
          </div>
          {canWrite ? (
            <Button variant="primary" icon={<PlusIcon size={14} />} onClick={() => setShowCreateModal(true)}>
              Register endpoint
            </Button>
          ) : null}
        </div>

        {list.isError ? (
          <Callout
            tone="danger"
            title="Could not load webhooks"
            action={
              <Button variant="secondary" size="sm" onClick={() => void list.refetch()}>
                Retry
              </Button>
            }
          >
            {(list.error as Error).message}
          </Callout>
        ) : list.isLoading ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Card key={i} className="h-52 animate-pulse bg-ink/[0.03]" />
            ))}
          </div>
        ) : hooks.length === 0 ? (
          <Card>
            <EmptyBlock
              icon={<BellIcon size={22} />}
              title="No webhooks registered"
              description="Register an endpoint to relay platform events to your own systems."
              action={
                canWrite ? (
                  <Button variant="primary" icon={<PlusIcon size={14} />} onClick={() => setShowCreateModal(true)}>
                    Register endpoint
                  </Button>
                ) : undefined
              }
            />
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {hooks.map((h) => (
              <EndpointCard
                key={h.id}
                hook={h}
                selected={h.id === selectedId}
                revealed={Boolean(revealedSecrets[h.id])}
                canWrite={canWrite}
                busy={(disable.isPending && disable.variables === h.id) || (update.isPending && update.variables?.id === h.id)}
                onSelect={() => setSelectedWebhookId(h.id)}
                onReveal={() => setRevealedSecrets((p) => ({ ...p, [h.id]: !p[h.id] }))}
                onToggleActive={() => (h.active === 1 ? disable.mutate(h.id) : update.mutate({ id: h.id, patch: { active: true } }))}
              />
            ))}
          </div>
        )}
      </section>

      <TableCard
        title="Recent outbound deliveries"
        description={selectedHook ? `Dispatch log for ${selectedHook.name} · ${hostOf(selectedHook.url)}` : 'Event dispatch logs, response codes and automatic retries.'}
        toolbar={
          rows.length > 0 ? (
            <div className="flex flex-col gap-3 rounded-xl bg-bone/60 p-4 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.06)] sm:flex-row sm:items-center sm:gap-6">
              <div className="shrink-0">
                <div className={SECTION_LABEL}>Success rate</div>
                <div className="font-display text-2xl font-bold tracking-[-0.03em] text-ink num-tabular">{rate}%</div>
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <SegmentBar
                  segments={[
                    { key: 'ok', value: ok, className: 'bg-mint', label: 'Delivered' },
                    { key: 'pending', value: pending, className: 'bg-amber', label: 'Pending' },
                    { key: 'failed', value: failed, className: 'bg-rose', label: 'Failed' },
                  ]}
                />
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-3">
                  <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-mint" />{ok} delivered</span>
                  <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-amber" />{pending} pending</span>
                  <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-rose" />{failed} failed</span>
                </div>
              </div>
            </div>
          ) : undefined
        }
        footer={rows.length ? <span>Showing the <strong className="text-ink">{rows.length}</strong> most recent deliveries</span> : undefined}
      >
        {deliveries.isLoading && selectedId ? (
          <TableSkeleton rows={4} cols={6} />
        ) : !selectedId ? (
          <EmptyBlock icon={<BellIcon size={22} />} title="No endpoint selected" description="Register a webhook above to monitor outgoing dispatches." />
        ) : rows.length === 0 ? (
          <EmptyBlock icon={<BellIcon size={22} />} title="No deliveries yet" description="Nothing has been dispatched to this endpoint yet." />
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Delivery</th>
                <th>Event</th>
                <th>Status</th>
                <th>HTTP</th>
                <th>Attempts</th>
                <th>When</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => {
                const good = d.responseStatus != null && d.responseStatus >= 200 && d.responseStatus < 300;
                return (
                  <tr key={d.id}>
                    <td>
                      <span className="font-mono text-xs text-ink-3" title={d.id}>
                        {d.id.slice(0, 8)}…
                      </span>
                    </td>
                    <td>
                      <Pill tone="neutral" className="font-mono">
                        {d.eventType}
                      </Pill>
                    </td>
                    <td>
                      <StatusPill status={d.status} />
                    </td>
                    <td>
                      {d.responseStatus ? (
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-xs font-semibold',
                            good ? 'bg-mint/10 text-mint' : 'bg-rose/10 text-rose',
                          )}
                        >
                          {good ? <CheckCircle2Icon size={11} /> : <XCircleIcon size={11} />}
                          {d.responseStatus}
                        </span>
                      ) : (
                        <span className="text-ink-4">—</span>
                      )}
                    </td>
                    <td>
                      <span className="font-mono text-xs">{d.attemptCount}</span>
                    </td>
                    <td>
                      <span className="text-xs text-ink-4" title={new Date(d.createdAt).toLocaleString()}>
                        {relativeTime(d.createdAt)}
                      </span>
                    </td>
                    <td className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button size="sm" variant="ghost" onClick={() => setInspectDelivery(d)}>
                          Inspect
                        </Button>
                        {canRetry && d.status === 'failed' ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => retry.mutate({ webhookId: d.webhookId, deliveryId: d.id })}
                            loading={retry.isPending && retry.variables?.deliveryId === d.id}
                          >
                            Retry
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </TableCard>

      {showCreateModal ? (
        <Modal
          size="lg"
          title="Register webhook endpoint"
          sub="Deliveries are signed with the secret below"
          icon={<BellIcon size={18} />}
          onClose={closeCreate}
          footer={
            <>
              <Button variant="ghost" onClick={closeCreate}>
                Cancel
              </Button>
              <Button variant="primary" disabled={!canSubmit} loading={create.isPending} onClick={handleCreate}>
                Register endpoint
              </Button>
            </>
          }
        >
          <div className="space-y-5">
            {create.isError ? <Callout tone="danger">{(create.error as Error).message}</Callout> : null}
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div>
                <FieldLabel htmlFor="wh-name">Endpoint name</FieldLabel>
                <input id="wh-name" autoFocus placeholder="e.g. ERP Order Sync" value={name} onChange={(e) => setName(e.target.value)} className={cn(controlClass, 'w-full')} />
              </div>
              <div>
                <FieldLabel htmlFor="wh-url">Target URL</FieldLabel>
                <input
                  id="wh-url"
                  placeholder="https://api.partner.com/vyro-webhooks"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className={cn(controlClass, 'w-full font-mono')}
                />
                {url && !urlValid ? <p className="mt-1.5 text-[11px] text-rose">URL must start with https://</p> : null}
              </div>
            </div>

            <div>
              <FieldLabel
                htmlFor="wh-secret"
                hint={
                  <button type="button" onClick={() => setSecret(generateSecret())} className="font-semibold text-copper transition-colors hover:text-ink">
                    Auto-generate
                  </button>
                }
              >
                Signing secret
              </FieldLabel>
              <input
                id="wh-secret"
                placeholder="Min 8 characters"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                className={cn(controlClass, 'w-full font-mono')}
              />
            </div>

            <div>
              <FieldLabel hint={`${selectedEvents.length} selected`}>Subscribed events</FieldLabel>
              <div className="space-y-4 rounded-xl bg-bone/60 p-4 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.06)]">
                {EVENT_GROUPS.map((g) => {
                  const allOn = g.events.every((e) => selectedEvents.includes(e));
                  return (
                    <div key={g.label}>
                      <div className="mb-2 flex items-center justify-between">
                        <span className={SECTION_LABEL}>{g.label}</span>
                        <button type="button" onClick={() => toggleEvents(g.events, !allOn)} className="text-[11px] font-semibold text-ink-3 hover:text-ink">
                          {allOn ? 'Clear' : 'Select all'}
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {g.events.map((ev) => {
                          const on = selectedEvents.includes(ev);
                          return (
                            <button
                              key={ev}
                              type="button"
                              aria-pressed={on}
                              onClick={() => toggleEvents([ev], !on)}
                              className={cn(
                                'rounded-lg px-2.5 py-1.5 font-mono text-xs transition-all duration-200',
                                on
                                  ? 'bg-charcoal text-paper shadow-[0_4px_10px_-4px_rgba(12,14,11,0.5)]'
                                  : 'bg-paper text-ink-3 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.1)] hover:text-ink hover:shadow-[inset_0_0_0_1px_rgba(12,14,11,0.25)]',
                              )}
                            >
                              {ev}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </Modal>
      ) : null}

      {inspectDelivery ? (
        <Modal
          size="lg"
          title="Delivery inspector"
          sub={inspectDelivery.id}
          icon={<FileTextIcon size={18} />}
          onClose={() => setInspectDelivery(null)}
          footer={
            <>
              {canRetry && inspectDelivery.status === 'failed' ? (
                <Button
                  variant="secondary"
                  loading={retry.isPending}
                  onClick={() =>
                    retry.mutate(
                      { webhookId: inspectDelivery.webhookId, deliveryId: inspectDelivery.id },
                      { onSuccess: () => setInspectDelivery(null) },
                    )
                  }
                >
                  Retry delivery
                </Button>
              ) : null}
              <Button variant="primary" onClick={() => setInspectDelivery(null)}>
                Close
              </Button>
            </>
          }
        >
          <div className="space-y-5">
            <DetailList
              columns={3}
              items={[
                { label: 'Event', value: <span className="font-mono text-xs">{inspectDelivery.eventType}</span> },
                { label: 'Status', value: <StatusPill status={inspectDelivery.status} /> },
                { label: 'HTTP code', value: <span className="font-mono text-xs">{inspectDelivery.responseStatus ?? '—'}</span> },
                { label: 'Attempts', value: <span className="font-mono text-xs">{inspectDelivery.attemptCount}</span> },
                { label: 'Created', value: <span className="text-xs">{new Date(inspectDelivery.createdAt).toLocaleString()}</span> },
                {
                  label: 'Next retry',
                  value: <span className="text-xs">{inspectDelivery.nextRetryAt ? new Date(inspectDelivery.nextRetryAt).toLocaleString() : '—'}</span>,
                },
              ]}
            />

            {(() => {
              const payload = (() => {
                try {
                  return JSON.stringify(JSON.parse(inspectDelivery.payloadJson), null, 2);
                } catch {
                  return inspectDelivery.payloadJson;
                }
              })();
              return (
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <h4 className={SECTION_LABEL}>Dispatched payload</h4>
                    <CopyButton text={payload} label="Copy payload" />
                  </div>
                  <pre className="max-h-72 overflow-auto rounded-xl bg-charcoal p-4 font-mono text-xs leading-relaxed text-paper/90 shadow-[inset_0_0_0_1px_rgba(250,247,240,0.08)] scrollbar-thin">
                    {payload}
                  </pre>
                </div>
              );
            })()}

            {inspectDelivery.responseBody ? (
              <div>
                <h4 className={cn(SECTION_LABEL, 'mb-2')}>Response body</h4>
                <pre className="max-h-48 overflow-auto rounded-xl bg-ink/[0.05] p-4 font-mono text-xs leading-relaxed text-ink shadow-[inset_0_0_0_1px_rgba(12,14,11,0.06)] scrollbar-thin">
                  {inspectDelivery.responseBody}
                </pre>
              </div>
            ) : null}
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
