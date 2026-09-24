import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { cn } from '@vyro/ui';
import { Button, Input, Label, Select, Textarea } from '@/components/ui';
import {
  SearchIcon,
  ClockIcon,
  ShieldCheckIcon,
  FileTextIcon,
  Trash2Icon,
  PlusIcon,
  SaveIcon,
  MailIcon,
  BellIcon,
  XIcon,
  EyeIcon,
  EyeOffIcon,
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
} from './useAdminPlatformConfig';
import {
  AdminPage,
  AdminPageHeader,
  Callout,
  Card,
  CellStack,
  DetailList,
  EmptyBlock,
  Panel,
  Pill,
  StatCard,
  StatGrid,
  StatusPill,
  TableCard,
  TableSkeleton,
  Tabs,
  Toolbar,
  controlClass,
} from './ui';

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

function ModalShell({
  title,
  sub,
  icon,
  onClose,
  children,
  wide,
}: {
  title: string;
  sub?: string | undefined;
  icon: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className={cn('vyro-surface w-full overflow-hidden', wide ? 'max-w-2xl' : 'max-w-md')}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-ink/[0.07] bg-bone/40 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-copper/15 text-copper">
              {icon}
            </span>
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-ink">{title}</h3>
              {sub ? <p className="mt-0.5 truncate font-mono text-[11px] text-ink-4">{sub}</p> : null}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-8 items-center justify-center rounded-lg text-ink-4 transition-colors hover:bg-ink/5 hover:text-ink"
          >
            <XIcon size={16} />
          </button>
        </div>
        <div className={cn('p-5 sm:p-6', wide && 'max-h-[75vh] overflow-y-auto')}>{children}</div>
      </div>
    </div>
  );
}

function ModeSwitch({
  mode,
  onChange,
  visualLabel,
}: {
  mode: 'visual' | 'json';
  onChange: (m: 'visual' | 'json') => void;
  visualLabel: string;
}) {
  return (
    <Tabs
      items={[
        { key: 'visual', label: visualLabel },
        { key: 'json', label: 'Raw JSON' },
      ]}
      value={mode}
      onChange={(k) => onChange(k as 'visual' | 'json')}
      ariaLabel="Editor mode"
    />
  );
}

