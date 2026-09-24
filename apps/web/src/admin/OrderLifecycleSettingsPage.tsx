import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ORDER_LIFECYCLE_DEFAULTS, type OrderLifecycleConfig } from '@vyro/shared';
import { api, ApiError } from '@/lib/api';
import { Button, Input, Label } from '@/components/ui';
import {
  ClockIcon,
  ShieldCheckIcon,
  SaveIcon,
  AlertCircleIcon,
  CheckCircleIcon,
} from '@/components/icons';
import { cn } from '@vyro/ui';
import { formatLifecycleDate } from '@/lib/orderLifecycle';
import { AdminPage, AdminPageHeader, Callout, Card, Panel, Pill, TableSkeleton } from './ui';

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
  const fieldInvalid = (f: (typeof NUMERIC_FIELDS)[number]) =>
    !Number.isInteger(draft[f.key]) || draft[f.key] < f.min || draft[f.key] > f.max;

  return (
    <AdminPage className="max-w-4xl">
      <AdminPageHeader
        kicker={
          <>
            <span>System</span>
            <span className="text-ink-4">/</span>
            <span>Orders</span>
          </>
        }
        title="Order lifecycle"
        description="Timers and guards applied to every purchase order. Changes apply to new automation runs immediately."
      />

      {q.isError ? (
        <Callout
          tone="danger"
          title="Could not load lifecycle settings"
          action={
            <Button variant="secondary" size="sm" onClick={() => void q.refetch()}>
              Retry
            </Button>
          }
        />
      ) : null}
      {error ? <Callout tone="danger">{error}</Callout> : null}
      {ok ? <Callout tone="success">{ok}</Callout> : null}

      {q.isLoading ? (
        <Card>
          <TableSkeleton rows={4} cols={2} />
        </Card>
      ) : (
        <form
          className="space-y-6"
          onSubmit={(e) => {
            e.preventDefault();
            if (!invalid) save.mutate();
          }}
        >
          <Panel
            title="Windows & timers"
            description="How long each lifecycle stage waits before automation acts."
            icon={<ClockIcon size={16} />}
          >
            <div className="grid gap-5 sm:grid-cols-2">
              {NUMERIC_FIELDS.map((f) => {
                const bad = fieldInvalid(f);
                return (
                  <div key={f.key} className="rounded-lg bg-ink/[0.03] p-4">
                    <div className="flex items-start justify-between gap-2">
                      <Label htmlFor={`olc-${f.key}`} className="mb-0">
                        {f.label}
                      </Label>
                      <Pill tone="neutral" className="shrink-0 font-mono">
                        {f.min}–{f.max}
                      </Pill>
                    </div>
                    <Input
                      id={`olc-${f.key}`}
                      type="number"
                      min={f.min}
                      max={f.max}
                      step={1}
                      value={draft[f.key]}
                      onChange={(e) => setDraft((d) => ({ ...d, [f.key]: Math.floor(Number(e.target.value)) }))}
                      className={cn('mt-2.5 font-mono', bad && 'shadow-[inset_0_0_0_1px_rgba(196,90,74,0.5)]')}
                      aria-invalid={bad}
                    />
                    <p className={cn('mt-1.5 text-xs', bad ? 'font-medium text-rose' : 'text-ink-4')}>
                      {bad ? `Must be an integer between ${f.min} and ${f.max}.` : f.hint}
                    </p>
                  </div>
                );
              })}
            </div>
          </Panel>

          <Panel
            title="Guards"
            description="Feature gates enforced on every purchase order."
            icon={<ShieldCheckIcon size={16} />}
          >
            <div className="divide-y divide-ink/[0.07]">
              {TOGGLE_FIELDS.map((f) => {
                const on = draft[f.key];
                return (
                  <div key={f.key} className="flex items-center justify-between gap-4 py-3.5 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-ink">{f.label}</span>
                        {on ? (
                          <Pill tone="success" dot>
                            On
                          </Pill>
                        ) : (
                          <Pill tone="neutral" dot>
                            Off
                          </Pill>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-ink-4">{f.hint}</p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={on}
                      aria-label={f.label}
                      onClick={() => setDraft((d) => ({ ...d, [f.key]: !on }))}
                      className={cn(
                        'flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors duration-200',
                        on ? 'bg-ink' : 'bg-ink/15',
                      )}
                    >
                      <span
                        className={cn(
                          'size-5 rounded-full transition-transform duration-200',
                          on ? 'translate-x-5 bg-volt' : 'translate-x-0 bg-paper shadow-sm',
                        )}
                      />
                    </button>
                  </div>
                );
              })}
            </div>
            {draft.automationSince ? (
              <div className="mt-4 flex items-start gap-2 rounded-lg bg-ink/[0.04] px-3.5 py-3 text-xs text-ink-3">
                <CheckCircleIcon size={14} className="mt-0.5 shrink-0 text-mint" />
                <span>
                  Automation active since{' '}
                  <strong className="font-mono text-ink">{formatLifecycleDate(draft.automationSince)}</strong> —
                  auto-cancel only affects orders created after this.
                </span>
              </div>
            ) : null}
          </Panel>

          <Card className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-ink-4">
              {invalid ? (
                <span className="inline-flex items-center gap-1.5 font-medium text-rose">
                  <AlertCircleIcon size={14} />
                  Fix out-of-range values before saving
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5">
                  <CheckCircleIcon size={14} className="text-mint" />
                  All values valid — optimistic concurrency check on save
                </span>
              )}
              <Pill tone="neutral" className="font-mono">
                v{q.data?.version ?? 0}
              </Pill>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={!q.data}
                onClick={() => {
                  setDraft({ ...ORDER_LIFECYCLE_DEFAULTS, ...q.data?.value });
                  setError('');
                  setOk('');
                }}
              >
                Discard changes
              </Button>
              <Button type="submit" size="sm" icon={<SaveIcon size={14} />} loading={save.isPending} disabled={invalid}>
                Save settings
              </Button>
            </div>
          </Card>
        </form>
      )}
    </AdminPage>
  );
}
