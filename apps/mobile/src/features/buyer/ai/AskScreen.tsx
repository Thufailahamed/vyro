import { useMemo, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, StyleSheet, TextInput, View } from 'react-native';
import { ArrowRight, CheckCircle2, Eraser, RefreshCw, Send, Sparkles, Store, Wrench } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Badge, Button, Card, Chip, IconButton, IconTile, InkHero, Kicker, ScreenHeader, Text, Touchable, useToast } from '@/ui';
import { api, errorMessage } from '@/lib/api';
import { useBusinessId } from '@/lib/auth';
import { formatLKR } from '@/lib/format';
import { colors, fonts, radii, shadow } from '@/theme/tokens';
import { Bubble } from '../orders/kit';
import { go, productHref } from '../commerce/data';
import { useVyroAI, type ChatTurn, type ComponentEnvelope } from './useVyroAI';

const SUGGESTIONS = [
  'Find the cheapest rice supplier',
  'Compare quotes for white sugar',
  'Where can I save this month?',
  'Suggest my usual reorder',
  'Summarize my spend',
];

/** Map web hrefs emitted by the AI to mobile routes. */
function mobileHref(href: string): string {
  if (href.startsWith('/products/')) return href.replace('/products/', '/buyer/product/');
  if (href.startsWith('/suppliers/')) return href.replace('/suppliers/', '/buyer/store/');
  if (href.startsWith('/orders/')) return href.replace('/orders/', '/buyer/order/');
  if (href.startsWith('/search')) return href.replace('/search', '/buyer/catalog');
  if (href === '/cart') return '/buyer/cart';
  if (href === '/orders') return '/buyer/orders';
  if (href === '/rfqs' || href.startsWith('/rfqs/')) return `/buyer${href}`;
  if (href === '/invoices') return '/buyer/invoices';
  if (href === '/dashboard' || href === '/analytics' || href === '/ai') return '/buyer/ai';
  return href;
}

