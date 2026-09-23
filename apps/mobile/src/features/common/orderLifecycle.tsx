import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { Camera, RotateCcw } from 'lucide-react-native';
import { assetUrl } from '@/lib/api';
import { cookieHeader } from '@/lib/cookieJar';
import { formatDate, formatDateTime, formatLKR, humanize } from '@/lib/format';
import { useOnChange } from '@/lib/useOnChange';
import {
  PAYMENT_STATE_LABEL,
  REASON_MIN,
  RETURN_REASON_LABEL,
  RETURN_STATUS_LABEL,
  type OrderReturn,
  type PaymentSummary,
} from '@/lib/orderLifecycle';
import { colors, fonts, radii } from '@/theme/tokens';
import { Badge, Button, Field, IconTile, Input, KeyValue, Sheet, StatusBadge, Text, type ButtonVariant } from '@/ui';

/** Derived payment position of an order as a status badge. */
export function PaymentBadge({ summary, size = 'sm' }: { summary: PaymentSummary | null | undefined; size?: 'sm' | 'md' }) {
  if (!summary) return null;
  return <StatusBadge status={summary.state} label={PAYMENT_STATE_LABEL[summary.state] ?? humanize(summary.state)} size={size} />;
}

/** Paid / refunded / due breakdown from `paymentSummary`. */
export function PaymentSummaryRows({ summary }: { summary: PaymentSummary }) {
  const rows: [string, string][] = [
    ['Method', summary.method === 'none' ? '—' : humanize(summary.method)],
    ['Order total', formatLKR(summary.totalCents)],
    ['Paid', formatLKR(summary.paidCents)],
  ];
  if (summary.refundedCents) rows.push(['Refunded', formatLKR(summary.refundedCents)]);
  if (summary.pendingRefundCents) rows.push(['Refund pending', formatLKR(summary.pendingRefundCents)]);
  rows.push(['Due', formatLKR(summary.dueCents)]);
  return (
    <View>
      {rows.map(([label, value], i) => (
        <KeyValue key={label} label={label} value={value} mono last={i === rows.length - 1} emphasize={label === 'Due' && summary.dueCents > 0} />
      ))}
    </View>
  );
}

/**
 * Session-protected proof-of-delivery photo. Native forwards the cookie jar
 * as a header (expo-image doesn't share it); on web the same-origin cookie is
 * sent automatically. Falls back to a text line if the image can't load.
 */
export function PodPhoto({ poId, height = 180 }: { poId: string; height?: number }) {
  const [failed, setFailed] = useState(false);
  const src = assetUrl(`/api/deliveries/${poId}/pod`);
  const cookie = cookieHeader();
  if (failed || !src) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <IconTile icon={Camera} tone="paper" size={32} />
        <Text variant="bodySm" color="ink3">
          Proof of delivery photo on file
        </Text>
      </View>
    );
  }
  return (
    <Image
      source={{ uri: src, headers: cookie ? { cookie } : undefined }}
      style={{ width: '100%', height, borderRadius: radii.lg, backgroundColor: colors.pearl }}
      contentFit="cover"
      transition={200}
      onError={() => setFailed(true)}
      accessibilityLabel="Proof of delivery photo"
    />
  );
}

/** One return (RMA) with its lines; `actions` renders role-specific buttons. */
export function ReturnCard({ ret, actions, showPo }: { ret: OrderReturn; actions?: ReactNode; showPo?: boolean }) {
  return (
    <View style={{ gap: 10, padding: 14, borderRadius: radii.xl, borderCurve: 'continuous', backgroundColor: colors.pearl }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <IconTile icon={RotateCcw} tone="ink" size={34} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontFamily: fonts.monoMedium, fontSize: 13, color: colors.ink }}>{ret.rmaNumber}</Text>
          <Text variant="caption" color="ink4" numberOfLines={1}>
            {showPo && ret.poNumber ? `${ret.poNumber} · ` : ''}
            {RETURN_REASON_LABEL[ret.reasonCode] ?? humanize(ret.reasonCode)} · {formatDate(ret.requestedAt ?? ret.createdAt)}
          </Text>
        </View>
        <StatusBadge status={ret.status} label={RETURN_STATUS_LABEL[ret.status] ?? humanize(ret.status)} size="sm" />
      </View>
      {ret.items.map((it) => (
        <View key={it.id} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
          <Text variant="bodySm" numberOfLines={2} style={{ flex: 1 }}>
            {it.productName ?? 'Item'}
          </Text>
          <Text style={{ fontFamily: fonts.mono, fontSize: 12, color: colors.ink3 }}>
            ×{it.quantity}
            {it.approvedQuantity != null && it.approvedQuantity !== it.quantity ? ` → ${it.approvedQuantity} approved` : ''}
            {it.receivedQuantity != null ? ` · ${it.receivedQuantity} received` : ''}
          </Text>
        </View>
      ))}
      {ret.reasonNote ? (
        <Text variant="caption" color="ink3">
          “{ret.reasonNote}”
        </Text>
      ) : null}
      {ret.rejectionReason ? <Badge label={`Rejected: ${ret.rejectionReason}`} tone="danger" size="sm" /> : null}
      {ret.supplierNote ? (
        <Text variant="caption" color="ink4">
          Supplier: {ret.supplierNote}
        </Text>
      ) : null}
      {ret.refundCents ? (
        <Text variant="caption" color="ink3">
          Refund {formatLKR(ret.refundCents)}
          {ret.refundedAt ? ` · ${formatDateTime(ret.refundedAt)}` : ''}
          {ret.creditNoteInvoiceId ? ' · credit note issued' : ''}
        </Text>
      ) : null}
      {ret.attachments.length ? (
        <Text variant="caption" color="ink4">
          {ret.attachments.length} photo{ret.attachments.length === 1 ? '' : 's'} attached
        </Text>
      ) : null}
      {actions ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: colors.lineSoft }}>
          {actions}
        </View>
      ) : null}
    </View>
  );
}

/**
 * Confirmation sheet whose action needs a written reason (≥ 3 chars) — the API
 * rejects cancel / reject / dispute moves without one (422 REASON_REQUIRED).
 */
export function ReasonSheet({
  visible,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel,
  variant = 'danger',
  loading,
  placeholder,
  hint,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  title: string;
  message?: string;
  confirmLabel: string;
  variant?: ButtonVariant;
  loading?: boolean;
  placeholder?: string;
  hint?: string;
  children?: ReactNode;
}) {
  const [reason, setReason] = useState('');
  useOnChange(visible, (open) => {
    if (open) setReason('');
  });
  const ok = reason.trim().length >= REASON_MIN;
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={title}
      subtitle={message}
      scroll
      footer={
        <>
          <Button title={confirmLabel} variant={variant} size="lg" full disabled={!ok} loading={loading} onPress={() => onConfirm(reason.trim())} />
          <Button title="Cancel" variant="ghost" full onPress={onClose} />
        </>
      }
    >
      <View style={{ gap: 14 }}>
        {children}
        <Field label="Reason" required hint={hint ?? `Shared on the order timeline · at least ${REASON_MIN} characters`}>
          <Input value={reason} onChangeText={setReason} placeholder={placeholder} maxLength={500} multiline />
        </Field>
      </View>
    </Sheet>
  );
}
