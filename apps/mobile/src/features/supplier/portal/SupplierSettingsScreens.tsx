import { useState } from 'react';
import { View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, FileText, Landmark, ListChecks, ShieldCheck, Upload, Warehouse } from 'lucide-react-native';
import { colors, radii } from '@/theme/tokens';
import { api, errorMessage } from '@/lib/api';
import { useSupplierId } from '@/lib/auth';
import {
  Banner,
  Button,
  EmptyState,
  ErrorState,
  Field,
  IconTile,
  InkHero,
  Input,
  KeyValue,
  Kicker,
  ListRow,
  Screen,
  Select,
  SkeletonList,
  StatusBadge,
  Stepper,
  Text,
  Timeline,
  useToast,
} from '@/ui';
import { appendFile, pickDocument } from '@/lib/files';
import { humanize } from '@/lib/format';
import { Section } from '@/features/supplier/ops/kit';

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
      footer={<Button title={save.isPending ? 'Saving…' : 'Save settings'} full loading={save.isPending} disabled={!form} onPress={() => save.mutate()} />}
    >
      <Section icon={Warehouse} kicker="Step 1" title="Depot" sub="Where buyers' orders are picked and packed.">
        <Field label="Warehouse address">
          <Input value={s.warehouseAddress ?? ''} onChangeText={(v) => set({ warehouseAddress: v })} placeholder="No. 12, Depot Road" />
        </Field>
        <Field label="City">
          <Input value={s.warehouseCity ?? ''} onChangeText={(v) => set({ warehouseCity: v })} placeholder="Colombo" />
        </Field>
        <Field label="District">
          <Input value={s.warehouseDistrict ?? ''} onChangeText={(v) => set({ warehouseDistrict: v })} placeholder="Colombo" />
        </Field>
        <Field label="Default lead time (days)">
          <Stepper value={s.defaultLeadTimeDays ?? 1} onChange={(v) => set({ defaultLeadTimeDays: v })} min={0} max={30} />
        </Field>
      </Section>
      <Section icon={Landmark} kicker="Step 2" title="Settlement" sub="How escrow releases reach you.">
        <Field label="Payout method">
          <Select value={s.payoutMethod ?? null} options={[{ value: 'bank', label: 'Bank transfer' }, { value: 'cash', label: 'Cash' }]} onChange={(v) => set({ payoutMethod: v })} placeholder="Select method…" />
        </Field>
        <Field label="Bank name">
          <Input value={s.bankName ?? ''} onChangeText={(v) => set({ bankName: v })} placeholder="Bank of Ceylon" />
        </Field>
        <Field label="Account number">
          <Input value={s.bankAccountNo ?? ''} onChangeText={(v) => set({ bankAccountNo: v })} placeholder="1234567890" keyboardType="number-pad" />
        </Field>
        <Field label="Branch">
          <Input value={s.bankBranch ?? ''} onChangeText={(v) => set({ bankBranch: v })} placeholder="Colombo 03" />
        </Field>
        <Field label="Account holder">
          <Input value={s.bankAccountHolder ?? ''} onChangeText={(v) => set({ bankAccountHolder: v })} placeholder="Company (Pvt) Ltd" />
        </Field>
      </Section>
    </Screen>
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
          <InkHero seed={`kyc-${status ?? 'none'}`}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <IconTile icon={ShieldCheck} tone={status === 'approved' ? 'volt' : 'glass'} size={44} />
              <StatusBadge status={status ?? 'not_submitted'} />
            </View>
            <View style={{ marginTop: 18, gap: 4 }}>
              <Kicker color="volt">Facility KYC</Kicker>
              <Text variant="displaySm" color="paper">
                {status ? humanize(status) : 'Not submitted'}
              </Text>
              <Text variant="caption" color="paperMuted">
                Verified facilities earn the trust seal on their storefront.
              </Text>
            </View>
          </InkHero>
          {notes ? <Banner tone="warning" title="Reviewer notes" message={notes} /> : null}
          <Section icon={ListChecks} kicker="Progress" title="Review steps">
            <Timeline steps={steps} />
            <View style={{ marginTop: -4 }}>
              <KeyValue label="Status" value={status ? humanize(status) : 'Not submitted'} last />
            </View>
          </Section>
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
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', padding: 12, borderRadius: radii.lg, borderCurve: 'continuous', backgroundColor: colors.pearl }}>
              <ShieldCheck size={16} color={colors.copperDeep} />
              <Text variant="caption" color="ink4" style={{ flex: 1 }}>
                Most reviews complete within 24–48 hours.
              </Text>
            </View>
            <Button
              title={submit.isPending ? 'Submitting…' : 'Submit KYC'}
              full
              loading={submit.isPending}
              onPress={() => submit.mutate({ ...form })}
            />
          </Section>
        </>
      )}
    </Screen>
  );
}