/** Ask VYRO — conversational procurement intelligence with SSE streaming. */
export function AskScreen() {
  const businessId = useBusinessId();
  const { state, send, clear, regenerate } = useVyroAI();
  const [input, setInput] = useState('');
  const listRef = useRef<FlatList<ChatTurn>>(null);
  const insets = useSafeAreaInsets();
  const toast = useToast();

  const turns = state.turns;
  const submit = (text?: string) => {
    const t = (text ?? input).trim();
    if (!t || state.loading) return;
    setInput('');
    void send(t, { businessId });
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 120);
  };

  const header = (
    <ScreenHeader
      kicker="VYRO AI"
      title="Ask anything."
      subtitle="Procurement intelligence grounded in your orders and live mill offers."
      back
      right={
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <IconButton icon={RefreshCw} variant="surface" accessibilityLabel="Regenerate last answer" onPress={() => void regenerate()} />
          <IconButton icon={Eraser} variant="surface" accessibilityLabel="Clear conversation" onPress={clear} />
        </View>
      }
    />
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bone, paddingTop: insets.top }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
        <FlatList
          ref={listRef}
          data={turns}
          keyExtractor={(t) => String(t.id)}
          ListHeaderComponent={header}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 16, gap: 12 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={
            <View style={{ gap: 14 }}>
              <InkHero seed="ask-vyro" style={{ gap: 14 }}>
                <IconTile icon={Sparkles} tone="volt" size={48} />
                <View style={{ gap: 4 }}>
                  <Kicker color="volt">Try one of these</Kicker>
                  <Text variant="h1" color="paper">
                    What should we source today?
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {SUGGESTIONS.map((s) => (
                    <Chip key={s} label={s} dark onPress={() => submit(s)} />
                  ))}
                </View>
              </InkHero>
            </View>
          }
          renderItem={({ item: t }) => <Turn turn={t} loading={state.loading} status={state.status} onPick={submit} toast={toast} />}
          ListFooterComponent={
            state.loading && state.status ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 12, height: 30, borderRadius: radii.pill, backgroundColor: colors.paper, ...shadow.sm }}>
                <Sparkles size={13} color={colors.copper} />
                <Text variant="caption" color="ink3">
                  {state.status}…
                </Text>
              </View>
            ) : null
          }
        />
        {/* Composer */}
        <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: Math.max(insets.bottom, 12), backgroundColor: colors.bone }}>
          <View
            style={[
              {
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                paddingLeft: 18,
                paddingRight: 5,
                minHeight: 56,
                borderRadius: radii.pill,
                borderCurve: 'continuous',
                backgroundColor: colors.paper,
              },
              shadow.md,
            ]}
          >
            <Sparkles size={16} color={colors.copper} />
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder="Ask about prices, suppliers, spend…"
              placeholderTextColor={colors.ink5}
              selectionColor={colors.copper}
              onSubmitEditing={() => submit()}
              returnKeyType="send"
              style={{ flex: 1, fontFamily: fonts.sans, fontSize: 15.5, color: colors.ink, paddingVertical: 12 }}
            />
            <IconButton
              icon={Send}
              variant="volt"
              size={46}
              accessibilityLabel="Send"
              onPress={() => submit()}
              style={{ opacity: state.loading || !input.trim() ? 0.4 : 1 }}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function Turn({
  turn,
  loading,
  status,
  onPick,
  toast,
}: {
  turn: ChatTurn;
  loading: boolean;
  status?: string;
  onPick: (text: string) => void;
  toast: ReturnType<typeof useToast>;
}) {
  if (turn.role === 'user') {
    return (
      <Bubble mine>
        <Text variant="body" color="paper">
          {turn.text}
        </Text>
      </Bubble>
    );
  }

  const working = loading && !turn.text && !turn.error;

  return (
    <View style={{ gap: 8 }}>
      {/* tool timeline */}
      {turn.tools.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {turn.tools.map((t, i) => (
            <Badge
              key={`${t.name}-${i}`}
              size="sm"
              icon={Wrench}
              label={`${t.label}${t.durationMs != null ? ` · ${(t.durationMs / 1000).toFixed(1)}s` : ''}`}
              tone={t.ok === false ? 'danger' : t.durationMs != null ? 'success' : 'neutral'}
            />
          ))}
        </View>
      ) : null}

      {turn.components.map((c, i) => (
        <ComponentCard key={i} c={c} onPick={onPick} toast={toast} />
      ))}

      {turn.text ? (
        <Bubble mine={false}>
          <Text variant="body">{turn.text}</Text>
        </Bubble>
      ) : working ? (
        <Bubble mine={false}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Sparkles size={14} color={colors.copper} />
            <Text variant="bodySm" color="ink4">
              {status ? `${status}…` : 'Thinking…'}
            </Text>
          </View>
        </Bubble>
      ) : null}

      {turn.error ? (
        <Card kind="flat" style={{ backgroundColor: colors.roseSoft, gap: 4 }}>
          <Text variant="bodySm" weight="semibold" style={{ color: colors.rose }}>
            {turn.error.code}
          </Text>
          <Text variant="bodySm" color="ink3">
            {turn.error.message}
          </Text>
        </Card>
      ) : null}

      {turn.actions.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {turn.actions.map((a, i) => (
            <Chip key={i} label={a.label} icon={ArrowRight} onPress={() => go(mobileHref(a.href))} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

/* ------------------------- component card renderers ------------------------ */

function ComponentCard({ c, onPick, toast }: { c: ComponentEnvelope; onPick: (t: string) => void; toast: ReturnType<typeof useToast> }) {
  const d = c.data as Record<string, any>;
  switch (c.type) {
    case 'recommendation_card':
      return <RecommendationCard d={d} />;
    case 'supplier_list_card':
      return <SupplierListCard d={d} />;
    case 'spend_summary_card':
      return <SpendCard d={d} />;
    case 'savings_card':
      return <SavingsCard d={d} />;
    case 'procurement_plan_card':
      return <PlanCard d={d} />;
    case 'clarification_card':
      return <ClarificationCard d={d} onPick={onPick} />;
    case 'confirmation_card':
      return <ConfirmCard d={d} toast={toast} />;
    case 'why_card':
      return <WhyCard d={d} />;
    case 'simulation_card':
      return <SimulationCard d={d} />;
    default:
      return <GenericCard c={c} />;
  }
}

function CardTitle({ kicker, title }: { kicker?: string; title: string }) {
  return (
    <View style={{ gap: 2 }}>
      {kicker ? <Kicker>{kicker}</Kicker> : null}
      <Text variant="h3">{title}</Text>
    </View>
  );
}

function RecommendationCard({ d }: { d: Record<string, any> }) {
  if (!d.supplierName && (d.message || d.disclaimer || d.title)) {
    return (
      <Card style={{ gap: 6 }}>
        {d.title ? <Text variant="h3">{String(d.title)}</Text> : null}
        <Text variant="bodySm" color="ink3">
          {String(d.message ?? d.disclaimer ?? 'Nothing to show yet.')}
        </Text>
      </Card>
    );
  }
  const reasons: string[] = [];
  if (d.offerCount > 1) reasons.push(`Lowest of ${d.offerCount} live quotes`);
  if (d.savingVsHighestCents > 0) reasons.push(`${formatLKR(d.savingVsHighestCents)} below highest quote`);
  if (d.deliveryAvailable) reasons.push('Delivery available');
  if (d.leadTimeDays != null) reasons.push(`${d.leadTimeDays}d dispatch`);
  if (d.availabilityStatus === 'low') reasons.push('Low stock — order soon');
  if (d.minOrderQty > 1) reasons.push(`Minimum order ${d.minOrderQty}`);

  return (
    <Card padding={0} style={{ overflow: 'hidden' }} onPress={d.productId ? () => go(productHref(String(d.productId))) : undefined}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: 14, borderBottomWidth: StyleSheet.hairlineWidth * 2, borderBottomColor: colors.lineSoft }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Kicker>{d.offerCount > 1 ? 'Best price' : 'Quote'}</Kicker>
          <Text variant="h3" numberOfLines={2}>
            {String(d.productName ?? '')}
          </Text>
        </View>
        <Text variant="metricSm">{formatLKR(d.priceCents)}</Text>
      </View>
      <View style={{ padding: 14, gap: 8 }}>
        {d.supplierName ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Store size={13} color={colors.copper} />
            <Text variant="bodySm" weight="medium">
              {String(d.supplierName)}
            </Text>
          </View>
        ) : null}
        {reasons.slice(0, 3).map((r) => (
          <View key={r} style={{ flexDirection: 'row', gap: 6 }}>
            <CheckCircle2 size={14} color={colors.mint} />
            <Text variant="bodySm" color="ink3" style={{ flex: 1 }}>
              {r}
            </Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

function SupplierListCard({ d }: { d: Record<string, any> }) {
  const list: any[] = d.suppliers ?? d.hits ?? [];
  return (
    <Card padding={0} style={{ overflow: 'hidden', gap: 0 }}>
      <View style={{ padding: 14 }}>
        <CardTitle kicker={d.suppliers ? 'Quotes' : 'Matches'} title={String(d.title ?? 'Compare')} />
      </View>
      {list.map((row: any, i: number) => {
        const meta = [
          row.bestSupplierName ? `via ${row.bestSupplierName}` : row.supplierName && row.productName ? row.supplierName : null,
          row.leadTimeDays != null ? `${row.leadTimeDays}d dispatch` : null,
          row.deliveryAvailable === true ? 'delivery' : row.deliveryAvailable === false ? 'pickup' : null,
          row.minOrderQty > 1 ? `min ${row.minOrderQty}` : null,
          row.savingVsHighestCents > 0 ? `saves ${formatLKR(row.savingVsHighestCents)}` : null,
          typeof row.fillRate === 'number' ? `${Math.round(row.fillRate * 100)}% fill` : null,
        ].filter(Boolean);
        const href = row.productId ? productHref(String(row.productId)) : row.supplierId ? `/buyer/store/${row.supplierId}` : null;
        return (
          <Touchable
            key={i}
            disabled={!href}
            onPress={href ? () => go(href) : undefined}
            style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: colors.lineSoft }}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="bodySm" weight="semibold" numberOfLines={1}>
                {String(row.productName ?? row.supplierName ?? '')}
              </Text>
              {meta.length ? (
                <Text variant="caption" color="ink4" numberOfLines={1}>
                  {meta.join(' · ')}
                </Text>
              ) : null}
            </View>
            <Text style={{ fontFamily: fonts.monoMedium, fontSize: 13, color: colors.ink }}>{formatLKR(row.priceCents ?? row.bestPriceCents)}</Text>
          </Touchable>
        );
      })}
      {!list.length ? (
        <Text variant="bodySm" color="ink4" style={{ padding: 14 }}>
          No matching quotes right now.
        </Text>
      ) : null}
    </Card>
  );
}

function SpendCard({ d }: { d: Record<string, any> }) {
  if (d.scope === 'price_changes') {
    return (
      <Card style={{ gap: 8 }}>
        <CardTitle kicker="Price moves" title="What changed" />
        {(d.movers ?? []).map((m: any, i: number) => (
          <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.pearl, borderRadius: radii.lg, borderCurve: 'continuous', padding: 10 }}>
            <Text variant="bodySm" weight="medium" style={{ flex: 1 }} numberOfLines={1}>
              {m.productName}
            </Text>
            <Text style={{ fontFamily: fonts.mono, fontSize: 11, color: colors.ink4 }}>
              {formatLKR(m.from)} → {formatLKR(m.to)}
            </Text>
            <Badge size="sm" tone={m.pct >= 0 ? 'danger' : 'success'} label={`${m.pct >= 0 ? '+' : ''}${m.pct}%`} />
          </View>
        ))}
        {!(d.movers ?? []).length ? (
          <Text variant="bodySm" color="ink4">
            No price changes in this period.
          </Text>
        ) : null}
      </Card>
    );
  }
  const title = d.scope === 'product' ? 'Product spend' : d.scope === 'supplier' ? 'Supplier spend' : 'Total spend';
  return (
    <Card kind="ink" style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Kicker color="volt">{title}</Kicker>
        <Text variant="caption" color="paperMuted">
          Last {d.period ?? '30 days'}
        </Text>
      </View>
      <Text variant="metric" color="paper">
        {formatLKR(d.totalCents)}
      </Text>
      {d.productName || d.supplierName ? (
        <Text variant="bodySm" color="paperMuted">
          {d.productName ?? d.supplierName}
        </Text>
      ) : null}
      <Text variant="caption" color="paperFaint" style={{ borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: colors.paperLine, paddingTop: 8 }}>
        {d.orderCount ?? 0} settled order{d.orderCount === 1 ? '' : 's'}
      </Text>
    </Card>
  );
}

function SavingsCard({ d }: { d: Record<string, any> }) {
  const opps: any[] = d.opportunities ?? [];
  return (
    <Card style={{ gap: 8 }}>
      <CardTitle kicker="Where you can save" title="Cheaper quotes" />
      {opps.slice(0, 5).map((o: any, i: number) => (
        <View key={i} style={{ backgroundColor: colors.pearl, borderRadius: radii.lg, borderCurve: 'continuous', padding: 10, gap: 4 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
            <Text variant="bodySm" weight="semibold" style={{ flex: 1 }} numberOfLines={1}>
              {o.productName}
            </Text>
            <Text style={{ fontFamily: fonts.monoMedium, fontSize: 13, color: colors.mint }}>−{formatLKR(o.savingCents)}</Text>
          </View>
          <Text variant="caption" color="ink4">
            {formatLKR(o.currentPriceCents)} at {o.currentSupplierName} → {formatLKR(o.alternativePriceCents)} at {o.alternativeSupplierName}
          </Text>
        </View>
      ))}
      {!opps.length ? (
        <Text variant="bodySm" color="ink4">
          No cheaper quotes on your usual items right now.
        </Text>
      ) : null}
      {d.disclaimer ? (
        <Text variant="caption" color="ink4">
          {String(d.disclaimer)}
        </Text>
      ) : null}
    </Card>
  );
}

function PlanCard({ d }: { d: Record<string, any> }) {
  const lines: any[] = d.lines ?? [];
  return (
    <Card style={{ gap: 8 }}>
      <CardTitle kicker="Suggested reorder" title={String(d.title ?? 'Based on what you usually buy')} />
      {lines.map((l: any, i: number) => (
        <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10, paddingVertical: 6, borderTopWidth: i ? StyleSheet.hairlineWidth * 2 : 0, borderTopColor: colors.lineSoft }}>
          <Text variant="bodySm" weight="medium" style={{ flex: 1 }}>
            {l.productName}
          </Text>
          <Text style={{ fontFamily: fonts.monoMedium, fontSize: 12, color: colors.ink3 }}>× {l.typicalQuantity}</Text>
        </View>
      ))}
      {!lines.length ? (
        <Text variant="bodySm" color="ink4">
          No reorder items to suggest.
        </Text>
      ) : null}
    </Card>
  );
}

function ClarificationCard({ d, onPick }: { d: Record<string, any>; onPick: (t: string) => void }) {
  const options: string[] = d.options ?? [];
  return (
    <Card style={{ gap: 10 }}>
      <Text variant="h3">{String(d.question ?? 'What do you need help with?')}</Text>
      {options.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {options.map((o) => (
            <Chip key={o} label={o.replace(/_/g, ' ')} onPress={() => onPick(o)} />
          ))}
        </View>
      ) : null}
    </Card>
  );
}

function ConfirmCard({ d, toast }: { d: Record<string, any>; toast: ReturnType<typeof useToast> }) {
  const [state, setState] = useState<'preview' | 'submitting' | 'confirmed'>('preview');
  const [poRef, setPoRef] = useState<string | null>(null);
  const items: any[] = d.items ?? [];
  const submit = async () => {
    setState('submitting');
    try {
      const res = await api.post<{ poRef?: string }>('/ai/confirm', { items }, { idempotencyKey: String(d.idempotencyKey ?? '') });
      setPoRef(res?.poRef ?? null);
      setState('confirmed');
      toast.success(res?.poRef ? `Order ${res.poRef} placed` : 'Order placed');
    } catch (e) {
      setState('preview');
      toast.error('Could not place order', errorMessage(e));
    }
  };
  return (
    <Card style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View>
          <Kicker>Draft order</Kicker>
          <Text variant="caption" color="ink4">
            Nothing is placed until you confirm.
          </Text>
        </View>
        {state === 'confirmed' ? <Badge tone="success" icon={CheckCircle2} label={poRef ?? 'Placed'} /> : null}
      </View>
      {items.map((it: any, i: number) => (
        <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: colors.lineSoft }}>
          <View style={{ flex: 1 }}>
            <Text variant="bodySm" weight="semibold">
              {it.product}
            </Text>
            <Text variant="caption" color="ink4">
              {it.quantity} {it.unit} · {it.supplier}
            </Text>
          </View>
          <Text style={{ fontFamily: fonts.monoMedium, fontSize: 13 }}>{formatLKR(it.priceCents * it.quantity)}</Text>
        </View>
      ))}
      <View style={{ backgroundColor: colors.pearl, borderRadius: radii.lg, borderCurve: 'continuous', padding: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Text variant="bodySm" color="ink3">
          Estimated total
        </Text>
        <Text variant="metricSm">{formatLKR(d.totalCents)}</Text>
      </View>
      <Text variant="caption" color="ink4">
        Dispatch {String(d.estimatedDelivery ?? 'per supplier lead time')}
      </Text>
      {state !== 'confirmed' ? <Button title={state === 'submitting' ? 'Placing…' : 'Place order'} variant="volt" loading={state === 'submitting'} onPress={() => void submit()} /> : null}
    </Card>
  );
}

function WhyCard({ d }: { d: Record<string, any> }) {
  const evidence: { label: string; value: string }[] = d.evidence ?? [];
  return (
    <Card style={{ gap: 8 }}>
      <Text variant="h3">{String(d.question ?? 'Why?')}</Text>
      <Text variant="bodySm" color="ink3">
        {String(d.answer ?? '')}
      </Text>
      {evidence.length ? (
        <View style={{ borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: colors.lineSoft, paddingTop: 8, gap: 4 }}>
          {evidence.map((e, i) => (
            <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
              <Text variant="bodySm" color="ink4">
                {e.label}
              </Text>
              <Text style={{ fontFamily: fonts.monoMedium, fontSize: 12 }}>{e.value}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {d.recommendation ? (
        <Text variant="bodySm" color="ink3" style={{ borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: colors.lineSoft, paddingTop: 8 }}>
          {String(d.recommendation)}
        </Text>
      ) : null}
    </Card>
  );
}

function SimulationCard({ d }: { d: Record<string, any> }) {
  const saving = (d.monthlyDeltaCents ?? 0) < 0;
  const pct = Number(d.savingsPct ?? 0);
  return (
    <Card style={{ gap: 10 }}>
      <CardTitle kicker="If you switch" title={String(d.productName ?? 'This product')} />
      <View style={{ flexDirection: 'row', gap: 12, borderTopWidth: StyleSheet.hairlineWidth * 2, borderBottomWidth: StyleSheet.hairlineWidth * 2, borderColor: colors.lineSoft, paddingVertical: 10 }}>
        <View style={{ flex: 1 }}>
          <Text variant="caption" color="ink4">
            Now
          </Text>
          <Text variant="bodySm" weight="semibold">
            {String(d.currentSupplier ?? '—')}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="caption" color="ink4">
            Alternative
          </Text>
          <Text variant="bodySm" weight="semibold">
            {String(d.alternativeSupplier ?? '—')}
          </Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <View>
          <Text variant="caption" color="ink4">
            {saving ? 'Estimated saving' : 'Estimated extra cost'}
          </Text>
          <Text variant="metricSm" style={{ color: saving ? colors.mint : colors.rose }}>
            {pct.toFixed(1)}%
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text variant="caption" color="ink3">
            Monthly {formatLKR(Math.abs(d.monthlyDeltaCents ?? 0))}
          </Text>
          <Text variant="caption" color="ink3">
            Annual {formatLKR(Math.abs(d.annualDeltaCents ?? 0))}
          </Text>
        </View>
      </View>
      <Text variant="caption" color="ink4">
        Lead time {(d.leadDeltaDays ?? 0) >= 0 ? '+' : ''}
        {d.leadDeltaDays ?? 0}d · {d.monthlyQuantity ?? 0} units/month
      </Text>
    </Card>
  );
}

/** Fallback renderer: title/message plus scalar fields. */
function GenericCard({ c }: { c: ComponentEnvelope }) {
  const d = c.data as Record<string, any>;
  const rows = useMemo(
    () =>
      Object.entries(d).filter(([k, v]) => (typeof v === 'string' || typeof v === 'number') && !['title', 'message', 'kicker'].includes(k)),
    [d],
  );
  return (
    <Card style={{ gap: 6 }}>
      {d.title || d.kicker ? <CardTitle kicker={d.kicker ? String(d.kicker) : c.type.replace(/_/g, ' ')} title={String(d.title ?? '')} /> : null}
      {d.message ? (
        <Text variant="bodySm" color="ink3">
          {String(d.message)}
        </Text>
      ) : null}
      {rows.map(([k, v]) => (
        <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
          <Text variant="bodySm" color="ink4">
            {k.replace(/([A-Z])/g, ' $1').trim()}
          </Text>
          <Text style={{ fontFamily: fonts.monoMedium, fontSize: 12 }}>{String(v)}</Text>
        </View>
      ))}
    </Card>
  );
}
