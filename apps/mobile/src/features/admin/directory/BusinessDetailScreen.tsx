import { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { FileText, Mail, MapPin, Phone, UserRound } from 'lucide-react-native';
import { api, errorMessage } from '@/lib/api';
import { formatDate, humanize } from '@/lib/format';
import { Avatar, Button, ConfirmSheet, InkHero, KeyValue, QueryView, Screen, StatusBadge, Text, useToast } from '@/ui';
import { useAdminGet } from '@/features/admin/common/api';
import { Can } from '@/features/admin/platform/kit';
import { ContactLine, Section } from '@/features/admin/ops/kit';

interface BusinessDetail {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  contactPerson?: string | null;
  city?: string | null;
  district?: string | null;
  address?: string | null;
  status?: string | null;
  createdAt?: number | null;
}

/** Mirrors web BusinessDetailPage (GET /admin/businesses/:id). */
export function BusinessDetailScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const q = useAdminGet<{ business: BusinessDetail }>(['admin-business', id], `/admin/businesses/${encodeURIComponent(id)}`, !!id);
  const toast = useToast();
  const [freezeOpen, setFreezeOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const b = q.data?.business;
  const frozen = b?.status === 'suspended' || b?.status === 'frozen';

  const run = async (path: string, okMsg: string) => {
    setBusy(true);
    try {
      await api.post(path, frozen ? {} : { reason: 'policy' });
      toast.success('Done', okMsg);
      void q.refetch();
    } catch (e) {
      toast.error('Action failed', errorMessage(e));
    } finally {
      setBusy(false);
      setFreezeOpen(false);
    }
  };

  return (
    <Screen
      back
      kicker="Registry · Business"
      title={b?.name ?? 'Business'}
      subtitle={b ? [b.city, b.district].filter(Boolean).join(', ') : undefined}
      onRefresh={() => q.refetch()}
      footer={
        b ? (
          <Can perm={['business:freeze', 'business:unfreeze']}>
            <Button
              title={frozen ? 'Unfreeze account' : 'Freeze account'}
              variant={frozen ? 'secondary' : 'danger'}
              full
              loading={busy}
              onPress={() => (frozen ? run(`/admin/businesses/${id}/unfreeze`, 'Business unfrozen.') : setFreezeOpen(true))}
            />
          </Can>
        ) : undefined
      }
    >
      <QueryView query={q} empty={() => !q.data?.business} emptyTitle="Business not found" emptyMessage="This buyer doesn't exist or you can't view it.">
        {(d) => {
          const v = d.business;
          return (
            <>
              <InkHero seed={`business-${v.id}`}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                  <Avatar name={v.name} size={56} tone="copper" />
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text variant="overline" color="volt">
                      Buyer business
                    </Text>
                    <Text variant="h1" color="paper" numberOfLines={2}>
                      {v.name}
                    </Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
                  {v.status ? <StatusBadge status={v.status} size="sm" /> : null}
                  {v.createdAt ? (
                    <Text variant="caption" color="paperFaint">
                      Joined {formatDate(v.createdAt)}
                    </Text>
                  ) : null}
                </View>
              </InkHero>
              <Section kicker="Contact" title={v.contactPerson ?? 'Reach the buyer'} icon={UserRound}>
                <View style={{ gap: 4 }}>
                  <ContactLine icon={Phone} value={v.phone} href={v.phone ? `tel:${v.phone}` : undefined} />
                  <ContactLine icon={Mail} value={v.email} href={v.email ? `mailto:${v.email}` : undefined} />
                  <ContactLine icon={MapPin} value={[v.address, v.city, v.district].filter(Boolean).join(', ')} />
                </View>
              </Section>
              <Section kicker="Record" title="Details" icon={FileText}>
                <View>
                  <KeyValue label="ID" value={v.id} mono />
                  <KeyValue label="Status" value={humanize(v.status)} />
                  <KeyValue label="Joined" value={v.createdAt ? formatDate(v.createdAt) : '—'} last />
                </View>
              </Section>
              <ConfirmSheet
                visible={freezeOpen}
                onClose={() => setFreezeOpen(false)}
                onConfirm={() => run(`/admin/businesses/${id}/freeze`, 'Business frozen.')}
                loading={busy}
                title={`Freeze ${v.name}?`}
                message="The buyer can't place new orders until unfrozen. Written to the audit trail."
                confirmLabel="Freeze business"
                variant="danger"
              />
            </>
          );
        }}
      </QueryView>
    </Screen>
  );
}

