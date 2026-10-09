import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { Button, ErrorBanner } from '@/components/ui';
import { MailIcon } from '@/components/icons';
import { useAuth } from '@/lib/auth';

interface Message {
  id: string;
  purchaseOrderId: string;
  senderUserId: string;
  body: string;
  createdAt: number;
  readAt: number | null;
}

interface MessagesResp {
  messages: Message[];
}

interface SendResp {
  id: string;
  createdAt: number;
}

const POLL_MS = 5000;

export function MessageThread({ purchaseOrderId }: { purchaseOrderId: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [body, setBody] = useState('');
  const [err, setErr] = useState('');
  const [sending, setSending] = useState(false);
  const lastSince = useRef(0);
  const scroller = useRef<HTMLDivElement>(null);

  const { data } = useQuery({
    queryKey: ['po-messages', purchaseOrderId],
    queryFn: () => api.get<MessagesResp>(`/purchase-orders/${purchaseOrderId}/messages`),
    refetchInterval: POLL_MS,
  });

  const messages = data?.messages ?? [];

  useEffect(() => {
    const last = messages[messages.length - 1];
    if (last && last.createdAt > lastSince.current) {
      lastSince.current = last.createdAt;
      const el = scroller.current;
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, [messages.length]);

  useEffect(() => {
    const last = messages[messages.length - 1];
    if (last && user && last.senderUserId !== user.userId && last.readAt == null) {
      void api.post(`/purchase-orders/${purchaseOrderId}/messages/read`, {}).then(() => {
        qc.invalidateQueries({ queryKey: ['po-messages', purchaseOrderId] });
      });
    }
  }, [messages.length, user?.userId, purchaseOrderId, qc]); // eslint-disable-line react-hooks/exhaustive-deps

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) return;
    setErr('');
    setSending(true);
    try {
      await api.post<SendResp>(`/purchase-orders/${purchaseOrderId}/messages`, { body: trimmed });
      setBody('');
      await qc.invalidateQueries({ queryKey: ['po-messages', purchaseOrderId] });
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : 'Failed to send');
    } finally {
      setSending(false);
    }
  }

  const dayLabel = (ts: number) => {
    const d = new Date(ts);
    const today = new Date();
    const y = new Date(today);
    y.setDate(today.getDate() - 1);
    if (d.toDateString() === today.toDateString()) return 'Today';
    if (d.toDateString() === y.toDateString()) return 'Yesterday';
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  return (
    <section className="flex h-[460px] flex-col overflow-hidden rounded-2xl border border-ink/10 bg-paper shadow-[0_1px_0_rgba(0,0,0,0.03),0_16px_36px_-26px_rgba(0,0,0,0.3)]">
      <header className="flex items-center justify-between gap-3 border-b border-ink/[0.07] px-6 py-4">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-ink text-volt">
            <MailIcon size={17} />
          </span>
          <div>
            <div className="text-[10px] font-mono font-bold uppercase tracking-[0.18em] text-copper">
              Conversation
            </div>
            <h3 className="font-display text-lg font-semibold tracking-tight text-ink-1">
              Messages
            </h3>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 text-[11px] text-ink-4">
          <span className="size-1.5 animate-pulse rounded-full bg-mint" /> Live
        </span>
      </header>
      <div
        ref={scroller}
        className="flex-1 space-y-2 overflow-y-auto bg-[linear-gradient(180deg,rgba(242,238,228,0.45),rgba(242,238,228,0.15))] px-5 py-4"
      >
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <span className="flex size-11 items-center justify-center rounded-full bg-paper text-ink-4 ring-1 ring-ink/10">
              <MailIcon size={18} />
            </span>
            <div className="text-sm font-semibold text-ink-2">No messages yet</div>
            <p className="max-w-xs text-xs text-ink-4">
              Ask about delivery times, packaging or payment — the supplier gets notified.
            </p>
          </div>
        )}
        {messages.map((m, i) => {
          const mine = user?.userId === m.senderUserId;
          const prev = messages[i - 1];
          const newDay =
            !prev ||
            new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString();
          return (
            <div key={m.id}>
              {newDay && (
                <div className="my-3 flex items-center gap-3 text-[10px] font-mono uppercase tracking-wider text-ink-4">
                  <span className="h-px flex-1 bg-ink/10" />
                  {dayLabel(m.createdAt)}
                  <span className="h-px flex-1 bg-ink/10" />
                </div>
              )}
              <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[78%] px-3.5 py-2 text-sm shadow-[0_1px_2px_rgba(0,0,0,0.06)] ${
                    mine
                      ? 'rounded-2xl rounded-br-md bg-ink text-paper'
                      : 'rounded-2xl rounded-bl-md bg-paper text-ink-1 ring-1 ring-ink/[0.07]'
                  }`}
                >
                  <div className="whitespace-pre-wrap break-words leading-relaxed">{m.body}</div>
                  <div
                    className={`mt-1 text-right text-[10px] ${mine ? 'text-paper/55' : 'text-ink-4'}`}
                  >
                    {new Date(m.createdAt).toLocaleTimeString('en-GB', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                    {mine && m.readAt ? ' · Read' : ''}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <form onSubmit={send} className="border-t border-ink/[0.07] bg-paper p-3">
        <ErrorBanner message={err} />
        <div className="flex items-center gap-2 rounded-xl bg-bone/50 p-1.5 ring-1 ring-ink/[0.08] focus-within:ring-2 focus-within:ring-volt/60">
          <input
            placeholder="Write a message…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={2000}
            disabled={sending}
            aria-label="Message"
            className="min-w-0 flex-1 bg-transparent px-2.5 py-1.5 text-sm text-ink-1 placeholder:text-ink-4 focus:outline-none"
          />
          <Button type="submit" size="sm" loading={sending} disabled={!body.trim()}>
            Send
          </Button>
        </div>
      </form>
    </section>
  );
}
