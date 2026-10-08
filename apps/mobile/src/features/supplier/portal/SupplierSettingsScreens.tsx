import { useState } from 'react';
import { View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Check, FileText, Landmark, ShieldCheck, Sparkles, Upload, Warehouse } from 'lucide-react-native';
import { colors, fonts } from '@/theme/tokens';
import { api, errorMessage, qs } from '@/lib/api';
import { useSupplierId } from '@/lib/auth';
import {
  Banner,
  Button,
  Card,
  Checkbox,
  EmptyState,
  ErrorState,
  Field,
  IconTile,
  Input,
  ListRow,
  Screen,
  Select,
  SkeletonList,
  StatusBadge,
  Stepper,
  Text,
  useToast,
} from '@/ui';
import { appendFile, pickDocument } from '@/lib/files';
import { humanize } from '@/lib/format';
import { Section, SummaryHero } from '@/features/supplier/ops/kit';

/* -------------------------------- Settings -------------------------------- */

type Settings = {
  payoutMethod?: 'bank' | 'cash' | null;
  bankName?: string | null;
  bankAccountNo?: string | null;
  bankBranch?: string | null;
  bankAccountHolder?: string | null;
  warehouseAddress?: string | null;
  warehouseCity?: string | null;
  warehouseDistrict?: string | null;
  defaultLeadTimeDays?: number | null;
};

