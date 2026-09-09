import { useState, useId } from 'react';
import { SearchIcon, FilterIcon, ClockIcon } from '@/components/icons';

export type AuditFiltersState = {
  actorId: string;
  action: string;
  targetType: string;
  from: string;
  to: string;
  targetId?: string;
};

export function emptyFilters(): AuditFiltersState {
  return { actorId: '', action: '', targetType: '', from: '', to: '' };
}

export function toApiFilters(s: AuditFiltersState): {
  actorId?: string;
  action?: string;
  targetType?: string;
  targetId?: string;
  from?: number;
  to?: number;
} {
  return {
    ...(s.actorId ? { actorId: s.actorId } : {}),
    ...(s.action ? { action: s.action } : {}),
    ...(s.targetType ? { targetType: s.targetType } : {}),
    ...(s.targetId ? { targetId: s.targetId } : {}),
    ...(s.from ? { from: Number(s.from) } : {}),
    ...(s.to ? { to: Number(s.to) } : {}),
  };
}

const PRESETS = [
  { id: 'all', label: 'All Time' },
  { id: '24h', label: 'Past 24h', getRange: () => ({ from: String(Date.now() - 24 * 3600 * 1000), to: '' }) },
  { id: '7d', label: 'Past 7 Days', getRange: () => ({ from: String(Date.now() - 7 * 86400 * 1000), to: '' }) },
  { id: '30d', label: 'Past 30 Days', getRange: () => ({ from: String(Date.now() - 30 * 86400 * 1000), to: '' }) },
  { id: 'custom', label: 'Custom Range' },
] as const;

const COMMON_ACTIONS = [
  { group: 'Governance & Access', actions: [
    { value: 'user.suspend', label: 'user.suspend (Suspend User)' },
    { value: 'user.unsuspend', label: 'user.unsuspend (Reactivate User)' },
    { value: 'admin.role_changed', label: 'admin.role_changed (Role Update / Demote)' },
    { value: 'admin.invite_created', label: 'admin.invite_created (Invite Admin)' },
    { value: 'admin.invite_revoked', label: 'admin.invite_revoked (Revoke Invite)' },
  ]},
  { group: 'Trust & Safety', actions: [
    { value: 'kyc.review', label: 'kyc.review (KYC Verification Decision)' },
    { value: 'abuse_report.resolve', label: 'abuse_report.resolve (Resolve Ticket)' },
    { value: 'abuse_report.dismiss', label: 'abuse_report.dismiss (Dismiss Ticket)' },
    { value: 'abuse_report.takedown', label: 'abuse_report.takedown (Listing Takedown)' },
  ]},
  { group: 'Commerce & Orders', actions: [
    { value: 'order.status_update', label: 'order.status_update (Status Transition)' },
    { value: 'order.cancel', label: 'order.cancel (Cancel Order)' },
    { value: 'order.refund', label: 'order.refund (Process Refund)' },
  ]},
  { group: 'Catalog & Platform', actions: [
    { value: 'catalog.product_update', label: 'catalog.product_update (Edit Product)' },
    { value: 'catalog.product_delete', label: 'catalog.product_delete (Delete Product)' },
    { value: 'config.update', label: 'config.update (Platform Config)' },
  ]},
];

const TARGET_TYPES = [
  { value: 'user', label: 'User (Account)' },
  { value: 'admin_role', label: 'Admin Role' },
  { value: 'order', label: 'Order' },
  { value: 'product', label: 'Product' },
  { value: 'category', label: 'Category' },
  { value: 'kyc_review', label: 'KYC Review' },
  { value: 'abuse_report', label: 'Abuse Report' },
  { value: 'supplier', label: 'Supplier' },
  { value: 'business', label: 'Business' },
  { value: 'system', label: 'System Configuration' },
];