export function PlatformPage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab | null) ?? 'flags';

  const switchTab = (next: string) => {
    const p = new URLSearchParams(params);
    p.set('tab', next);
    setParams(p);
  };

  const flagsQuery = useFeatureFlags();
  const templatesQuery = useEmailTemplates();
  const webhooksQuery = useWebhooks();

  // Metrics
  const flagCount = Object.keys(flagsQuery.data?.value ?? {}).length;
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
      />

      <StatGrid cols={4}>
        <StatCard
          label="Feature flags"
          value={flagCount}
          sub={`Schema version v${flagsQuery.data?.version ?? 0}`}
          icon={<ShieldCheckIcon size={16} />}
          loading={kpisLoading}
        />
        <StatCard
          label="Email templates"
          value={templateCount}
          sub={`Schema version v${templatesQuery.data?.version ?? 0}`}
          icon={<MailIcon size={16} />}
          loading={kpisLoading}
        />
        <StatCard
          label="Active webhooks"
          value={activeWebhookCount}
          sub={`${webhookCount} endpoints registered`}
          icon={<BellIcon size={16} />}
          status={
            webhookCount > 0 ? (
              <Pill tone={activeWebhookCount === webhookCount ? 'success' : 'warning'} dot>
                {activeWebhookCount === webhookCount ? 'All live' : `${webhookCount - activeWebhookCount} disabled`}
              </Pill>
            ) : undefined
          }
          loading={kpisLoading}
        />
        <StatCard
          label="Platform concurrency"
          value="Optimistic"
          sub="Version mismatch protected"
          icon={<ClockIcon size={16} />}
        />
      </StatGrid>

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

  const [mode, setMode] = useState<'visual' | 'json'>('visual');
  const [items, setItems] = useState<FeatureFlagItem[]>([]);
  const [jsonDraft, setJsonDraft] = useState<string>('');
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [newRollout, setNewRollout] = useState(100);
  const [newEnabled, setNewEnabled] = useState(true);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [jsonError, setJsonError] = useState<string | null>(null);

  // Sync server data into local visual state
  useEffect(() => {
    if (q.data?.value) {
      const raw = q.data.value;
      const parsed: FeatureFlagItem[] = Object.entries(raw).map(([k, val]) => {
        if (typeof val === 'boolean') {
          return { key: k, enabled: val, rollout: 100, notes: '' };
        }
        if (typeof val === 'object' && val !== null) {
          const obj = val as { enabled?: boolean; rollout?: number; notes?: string };
          return {
            key: k,
            enabled: Boolean(obj.enabled),
            rollout: typeof obj.rollout === 'number' ? obj.rollout : 100,
            notes: obj.notes ?? '',
          };
        }
        return { key: k, enabled: Boolean(val), rollout: 100, notes: '' };
      });
      setItems(parsed);
      setJsonDraft(JSON.stringify(raw, null, 2));
    }
  }, [q.data]);

  const filteredItems = useMemo(() => {
    if (!search.trim()) return items;
    const term = search.toLowerCase();
    return items.filter((f) => f.key.toLowerCase().includes(term) || (f.notes ?? '').toLowerCase().includes(term));
  }, [items, search]);

  if (!canRead) {
    return (
      <Callout tone="warning" title="Insufficient permissions">
        You need the <span className="font-mono text-xs">feature_flag:read</span> permission to view flags.
      </Callout>
    );
  }

  const handleToggleFlag = (key: string) => {
    setItems((prev) => prev.map((f) => (f.key === key ? { ...f, enabled: !f.enabled } : f)));
  };

  const handleRolloutChange = (key: string, rollout: number) => {
    setItems((prev) => prev.map((f) => (f.key === key ? { ...f, rollout } : f)));
  };

  const handleDeleteFlag = (key: string) => {
    setItems((prev) => prev.filter((f) => f.key !== key));
  };

  const handleSaveVisual = () => {
    const valueMap: Record<string, unknown> = {};
    items.forEach((item) => {
      valueMap[item.key] = {
        enabled: item.enabled,
        rollout: item.rollout ?? 100,
        notes: item.notes ?? '',
      };
    });
    update.mutate(
      { value: valueMap, expectedVersion: q.data?.version ?? 0 },
      {
        onSuccess: () => {
          setSaveSuccess(true);
          setTimeout(() => setSaveSuccess(false), 3000);
        },
      },
    );
  };

  const handleSaveJson = () => {
    try {
      const parsed = JSON.parse(jsonDraft);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        setJsonError('Feature flags must be a valid JSON object');
        return;
      }
      update.mutate(
        { value: parsed as Record<string, unknown>, expectedVersion: q.data?.version ?? 0 },
        {
          onSuccess: () => {
            setJsonError(null);
            setSaveSuccess(true);
            setTimeout(() => setSaveSuccess(false), 3000);
          },
        },
      );
    } catch {
      setJsonError('Invalid JSON syntax. Please verify commas and quotes.');
    }
  };

  const handleInitDefaults = () => {
    update.mutate(
      { value: DEFAULT_FEATURE_FLAGS, expectedVersion: q.data?.version ?? 0 },
      {
        onSuccess: () => {
          setSaveSuccess(true);
          setTimeout(() => setSaveSuccess(false), 3000);
        },
      },
    );
  };

  const handleCreateNewFlag = () => {
    if (!newKey.trim()) return;
    const formattedKey = newKey.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    setItems((prev) => [
      ...prev.filter((f) => f.key !== formattedKey),
      {
        key: formattedKey,
        enabled: newEnabled,
        rollout: newRollout,
        notes: newNotes.trim(),
      },
    ]);
    setShowAddModal(false);
    setNewKey('');
    setNewNotes('');
    setNewRollout(100);
    setNewEnabled(true);
  };

  return (
    <div className="space-y-4">
      {q.isError ? <Callout tone="danger">{(q.error as Error).message}</Callout> : null}
      {update.isError ? <Callout tone="danger">{(update.error as Error).message}</Callout> : null}
      {jsonError ? <Callout tone="danger">{jsonError}</Callout> : null}
      {saveSuccess ? (
        <Callout tone="success">
          Feature flag configuration updated successfully (v{q.data?.version}).
        </Callout>
      ) : null}

      {/* Controls Bar */}
      <Card>
        <Toolbar
          actions={
            <>
              <ModeSwitch mode={mode} onChange={setMode} visualLabel="Visual cards" />
              {canWrite && mode === 'visual' ? (
                <Button size="sm" variant="secondary" className="h-10" icon={<PlusIcon size={14} />} onClick={() => setShowAddModal(true)}>
                  New flag
                </Button>
              ) : null}
              {canWrite ? (
                <Button
                  size="sm"
                  variant="primary"
                  className="h-10"
                  icon={<SaveIcon size={14} />}
                  onClick={mode === 'visual' ? handleSaveVisual : handleSaveJson}
                  loading={update.isPending}
                >
                  Save changes
                </Button>
              ) : null}
            </>
          }
        >
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <SearchIcon size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-4" />
            <input
              type="text"
              placeholder="Search feature flags…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={cn(controlClass, 'w-full pl-9')}
            />
          </div>
          <Pill tone="neutral" className="font-mono">
            v{q.data?.version ?? 0} · {items.length} total
          </Pill>
        </Toolbar>
      </Card>

      {/* Visual Mode */}
      {mode === 'visual' ? (
        q.isLoading ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <Card key={i} className="h-36 animate-pulse bg-ink/[0.03]" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <Card>
            <EmptyBlock
              icon={<ShieldCheckIcon size={22} />}
              title="No feature flags defined"
              description="The configuration store is empty. Initialize standard VYRO e-commerce flags or create a custom flag."
              action={
                canWrite ? (
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <Button size="sm" variant="primary" onClick={handleInitDefaults} loading={update.isPending}>
                      Initialize standard flags
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => setShowAddModal(true)}>
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
              description={`No feature flags match "${search}".`}
              action={
                <Button size="sm" variant="secondary" onClick={() => setSearch('')}>
                  Clear search
                </Button>
              }
            />
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {filteredItems.map((flag) => (
              <Card key={flag.key} className="flex flex-col justify-between gap-4 transition-shadow hover:shadow-md">
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <code className="font-mono text-sm font-bold text-ink">{flag.key}</code>
                        {flag.enabled ? (
                          <Pill tone="success" dot>
                            Active
                          </Pill>
                        ) : (
                          <Pill tone="neutral" dot>
                            Disabled
                          </Pill>
                        )}
                      </div>
                      <p className="text-xs leading-relaxed text-ink-4">
                        {flag.notes || 'No operational documentation provided for this flag.'}
                      </p>
                    </div>

                    {/* Toggle Switch */}
                    <button
                      type="button"
                      role="switch"
                      aria-checked={flag.enabled}
                      disabled={!canWrite}
                      onClick={() => handleToggleFlag(flag.key)}
                      className={cn(
                        'flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50',
                        flag.enabled ? 'bg-ink' : 'bg-ink/15',
                      )}
                      title={flag.enabled ? 'Disable flag' : 'Enable flag'}
                    >
                      <span
                        className={cn(
                          'size-5 rounded-full transition-transform duration-200',
                          flag.enabled ? 'translate-x-5 bg-volt' : 'translate-x-0 bg-paper shadow-sm',
                        )}
                      />
                    </button>
                  </div>

                  {/* Rollout Percentage Slider */}
                  <div className="mt-4 border-t border-ink/[0.07] pt-3">
                    <div className="mb-1.5 flex items-center justify-between text-xs">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-4">
                        Rollout cohort
                      </span>
                      <span className="font-mono font-bold text-ink">{flag.rollout ?? 100}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="5"
                      disabled={!canWrite || !flag.enabled}
                      value={flag.rollout ?? 100}
                      onChange={(e) => handleRolloutChange(flag.key, Number(e.target.value))}
                      className="w-full cursor-pointer accent-ink disabled:opacity-40"
                    />
                  </div>
                </div>

                {/* Footer Delete */}
                {canWrite ? (
                  <div className="flex justify-end border-t border-ink/[0.07] pt-3">
                    <button
                      type="button"
                      onClick={() => handleDeleteFlag(flag.key)}
                      className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-rose/80 transition-colors hover:bg-rose/10 hover:text-rose"
                      title="Remove this flag"
                    >
                      <Trash2Icon size={12} />
                      <span>Delete</span>
                    </button>
                  </div>
                ) : null}
              </Card>
            ))}
          </div>
        )
      ) : (
        /* Raw JSON Mode */
        <Panel
          title={`Direct JSON editor`}
          description={`Schema version v${q.data?.version ?? 0} — edits are validated before saving.`}
          icon={<FileTextIcon size={16} />}
          actions={
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                try {
                  const p = JSON.parse(jsonDraft);
                  setJsonDraft(JSON.stringify(p, null, 2));
                } catch {
                  setJsonError('Invalid JSON syntax');
                }
              }}
            >
              Format JSON
            </Button>
          }
        >
          <Textarea
            className="h-96 font-mono text-xs leading-relaxed"
            value={jsonDraft}
            onChange={(e) => setJsonDraft(e.target.value)}
            disabled={!canWrite}
          />
        </Panel>
      )}

      {/* New Flag Modal */}
      {showAddModal ? (
        <ModalShell
          title="Create feature flag"
          icon={<ShieldCheckIcon size={15} />}
          onClose={() => setShowAddModal(false)}
        >
          <div className="space-y-4">
            <div>
              <Label htmlFor="new-flag-key">Flag key (identifier)</Label>
              <Input
                id="new-flag-key"
                placeholder="e.g. instant_supplier_settlement"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                className="font-mono"
              />
            </div>
            <div>
              <Label htmlFor="new-flag-notes">Operational notes / documentation</Label>
              <Textarea
                id="new-flag-notes"
                placeholder="Explain what this flag gates…"
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="new-flag-status">Initial status</Label>
                <Select
                  id="new-flag-status"
                  value={newEnabled ? 'true' : 'false'}
                  onChange={(e) => setNewEnabled(e.target.value === 'true')}
                >
                  <option value="true">Enabled (active)</option>
                  <option value="false">Disabled (off)</option>
                </Select>
              </div>
              <div>
                <Label htmlFor="new-flag-rollout">Rollout %</Label>
                <Input
                  id="new-flag-rollout"
                  type="number"
                  min="0"
                  max="100"
                  value={newRollout}
                  onChange={(e) => setNewRollout(Number(e.target.value))}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-ink/[0.07] pt-4">
              <Button variant="ghost" size="sm" onClick={() => setShowAddModal(false)}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" disabled={!newKey.trim()} onClick={handleCreateNewFlag}>
                Add flag
              </Button>
            </div>
          </div>
        </ModalShell>
      ) : null}
    </div>
  );
}