export function SupplierSettingsScreen() {
  const supplierId = useSupplierId();
  const qc = useQueryClient();
  const toast = useToast();

  const q = useQuery({
    queryKey: ['supplier-settings', supplierId],
    queryFn: () => api.get<{ settings: Settings }>(`/suppliers/${supplierId}/settings`),
    enabled: !!supplierId,
  });

  const [form, setForm] = useState<Partial<Settings> | null>(null);
  const s: Settings = { ...(q.data?.settings ?? {}), ...(form ?? {}) };

  const save = useMutation({
    mutationFn: () => api.patch(`/suppliers/${supplierId}/settings`, form ?? {}),
    onSuccess: () => {
      toast.success('Settings saved');
      setForm(null);
      void qc.invalidateQueries({ queryKey: ['supplier-settings', supplierId] });
    },
    onError: (e) => toast.error('Could not save', errorMessage(e)),
  });

  const set = (patch: Partial<Settings>) => setForm((f) => ({ ...(f ?? {}), ...patch }));
  const cash = s.payoutMethod === 'cash';
  const required: (keyof Settings)[] = ['warehouseAddress', 'warehouseCity', 'warehouseDistrict', 'payoutMethod', ...(cash ? [] : (['bankName', 'bankAccountNo', 'bankAccountHolder'] as const))];
  const filled = required.filter((k) => s[k] != null && String(s[k]).trim() !== '').length;
  const pct = Math.round((filled / required.length) * 100);

  if (q.isLoading)
    return (
      <Screen back kicker="Facility" title="Settings">
        <SkeletonList rows={5} />
      </Screen>
    );
  if (q.isError)
    return (
      <Screen back kicker="Facility" title="Settings" onRefresh={() => q.refetch()}>
        <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      </Screen>
    );

  return (
    <Screen
      back
      onRefresh={() => q.refetch()}
      kicker="Facility"
      title="Settings"
      subtitle="Depot, lead times and settlement payouts."
      keyboard
      footer={
        <>
          {form ? (
            <Text variant="caption" color="copper" align="center">
              You have unsaved changes
            </Text>
          ) : null}
          <Button title={save.isPending ? 'Saving…' : 'Save settings'} full loading={save.isPending} disabled={!form} onPress={() => save.mutate()} />
        </>
      }
    >
      <SummaryHero
        icon={Warehouse}
        kicker="Facility profile"
        value={`${pct}% complete`}
        sub={pct === 100 ? 'Depot and payouts are fully set up.' : 'Complete your depot and payout details so buyers can order and you get paid.'}
        cells={[
          { label: 'Depot', value: s.warehouseCity || '—', dot: s.warehouseCity ? colors.volt : colors.paperFaint },
          { label: 'Payout', value: s.payoutMethod ? humanize(s.payoutMethod) : '—', dot: s.payoutMethod ? colors.volt : colors.paperFaint },
          { label: 'Lead time', value: `${s.defaultLeadTimeDays ?? 1}d`, dot: colors.copper },
        ]}
      >
        <View style={{ height: 6, borderRadius: 3, backgroundColor: 'rgba(250,247,240,0.1)', overflow: 'hidden' }}>
          <View style={{ width: `${pct}%`, height: '100%', borderRadius: 3, backgroundColor: colors.volt }} />
        </View>
      </SummaryHero>
      <Section icon={Warehouse} kicker="Step 1" title="Depot" sub="Where buyers' orders are picked and packed.">
        <Field label="Warehouse address">
          <Input value={s.warehouseAddress ?? ''} onChangeText={(v) => set({ warehouseAddress: v })} placeholder="No. 12, Depot Road" />
        </Field>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Field label="City">
              <Input value={s.warehouseCity ?? ''} onChangeText={(v) => set({ warehouseCity: v })} placeholder="Colombo" />
            </Field>
          </View>
          <View style={{ flex: 1 }}>
            <Field label="District">
              <Input value={s.warehouseDistrict ?? ''} onChangeText={(v) => set({ warehouseDistrict: v })} placeholder="Colombo" />
            </Field>
          </View>
        </View>
        <Field label="Default lead time (days)">
          <Stepper value={s.defaultLeadTimeDays ?? 1} onChange={(v) => set({ defaultLeadTimeDays: v })} min={0} max={30} />
        </Field>
      </Section>
      <Section icon={Landmark} kicker="Step 2" title="Settlement" sub="How escrow releases reach you.">
        <Field label="Payout method">
          <Select value={s.payoutMethod ?? null} options={[{ value: 'bank', label: 'Bank transfer' }, { value: 'cash', label: 'Cash' }]} onChange={(v) => set({ payoutMethod: v })} placeholder="Select method…" />
        </Field>
        {cash ? (
          <Text variant="caption" color="ink4">
            Cash payouts are collected at the depot — no bank details needed.
          </Text>
        ) : (
          <>
            <Field label="Bank name">
              <Input value={s.bankName ?? ''} onChangeText={(v) => set({ bankName: v })} placeholder="Bank of Ceylon" />
            </Field>
            <Field label="Account number">
              <Input value={s.bankAccountNo ?? ''} onChangeText={(v) => set({ bankAccountNo: v })} placeholder="1234567890" keyboardType="number-pad" />
            </Field>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Field label="Branch">
                  <Input value={s.bankBranch ?? ''} onChangeText={(v) => set({ bankBranch: v })} placeholder="Colombo 03" />
                </Field>
              </View>
              <View style={{ flex: 1 }}>
                <Field label="Account holder">
                  <Input value={s.bankAccountHolder ?? ''} onChangeText={(v) => set({ bankAccountHolder: v })} placeholder="Company Ltd" />
                </Field>
              </View>
            </View>
          </>
        )}
      </Section>
      <BuyLeadsSection supplierId={supplierId} />
    </Screen>
  );
}

/* -------------------------------- BuyLeads -------------------------------- */

type BuyLeadsSubscription = { enabled: boolean; categoryIds: string[] };
type Category = { id: string; slug: string; name: string; active: boolean };

