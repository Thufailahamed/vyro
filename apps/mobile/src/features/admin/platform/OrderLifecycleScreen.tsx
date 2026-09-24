import { useState } from 'react';
import { View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save, Timer } from 'lucide-react-native';
import { api, ApiError, errorMessage } from '@/lib/api';
import { useOnChange } from '@/lib/useOnChange';
import { formatDateTime } from '@/lib/format';
import { Banner, Button, ErrorState, Field, Input, Screen, SkeletonList, Text, ToggleRow, useToast } from '@/ui';
import { Can } from '@/features/admin/platform/kit';
import { Section } from '@/features/admin/ops/kit';

interface OrderLifecycleConfig {
  pendingAutoCancelHours: number;
  autoCompleteDays: number;
  disputeWindowDays: number;
  returnWindowDays: number;
  returnEscalationDays: number;
  paymentGateEnabled: boolean;
  returnsEnabled: boolean;
  automationEnabled: boolean;
  automationSince?: number;
}

const DEFAULTS: OrderLifecycleConfig = {
  pendingAutoCancelHours: 48,
  autoCompleteDays: 3,
  disputeWindowDays: 7,
  returnWindowDays: 7,
  returnEscalationDays: 3,
  paymentGateEnabled: true,
  returnsEnabled: true,
  automationEnabled: true,
};

type NumericKey =
  | 'pendingAutoCancelHours'
  | 'autoCompleteDays'
  | 'disputeWindowDays'
  | 'returnWindowDays'
  | 'returnEscalationDays';
type ToggleKey = 'paymentGateEnabled' | 'returnsEnabled' | 'automationEnabled';

const NUMERIC_FIELDS: { key: NumericKey; label: string; hint: string; min: number; max: number }[] = [
  { key: 'pendingAutoCancelHours', label: 'Auto-cancel pending after (hours)', hint: 'Unanswered orders are cancelled and refunded.', min: 1, max: 720 },
  { key: 'autoCompleteDays', label: 'Auto-complete delivered after (days)', hint: 'Buyer confirmation window before funds release.', min: 1, max: 60 },
  { key: 'disputeWindowDays', label: 'Dispute window (days after delivery)', hint: 'Buyers can open a dispute within this window.', min: 1, max: 90 },
  { key: 'returnWindowDays', label: 'Return window (days after delivery)', hint: '0 disables new return requests.', min: 0, max: 90 },
  { key: 'returnEscalationDays', label: 'Escalate unanswered returns after (days)', hint: 'Supplier inaction on a return escalates to ops.', min: 1, max: 30 },
];

const TOGGLE_FIELDS: { key: ToggleKey; label: string; hint: string }[] = [
  { key: 'paymentGateEnabled', label: 'Payment gate', hint: 'Suppliers cannot dispatch until the order is paid, COD or on credit.' },
  { key: 'returnsEnabled', label: 'Returns (RMA)', hint: 'Allow buyers to request returns on delivered orders.' },
  { key: 'automationEnabled', label: 'Lifecycle automation', hint: 'Run auto-cancel, auto-complete and return escalation jobs.' },
];

interface LifecycleSettings {
  value: OrderLifecycleConfig;
  version: number;
}

