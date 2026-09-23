import { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Mail, MapPin, Phone, ShieldCheck } from 'lucide-react-native';
import { api, errorMessage } from '@/lib/api';
import { formatDate, humanize } from '@/lib/format';
import {
  Banner,
  Button,
  ConfirmSheet,
  KeyValue,
  QueryView,
  Screen,
  StatusBadge,
  Text,
  useToast,
} from '@/ui';
import { useAdminGet } from '@/features/admin/common/api';
import { Can } from '@/features/admin/platform/kit';
import { ContactLine, Section } from '@/features/admin/ops/kit';

interface SupplierDetail {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  contactPerson?: string | null;
  city?: string | null;
  district?: string | null;
  address?: string | null;
  status?: string | null;
  verificationStatus?: string | null;
  createdAt?: number | null;
}

/** Mirrors web SupplierDetailPage (GET /admin/suppliers/:id). */
export function SupplierDetailScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const q = useAdminGet<{ supplier: SupplierDetail }>(['admin-supplier', id], `/admin/suppliers/${encodeURIComponent(id)}`, !!id);
  const toast = useToast();
  const [freezeOpen, setFreezeOpen] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const s = q.data?.supplier;
  const frozen = s?.status === 'suspended' || s?.status === 'frozen';

  const run = async (path: string, body: Record<string, unknown>, okMsg: string) => {
    setBusy(true);
    try {
      await api.post(path, body);
      toast.success('Done', okMsg);
      void q.refetch();
    } catch (e) {
      toast.error('Action failed', errorMessage(e));
    } finally {
      setBusy(false);
      setFreezeOpen(false);
      setVerifyOpen(false);
    }
  };

  return (
    <Screen
      back
      kicker="Registry · Supplier"
      title={s?.name ?? 'Supplier'}
      subtitle={s ? [s.city, s.district].filter(Boolean).join(', ') : undefined}
      onRefresh={() => q.refetch()}
      footer={
        s ? (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Can perm="supplier:verify">
              {s.verificationStatus === 'pending' ? (
                <Button title="Verify" icon={ShieldCheck} onPress={() => setVerifyOpen(true)} style={{ flex: 1 }} />
              ) : null}
            </Can>
            <Can perm={['supplier:freeze', 'supplier:unfreeze']}>
              <Button
                title={frozen ? 'Unfreeze' : 'Freeze'}
                variant={frozen ? 'secondary' : 'danger'}
                onPress={() => (frozen ? run(`/admin/suppliers/${id}/unfreeze`, {}, 'Supplier unfrozen.') : setFreezeOpen(true))}
                loading={busy}
                style={{ flex: 1 }}
              />
            </Can>
          </View>
        ) : undefined
      }
    >
      <QueryView query={q} empty={() => !q.data?.supplier} emptyTitle="Supplier not found" emptyMessage="This merchant doesn't exist or you can't view it.">
        {(d) => {
          const v = d.supplier;
          return (
            <>
              <Section kicker="Merchant" title={v.name}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  {v.status ? <StatusBadge status={v.status} size="sm" /> : null}
                  {v.verificationStatus ? <StatusBadge status={v.verificationStatus} size="sm" /> : null}
                </View>
                <View>
                  {v.contactPerson ? (
                    <Text variant="bodySm" color="ink3">
                      Contact · {v.contactPerson}
                    </Text>
                  ) : null}
                  <ContactLine icon={Phone} value={v.phone} href={v.phone ? `tel:${v.phone}` : undefined} />
                  <ContactLine icon={Mail} value={v.email} href={v.email ? `mailto:${v.email}` : undefined} />
                  <ContactLine icon={MapPin} value={[v.address, v.city, v.district].filter(Boolean).join(', ')} />
                </View>
              </Section>
              <Section kicker="Record" title="Details">
                <View>
                  <KeyValue label="ID" value={v.id} mono />
                  <KeyValue label="Status" value={humanize(v.status)} />
                  <KeyValue label="Verification" value={humanize(v.verificationStatus)} />
                  <KeyValue label="Joined" value={v.createdAt ? formatDate(v.createdAt) : '—'} last />
                </View>
              </Section>
              <ConfirmSheet
                visible={freezeOpen}
                onClose={() => setFreezeOpen(false)}
                onConfirm={() => run(`/admin/suppliers/${id}/freeze`, { reason: 'admin' }, 'Supplier frozen.')}
                loading={busy}
                title={`Freeze ${v.name}?`}
                message="The merchant can't receive new orders until unfrozen. Written to the audit trail."
                confirmLabel="Freeze supplier"
                variant="danger"
              />
              <ConfirmSheet
                visible={verifyOpen}
                onClose={() => setVerifyOpen(false)}
                onConfirm={() => run(`/admin/suppliers/${id}/verification`, { status: 'verified' }, 'Supplier verified.')}
                loading={busy}
                title={`Verify ${v.name}?`}
                message="Marks KYC and certificates as reviewed and approved."
                confirmLabel="Verify supplier"
              />
            </>
          );
        }}
      </QueryView>
      {q.isError ? <Banner tone="danger" message={errorMessage(q.error)} /> : null}
    </Screen>
  );
}
