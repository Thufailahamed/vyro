import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { FileText, Printer, Share2 } from 'lucide-react-native';
import { Button, EmptyState, ErrorState, IconTile, InkHero, KeyValue, Screen, SkeletonList, Text, useToast } from '@/ui';
import { api, errorMessage } from '@/lib/api';
import { formatDateTime, formatLKR } from '@/lib/format';
import { colors, fonts, radii } from '@/theme/tokens';
import { MonoTag, Section, go } from './kit';
import { invoiceTypeLabel } from './orderStatus';
import { shareApiFile } from './share';
import type { InvoiceItem } from './types';

interface InvoiceDetail {
  invoice: {
    id: string;
    number: string;
    type: 'receipt' | 'tax_invoice' | 'credit_note';
    purchaseOrderId: string;
    businessId?: string;
    supplierId?: string;
    subtotalCents: number;
    taxCents: number;
    totalCents: number;
    currency: string;
    issuedAt: number;
    dueAt: number | null;
    notes?: string | null;
  };
  items: InvoiceItem[];
}

/**
 * Buyer invoice — the web renders the server's HTML snapshot in an iframe.
 * Native renders the same data and offers the printable HTML via share sheet.
 */
export function InvoiceScreen() {
  const { id: poId, invoiceId } = useLocalSearchParams<{ id: string; invoiceId: string }>();
  const toast = useToast();
  const [sharing, setSharing] = useState(false);

  const q = useQuery({
    queryKey: ['invoice', invoiceId],
    queryFn: () => api.get<InvoiceDetail>(`/invoices/${invoiceId}`),
    enabled: !!invoiceId,
  });

  async function share() {
    const number = q.data?.invoice.number ?? invoiceId;
    setSharing(true);
    try {
      await shareApiFile(`/invoices/${encodeURIComponent(number!)}/html`, `${number}.html`, 'text/html');
    } catch (e) {
      toast.error('Could not open invoice', errorMessage(e));
    } finally {
      setSharing(false);
    }
  }

  if (q.isLoading) {
    return (
      <Screen scroll={false}>
        <SkeletonList rows={5} height={96} />
      </Screen>
    );
  }

  if (q.isError || !q.data) {
    return (
      <Screen>
        <View style={{ paddingTop: 60 }}>
          {q.isError ? (
            <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
          ) : (
            <EmptyState
              icon={FileText}
              title="Invoice not found"
              message="It may have been removed, or you may not have access."
              action={{ label: 'Back to order', onPress: () => go(`/buyer/order/${poId}`, true) }}
            />
          )}
        </View>
      </Screen>
    );
  }

  const { invoice, items } = q.data;

  return (
    <Screen
      back
      kicker={invoiceTypeLabel(invoice.type)}
      title={invoice.number}
      subtitle={`Issued ${formatDateTime(invoice.issuedAt)}${invoice.dueAt ? ` · due ${formatDateTime(invoice.dueAt)}` : ''}`}
      onRefresh={() => q.refetch()}
      footer={<Button title="Share / print invoice" icon={Share2} size="lg" full loading={sharing} onPress={share} />}
    >
      <InkHero seed={`invoice-${invoice.id}`} style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <IconTile icon={FileText} tone="glass" size={48} />
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <MonoTag label={invoiceTypeLabel(invoice.type)} tone="paper" />
            <MonoTag label={`PO ref`} tone="volt" />
          </View>
        </View>
        <Text variant="overline" color="volt">
          Total {invoice.currency === 'LKR' ? '(LKR)' : invoice.currency}
        </Text>
        <Text variant="metric" color="paper" numberOfLines={1} adjustsFontSizeToFit>
          {formatLKR(invoice.totalCents)}
        </Text>
        <Text variant="caption" color="paperMuted">
          {items.length} line{items.length === 1 ? '' : 's'} · tax {formatLKR(invoice.taxCents)}
        </Text>
      </InkHero>

      <Section kicker="Lines" title={`Items (${items.length})`} icon={FileText}>
        {items.length === 0 ? (
          <Text variant="bodySm" color="ink4">
            Line detail is inside the printable invoice — share it above.
          </Text>
        ) : (
          <View>
            {items.map((it, i) => (
              <View
                key={it.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  paddingVertical: 12,
                  borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth * 2,
                  borderTopColor: colors.lineSoft,
                }}
              >
                <View style={{ width: 36, height: 36, borderRadius: 12, borderCurve: 'continuous', backgroundColor: colors.bone, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontFamily: fonts.monoMedium, fontSize: 12, color: colors.ink3 }}>{String(i + 1).padStart(2, '0')}</Text>
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="bodySm" weight="semibold" numberOfLines={2}>
                    {it.description}
                  </Text>
                  <Text style={{ fontFamily: fonts.mono, fontSize: 11, color: colors.ink5 }}>
                    {it.quantity} × {formatLKR(it.unitCents)}
                  </Text>
                </View>
                <Text style={{ fontFamily: fonts.monoMedium, fontSize: 13, color: colors.ink }}>{formatLKR(it.lineTotalCents)}</Text>
              </View>
            ))}
          </View>
        )}
      </Section>

      <Section kicker="Totals" title="Summary" icon={Printer}>
        <View>
          <KeyValue label="Subtotal" value={formatLKR(invoice.subtotalCents)} mono />
          <KeyValue label="Tax" value={formatLKR(invoice.taxCents)} mono />
          <KeyValue label="Total" value={formatLKR(invoice.totalCents)} mono last emphasize />
        </View>
        {invoice.notes ? (
          <View style={{ padding: 12, borderRadius: radii.lg, borderCurve: 'continuous', backgroundColor: colors.pearl }}>
            <Text variant="bodySm" color="ink4">
              {invoice.notes}
            </Text>
          </View>
        ) : null}
      </Section>

      <Button title="Back to order" variant="ghost" onPress={() => go(`/buyer/order/${poId ?? invoice.purchaseOrderId}`, true)} />
    </Screen>
  );
}