// ----------------------------------------------------------------------
// 2. EMAIL TEMPLATES TAB
// ----------------------------------------------------------------------
function TemplatesTab() {
  const canRead = usePermission('email_template:read');
  const canWrite = usePermission('email_template:write');
  const q = useEmailTemplates();
  const update = useUpdateEmailTemplates();

  const [mode, setMode] = useState<'visual' | 'json'>('visual');
  const [templates, setTemplates] = useState<EmailTemplateItem[]>([]);
  const [activeKey, setActiveKey] = useState<string>('');
  const [jsonDraft, setJsonDraft] = useState<string>('');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [jsonError, setJsonError] = useState<string | null>(null);

  // Sync server data into state
  useEffect(() => {
    if (q.data?.value) {
      const raw = q.data.value;
      const parsed: EmailTemplateItem[] = Object.entries(raw).map(([k, val]) => {
        const obj = (typeof val === 'object' && val !== null ? val : {}) as {
          subject?: string;
          body?: string;
          locale?: string;
        };
        return {
          key: k,
          subject: obj.subject ?? '',
          body: obj.body ?? '',
          locale: obj.locale ?? 'en',
        };
      });
      setTemplates(parsed);
      if (parsed.length > 0 && !activeKey) {
        setActiveKey(parsed[0]?.key ?? '');
      }
      setJsonDraft(JSON.stringify(raw, null, 2));
    }
  }, [q.data, activeKey]);

  const activeTemplate = templates.find((t) => t.key === activeKey) ?? templates[0];

  if (!canRead) {
    return (
      <Callout tone="warning" title="Insufficient permissions">
        You need the <span className="font-mono text-xs">email_template:read</span> permission to view templates.
      </Callout>
    );
  }

  const handleUpdateActive = (patch: Partial<EmailTemplateItem>) => {
    if (!activeTemplate) return;
    setTemplates((prev) => prev.map((t) => (t.key === activeTemplate.key ? { ...t, ...patch } : t)));
  };

  const handleSaveVisual = () => {
    const valueMap: Record<string, unknown> = {};
    templates.forEach((t) => {
      valueMap[t.key] = {
        subject: t.subject,
        body: t.body,
        locale: t.locale,
      };
    });
    update.mutate(
      { value: valueMap, expectedVersion: q.data?.version ?? 0 },
      {
        onSuccess: () => {
          setSaveSuccess(true);
          setTimeout(() => setSaveSuccess(false), 3000);
        },
      },
    );
  };

  const handleSaveJson = () => {
    try {
      const parsed = JSON.parse(jsonDraft);
      update.mutate(
        { value: parsed as Record<string, unknown>, expectedVersion: q.data?.version ?? 0 },
        {
          onSuccess: () => {
            setSaveSuccess(true);
            setTimeout(() => setSaveSuccess(false), 3000);
          },
        },
      );
    } catch {
      setJsonError('Invalid JSON syntax');
    }
  };

  const handleInitDefaults = () => {
    update.mutate(
      { value: DEFAULT_EMAIL_TEMPLATES, expectedVersion: q.data?.version ?? 0 },
      {
        onSuccess: () => {
          setSaveSuccess(true);
          setTimeout(() => setSaveSuccess(false), 3000);
        },
      },
    );
  };

  const handleAddNewTemplate = () => {
    const key = prompt('Enter new template key (e.g. delivery_delayed):');
    if (!key) return;
    const formatted = key.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    setTemplates((prev) => [
      ...prev,
      {
        key: formatted,
        subject: 'Notification from VYRO',
        body: 'Hello {{customerName}},\n\nYour message here.\n\nBest,\nVYRO Team',
        locale: 'en',
      },
    ]);
    setActiveKey(formatted);
  };

  const handleDeleteTemplate = (key: string) => {
    if (confirm(`Are you sure you want to delete template "${key}"?`)) {
      setTemplates((prev) => prev.filter((t) => t.key !== key));
      if (activeKey === key) {
        const next = templates.find((t) => t.key !== key);
        setActiveKey(next?.key ?? '');
      }
    }
  };

  return (
    <div className="space-y-4">
      {q.isError ? <Callout tone="danger">{(q.error as Error).message}</Callout> : null}
      {update.isError ? <Callout tone="danger">{(update.error as Error).message}</Callout> : null}
      {jsonError ? <Callout tone="danger">{jsonError}</Callout> : null}
      {saveSuccess ? (
        <Callout tone="success">Email templates updated successfully (v{q.data?.version}).</Callout>
      ) : null}

      {/* Toolbar */}
      <Card>
        <Toolbar
          actions={
            <>
              <ModeSwitch mode={mode} onChange={setMode} visualLabel="Visual designer" />
              {canWrite && mode === 'visual' ? (
                <Button size="sm" variant="secondary" className="h-10" icon={<PlusIcon size={14} />} onClick={handleAddNewTemplate}>
                  Add template
                </Button>
              ) : null}
              {canWrite ? (
                <Button
                  size="sm"
                  variant="primary"
                  className="h-10"
                  icon={<SaveIcon size={14} />}
                  onClick={mode === 'visual' ? handleSaveVisual : handleSaveJson}
                  loading={update.isPending}
                >
                  Save changes
                </Button>
              ) : null}
            </>
          }
        >
          <span className="text-sm font-semibold text-ink">Template editor</span>
          <Pill tone="neutral" className="font-mono">
            v{q.data?.version ?? 0} · {templates.length} templates
          </Pill>
        </Toolbar>
      </Card>

      {mode === 'visual' ? (
        q.isLoading ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            <Card className="h-64 animate-pulse bg-ink/[0.03] lg:col-span-4" />
            <Card className="h-64 animate-pulse bg-ink/[0.03] lg:col-span-8" />
          </div>
        ) : templates.length === 0 ? (
          <Card>
            <EmptyBlock
              icon={<MailIcon size={22} />}
              title="No email templates configured"
              description="Your database currently has no transactional notification templates configured."
              action={
                canWrite ? (
                  <Button size="sm" variant="primary" onClick={handleInitDefaults} loading={update.isPending}>
                    Load default operational templates
                  </Button>
                ) : undefined
              }
            />
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
            {/* Sidebar list */}
            <Card className="h-fit lg:col-span-4" >
              <span className="mb-2 block px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-4">
                Configured templates
              </span>
              <div className="space-y-1.5">
                {templates.map((tmpl) => {
                  const active = (activeTemplate?.key ?? '') === tmpl.key;
                  return (
                    <button
                      key={tmpl.key}
                      type="button"
                      onClick={() => setActiveKey(tmpl.key)}
                      className={cn(
                        'flex w-full flex-col gap-1 rounded-lg p-2.5 text-left transition-colors',
                        active ? 'bg-ink text-paper' : 'text-ink hover:bg-ink/[0.05]',
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-mono text-xs font-semibold">{tmpl.key}</span>
                        <span
                          className={cn(
                            'rounded px-1.5 py-0.5 font-mono text-[9px] uppercase',
                            active ? 'bg-volt font-bold text-ink' : 'bg-ink/[0.06] text-ink-4',
                          )}
                        >
                          {tmpl.locale}
                        </span>
                      </div>
                      <p className={cn('truncate text-[11px]', active ? 'text-paper/70' : 'text-ink-4')}>
                        {tmpl.subject || 'No subject set'}
                      </p>
                    </button>
                  );
                })}
              </div>
            </Card>

            {/* Template Editor & Live Preview */}
            {activeTemplate ? (
              <div className="space-y-4 lg:col-span-8">
                <Panel
                  title={<span className="font-mono">{activeTemplate.key}</span>}
                  description="Edit template copy and dynamic placeholders"
                  icon={<MailIcon size={16} />}
                  actions={
                    canWrite ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-rose hover:bg-rose/10"
                        onClick={() => handleDeleteTemplate(activeTemplate.key)}
                      >
                        Delete template
                      </Button>
                    ) : undefined
                  }
                >
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
                      <div className="sm:col-span-3">
                        <Label htmlFor="tpl-subject">Email subject line</Label>
                        <Input
                          id="tpl-subject"
                          value={activeTemplate.subject}
                          onChange={(e) => handleUpdateActive({ subject: e.target.value })}
                          disabled={!canWrite}
                        />
                      </div>
                      <div className="sm:col-span-1">
                        <Label htmlFor="tpl-locale">Locale</Label>
                        <Select
                          id="tpl-locale"
                          value={activeTemplate.locale}
                          onChange={(e) => handleUpdateActive({ locale: e.target.value })}
                          disabled={!canWrite}
                        >
                          <option value="en">English (en)</option>
                          <option value="si">Sinhala (si)</option>
                          <option value="ta">Tamil (ta)</option>
                        </Select>
                      </div>
                    </div>

                    <div>
                      <div className="mb-1 flex flex-wrap items-center justify-between gap-1">
                        <Label htmlFor="tpl-body">Email body (plaintext / markdown)</Label>
                        <span className="font-mono text-[10px] text-ink-4">
                          {'{{customerName}} {{orderId}} {{trackingUrl}}'}
                        </span>
                      </div>
                      <Textarea
                        id="tpl-body"
                        rows={8}
                        className="font-mono text-xs leading-relaxed"
                        value={activeTemplate.body}
                        onChange={(e) => handleUpdateActive({ body: e.target.value })}
                        disabled={!canWrite}
                      />
                    </div>
                  </div>
                </Panel>

                {/* Simulated Customer Preview */}
                <Card className="bg-bone/50">
                  <span className="mb-3 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-4">
                    <EyeIcon size={13} />
                    Customer inbox preview
                  </span>
                  <div className="vyro-surface space-y-3 p-5 font-sans">
                    <div className="border-b border-ink/[0.07] pb-2">
                      <div className="text-xs text-ink-4">From: VYRO Notifications &lt;notifications@vyro.lk&gt;</div>
                      <div className="mt-0.5 text-sm font-bold text-ink">{activeTemplate.subject}</div>
                    </div>
                    <div className="whitespace-pre-wrap text-xs leading-relaxed text-ink">
                      {activeTemplate.body
                        .replace(/\{\{customerName\}\}/g, 'Thufail Ahamed')
                        .replace(/\{\{orderId\}\}/g, 'VY-8921')
                        .replace(/\{\{itemCount\}\}/g, '3')
                        .replace(/\{\{totalAmount\}\}/g, '14,500.00')
                        .replace(/\{\{trackingUrl\}\}/g, 'https://vyro.lk/orders/track/VY-8921')
                        .replace(/\{\{carrierName\}\}/g, 'VYRO Express Logistics')
                        .replace(/\{\{trackingCode\}\}/g, 'LK-902198')
                        .replace(/\{\{estimatedDelivery\}\}/g, 'Tomorrow by 5:00 PM')}
                    </div>
                  </div>
                </Card>
              </div>
            ) : null}
          </div>
        )
      ) : (
        /* Raw JSON mode */
        <Panel
          title="Direct JSON editor"
          description={`Schema version v${q.data?.version ?? 0} — edits are validated before saving.`}
          icon={<FileTextIcon size={16} />}
        >
          <Textarea
            className="h-96 font-mono text-xs leading-relaxed"
            value={jsonDraft}
            onChange={(e) => setJsonDraft(e.target.value)}
            disabled={!canWrite}
          />
        </Panel>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------
// 3. WEBHOOKS TAB
// ----------------------------------------------------------------------
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
  const selectedId = selectedWebhookId ?? list.data?.[0]?.id ?? null;
  const deliveries = useWebhookDeliveries(selectedId);
  const [inspectDelivery, setInspectDelivery] = useState<WebhookDeliveryRow | null>(null);

  const generateSecret = () => {
    const chars = 'abcdef0123456789';
    let s = 'whsec_';
    for (let i = 0; i < 32; i++) {
      s += chars[Math.floor(Math.random() * chars.length)];
    }
    setSecret(s);
  };

  const handleCreate = () => {
    if (!name || !url || selectedEvents.length === 0 || secret.length < 8) return;
    create.mutate(
      {
        name,
        url,
        eventTypes: selectedEvents,
        secret,
      },
      {
        onSuccess: () => {
          setShowCreateModal(false);
          setName('');
          setUrl('');
          setSecret('');
          setSelectedEvents(['order.created']);
        },
      },
    );
  };

  const toggleEventSelection = (ev: string) => {
    setSelectedEvents((prev) => (prev.includes(ev) ? prev.filter((e) => e !== ev) : [...prev, ev]));
  };

  const toggleSecretReveal = (id: string) => {
    setRevealedSecrets((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  if (!canRead) {
    return (
      <Callout tone="warning" title="Insufficient permissions">
        You need the <span className="font-mono text-xs">webhook:read</span> permission to view webhooks.
      </Callout>
    );
  }

  return (
    <div className="space-y-6">
      {/* Webhooks Table */}
      <TableCard
        title="Configured webhook endpoints"
        description="Outbound event notification triggers dispatched via HTTP POST."
        actions={
          canWrite ? (
            <Button size="sm" variant="primary" icon={<PlusIcon size={14} />} onClick={() => setShowCreateModal(true)}>
              Register endpoint
            </Button>
          ) : undefined
        }
        footer={
          <span>
            <strong className="text-ink">{(list.data ?? []).length}</strong> endpoints registered
          </span>
        }
      >
        {list.isError ? (
          <div className="p-5 sm:p-6">
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
          </div>
        ) : list.isLoading ? (
          <TableSkeleton rows={3} cols={6} />
        ) : !(list.data ?? []).length ? (
          <EmptyBlock
            icon={<BellIcon size={22} />}
            title="No webhooks registered"
            description="Register an endpoint above to relay platform events."
            action={
              canWrite ? (
                <Button size="sm" variant="primary" icon={<PlusIcon size={14} />} onClick={() => setShowCreateModal(true)}>
                  Register endpoint
                </Button>
              ) : undefined
            }
          />
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Endpoint</th>
                <th>Target URL</th>
                <th>Subscribed events</th>
                <th>Signing secret</th>
                <th>Status</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {(list.data ?? []).map((h) => {
                const events: string[] = (() => {
                  try {
                    return JSON.parse(h.eventTypesJson);
                  } catch {
                    return [];
                  }
                })();
                const isSecretRevealed = Boolean(revealedSecrets[h.id]);

                return (
                  <tr key={h.id}>
                    <td>
                      <CellStack mono primary={h.name} secondary={h.id} />
                    </td>
                    <td>
                      <span className="block max-w-[220px] truncate font-mono text-xs text-ink-3" title={h.url}>
                        {h.url}
                      </span>
                    </td>
                    <td>
                      <div className="flex max-w-xs flex-wrap gap-1">
                        {events.map((ev) => (
                          <Pill key={ev} tone="neutral" className="font-mono">
                            {ev}
                          </Pill>
                        ))}
                      </div>
                    </td>
                    <td>
                      <div className="flex items-center gap-1.5 font-mono text-xs">
                        <span className="text-ink-3">{isSecretRevealed ? h.secret : '••••••••••••'}</span>
                        <button
                          type="button"
                          onClick={() => toggleSecretReveal(h.id)}
                          className="rounded p-1 text-ink-4 transition-colors hover:bg-ink/5 hover:text-ink"
                          title={isSecretRevealed ? 'Hide secret' : 'Reveal secret'}
                          aria-label={isSecretRevealed ? 'Hide secret' : 'Reveal secret'}
                        >
                          {isSecretRevealed ? <EyeOffIcon size={13} /> : <EyeIcon size={13} />}
                        </button>
                      </div>
                    </td>
                    <td>
                      {h.active === 1 ? (
                        <Pill tone="success" dot>
                          Active
                        </Pill>
                      ) : (
                        <Pill tone="neutral" dot>
                          Disabled
                        </Pill>
                      )}
                    </td>
                    <td className="text-right">
                      {canWrite ? (
                        h.active === 1 ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-rose hover:bg-rose/10"
                            onClick={() => disable.mutate(h.id)}
                            loading={disable.isPending}
                          >
                            Disable
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-mint hover:bg-mint/10"
                            onClick={() => update.mutate({ id: h.id, patch: { active: true } })}
                            loading={update.isPending}
                          >
                            Re-enable
                          </Button>
                        )
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </TableCard>

      {/* Recent Deliveries Table */}
      <TableCard
        title="Recent outbound deliveries"
        description="Event dispatch logs, response HTTP status codes, and automatic retries."
        toolbar={
          list.data && list.data.length > 1 ? (
            <Toolbar
              actions={
                <Select
                  value={selectedId ?? ''}
                  onChange={(e) => setSelectedWebhookId(e.target.value || null)}
                  className="w-auto font-mono text-xs"
                  aria-label="Filter deliveries by endpoint"
                >
                  {list.data.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name}
                    </option>
                  ))}
                </Select>
              }
            >
              <span className="text-xs text-ink-4">
                Showing deliveries for the selected endpoint
              </span>
            </Toolbar>
          ) : undefined
        }
      >
        {deliveries.isLoading && selectedId ? (
          <TableSkeleton rows={4} cols={6} />
        ) : !selectedId ? (
          <EmptyBlock
            icon={<BellIcon size={22} />}
            title="No endpoint selected"
            description="Create a webhook above to monitor outgoing dispatches."
          />
        ) : !(deliveries.data ?? []).length ? (
          <EmptyBlock
            icon={<BellIcon size={22} />}
            title="No deliveries yet"
            description="No webhook deliveries logged yet for this endpoint."
          />
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Delivery</th>
                <th>Event type</th>
                <th>Status</th>
                <th>HTTP response</th>
                <th>Attempts</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {(deliveries.data ?? []).map((d) => (
                <tr key={d.id}>
                  <td>
                    <CellStack mono primary={`${d.id.slice(0, 8)}…`} secondary={d.id} />
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
                          'font-mono text-xs font-semibold',
                          d.responseStatus >= 200 && d.responseStatus < 300 ? 'text-mint' : 'text-rose',
                        )}
                      >
                        {d.responseStatus}
                      </span>
                    ) : (
                      <span className="text-ink-4">—</span>
                    )}
                  </td>
                  <td>
                    <span className="font-mono text-xs">{d.attemptCount}</span>
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
              ))}
            </tbody>
          </table>
        )}
      </TableCard>

      {/* Register Webhook Modal */}
      {showCreateModal ? (
        <ModalShell
          title="Register webhook endpoint"
          icon={<BellIcon size={15} />}
          onClose={() => setShowCreateModal(false)}
          wide
        >
          <div className="space-y-4">
            <div>
              <Label htmlFor="wh-name">Endpoint name</Label>
              <Input
                id="wh-name"
                placeholder="e.g. ERP Order Sync"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="wh-url">Target HTTPS URL</Label>
              <Input
                id="wh-url"
                placeholder="https://api.partner.com/vyro-webhooks"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="font-mono"
              />
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between">
                <Label htmlFor="wh-secret" className="mb-0">
                  Signing secret (min 8 chars)
                </Label>
                <button
                  type="button"
                  onClick={generateSecret}
                  className="text-[11px] font-medium text-copper transition-colors hover:text-ink"
                >
                  Auto-generate
                </button>
              </div>
              <Input
                id="wh-secret"
                type="text"
                placeholder="Enter secret or click auto-generate"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                className="font-mono"
              />
            </div>

            <div>
              <Label>Subscribed events</Label>
              <div className="grid max-h-44 grid-cols-1 gap-1 overflow-y-auto rounded-lg bg-ink/[0.04] p-3 sm:grid-cols-2">
                {WEBHOOK_EVENT_CATALOG.map((ev) => {
                  const isChecked = selectedEvents.includes(ev);
                  return (
                    <label
                      key={ev}
                      className={cn(
                        'flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 font-mono text-xs transition-colors',
                        isChecked ? 'bg-paper text-ink shadow-sm' : 'text-ink-3 hover:bg-paper/60',
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleEventSelection(ev)}
                        className="accent-ink"
                      />
                      <span>{ev}</span>
                    </label>
                  );
                })}
              </div>
              <p className="mt-1.5 text-xs text-ink-4">{selectedEvents.length} event(s) selected.</p>
            </div>

            <div className="flex justify-end gap-2 border-t border-ink/[0.07] pt-4">
              <Button variant="ghost" size="sm" onClick={() => setShowCreateModal(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={!name || !url || selectedEvents.length === 0 || secret.length < 8}
                onClick={handleCreate}
                loading={create.isPending}
              >
                Register endpoint
              </Button>
            </div>
          </div>
        </ModalShell>
      ) : null}

      {/* Inspect Delivery Modal */}
      {inspectDelivery ? (
        <ModalShell
          title="Delivery inspector"
          sub={inspectDelivery.id}
          icon={<FileTextIcon size={15} />}
          onClose={() => setInspectDelivery(null)}
          wide
        >
          <div className="space-y-5">
            <DetailList
              columns={3}
              items={[
                { label: 'Event', value: <span className="font-mono text-xs">{inspectDelivery.eventType}</span> },
                { label: 'Status', value: <StatusPill status={inspectDelivery.status} /> },
                {
                  label: 'HTTP code',
                  value: <span className="font-mono text-xs">{inspectDelivery.responseStatus ?? '—'}</span>,
                },
              ]}
            />

            <div>
              <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-4">
                Dispatched payload
              </h4>
              <pre className="overflow-x-auto rounded-lg bg-charcoal p-3.5 font-mono text-xs leading-relaxed text-paper">
                {(() => {
                  try {
                    return JSON.stringify(JSON.parse(inspectDelivery.payloadJson), null, 2);
                  } catch {
                    return inspectDelivery.payloadJson;
                  }
                })()}
              </pre>
            </div>

            {inspectDelivery.responseBody ? (
              <div>
                <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-4">
                  Response body
                </h4>
                <pre className="overflow-x-auto rounded-lg bg-ink/[0.05] p-3.5 font-mono text-xs leading-relaxed text-ink">
                  {inspectDelivery.responseBody}
                </pre>
              </div>
            ) : null}

            <div className="flex justify-end border-t border-ink/[0.07] pt-4">
              <Button size="sm" variant="ghost" onClick={() => setInspectDelivery(null)}>
                Close
              </Button>
            </div>
          </div>
        </ModalShell>
      ) : null}
    </div>
  );
}
