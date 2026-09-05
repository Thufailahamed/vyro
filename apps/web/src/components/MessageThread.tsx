import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { Button, ErrorBanner, Input } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { Surface } from '@/components/brand/Surface';

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

  return (
    <Surface className="p-0 overflow-hidden flex flex-col h-[420px]">
      <div className="px-5 py-3 border-b border-ink/10 font-display text-lg">Messages</div>
      <div ref={scroller} className="flex-1 overflow-y-auto px-5 py-4 space-y-3 bg-mist/40">
        {messages.length === 0 && (
          <div className="text-sm text-ink-4 text-center py-8">No messages yet. Start the conversation.</div>
        )}
        {messages.map((m) => {
          const mine = user?.userId === m.senderUserId;
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                  mine ? 'bg-copper text-paper' : 'bg-paper border border-ink/10'
                }`}
              >
                <div className="whitespace-pre-wrap break-words">{m.body}</div>
                <div className={`text-[10px] mt-1 ${mine ? 'text-paper/70' : 'text-ink-4'}`}>
                  {new Date(m.createdAt).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <form onSubmit={send} className="border-t border-ink/10 p-3 flex gap-2">
        <div className="flex-1">
          <ErrorBanner message={err} />
          <Input
            placeholder="Type a message…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={2000}
            disabled={sending}
          />
        </div>
        <Button type="submit" loading={sending} disabled={!body.trim()}>
          Send
        </Button>
      </form>
    </Surface>
  );
}
