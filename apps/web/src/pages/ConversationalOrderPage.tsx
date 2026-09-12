import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { Button } from '@/components/ui';
import { Surface } from '@/components/brand/Surface';
import { useToast } from '@vyro/ui';
import type { ConversationalOrderResponse, OrderDraft } from '@vyro/ai';
import { ArrowLeftIcon } from '@/components/icons';

interface MessageBubble {
  sender: 'user' | 'bot';
  text: string;
  draft?: OrderDraft | undefined;
  timestamp: string;
}

export function ConversationalOrderPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const [inputMsg, setInputMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [messages, setMessages] = useState<MessageBubble[]>([
    {
      sender: 'bot',
      text: '👋 *Welcome to Vyro WhatsApp Procurement!*\n\nSend your wholesale order list, ask for bulk rates, or repeat your weekly order.\n\n_Example: "Machan send 5 bags samba rice and 2 bags sugar tomorrow"_',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  const quickPrompts = [
    'Send 5 bags samba rice and 2 bags sugar',
    'What is the price of white sugar?',
    'Repeat my usual weekly order',
    'Where is my latest order?',
  ];

  async function handleSend(textToSend?: string) {
    const text = (textToSend ?? inputMsg).trim();
    if (!text || loading) return;

    const userTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setMessages((prev) => [...prev, { sender: 'user', text, timestamp: userTime }]);
    if (!textToSend) setInputMsg('');
    setLoading(true);

    try {
      const res = await api.post<ConversationalOrderResponse>('/conversational/chat', {
        message: text,
      });

      const botTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      setMessages((prev) => [
        ...prev,
        {
          sender: 'bot',
          text: res.replyText,
          draft: res.draft,
          timestamp: botTime,
        },
      ]);
    } catch (e) {
      toast.show(toast.error(e instanceof Error ? e.message : 'Failed to send message'));
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirmDraft(draft: OrderDraft) {
    setConfirming(true);
    try {
      const res = await api.post<{ ok: boolean; poIds: string[]; totalCents: number }>(
        '/conversational/confirm',
        {
          draftId: draft.id,
          businessId: 'default',
        },
      );
      toast.show(toast.success('Purchase Order placed successfully!'));
      if (res.poIds[0]) {
        navigate(`/orders/${res.poIds[0]}`);
      }
    } catch (e) {
      toast.show(toast.error(e instanceof Error ? e.message : 'Could not place order'));
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link to="/orders" className="inline-flex items-center gap-1.5 text-xs text-ink-3 hover:text-ink">
        <ArrowLeftIcon size={14} /> Back to Orders
      </Link>

      <div className="mt-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink flex items-center gap-2">
            <span>💬 Conversational Ordering</span>
            <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
              WhatsApp Engine
            </span>
          </h1>
          <p className="text-xs text-ink-3 mt-1">
            Order wholesale supplies in plain English or Singlish trade phrasing.
          </p>
        </div>
      </div>

      {/* Quick Prompt Pills */}
      <div className="mt-4 flex flex-wrap gap-2">
        {quickPrompts.map((p, i) => (
          <button
            key={i}
            onClick={() => void handleSend(p)}
            className="rounded-full border border-line bg-paper px-3 py-1 text-xs text-ink-2 hover:border-ink hover:text-ink shadow-soft-sm transition"
          >
            {p}
          </button>
        ))}
      </div>

      {/* Chat Messages Container */}
      <Surface kind="elevated" className="mt-4 flex h-[480px] flex-col rounded-2xl border border-line p-4 shadow-sm">
        <div className="flex-1 overflow-y-auto space-y-3 pr-2">
          {messages.map((m, i) => (
            <div
              key={i}
              className={`flex flex-col ${m.sender === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl p-3.5 text-xs leading-relaxed shadow-sm ${
                  m.sender === 'user'
                    ? 'bg-ink text-paper rounded-br-none'
                    : 'bg-bone text-ink rounded-bl-none border border-line'
                }`}
              >
                <div className="whitespace-pre-wrap font-sans">{m.text}</div>

                {/* Embedded Order Draft Card */}
                {m.draft && (
                  <div className="mt-3 rounded-xl border border-line/60 bg-paper p-3 text-ink">
                    <div className="flex items-center justify-between border-b border-line/40 pb-2">
                      <span className="font-semibold text-xs text-ink">Order Draft Preview</span>
                      <span className="font-mono font-bold text-emerald-700">
                        Rs. {(m.draft.totalCents / 100).toLocaleString()}
                      </span>
                    </div>

                    <div className="mt-2 space-y-1.5">
                      {m.draft.items.map((it, idx) => (
                        <div key={idx} className="flex justify-between text-[11px]">
                          <span>
                            {it.productName} x {it.quantity} {it.unit}
                          </span>
                          <span className="font-mono text-ink-3">
                            Rs. {(it.totalCents / 100).toLocaleString()}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="mt-3 flex justify-end gap-2 border-t border-line/40 pt-2">
                      <Button
                        onClick={() => void handleConfirmDraft(m.draft!)}
                        loading={confirming}
                        disabled={confirming}
                        size="sm"
                        className="bg-emerald-600 text-paper hover:bg-emerald-700 text-xs font-semibold"
                      >
                        Confirm & Place Purchase Order
                      </Button>
                    </div>
                  </div>
                )}

                <div
                  className={`mt-1 text-[10px] text-right ${
                    m.sender === 'user' ? 'text-paper/60' : 'text-ink-4'
                  }`}
                >
                  {m.timestamp}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Input Bar */}
        <div className="mt-3 flex items-center gap-2 border-t border-line/50 pt-3">
          <input
            value={inputMsg}
            onChange={(e) => setInputMsg(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            placeholder="Type your wholesale order (e.g. 'Send 5 bags samba rice and 2 sugar')..."
            className="flex-1 rounded-xl border border-line bg-paper px-3 py-2 text-xs focus:ring-ink"
          />
          <Button
            onClick={() => void handleSend()}
            loading={loading}
            disabled={loading || !inputMsg.trim()}
            size="sm"
            className="bg-ink text-paper hover:bg-charcoal font-semibold px-4"
          >
            Send
          </Button>
        </div>
      </Surface>
    </div>
  );
}
