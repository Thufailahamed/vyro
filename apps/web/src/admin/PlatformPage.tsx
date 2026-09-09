import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader, Surface, ErrorBanner, Button, Input, EmptyState } from '@/components/ui';
import {
  SearchIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  ClockIcon,
  ShieldCheckIcon,
  FileTextIcon,
  Trash2Icon,
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
  type WebhookRow,
  type WebhookDeliveryRow,
} from './useAdminPlatformConfig';

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

export function PlatformPage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab | null) ?? 'flags';

  const switchTab = (next: Tab) => {
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

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto pb-12">
      {/* Top Header */}
      <PageHeader
        kicker="System & Platform Control"
        title="Platform Configuration"
        sub="Runtime control plane for feature toggles, customer notification templates, and real-time webhook event relays."
      />

      {/* Executive KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 bg-white rounded-2xl border border-ink/10 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-3">Feature Flags</span>
            <div className="w-8 h-8 rounded-lg bg-sand/60 flex items-center justify-center text-ink">
              <ShieldCheckIcon size={16} />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold font-mono text-ink">{flagCount}</div>
            <p className="text-[11px] text-ink-4 mt-0.5">Schema version v{flagsQuery.data?.version ?? 0}</p>
          </div>
        </div>

        <div className="p-4 bg-white rounded-2xl border border-ink/10 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-3">Email Templates</span>
            <div className="w-8 h-8 rounded-lg bg-sand/60 flex items-center justify-center text-ink">
              <FileTextIcon size={16} />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold font-mono text-ink">{templateCount}</div>
            <p className="text-[11px] text-ink-4 mt-0.5">Schema version v{templatesQuery.data?.version ?? 0}</p>
          </div>
        </div>

        <div className="p-4 bg-white rounded-2xl border border-ink/10 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-3">Active Webhooks</span>
            <div className="w-8 h-8 rounded-lg bg-sand/60 flex items-center justify-center text-ink">
              <CheckCircleIcon size={16} />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold font-mono text-ink">
              {activeWebhookCount} <span className="text-xs text-ink-4 font-normal">/ {webhookCount} total</span>
            </div>
            <p className="text-[11px] text-ink-4 mt-0.5">Event dispatch endpoints</p>
          </div>
        </div>

        <div className="p-4 bg-white rounded-2xl border border-ink/10 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-3">Platform Concurrency</span>
            <div className="w-8 h-8 rounded-lg bg-sand/60 flex items-center justify-center text-ink">
              <ClockIcon size={16} />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold font-mono text-ink">Optimistic</div>
            <p className="text-[11px] text-ink-4 mt-0.5">Version mismatch protected</p>
          </div>
        </div>
      </div>

      {/* Accessible High-Contrast Navigation Tabs */}
      <nav className="flex items-center gap-2 border-b border-ink/10">
        <button
          type="button"
          onClick={() => switchTab('flags')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all -mb-px rounded-t-lg ${
            tab === 'flags'
              ? 'border-ink text-ink font-semibold bg-sand/30 shadow-sm'
              : 'border-transparent text-ink-4 hover:text-ink hover:border-ink/20'
          }`}
        >
          <ShieldCheckIcon size={16} />
          <span>Feature Flags</span>
          <span className="px-2 py-0.5 text-xs font-mono rounded-full bg-bone text-ink-3 border border-ink/10">
            {flagCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => switchTab('templates')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all -mb-px rounded-t-lg ${
            tab === 'templates'
              ? 'border-ink text-ink font-semibold bg-sand/30 shadow-sm'
              : 'border-transparent text-ink-4 hover:text-ink hover:border-ink/20'
          }`}
        >
          <FileTextIcon size={16} />
          <span>Email Templates</span>
          <span className="px-2 py-0.5 text-xs font-mono rounded-full bg-bone text-ink-3 border border-ink/10">
            {templateCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => switchTab('webhooks')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all -mb-px rounded-t-lg ${
            tab === 'webhooks'
              ? 'border-ink text-ink font-semibold bg-sand/30 shadow-sm'
              : 'border-transparent text-ink-4 hover:text-ink hover:border-ink/20'
          }`}
        >
          <ClockIcon size={16} />
          <span>Webhooks & Deliveries</span>
          <span className="px-2 py-0.5 text-xs font-mono rounded-full bg-bone text-ink-3 border border-ink/10">
            {webhookCount}
          </span>
        </button>
      </nav>

      {/* Tab Panels */}
      {tab === 'flags' ? <FlagsTab /> : null}
      {tab === 'templates' ? <TemplatesTab /> : null}
      {tab === 'webhooks' ? <WebhooksTab /> : null}
    </div>
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

  if (!canRead) return <ErrorBanner message="You need feature_flag:read permission to view flags." />;

  const filteredItems = useMemo(() => {
    if (!search.trim()) return items;
    const term = search.toLowerCase();
    return items.filter((f) => f.key.toLowerCase().includes(term) || (f.notes ?? '').toLowerCase().includes(term));
  }, [items, search]);

  const handleToggleFlag = (key: string) => {
    setItems((prev) =>
      prev.map((f) => (f.key === key ? { ...f, enabled: !f.enabled } : f))
    );
  };

  const handleRolloutChange = (key: string, rollout: number) => {
    setItems((prev) =>
      prev.map((f) => (f.key === key ? { ...f, rollout } : f))
    );
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
      }
    );
  };

  const handleSaveJson = () => {
    try {
      const parsed = JSON.parse(jsonDraft);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        alert('Feature flags must be a valid JSON object');
        return;
      }
      update.mutate(
        { value: parsed as Record<string, unknown>, expectedVersion: q.data?.version ?? 0 },
        {
          onSuccess: () => {
            setSaveSuccess(true);
            setTimeout(() => setSaveSuccess(false), 3000);
          },
        }
      );
    } catch {
      alert('Invalid JSON syntax. Please verify commas and quotes.');
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
      }
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
      {q.isError ? <ErrorBanner message={(q.error as Error).message} /> : null}
      {update.isError ? <ErrorBanner message={(update.error as Error).message} /> : null}
      {saveSuccess && (
        <div className="p-3 bg-mint/10 border border-mint/30 text-mint text-xs rounded-xl flex items-center gap-2">
          <CheckCircleIcon size={16} />
          <span>Feature flag configuration updated successfully (v{q.data?.version}).</span>
        </div>
      )}

      {/* Controls Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-white rounded-2xl border border-ink/10 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="relative w-64">
            <input
              type="text"
              placeholder="Search feature flags..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-9 pl-8 pr-3 bg-paper text-xs text-ink rounded-lg border border-ink/20 focus:outline-none focus:border-ink"
            />
            <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-ink-4">
              <SearchIcon size={14} />
            </div>
          </div>
          <span className="text-xs font-mono text-ink-4">
            v{q.data?.version ?? 0} &bull; {items.length} total
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Mode Switch */}
          <div className="flex items-center gap-1 bg-bone p-1 rounded-lg border border-ink/10 text-xs">
            <button
              type="button"
              onClick={() => setMode('visual')}
              className={`px-3 py-1 rounded font-medium transition-all ${
                mode === 'visual' ? 'bg-white shadow text-ink font-semibold' : 'text-ink-4 hover:text-ink'
              }`}
            >
              Visual Cards
            </button>
            <button
              type="button"
              onClick={() => setMode('json')}
              className={`px-3 py-1 rounded font-medium transition-all ${
                mode === 'json' ? 'bg-white shadow text-ink font-semibold' : 'text-ink-4 hover:text-ink'
              }`}
            >
              Raw JSON
            </button>
          </div>

          {canWrite && mode === 'visual' && (
            <Button size="sm" variant="outline" onClick={() => setShowAddModal(true)}>
              + New Flag
            </Button>
          )}

          {canWrite && (
            <Button
              size="sm"
              variant="primary"
              onClick={mode === 'visual' ? handleSaveVisual : handleSaveJson}
              loading={update.isPending}
            >
              Save Changes
            </Button>
          )}
        </div>
      </div>

      {/* Visual Mode */}
      {mode === 'visual' ? (
        items.length === 0 ? (
          <Surface className="p-10 text-center">
            <EmptyState
              icon={<ShieldCheckIcon size={28} />}
              title="No Feature Flags Defined"
              description="Your database currently has an empty configuration {}. You can initialize standard Vyro e-commerce flags or create a custom flag."
              action={
                canWrite ? (
                  <div className="flex items-center justify-center gap-3">
                    <Button size="sm" variant="primary" onClick={handleInitDefaults} loading={update.isPending}>
                      Initialize Standard Flags
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setShowAddModal(true)}>
                      Create Custom Flag
                    </Button>
                  </div>
                ) : null
              }
            />
          </Surface>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredItems.map((flag) => (
              <div
                key={flag.key}
                className="p-5 bg-white rounded-2xl border border-ink/10 shadow-sm flex flex-col justify-between hover:border-ink/25 transition-all"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <code className="font-mono text-sm font-bold text-ink">{flag.key}</code>
                        <span
                          className={`px-2 py-0.5 text-[10px] font-mono font-bold uppercase rounded-full border ${
                            flag.enabled
                              ? 'bg-mint/15 text-mint border-mint/30'
                              : 'bg-bone text-ink-4 border-ink/10'
                          }`}
                        >
                          {flag.enabled ? 'ACTIVE' : 'DISABLED'}
                        </span>
                      </div>
                      <p className="text-xs text-ink-4 leading-relaxed">
                        {flag.notes || 'No operational documentation provided for this flag.'}
                      </p>
                    </div>

                    {/* Toggle Switch */}
                    <button
                      type="button"
                      disabled={!canWrite}
                      onClick={() => handleToggleFlag(flag.key)}
                      className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors duration-200 shrink-0 ${
                        flag.enabled ? 'bg-ink' : 'bg-bone border border-ink/20'
                      }`}
                      title={flag.enabled ? 'Disable Flag' : 'Enable Flag'}
                    >
                      <div
                        className={`w-4 h-4 rounded-full transition-transform duration-200 ${
                          flag.enabled ? 'transform translate-x-6 bg-volt' : 'bg-ink-4'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Rollout Percentage Slider */}
                  <div className="mt-4 pt-3 border-t border-ink/5">
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="font-semibold text-ink-3 uppercase tracking-wider text-[10px]">
                        Rollout Cohort
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
                      className="w-full accent-ink cursor-pointer disabled:opacity-40"
                    />
                  </div>
                </div>

                {/* Footer Delete */}
                {canWrite && (
                  <div className="mt-3 pt-2 border-t border-ink/5 flex justify-end">
                    <button
                      type="button"
                      onClick={() => handleDeleteFlag(flag.key)}
                      className="text-xs text-rose/70 hover:text-rose flex items-center gap-1 font-medium transition-colors"
                      title="Remove this flag"
                    >
                      <Trash2Icon size={12} />
                      <span>Delete</span>
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      ) : (
        /* Raw JSON Mode */
        <Surface className="p-5 space-y-3 bg-white border border-ink/10">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-3">
              Direct JSON Editor (v{q.data?.version ?? 0})
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                try {
                  const p = JSON.parse(jsonDraft);
                  setJsonDraft(JSON.stringify(p, null, 2));
                } catch {
                  alert('Invalid JSON syntax');
                }
              }}
            >
              Format JSON
            </Button>
          </div>
          <textarea
            className="w-full h-96 font-mono text-xs bg-paper border border-ink/20 rounded-xl p-4 leading-relaxed focus:outline-none focus:border-ink"
            value={jsonDraft}
            onChange={(e) => setJsonDraft(e.target.value)}
            disabled={!canWrite}
          />
        </Surface>
      )}

      {/* New Flag Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-charcoal/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl border border-ink/20 shadow-2xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-base font-bold text-ink">Create Feature Flag</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink-3 mb-1">
                  Flag Key (Identifier)
                </label>
                <Input
                  placeholder="e.g. instant_supplier_settlement"
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink-3 mb-1">
                  Operational Notes / Documentation
                </label>
                <textarea
                  placeholder="Explain what this flag gates..."
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  className="w-full bg-paper p-3 text-xs border border-ink/20 rounded-lg focus:outline-none focus:border-ink"
                  rows={2}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink-3 mb-1">
                    Initial Status
                  </label>
                  <select
                    value={newEnabled ? 'true' : 'false'}
                    onChange={(e) => setNewEnabled(e.target.value === 'true')}
                    className="w-full h-11 px-3 bg-paper text-xs rounded-lg border border-ink/20 focus:outline-none focus:border-ink"
                  >
                    <option value="true">Enabled (Active)</option>
                    <option value="false">Disabled (Off)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink-3 mb-1">
                    Rollout %
                  </label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={newRollout}
                    onChange={(e) => setNewRollout(Number(e.target.value))}
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-ink/10">
              <Button variant="outline" size="sm" onClick={() => setShowAddModal(false)}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" disabled={!newKey.trim()} onClick={handleCreateNewFlag}>
                Add Flag
              </Button>
            </div>
          </div>
        </div>
      )}
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

  if (!canRead) return <ErrorBanner message="You need email_template:read permission to view templates." />;

  const activeTemplate = templates.find((t) => t.key === activeKey) ?? templates[0];

  const handleUpdateActive = (patch: Partial<EmailTemplateItem>) => {
    if (!activeTemplate) return;
    setTemplates((prev) =>
      prev.map((t) => (t.key === activeTemplate.key ? { ...t, ...patch } : t))
    );
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
      }
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
        }
      );
    } catch {
      alert('Invalid JSON syntax');
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
      }
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
      {q.isError ? <ErrorBanner message={(q.error as Error).message} /> : null}
      {update.isError ? <ErrorBanner message={(update.error as Error).message} /> : null}
      {saveSuccess && (
        <div className="p-3 bg-mint/10 border border-mint/30 text-mint text-xs rounded-xl flex items-center gap-2">
          <CheckCircleIcon size={16} />
          <span>Email templates updated successfully (v{q.data?.version}).</span>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-white rounded-2xl border border-ink/10 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-ink-3">Template Editor</span>
          <span className="px-2 py-0.5 text-xs font-mono rounded bg-bone text-ink-4">
            v{q.data?.version ?? 0} &bull; {templates.length} templates
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-bone p-1 rounded-lg border border-ink/10 text-xs">
            <button
              type="button"
              onClick={() => setMode('visual')}
              className={`px-3 py-1 rounded font-medium transition-all ${
                mode === 'visual' ? 'bg-white shadow text-ink font-semibold' : 'text-ink-4 hover:text-ink'
              }`}
            >
              Visual Designer
            </button>
            <button
              type="button"
              onClick={() => setMode('json')}
              className={`px-3 py-1 rounded font-medium transition-all ${
                mode === 'json' ? 'bg-white shadow text-ink font-semibold' : 'text-ink-4 hover:text-ink'
              }`}
            >
              Raw JSON
            </button>
          </div>

          {canWrite && mode === 'visual' && (
            <Button size="sm" variant="outline" onClick={handleAddNewTemplate}>
              + Add Template
            </Button>
          )}

          {canWrite && (
            <Button
              size="sm"
              variant="primary"
              onClick={mode === 'visual' ? handleSaveVisual : handleSaveJson}
              loading={update.isPending}
            >
              Save Changes
            </Button>
          )}
        </div>
      </div>

      {mode === 'visual' ? (
        templates.length === 0 ? (
          <Surface className="p-10 text-center">
            <EmptyState
              icon={<FileTextIcon size={28} />}
              title="No Email Templates Configured"
              description="Your database currently has no transactional notification templates configured."
              action={
                canWrite ? (
                  <Button size="sm" variant="primary" onClick={handleInitDefaults} loading={update.isPending}>
                    Load Default Operational Templates
                  </Button>
                ) : null
              }
            />
          </Surface>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Sidebar list */}
            <div className="lg:col-span-4 space-y-2">
              <div className="p-3 bg-white rounded-2xl border border-ink/10 shadow-sm space-y-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-4 px-2 block mb-1">
                  Configured Templates
                </span>
                {templates.map((tmpl) => {
                  const active = (activeTemplate?.key ?? '') === tmpl.key;
                  return (
                    <button
                      key={tmpl.key}
                      type="button"
                      onClick={() => setActiveKey(tmpl.key)}
                      className={`w-full text-left p-2.5 rounded-xl transition-all flex flex-col gap-1 ${
                        active
                          ? 'bg-ink text-white font-medium shadow-sm'
                          : 'hover:bg-sand/30 text-ink'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-semibold truncate">{tmpl.key}</span>
                        <span
                          className={`text-[9px] font-mono uppercase px-1.5 py-0.5 rounded ${
                            active ? 'bg-volt text-ink font-bold' : 'bg-bone text-ink-4'
                          }`}
                        >
                          {tmpl.locale}
                        </span>
                      </div>
                      <p
                        className={`text-[11px] truncate ${
                          active ? 'text-paper/80' : 'text-ink-4'
                        }`}
                      >
                        {tmpl.subject || 'No subject set'}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Template Editor & Live Preview */}
            {activeTemplate && (
              <div className="lg:col-span-8 space-y-4">
                <Surface className="p-5 space-y-4 bg-white border border-ink/10">
                  <div className="flex items-center justify-between pb-3 border-b border-ink/10">
                    <div>
                      <h4 className="font-mono text-sm font-bold text-ink">{activeTemplate.key}</h4>
                      <p className="text-xs text-ink-4">Edit template copy and dynamic placeholders</p>
                    </div>
                    {canWrite && (
                      <button
                        type="button"
                        onClick={() => handleDeleteTemplate(activeTemplate.key)}
                        className="text-xs text-rose hover:underline font-medium"
                      >
                        Delete Template
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div className="sm:col-span-3">
                      <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink-3 mb-1">
                        Email Subject Line
                      </label>
                      <Input
                        value={activeTemplate.subject}
                        onChange={(e) => handleUpdateActive({ subject: e.target.value })}
                        disabled={!canWrite}
                      />
                    </div>
                    <div className="sm:col-span-1">
                      <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink-3 mb-1">
                        Locale
                      </label>
                      <select
                        value={activeTemplate.locale}
                        onChange={(e) => handleUpdateActive({ locale: e.target.value })}
                        disabled={!canWrite}
                        className="w-full h-11 px-3 bg-paper text-xs rounded-lg border border-ink/20 focus:outline-none focus:border-ink"
                      >
                        <option value="en">English (en)</option>
                        <option value="si">Sinhala (si)</option>
                        <option value="ta">Tamil (ta)</option>
                      </select>
                    </div>
                  </div>

                  {/* Body Textarea */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink-3">
                        Email Body (Plaintext / Markdown)
                      </label>
                      <div className="text-[10px] text-ink-4">
                        Supported: {'{{customerName}}'}, {'{{orderId}}'}, {'{{trackingUrl}}'}
                      </div>
                    </div>
                    <textarea
                      rows={8}
                      className="w-full bg-paper p-3.5 text-xs font-mono text-ink rounded-xl border border-ink/20 focus:outline-none focus:border-ink leading-relaxed"
                      value={activeTemplate.body}
                      onChange={(e) => handleUpdateActive({ body: e.target.value })}
                      disabled={!canWrite}
                    />
                  </div>
                </Surface>

                {/* Simulated Customer Preview */}
                <Surface className="p-5 bg-sand/20 border border-ink/10 space-y-3">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-4 flex items-center gap-1.5">
                    <FileTextIcon size={14} />
                    <span>Customer Inbox Preview</span>
                  </span>
                  <div className="p-5 bg-white rounded-xl border border-ink/10 shadow-sm space-y-3 font-sans">
                    <div className="border-b border-ink/10 pb-2">
                      <div className="text-xs text-ink-4">From: VYRO Notifications &lt;notifications@vyro.lk&gt;</div>
                      <div className="text-sm font-bold text-ink mt-0.5">{activeTemplate.subject}</div>
                    </div>
                    <div className="text-xs text-ink whitespace-pre-wrap leading-relaxed">
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
                </Surface>
              </div>
            )}
          </div>
        )
      ) : (
        /* Raw JSON mode */
        <Surface className="p-5 space-y-3 bg-white border border-ink/10">
          <textarea
            className="w-full h-96 font-mono text-xs bg-paper border border-ink/20 rounded-xl p-4 leading-relaxed focus:outline-none focus:border-ink"
            value={jsonDraft}
            onChange={(e) => setJsonDraft(e.target.value)}
            disabled={!canWrite}
          />
        </Surface>
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

  if (!canRead) return <ErrorBanner message="You need webhook:read permission to view webhooks." />;

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
      }
    );
  };

  const toggleEventSelection = (ev: string) => {
    setSelectedEvents((prev) =>
      prev.includes(ev) ? prev.filter((e) => e !== ev) : [...prev, ev]
    );
  };

  const toggleSecretReveal = (id: string) => {
    setRevealedSecrets((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="space-y-6">
      {/* Top Controls */}
      <div className="flex items-center justify-between p-4 bg-white rounded-2xl border border-ink/10 shadow-sm">
        <div>
          <h3 className="text-sm font-bold text-ink">Configured Webhook Endpoints</h3>
          <p className="text-xs text-ink-4">Outbound event notification triggers dispatched via HTTP POST</p>
        </div>
        {canWrite && (
          <Button size="sm" variant="primary" onClick={() => setShowCreateModal(true)}>
            + Register Endpoint
          </Button>
        )}
      </div>

      {/* Webhooks Table */}
      <Surface className="overflow-hidden border border-ink/10 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-ink/10 bg-bone/40 text-[11px] uppercase tracking-wider font-semibold text-ink-3">
                <th className="py-3 px-4">Endpoint Name</th>
                <th className="py-3 px-4">Target URL</th>
                <th className="py-3 px-4">Subscribed Events</th>
                <th className="py-3 px-4">Signing Secret</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5 text-xs">
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
                  <tr key={h.id} className="hover:bg-sand/20 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-ink">
                      {h.name}
                    </td>
                    <td className="py-3 px-4 font-mono text-ink-3 max-w-xs truncate" title={h.url}>
                      {h.url}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex flex-wrap gap-1 max-w-xs">
                        {events.map((ev) => (
                          <span
                            key={ev}
                            className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-sand/60 text-ink border border-ink/10"
                          >
                            {ev}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono">
                      <div className="flex items-center gap-1.5">
                        <span>{isSecretRevealed ? h.secret : '••••••••••••••••'}</span>
                        <button
                          type="button"
                          onClick={() => toggleSecretReveal(h.id)}
                          className="text-[10px] text-ink-4 hover:text-ink underline"
                        >
                          {isSecretRevealed ? 'Hide' : 'Show'}
                        </button>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono font-bold uppercase rounded-full ${
                          h.active === 1
                            ? 'bg-mint/15 text-mint border border-mint/30'
                            : 'bg-bone text-ink-4 border border-ink/10'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${h.active === 1 ? 'bg-mint' : 'bg-ink-4'}`} />
                        {h.active === 1 ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      {canWrite && (
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
                      )}
                    </td>
                  </tr>
                );
              })}
              {!list.data?.length && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-xs text-ink-4">
                    No webhooks registered. Register an endpoint above to relay platform events.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Surface>

      {/* Recent Deliveries Table */}
      <Surface className="p-5 space-y-4 border border-ink/10 bg-white">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-ink/10">
          <div>
            <h3 className="text-sm font-bold text-ink">Recent Outbound Deliveries</h3>
            <p className="text-xs text-ink-4">Event dispatch logs, response HTTP status codes, and automatic retries</p>
          </div>

          {list.data && list.data.length > 1 && (
            <label className="text-xs flex items-center gap-2">
              <span className="text-ink-4 font-semibold uppercase tracking-wider text-[10px]">Filter Webhook:</span>
              <select
                value={selectedId ?? ''}
                onChange={(e) => setSelectedWebhookId(e.target.value || null)}
                className="h-8 px-2.5 bg-paper text-xs rounded-lg border border-ink/20 focus:outline-none focus:border-ink font-mono"
              >
                {list.data.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-ink/10 bg-bone/40 text-[11px] uppercase tracking-wider font-semibold text-ink-3">
                <th className="py-2.5 px-4">Delivery UUID</th>
                <th className="py-2.5 px-4">Event Type</th>
                <th className="py-2.5 px-4">Delivery Status</th>
                <th className="py-2.5 px-4">HTTP Response</th>
                <th className="py-2.5 px-4">Attempts</th>
                <th className="py-2.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5 text-xs">
              {(deliveries.data ?? []).map((d) => (
                <tr key={d.id} className="hover:bg-sand/20 transition-colors">
                  <td className="py-2.5 px-4 font-mono text-ink font-semibold">
                    {d.id.slice(0, 8)}…
                  </td>
                  <td className="py-2.5 px-4 font-mono">
                    <span className="px-2 py-0.5 rounded bg-sand/60 text-ink border border-ink/10">
                      {d.eventType}
                    </span>
                  </td>
                  <td className="py-2.5 px-4">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono font-bold uppercase rounded-full ${
                        d.status === 'success'
                          ? 'bg-mint/15 text-mint border border-mint/30'
                          : d.status === 'failed'
                          ? 'bg-rose/15 text-rose border border-rose/30'
                          : 'bg-amber/15 text-amber border border-amber/30'
                      }`}
                    >
                      {d.status}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 font-mono font-semibold">
                    {d.responseStatus ? (
                      <span className={d.responseStatus >= 200 && d.responseStatus < 300 ? 'text-mint' : 'text-rose'}>
                        {d.responseStatus}
                      </span>
                    ) : (
                      <span className="text-ink-4">—</span>
                    )}
                  </td>
                  <td className="py-2.5 px-4 font-mono">{d.attemptCount}</td>
                  <td className="py-2.5 px-4 text-right space-x-2">
                    <button
                      type="button"
                      onClick={() => setInspectDelivery(d)}
                      className="text-xs text-ink hover:underline font-medium"
                    >
                      Inspect
                    </button>
                    {canRetry && d.status === 'failed' && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => retry.mutate({ webhookId: d.webhookId, deliveryId: d.id })}
                        loading={retry.isPending && retry.variables?.deliveryId === d.id}
                      >
                        Retry
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {!selectedId ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-xs text-ink-4">
                    Create a webhook above to monitor outgoing dispatches.
                  </td>
                </tr>
              ) : !deliveries.data?.length ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-xs text-ink-4">
                    No webhook deliveries logged yet for this endpoint.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Surface>

      {/* Register Webhook Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-charcoal/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl border border-ink/20 shadow-2xl max-w-xl w-full p-6 space-y-4">
            <h3 className="text-base font-bold text-ink">Register Webhook Endpoint</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink-3 mb-1">
                  Endpoint Name
                </label>
                <Input
                  placeholder="e.g. ERP Order Sync"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink-3 mb-1">
                  Target HTTPS URL
                </label>
                <Input
                  placeholder="https://api.partner.com/vyro-webhooks"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink-3">
                    Signing Secret (min 8 chars)
                  </label>
                  <button
                    type="button"
                    onClick={generateSecret}
                    className="text-[11px] text-ink hover:underline font-medium"
                  >
                    Auto-generate
                  </button>
                </div>
                <Input
                  type="text"
                  placeholder="Enter secret or click auto-generate"
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink-3 mb-1">
                  Subscribed Events
                </label>
                <div className="grid grid-cols-2 gap-2 p-3 bg-bone/50 rounded-xl border border-ink/10 max-h-40 overflow-y-auto">
                  {WEBHOOK_EVENT_CATALOG.map((ev) => {
                    const isChecked = selectedEvents.includes(ev);
                    return (
                      <label key={ev} className="flex items-center gap-2 text-xs font-mono cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleEventSelection(ev)}
                          className="accent-ink rounded"
                        />
                        <span>{ev}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-ink/10">
              <Button variant="outline" size="sm" onClick={() => setShowCreateModal(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={!name || !url || selectedEvents.length === 0 || secret.length < 8}
                onClick={handleCreate}
                loading={create.isPending}
              >
                Register Endpoint
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Inspect Delivery Modal */}
      {inspectDelivery && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-charcoal/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl border border-ink/20 shadow-2xl max-w-2xl w-full p-6 space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-2 border-b border-ink/10">
              <div>
                <h3 className="text-base font-bold text-ink">Delivery Inspector</h3>
                <p className="text-xs text-ink-4 font-mono">{inspectDelivery.id}</p>
              </div>
              <button
                type="button"
                onClick={() => setInspectDelivery(null)}
                className="w-8 h-8 rounded-full bg-bone flex items-center justify-center font-bold text-sm"
              >
                &times;
              </button>
            </div>

            <div className="overflow-y-auto space-y-4 text-xs font-mono">
              <div className="grid grid-cols-3 gap-2 p-3 bg-bone/50 rounded-xl">
                <div>
                  <span className="text-[10px] text-ink-4 block uppercase">Event</span>
                  <span className="font-bold text-ink">{inspectDelivery.eventType}</span>
                </div>
                <div>
                  <span className="text-[10px] text-ink-4 block uppercase">Status</span>
                  <span className="font-bold text-ink">{inspectDelivery.status}</span>
                </div>
                <div>
                  <span className="text-[10px] text-ink-4 block uppercase">HTTP Code</span>
                  <span className="font-bold text-ink">{inspectDelivery.responseStatus ?? '—'}</span>
                </div>
              </div>

              <div>
                <span className="text-[11px] font-sans font-semibold uppercase tracking-wider text-ink-3 block mb-1">
                  Dispatched Payload
                </span>
                <pre className="p-3 bg-charcoal text-paper rounded-xl overflow-x-auto text-xs">
                  {(() => {
                    try {
                      return JSON.stringify(JSON.parse(inspectDelivery.payloadJson), null, 2);
                    } catch {
                      return inspectDelivery.payloadJson;
                    }
                  })()}
                </pre>
              </div>

              {inspectDelivery.responseBody && (
                <div>
                  <span className="text-[11px] font-sans font-semibold uppercase tracking-wider text-ink-3 block mb-1">
                    Response Body
                  </span>
                  <pre className="p-3 bg-bone text-ink rounded-xl overflow-x-auto text-xs border border-ink/10">
                    {inspectDelivery.responseBody}
                  </pre>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-ink/10">
              <Button size="sm" variant="outline" onClick={() => setInspectDelivery(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