export function AuditFilters({
  value,
  onChange,
}: {
  value: AuditFiltersState;
  onChange: (v: AuditFiltersState) => void;
}) {
  const [isCustomDate, setIsCustomDate] = useState(false);
  const [customActionMode, setCustomActionMode] = useState(false);
  const [customTargetMode, setCustomTargetMode] = useState(false);
  const filterId = useId();

  // Detect active preset
  const isAllTime = !value.from && !value.to;
  const isFiltered = Boolean(value.actorId || value.action || value.targetType || value.targetId || value.from || value.to);

  // Compute active preset button
  const getActivePreset = () => {
    if (isCustomDate) return 'custom';
    if (isAllTime) return 'all';
    const now = Date.now();
    const fromNum = Number(value.from);
    if (!value.to && fromNum) {
      const diffHours = (now - fromNum) / (3600 * 1000);
      if (diffHours >= 23 && diffHours <= 25) return '24h';
      const diffDays = (now - fromNum) / (86400 * 1000);
      if (diffDays >= 6.5 && diffDays <= 7.5) return '7d';
      if (diffDays >= 29 && diffDays <= 31) return '30d';
    }
    return 'custom';
  };

  const activePreset = getActivePreset();

  const handlePresetSelect = (presetId: (typeof PRESETS)[number]['id']) => {
    if (presetId === 'all') {
      setIsCustomDate(false);
      onChange({ ...value, from: '', to: '' });
    } else if (presetId === 'custom') {
      setIsCustomDate(true);
    } else {
      setIsCustomDate(false);
      const preset = PRESETS.find((p) => p.id === presetId);
      if (preset && 'getRange' in preset) {
        const { from, to } = preset.getRange();
        onChange({ ...value, from, to });
      }
    }
  };

  // Convert epoch to YYYY-MM-DD for date inputs
  const formatDateVal = (epochStr: string) => {
    if (!epochStr) return '';
    try {
      const d = new Date(Number(epochStr));
      if (isNaN(d.getTime())) return '';
      return d.toISOString().slice(0, 10);
    } catch {
      return '';
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-ink/10 shadow-sm p-4 sm:p-5 space-y-4">
      {/* Top Bar: Presets & Reset */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-ink/10">
        <div className="flex items-center gap-2">
          <ClockIcon size={16} className="text-ink-4" />
          <span className="text-xs font-semibold uppercase tracking-wider text-ink-3">Time Range</span>
          <div className="flex flex-wrap items-center gap-1.5 ml-1">
            {PRESETS.map((p) => {
              const active = activePreset === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handlePresetSelect(p.id)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-all ${
                    active
                      ? 'bg-ink text-volt font-semibold shadow-sm'
                      : 'bg-bone text-ink-3 hover:bg-sand/60 hover:text-ink'
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>

        {isFiltered && (
          <button
            type="button"
            onClick={() => {
              setIsCustomDate(false);
              setCustomActionMode(false);
              setCustomTargetMode(false);
              onChange(emptyFilters());
            }}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-rose hover:text-rose/80 hover:underline self-start sm:self-auto"
          >
            <span>Reset All Filters</span>
          </button>
        )}
      </div>

      {/* Custom Date Range Picker (shown when custom is selected) */}
      {(isCustomDate || activePreset === 'custom') && (
        <div className="flex flex-wrap items-center gap-3 p-3 bg-bone/70 rounded-xl border border-ink/10 animate-fade-in text-xs">
          <span className="font-semibold text-ink-3 uppercase tracking-wider">Custom Window:</span>
          <label className="flex items-center gap-2">
            <span className="text-ink-4">From:</span>
            <input
              type="date"
              value={formatDateVal(value.from)}
              onChange={(e) => {
                const val = e.target.value;
                if (!val) {
                  onChange({ ...value, from: '' });
                } else {
                  const ms = new Date(val).getTime();
                  onChange({ ...value, from: String(ms) });
                }
              }}
              className="h-8 px-2 bg-white border border-ink/20 rounded-lg text-xs font-mono text-ink focus:outline-none focus:border-ink"
            />
          </label>
          <label className="flex items-center gap-2">
            <span className="text-ink-4">To:</span>
            <input
              type="date"
              value={formatDateVal(value.to)}
              onChange={(e) => {
                const val = e.target.value;
                if (!val) {
                  onChange({ ...value, to: '' });
                } else {
                  const ms = new Date(`${val}T23:59:59.999`).getTime();
                  onChange({ ...value, to: String(ms) });
                }
              }}
              className="h-8 px-2 bg-white border border-ink/20 rounded-lg text-xs font-mono text-ink focus:outline-none focus:border-ink"
            />
          </label>
        </div>
      )}

      {/* Main Filter Grid: Action, Target Type, Actor, Target ID */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Action Filter */}
        <div>
          <label htmlFor={`${filterId}-action`} className="block text-[11px] font-semibold uppercase tracking-wider text-ink-3 mb-1">
            Action
          </label>
          {customActionMode ? (
            <div className="flex items-center gap-1.5">
              <input
                id={`${filterId}-action`}
                type="text"
                placeholder="e.g. user.suspend"
                value={value.action}
                onChange={(e) => onChange({ ...value, action: e.target.value })}
                className="w-full h-9 px-3 bg-paper text-xs font-mono text-ink rounded-lg border border-ink/20 focus:outline-none focus:border-ink"
              />
              <button
                type="button"
                onClick={() => {
                  setCustomActionMode(false);
                  onChange({ ...value, action: '' });
                }}
                className="px-2 h-9 text-xs text-ink-4 hover:text-ink border border-ink/15 rounded-lg bg-bone"
                title="Back to dropdown"
              >
                List
              </button>
            </div>
          ) : (
            <select
              id={`${filterId}-action`}
              value={value.action}
              onChange={(e) => {
                if (e.target.value === '__custom__') {
                  setCustomActionMode(true);
                  onChange({ ...value, action: '' });
                } else {
                  onChange({ ...value, action: e.target.value });
                }
              }}
              className="w-full h-9 px-2.5 bg-paper text-xs text-ink rounded-lg border border-ink/20 focus:outline-none focus:border-ink font-medium"
            >
              <option value="">All Actions</option>
              {COMMON_ACTIONS.map((group) => (
                <optgroup key={group.group} label={group.group}>
                  {group.actions.map((act) => (
                    <option key={act.value} value={act.value}>
                      {act.label}
                    </option>
                  ))}
                </optgroup>
              ))}
              <option value="__custom__">Custom action query...</option>
            </select>
          )}
        </div>

        {/* Target Type Filter */}
        <div>
          <label htmlFor={`${filterId}-targetType`} className="block text-[11px] font-semibold uppercase tracking-wider text-ink-3 mb-1">
            Target Type
          </label>
          {customTargetMode ? (
            <div className="flex items-center gap-1.5">
              <input
                id={`${filterId}-targetType`}
                type="text"
                placeholder="e.g. user, order..."
                value={value.targetType}
                onChange={(e) => onChange({ ...value, targetType: e.target.value })}
                className="w-full h-9 px-3 bg-paper text-xs font-mono text-ink rounded-lg border border-ink/20 focus:outline-none focus:border-ink"
              />
              <button
                type="button"
                onClick={() => {
                  setCustomTargetMode(false);
                  onChange({ ...value, targetType: '' });
                }}
                className="px-2 h-9 text-xs text-ink-4 hover:text-ink border border-ink/15 rounded-lg bg-bone"
                title="Back to dropdown"
              >
                List
              </button>
            </div>
          ) : (
            <select
              id={`${filterId}-targetType`}
              value={value.targetType}
              onChange={(e) => {
                if (e.target.value === '__custom__') {
                  setCustomTargetMode(true);
                  onChange({ ...value, targetType: '' });
                } else {
                  onChange({ ...value, targetType: e.target.value });
                }
              }}
              className="w-full h-9 px-2.5 bg-paper text-xs text-ink rounded-lg border border-ink/20 focus:outline-none focus:border-ink font-medium"
            >
              <option value="">All Target Types</option>
              {TARGET_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
              <option value="__custom__">Custom target type...</option>
            </select>
          )}
        </div>

        {/* Actor Search Input */}
        <div>
          <label htmlFor={`${filterId}-actorId`} className="block text-[11px] font-semibold uppercase tracking-wider text-ink-3 mb-1">
            Actor ID
          </label>
          <div className="relative">
            <input
              id={`${filterId}-actorId`}
              type="text"
              placeholder="Operator UUID..."
              value={value.actorId}
              onChange={(e) => onChange({ ...value, actorId: e.target.value })}
              className="w-full h-9 pl-8 pr-3 bg-paper text-xs font-mono text-ink rounded-lg border border-ink/20 focus:outline-none focus:border-ink"
            />
            <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-ink-4">
              <SearchIcon size={14} />
            </div>
          </div>
        </div>

        {/* Target ID / Search Input */}
        <div>
          <label htmlFor={`${filterId}-targetId`} className="block text-[11px] font-semibold uppercase tracking-wider text-ink-3 mb-1">
            Target ID
          </label>
          <div className="relative">
            <input
              id={`${filterId}-targetId`}
              type="text"
              placeholder="Entity UUID or code..."
              value={value.targetId ?? ''}
              onChange={(e) => onChange({ ...value, targetId: e.target.value })}
              className="w-full h-9 pl-8 pr-3 bg-paper text-xs font-mono text-ink rounded-lg border border-ink/20 focus:outline-none focus:border-ink"
            />
            <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-ink-4">
              <FilterIcon size={14} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