function BuyLeadsSection({ supplierId }: { supplierId: string | undefined }) {
  const qc = useQueryClient();
  const toast = useToast();
  const sub = useQuery({
    queryKey: ['supplier', supplierId, 'buyleads-sub'],
    queryFn: () => api.get<BuyLeadsSubscription>(`/supplier/buyleads/subs${qs({ supplierId })}`),
    retry: false,
  });
  const cats = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get<{ categories: Category[] }>('/categories'),
    staleTime: 5 * 60 * 1000,
  });

  const [draft, setDraft] = useState<BuyLeadsSubscription | null>(null);
  const value = draft ?? sub.data ?? { enabled: false, categoryIds: [] };

  const save = useMutation({
    mutationFn: (next: BuyLeadsSubscription) => api.put<BuyLeadsSubscription>(`/supplier/buyleads/subs${qs({ supplierId })}`, next),
    onSuccess: (data) => {
      qc.setQueryData(['supplier', supplierId, 'buyleads-sub'], data);
      setDraft(null);
      toast.success('BuyLeads preferences saved');
    },
    onError: (e) => toast.error('Could not save BuyLeads preferences', errorMessage(e)),
  });

  if (sub.isError) return null; // flag off — keep settings page clean

  return (
    <Section icon={Sparkles} kicker="Intelligence" title="BuyLeads" sub="Daily email digest of new RFQs matching your categories.">
      <Checkbox
        checked={value.enabled}
        onChange={(enabled) => setDraft({ ...value, enabled })}
        label="Daily digest email"
        description="One email each morning with new matched RFQs."
      />
      <Field label="Subscribed categories">
        {cats.isLoading ? (
          <SkeletonList rows={1} />
        ) : (
          <View style={{ gap: 10 }}>
            {(cats.data?.categories ?? [])
              .filter((c) => c.active)
              .map((c) => (
                <Checkbox
                  key={c.id}
                  checked={value.categoryIds.includes(c.id)}
                  onChange={() => {
                    const set = new Set(value.categoryIds);
                    if (set.has(c.id)) set.delete(c.id);
                    else set.add(c.id);
                    setDraft({ ...value, categoryIds: Array.from(set) });
                  }}
                  label={c.name}
                />
              ))}
          </View>
        )}
      </Field>
      <Button
        title={save.isPending ? 'Saving…' : 'Save BuyLeads'}
        size="sm"
        disabled={save.isPending || !draft}
        onPress={() => draft && save.mutate(draft)}
      />
    </Section>
  );
}

/* ------------------------------- Verification ------------------------------ */

type Kyc = { status: string; reviewNotes?: string | null } | null;