/** /admin/order-lifecycle — mirrors web OrderLifecycleSettingsPage. */
export function OrderLifecycleScreen() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({
    queryKey: ['admin-order-lifecycle'],
    queryFn: () => api.get<LifecycleSettings>('/admin/order-lifecycle'),
  });
  const [draft, setDraft] = useState<OrderLifecycleConfig>(DEFAULTS);
  const [text, setText] = useState<Record<NumericKey, string>>({
    pendingAutoCancelHours: String(DEFAULTS.pendingAutoCancelHours),
    autoCompleteDays: String(DEFAULTS.autoCompleteDays),
    disputeWindowDays: String(DEFAULTS.disputeWindowDays),
    returnWindowDays: String(DEFAULTS.returnWindowDays),
    returnEscalationDays: String(DEFAULTS.returnEscalationDays),
  });
  const [stale, setStale] = useState(false);

  useOnChange(q.data, (data) => {
    if (data) {
      const value = { ...DEFAULTS, ...data.value };
      setDraft(value);
      setText({
        pendingAutoCancelHours: String(value.pendingAutoCancelHours),
        autoCompleteDays: String(value.autoCompleteDays),
        disputeWindowDays: String(value.disputeWindowDays),
        returnWindowDays: String(value.returnWindowDays),
        returnEscalationDays: String(value.returnEscalationDays),
      });
      setStale(false);
    }
  });

  const save = useMutation({
    mutationFn: () => {
      const { automationSince: _ignored, ...value } = draft;
      return api.put<LifecycleSettings>('/admin/order-lifecycle', {
        value,
        expectedVersion: q.data?.version ?? 0,
      });
    },
    onSuccess: (data) => {
      setStale(false);
      toast.success('Settings saved');
      qc.setQueryData(['admin-order-lifecycle'], data);
    },
    onError: (e) => {
      if (e instanceof ApiError && (e.status === 409 || e.code === 'STALE_WRITE')) {
        setStale(true);
        void q.refetch();
      } else {
        toast.error('Save failed', errorMessage(e));
      }
    },
  });

  const setNumeric = (key: NumericKey, raw: string) => {
    setText((t) => ({ ...t, [key]: raw }));
    const n = Math.floor(Number(raw));
    setDraft((d) => ({ ...d, [key]: Number.isFinite(n) ? n : NaN }));
  };

  const invalid = NUMERIC_FIELDS.some((f) => !Number.isInteger(draft[f.key]) || draft[f.key] < f.min || draft[f.key] > f.max);

  return (
    <Screen
      back
      kicker="System · Orders"
      title="Order lifecycle"
      subtitle="Timers and guards applied to every purchase order. Changes apply to new automation runs immediately."
      onRefresh={() => q.refetch()}
      footer={
        q.data ? (
          <Can perm="feature_flag:write">
            <Button title={`Save settings · v${q.data.version}`} icon={Save} variant="volt" size="lg" full loading={save.isPending} disabled={invalid} onPress={() => save.mutate()} />
          </Can>
        ) : undefined
      }
    >
      {stale ? (
        <Banner tone="warning" title="Settings changed elsewhere" message="The latest values have been loaded — review and save again." />
      ) : null}
      {q.isLoading ? (
        <SkeletonList rows={5} height={90} />
      ) : q.isError ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      ) : (
        <View style={{ gap: 14 }}>
          <Section kicker="Windows" title="Timers" icon={Timer}>
            <View style={{ gap: 14 }}>
              {NUMERIC_FIELDS.map((f) => (
                <Field key={f.key} label={f.label} hint={`${f.hint} (${f.min}–${f.max})`}>
                  <Input value={text[f.key]} onChangeText={(v) => setNumeric(f.key, v)} keyboardType="number-pad" />
                </Field>
              ))}
            </View>
          </Section>
          <Section kicker="Guards" title="Automation" icon={Timer}>
            <View>
              {TOGGLE_FIELDS.map((f, i) => (
                <ToggleRow
                  key={f.key}
                  label={f.label}
                  description={f.hint}
                  value={draft[f.key]}
                  last={i === TOGGLE_FIELDS.length - 1}
                  onValueChange={(v) => setDraft((d) => ({ ...d, [f.key]: v }))}
                />
              ))}
            </View>
            {draft.automationSince ? (
              <Text variant="caption" color="ink4" style={{ marginTop: 10 }}>
                Automation active since {formatDateTime(draft.automationSince)} — auto-cancel only affects orders created after this.
              </Text>
            ) : null}
          </Section>
          {invalid ? <Banner tone="warning" message="Every timer must be a whole number inside its allowed range." /> : null}
        </View>
      )}
    </Screen>
  );
}
