export type AuditFiltersState = {
  actorId: string;
  action: string;
  targetType: string;
  from: string;
  to: string;
};

export function AuditFilters({
  value,
  onChange,
}: {
  value: AuditFiltersState;
  onChange: (v: AuditFiltersState) => void;
}) {
  return (
    <div className="grid grid-cols-5 gap-2">
      <Input label="Actor ID" value={value.actorId} onChange={(v) => onChange({ ...value, actorId: v })} />
      <Input label="Action" value={value.action} onChange={(v) => onChange({ ...value, action: v })} />
      <Input label="Target type" value={value.targetType} onChange={(v) => onChange({ ...value, targetType: v })} />
      <Input label="From (epoch ms)" value={value.from} onChange={(v) => onChange({ ...value, from: v })} />
      <Input label="To (epoch ms)" value={value.to} onChange={(v) => onChange({ ...value, to: v })} />
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs text-ink-500">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border rounded px-2 py-1 w-full text-sm"
      />
    </label>
  );
}

export function emptyFilters(): AuditFiltersState {
  return { actorId: '', action: '', targetType: '', from: '', to: '' };
}
export function toApiFilters(s: AuditFiltersState): {
  actorId?: string;
  action?: string;
  targetType?: string;
  from?: number;
  to?: number;
} {
  return {
    actorId: s.actorId || undefined,
    action: s.action || undefined,
    targetType: s.targetType || undefined,
    from: s.from ? Number(s.from) : undefined,
    to: s.to ? Number(s.to) : undefined,
  };
}