export function SupplierVerificationScreen() {
  const toast = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState({ registrationNo: '', taxId: '', bankName: '', bankAccountNo: '', bankBranch: '', bankAccountHolder: '', notes: '' });
  const [files, setFiles] = useState<{ uri: string; name: string; type: string }[]>([]);

  const kyc = useQuery({
    queryKey: ['seller-kyc'],
    queryFn: () => api.get<{ kyc: Kyc }>('/kyc/my'),
  });

  const submit = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post('/kyc/submit', body),
    onSuccess: () => {
      toast.success('KYC submitted');
      void qc.invalidateQueries({ queryKey: ['seller-kyc'] });
    },
    onError: (e) => toast.error('Could not submit', errorMessage(e)),
  });

  const upload = useMutation({
    mutationFn: async () => {
      const picked = await pickDocument({ multiple: true });
      if (!picked.length) return 0;
      let n = 0;
      for (const f of picked) {
        const fd = new FormData();
        appendFile(fd, 'file', f);
        await api.upload('/documents', fd);
        n += 1;
      }
      setFiles((prev) => [...prev, ...picked.map((p) => ({ uri: p.uri, name: p.name, type: p.type }))]);
      return n;
    },
    onSuccess: (n) => {
      if (n > 0) toast.success(`${n} document${n === 1 ? '' : 's'} uploaded`);
    },
    onError: (e) => toast.error('Upload failed', errorMessage(e)),
  });

  const status = kyc.data?.kyc?.status ?? null;
  const approved = status === 'approved';
  const notes = kyc.data?.kyc?.reviewNotes ?? null;

  const steps = ['Business registration', 'Tax & compliance', 'Settlement bank', 'Admin review'].map((label, i) => ({
    label,
    state: (status === 'approved' ? 'done' : status === null ? (i === 0 ? 'active' : 'idle') : i < 3 ? 'done' : 'active') as 'done' | 'active' | 'idle',
  }));

  return (
    <Screen back keyboard onRefresh={() => kyc.refetch()} kicker="Compliance" title="Verification" subtitle="Facility KYC and document checks.">
      {kyc.isLoading ? (
        <SkeletonList rows={4} />
      ) : kyc.isError ? (
        <ErrorState message={errorMessage(kyc.error)} onRetry={() => kyc.refetch()} />
      ) : (
        <>
          <SummaryHero
            icon={ShieldCheck}
            kicker="Facility KYC"
            value={status ? humanize(status) : 'Not submitted'}
            sub={approved ? 'Your trust seal is live on your storefront.' : 'Verified facilities earn the trust seal on their storefront. Reviews take 24–48 hours.'}
            right={<StatusBadge status={status ?? 'not_submitted'} size="sm" />}
          >
            <View style={{ gap: 10 }}>
              {steps.map((st, i) => (
                <View key={st.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 11,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: st.state === 'done' ? colors.volt : st.state === 'active' ? 'rgba(198,220,74,0.18)' : 'rgba(250,247,240,0.08)',
                      borderWidth: st.state === 'active' ? 1.5 : 0,
                      borderColor: colors.volt,
                    }}
                  >
                    {st.state === 'done' ? (
                      <Check size={12} color={colors.ink} strokeWidth={3} />
                    ) : (
                      <Text style={{ fontFamily: fonts.sansSemi, fontSize: 10.5, lineHeight: 13, color: st.state === 'active' ? colors.volt : colors.paperFaint }}>{i + 1}</Text>
                    )}
                  </View>
                  <Text variant="bodySm" weight={st.state === 'idle' ? 'regular' : 'semibold'} color={st.state === 'idle' ? 'paperFaint' : 'paper'} style={{ flex: 1 }}>
                    {st.label}
                  </Text>
                  {st.state === 'active' ? (
                    <Text variant="caption" color="volt">
                      {status ? 'In review' : 'Next'}
                    </Text>
                  ) : null}
                </View>
              ))}
            </View>
          </SummaryHero>
          {notes ? <Banner tone="warning" title="Reviewer notes" message={notes} /> : null}
          {approved ? (
            <Card kind="bone" style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <IconTile icon={ShieldCheck} tone="success" size={42} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="h3">You're verified</Text>
                <Text variant="bodySm" color="ink4">
                  Contact support if your registration or bank details change.
                </Text>
              </View>
            </Card>
          ) : (
          <>
          <Section icon={FileText} kicker="Step 1" title="Documents" sub="Registration, tax and bank proofs.">
            {files.length === 0 ? (
              <EmptyState compact icon={Building2} title="No uploads yet" message="Attach registration, tax and bank proofs." />
            ) : (
              <View style={{ marginTop: -6 }}>
                {files.map((f, i) => (
                  <ListRow key={f.uri} icon={FileText} iconTone="paper" title={f.name} subtitle={f.type} last={i === files.length - 1} />
                ))}
              </View>
            )}
            <Button title={upload.isPending ? 'Uploading…' : 'Upload documents'} icon={Upload} variant="secondary" full loading={upload.isPending} onPress={() => upload.mutate()} />
          </Section>
          <Section icon={Building2} kicker="Step 2" title="KYC form" sub="Business registration and settlement details.">
            <Field label="Registration number" required>
              <Input value={form.registrationNo} onChangeText={(v) => setForm((f) => ({ ...f, registrationNo: v }))} placeholder="PV-123456" />
            </Field>
            <Field label="Tax ID">
              <Input value={form.taxId} onChangeText={(v) => setForm((f) => ({ ...f, taxId: v }))} placeholder="TAX-…" />
            </Field>
            <Field label="Bank name">
              <Input value={form.bankName} onChangeText={(v) => setForm((f) => ({ ...f, bankName: v }))} placeholder="Bank of Ceylon" />
            </Field>
            <Field label="Account number">
              <Input value={form.bankAccountNo} onChangeText={(v) => setForm((f) => ({ ...f, bankAccountNo: v }))} keyboardType="number-pad" placeholder="1234567890" />
            </Field>
            <Field label="Branch">
              <Input value={form.bankBranch} onChangeText={(v) => setForm((f) => ({ ...f, bankBranch: v }))} placeholder="Colombo 03" />
            </Field>
            <Field label="Account holder">
              <Input value={form.bankAccountHolder} onChangeText={(v) => setForm((f) => ({ ...f, bankAccountHolder: v }))} placeholder="Company (Pvt) Ltd" />
            </Field>
            <Field label="Notes">
              <Input value={form.notes} onChangeText={(v) => setForm((f) => ({ ...f, notes: v }))} placeholder="Anything the reviewer should know…" multiline />
            </Field>
            <Button
              title={submit.isPending ? 'Submitting…' : 'Submit KYC'}
              full
              loading={submit.isPending}
              onPress={() => submit.mutate({ ...form })}
            />
          </Section>
          </>
          )}
        </>
      )}
    </Screen>
  );
}
