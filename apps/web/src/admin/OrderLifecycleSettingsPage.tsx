import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ORDER_LIFECYCLE_DEFAULTS, type OrderLifecycleConfig } from '@vyro/shared';
import { api, ApiError } from '@/lib/api';
import { Button, ErrorBanner, Input, Label, PageHeader, SuccessBanner, Surface } from '@/components/ui';
import { formatLifecycleDate } from '@/lib/orderLifecycle';

type NumericKey =
  | 'pendingAutoCancelHours'
  | 'autoCompleteDays'
  | 'disputeWindowDays'
  | 'returnWindowDays'
  | 'returnEscalationDays';
type ToggleKey = 'paymentGateEnabled' | 'returnsEnabled' | 'automationEnabled';

const NUMERIC_FIELDS: Array<{ key: NumericKey; label: string; hint: string; min: number; max: number }> = [
  { key: 'pendingAutoCancelHours', label: 'Auto-cancel pending after (hours)', hint: 'Unanswered orders are cancelled and refunded.', min: 1, max: 720 },
  { key: 'autoCompleteDays', label: 'Auto-complete delivered after (days)', hint: 'Buyer confirmation window before funds release.', min: 1, max: 60 },
  { key: 'disputeWindowDays', label: 'Dispute window (days after delivery)', hint: 'Buyers can open a dispute within this window.', min: 1, max: 90 },
  { key: 'returnWindowDays', label: 'Return window (days after delivery)', hint: '0 disables new return requests.', min: 0, max: 90 },
  { key: 'returnEscalationDays', label: 'Escalate unanswered returns after (days)', hint: 'Supplier inaction on a return escalates to ops.', min: 1, max: 30 },
];

const TOGGLE_FIELDS: Array<{ key: ToggleKey; label: string; hint: string }> = [
  { key: 'paymentGateEnabled', label: 'Payment gate', hint: 'Suppliers cannot dispatch until the order is paid, COD or on credit.' },
  { key: 'returnsEnabled', label: 'Returns (RMA)', hint: 'Allow buyers to request returns on delivered orders.' },
  { key: 'automationEnabled', label: 'Lifecycle automation', hint: 'Run auto-cancel, auto-complete and return escalation jobs.' },
];

interface LifecycleSettings {
  value: OrderLifecycleConfig;
  version: number;
}

export function OrderLifecycleSettingsPage() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['admin-order-lifecycle'],
    queryFn: () => api.get<LifecycleSettings>('/admin/order-lifecycle'),
  });
  const [draft, setDraft] = useState<OrderLifecycleConfig>(ORDER_LIFECYCLE_DEFAULTS);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  useEffect(() => {
    if (q.data) setDraft({ ...ORDER_LIFECYCLE_DEFAULTS, ...q.data.value });
  }, [q.data]);

  const save = useMutation({
    mutationFn: () => {
      const { automationSince: _ignored, ...value } = draft;
      return api.put<LifecycleSettings>('/admin/order-lifecycle', {
        value,
        expectedVersion: q.data?.version ?? 0,
      });
    },
    onSuccess: (data) => {
      setError('');
      setOk('Settings saved.');
      qc.setQueryData(['admin-order-lifecycle'], data);
    },
    onError: (e) => {
      setOk('');
      if (e instanceof ApiError && (e.status === 409 || e.code === 'STALE_WRITE')) {
        setError('Someone else changed these settings. The latest values have been loaded — review and save again.');
        void q.refetch();
      } else {
        setError(e instanceof ApiError ? `${e.code}: ${e.message}` : 'Save failed');
      }
    },
  });

  const invalid = NUMERIC_FIELDS.some(
    (f) => !Number.isInteger(draft[f.key]) || draft[f.key] < f.min || draft[f.key] > f.max,
  );

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-16">
      <PageHeader
        kicker="System / Orders"
        title="Order lifecycle"
        sub="Timers and guards applied to every purchase order. Changes apply to new automation runs immediately."
      />

      <ErrorBanner message={q.isError ? 'Could not load lifecycle settings.' : error} />
      {ok && <SuccessBanner message={ok} />}

      {q.isLoading ? (
        <div className="h-64 bg-mist/60 animate-pulse" />
      ) : (
        <form
          className="space-y-6"
          onSubmit={(e) => {
            e.preventDefault();
            if (!invalid) save.mutate();
          }}
        >
          <Surface className="p-5 space-y-4">
            <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-ink">Windows &amp; timers</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              {NUMERIC_FIELDS.map((f) => (
                <div key={f.key}>
                  <Label htmlFor={`olc-${f.key}`}>{f.label}</Label>
                  <Input
                    id={`olc-${f.key}`}
                    type="number"
                    min={f.min}
                    max={f.max}
                    step={1}
                    value={draft[f.key]}
                    onChange={(e) => setDraft((d) => ({ ...d, [f.key]: Math.floor(Number(e.target.value)) }))}
                  />
                  <p className="text-[11px] text-ink-4 mt-1">
                    {f.hint} ({f.min}–{f.max})
                  </p>
                </div>
              ))}
            </div>
          </Surface>

          <Surface className="p-5 space-y-4">
            <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-ink">Guards</h2>
            {TOGGLE_FIELDS.map((f) => (
              <label key={f.key} className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={draft[f.key]}
                  onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.checked }))}
                  className="mt-1 accent-copper"
                />
                <span>
                  <span className="block text-sm font-semibold text-ink">{f.label}</span>
                  <span className="block text-xs text-ink-4">{f.hint}</span>
                </span>
              </label>
            ))}
            {draft.automationSince && (
              <p className="text-[11px] font-mono text-ink-4">
                Automation active since {formatLifecycleDate(draft.automationSince)} — auto-cancel only affects orders
                created after this.
              </p>
            )}
          </Surface>

          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono text-ink-4">Version {q.data?.version ?? 0}</span>
            <Button type="submit" loading={save.isPending} disabled={invalid}>
              Save settings
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
