import { useState, useId } from 'react';
import { cn } from '@vyro/ui';
import { Label } from '@/components/ui';
import { SearchIcon, FilterIcon, ClockIcon } from '@/components/icons';
import { Card, Tabs, controlClass } from './ui';

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
    <Card className="space-y-4">
      {/* Top Bar: Presets & Reset */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-4">
            <ClockIcon size={14} />
            Time range
          </span>
          <Tabs
            items={PRESETS.map((p) => ({ key: p.id, label: p.label }))}
            value={activePreset}
            onChange={(key) => handlePresetSelect(key as (typeof PRESETS)[number]['id'])}
            ariaLabel="Time range presets"
          />
        </div>

        {isFiltered ? (
          <button
            type="button"
            onClick={() => {
              setIsCustomDate(false);
              setCustomActionMode(false);
              setCustomTargetMode(false);
              onChange(emptyFilters());
            }}
            className="self-start text-xs font-semibold text-rose transition-colors hover:text-rose/80 sm:self-auto"
          >
            Reset all filters
          </button>
        ) : null}
      </div>

      {/* Custom Date Range Picker (shown when custom is selected) */}
      {isCustomDate || activePreset === 'custom' ? (
        <div className="flex flex-wrap items-center gap-4 rounded-lg bg-ink/[0.04] px-4 py-3 text-xs animate-fade-in">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-4">Custom window</span>
          <label className="flex items-center gap-2">
            <span className="text-ink-4">From</span>
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
              className={cn(controlClass, 'h-9 w-auto font-mono text-xs')}
            />
          </label>
          <label className="flex items-center gap-2">
            <span className="text-ink-4">To</span>
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
              className={cn(controlClass, 'h-9 w-auto font-mono text-xs')}
            />
          </label>
        </div>
      ) : null}

      {/* Main Filter Grid: Action, Target Type, Actor, Target ID */}
      <div className="grid grid-cols-1 gap-4 border-t border-ink/[0.07] pt-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Action Filter */}
        <div>
          <Label htmlFor={`${filterId}-action`}>Action</Label>
          {customActionMode ? (
            <div className="flex items-center gap-1.5">
              <input
                id={`${filterId}-action`}
                type="text"
                placeholder="e.g. user.suspend"
                value={value.action}
                onChange={(e) => onChange({ ...value, action: e.target.value })}
                className={cn(controlClass, 'w-full font-mono text-xs')}
              />
              <button
                type="button"
                onClick={() => {
                  setCustomActionMode(false);
                  onChange({ ...value, action: '' });
                }}
                className={cn(controlClass, 'h-10 shrink-0 px-2.5 text-xs text-ink-3 hover:text-ink')}
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
              className={cn(controlClass, 'w-full')}
            >
              <option value="">All actions</option>
              {COMMON_ACTIONS.map((group) => (
                <optgroup key={group.group} label={group.group}>
                  {group.actions.map((act) => (
                    <option key={act.value} value={act.value}>
                      {act.label}
                    </option>
                  ))}
                </optgroup>
              ))}
              <option value="__custom__">Custom action query…</option>
            </select>
          )}
        </div>

        {/* Target Type Filter */}
        <div>
          <Label htmlFor={`${filterId}-targetType`}>Target type</Label>
          {customTargetMode ? (
            <div className="flex items-center gap-1.5">
              <input
                id={`${filterId}-targetType`}
                type="text"
                placeholder="e.g. user, order…"
                value={value.targetType}
                onChange={(e) => onChange({ ...value, targetType: e.target.value })}
                className={cn(controlClass, 'w-full font-mono text-xs')}
              />
              <button
                type="button"
                onClick={() => {
                  setCustomTargetMode(false);
                  onChange({ ...value, targetType: '' });
                }}
                className={cn(controlClass, 'h-10 shrink-0 px-2.5 text-xs text-ink-3 hover:text-ink')}
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
              className={cn(controlClass, 'w-full')}
            >
              <option value="">All target types</option>
              {TARGET_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
              <option value="__custom__">Custom target type…</option>
            </select>
          )}
        </div>

        {/* Actor Search Input */}
        <div>
          <Label htmlFor={`${filterId}-actorId`}>Actor ID</Label>
          <div className="relative">
            <SearchIcon
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-4"
            />
            <input
              id={`${filterId}-actorId`}
              type="text"
              placeholder="Operator UUID…"
              value={value.actorId}
              onChange={(e) => onChange({ ...value, actorId: e.target.value })}
              className={cn(controlClass, 'w-full pl-9 font-mono text-xs')}
            />
          </div>
        </div>

        {/* Target ID / Search Input */}
        <div>
          <Label htmlFor={`${filterId}-targetId`}>Target ID</Label>
          <div className="relative">
            <FilterIcon
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-4"
            />
            <input
              id={`${filterId}-targetId`}
              type="text"
              placeholder="Entity UUID or code…"
              value={value.targetId ?? ''}
              onChange={(e) => onChange({ ...value, targetId: e.target.value })}
              className={cn(controlClass, 'w-full pl-9 font-mono text-xs')}
            />
          </div>
        </div>
      </div>
    </Card>
  );
}
