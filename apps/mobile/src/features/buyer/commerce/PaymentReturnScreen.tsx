import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { AlertTriangle, CheckCircle2, Clock, XCircle } from 'lucide-react-native';
import { Button, Card, Gutter, Loader, Screen, ScreenHeader, Text } from '@/ui';
import { api } from '@/lib/api';
import { formatLKR } from '@/lib/format';
import { colors, fonts } from '@/theme/tokens';
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

  const orderLink = poId ? `/buyer/order/${poId}` : '/buyer/orders';

  const state = settled
    ? payment!.status === 'confirmed'
      ? { icon: CheckCircle2, color: colors.mint, title: 'Payment confirmed', sub: `The supplier has been notified. ${formatLKR(payment!.amountCents ?? 0)} recorded against your order.` }
      : { icon: XCircle, color: colors.rose, title: 'Payment not completed', sub: 'The gateway reported the payment as failed or cancelled. You can retry from the order page.' }
    : outcome === 'cancel'
      ? { icon: AlertTriangle, color: colors.amber, title: 'Payment cancelled', sub: 'You cancelled before completing the payment. Your order draft is unchanged.' }
      : timedOut
        ? { icon: AlertTriangle, color: colors.amber, title: 'Still processing', sub: 'The gateway has not confirmed yet. Check the order page in a moment — we reconcile automatically.' }
        : { icon: Clock, color: colors.copper, title: 'Confirming payment…', sub: 'We are waiting for the payment gateway to confirm. This usually takes a few seconds.' };

  const Icon = state.icon;
  return (
    <Screen>
      <ScreenHeader back kicker="Secure payment" title={state.title} />
      <Gutter style={{ gap: 16 }}>
        <Card padding={28} style={{ alignItems: 'center', gap: 12 }}>
          <Icon size={44} color={state.color} strokeWidth={1.6} />
          <Text variant="h2" align="center">
            {state.title}
          </Text>
          <Text variant="bodySm" color="ink3" align="center">
            {state.sub}
          </Text>
          {payment ? (
            <Text style={{ fontFamily: fonts.monoMedium, fontSize: 14, color: colors.ink4 }}>
              {payment.method ? `${payment.method} · ` : ''}
              {payment.status}
            </Text>
          ) : q.isLoading ? (
            <Loader label="Checking status…" />
          ) : null}
        </Card>

        <View style={{ gap: 10 }}>
          <Button title="View order" variant="primary" full onPress={() => go(orderLink)} />
          {outcome === 'success' && !settled ? <Button title="Refresh status" variant="secondary" full loading={q.isFetching} onPress={() => { setNow(Date.now()); void q.refetch(); }} /> : null}
          {settled && payment?.status === 'confirmed' ? <Button title="Continue shopping" variant="secondary" full onPress={() => go('/buyer/catalog')} /> : null}
          {outcome === 'cancel' || payment?.status === 'failed' || payment?.status === 'cancelled' ? <Button title="Try again" variant="secondary" full onPress={() => go(orderLink)} /> : null}
        </View>
      </Gutter>
    </Screen>
  );
}
