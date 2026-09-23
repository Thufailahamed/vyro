import { useRef, useState } from 'react';
import { FlatList, ScrollView, TextInput, View } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { CheckCheck, Send, Sparkles } from 'lucide-react-native';
import { Button, Chip, IconButton, IconTile, Screen, Text, useToast } from '@/ui';
import { api, errorMessage } from '@/lib/api';
import { useBusinessId } from '@/lib/auth';
import { formatLKR } from '@/lib/format';
import { colors, fonts, radii, shadow } from '@/theme/tokens';
import { Bubble, go } from './kit';

interface DraftItem {
  productId: string;
  supplierProductId: string;
  productName: string;
  quantity: number;
  unit: string;
  unitPriceCents: number;
  totalCents: number;
  supplierId: string;
  supplierName: string;
}

interface OrderDraft {
  id: string;
  totalCents: number;
  deliveryDateEstimate?: string;
  items: DraftItem[];
}

interface ChatResponse {
  replyText: string;
  intent: 'order_draft' | 'price_inquiry' | 'reorder' | 'order_tracking' | 'help';
  draft?: OrderDraft;
  trackingInfo?: { poNumber: string; status: string; totalCents: number; driverName?: string; deliveryAddress?: string };
}

interface Msg {
  sender: 'user' | 'bot';
  text: string;
  draft?: OrderDraft;
  timestamp: string;
}

const QUICK_PROMPTS = [
  'Send 5 bags samba rice and 2 bags sugar',
  'What is the price of white sugar?',
  'Repeat my usual weekly order',
  'Where is my latest order?',
];

const WELCOME =
  'Send your wholesale order list, ask for bulk rates, or repeat your weekly order.\n\nExample: "Machan send 5 bags samba rice and 2 bags sugar tomorrow"';

function now() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** Chat-to-order — the web's WhatsApp-style conversational procurement. */
export function ConversationalOrderScreen() {
  const toast = useToast();
  const businessId = useBusinessId();
  const listRef = useRef<FlatList<Msg>>(null);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Msg[]>([{ sender: 'bot', text: WELCOME, timestamp: now() }]);

  const chat = useMutation({
    mutationFn: (text: string) => api.post<ChatResponse>('/conversational/chat', { message: text, businessId }),
    onSuccess: (res) => {
      setMessages((prev) => [...prev, { sender: 'bot', text: res.replyText, draft: res.draft, timestamp: now() }]);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 120);
    },
    onError: (e) => toast.error('Could not send', errorMessage(e)),
  });

  const confirm = useMutation({
    mutationFn: (draftId: string) =>
      api.post<{ ok: boolean; poIds: string[] }>('/conversational/confirm', { draftId, businessId: businessId ?? 'default' }),
    onSuccess: (res) => {
      toast.success('Purchase order placed');
      if (res.poIds[0]) go(`/buyer/order/${res.poIds[0]}`, true);
    },
    onError: (e) => toast.error('Could not place order', errorMessage(e)),
  });

  function send(text?: string) {
    const t = (text ?? input).trim();
    if (!t || chat.isPending) return;
    setMessages((prev) => [...prev, { sender: 'user', text: t, timestamp: now() }]);
    if (!text) setInput('');
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 120);
    chat.mutate(t);
  }

  return (
    <Screen
      scroll={false}
      keyboard
      back
      kicker="Procurement"
      title="Chat to order"
      subtitle="Wholesale ordering in plain English or Singlish trade phrasing."
      large={false}
      padded={false}
      contentStyle={{ paddingHorizontal: 20 }}
      footer={
        <View
          style={[
            {
              flexDirection: 'row',
              gap: 8,
              alignItems: 'center',
              paddingLeft: 18,
              paddingRight: 5,
              minHeight: 54,
              borderRadius: radii.pill,
              backgroundColor: colors.pearl,
            },
            shadow.sm,
          ]}
        >
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="e.g. Send 5 bags samba rice and 2 sugar"
            placeholderTextColor={colors.ink5}
            selectionColor={colors.copper}
            onSubmitEditing={() => send()}
            returnKeyType="send"
            style={{ flex: 1, fontFamily: fonts.sans, fontSize: 15, color: colors.ink, paddingVertical: 10 }}
          />
          <IconButton icon={Send} variant="volt" size={44} accessibilityLabel="Send" onPress={() => send()} style={{ opacity: chat.isPending || !input.trim() ? 0.4 : 1 }} />
        </View>
      }
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0, marginHorizontal: -20, overflow: 'visible' }}
        contentContainerStyle={{ gap: 8, paddingHorizontal: 20, paddingVertical: 6 }}
      >
        {QUICK_PROMPTS.map((p) => (
          <Chip key={p} label={p} onPress={() => send(p)} icon={Sparkles} />
        ))}
      </ScrollView>
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(_, i) => String(i)}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ gap: 12, paddingTop: 8, paddingBottom: 12 }}
        renderItem={({ item }) => (
          <Bubble mine={item.sender === 'user'} meta={item.timestamp}>
            <Text variant="bodySm" color={item.sender === 'user' ? 'paper' : 'ink'}>
              {item.text}
            </Text>
            {item.draft ? <DraftCard draft={item.draft} confirming={confirm.isPending} onConfirm={() => confirm.mutate(item.draft!.id)} /> : null}
          </Bubble>
        )}
      />
      {chat.isPending ? (
        <View style={{ paddingBottom: 10 }}>
          <Bubble mine={false}>
            <Text variant="caption" color="ink4">
              VYRO is typing…
            </Text>
          </Bubble>
        </View>
      ) : null}
    </Screen>
  );
}

function DraftCard({ draft, confirming, onConfirm }: { draft: OrderDraft; confirming: boolean; onConfirm: () => void }) {
  return (
    <View style={{ marginTop: 8, gap: 10, padding: 12, borderRadius: radii.lg, borderCurve: 'continuous', backgroundColor: colors.pearl }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 2 }}>
        <IconTile icon={CheckCheck} tone="success" size={30} />
        <Text variant="bodySm" weight="semibold" style={{ flex: 1 }}>
          Order draft
        </Text>
        <Text style={{ fontFamily: fonts.monoMedium, fontSize: 15, color: colors.mint }}>{formatLKR(draft.totalCents)}</Text>
      </View>
      {draft.items.map((it, i) => (
        <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
          <Text variant="caption" style={{ flex: 1 }} numberOfLines={2}>
            {it.productName} × {it.quantity} {it.unit}
          </Text>
          <Text style={{ fontFamily: fonts.mono, fontSize: 11, color: colors.ink4 }}>{formatLKR(it.totalCents)}</Text>
        </View>
      ))}
      {draft.deliveryDateEstimate ? (
        <Text variant="caption" color="ink4">
          Est. delivery {draft.deliveryDateEstimate}
        </Text>
      ) : null}
      <Button title="Confirm & place PO" icon={CheckCheck} size="sm" loading={confirming} onPress={onConfirm} full />
    </View>
  );
}
