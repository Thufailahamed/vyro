import { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { AlertTriangle, CheckCircle2, Clock, XCircle } from 'lucide-react-native';
import { Button, Card, ConfettiBurst, Loader, Screen, ScreenHeader, Text } from '@/ui';
import { api } from '@/lib/api';
import { haptic } from '@/lib/haptics';
import { formatLKR } from '@/lib/format';
import { colors, fonts, radii } from '@/theme/tokens';
import { go } from '../orders/kit';
import type { Payment } from './types';

const POLL_INTERVAL_MS = 3000;
const TIMEOUT_MS = 90_000;

/**
 * PayHere return hop — the gateway redirects here before the server webhook
 * necessarily lands, so we poll the payment record until it settles.
 */
export function PaymentReturnScreen() {
  const params = useLocalSearchParams<{ id?: string; poId?: string; paymentId?: string; outcome?: string }>();
  const poId = params.id ?? params.poId;
  const outcome = params.outcome === 'cancel' ? 'cancel' : 'success';
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const timedOut = now - startedAt > TIMEOUT_MS;
  const shouldPoll = outcome === 'success' && !timedOut;

  const q = useQuery({
    queryKey: ['payments', poId],
    queryFn: () => api.get<{ payments: Payment[] }>(`/payments/by-po/${poId}`),
    enabled: !!poId,
    refetchInterval: shouldPoll ? POLL_INTERVAL_MS : false,
  });

  const payment = useMemo(() => {
    const list = q.data?.payments ?? [];
    if (params.paymentId) {
      const exact = list.find((p) => p.id === params.paymentId);
      if (exact) return exact;
    }
    return list.length > 0 ? list[list.length - 1] : null;
  }, [q.data, params.paymentId]);

  const settled = payment?.status === 'confirmed' || payment?.status === 'failed' || payment?.status === 'cancelled' || payment?.status === 'chargeback';

  const celebrated = useRef(false);
  useEffect(() => {
    if (payment?.status === 'confirmed' && !celebrated.current) {
      celebrated.current = true;
      haptic.success();
    }
  }, [payment?.status]);

  const orderLink = poId ? `/buyer/order/${poId}` : '/buyer/orders';

  const state = settled
    ? payment!.status === 'confirmed'
      ? { icon: CheckCircle2, color: colors.mint, soft: colors.mintSoft, title: 'Payment confirmed', sub: `The supplier has been notified. ${formatLKR(payment!.amountCents ?? 0)} recorded against your order.` }
      : { icon: XCircle, color: colors.rose, soft: colors.roseSoft, title: 'Payment not completed', sub: 'The gateway reported the payment as failed or cancelled. You can retry from the order page.' }
    : outcome === 'cancel'
      ? { icon: AlertTriangle, color: colors.amber, soft: colors.amberSoft, title: 'Payment cancelled', sub: 'You cancelled before completing the payment. Your order draft is unchanged.' }
      : timedOut
        ? { icon: AlertTriangle, color: colors.amber, soft: colors.amberSoft, title: 'Still processing', sub: 'The gateway has not confirmed yet. Check the order page in a moment — we reconcile automatically.' }
        : { icon: Clock, color: colors.copper, soft: colors.copperSoft, title: 'Confirming payment…', sub: 'We are waiting for the payment gateway to confirm. This usually takes a few seconds.' };

  const Icon = state.icon;
  return (
    <Screen
      footer={
        <>
          <Button title="View order" variant="primary" size="lg" full onPress={() => go(orderLink)} />
          {outcome === 'success' && !settled ? (
            <Button
              title="Refresh status"
              variant="secondary"
              full
              loading={q.isFetching}
              onPress={() => {
                setNow(Date.now());
                void q.refetch();
              }}
            />
          ) : null}
          {settled && payment?.status === 'confirmed' ? <Button title="Continue shopping" variant="secondary" full onPress={() => go('/buyer/catalog')} /> : null}
          {outcome === 'cancel' || payment?.status === 'failed' || payment?.status === 'cancelled' ? <Button title="Try again" variant="secondary" full onPress={() => go(orderLink)} /> : null}
        </>
      }
    >
      <ScreenHeader back kicker="Secure payment" title={state.title} />
      <Card kind="elevated" padding={28} radius={radii['3xl']} style={{ alignItems: 'center', gap: 14, marginTop: 8 }}>
        <View style={{ width: 104, height: 104, borderRadius: 52, backgroundColor: state.soft, alignItems: 'center', justifyContent: 'center' }}>
          {payment?.status === 'confirmed' ? <ConfettiBurst size={120} /> : null}
          <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center' }}>
            <Icon size={38} color={state.color} strokeWidth={1.7} />
          </View>
        </View>
        <Text variant="displaySm" align="center">
          {state.title}
        </Text>
        <Text variant="bodySm" color="ink3" align="center">
          {state.sub}
        </Text>
        {payment ? (
          <View style={{ paddingHorizontal: 14, height: 32, borderRadius: radii.pill, backgroundColor: colors.pearl, justifyContent: 'center' }}>
            <Text style={{ fontFamily: fonts.monoMedium, fontSize: 12.5, color: colors.ink3 }}>
              {payment.method ? `${payment.method} · ` : ''}
              {payment.status}
            </Text>
          </View>
        ) : q.isLoading ? (
          <Loader label="Checking status…" />
        ) : null}
      </Card>
    </Screen>
  );
}
