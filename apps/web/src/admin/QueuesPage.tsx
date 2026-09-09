import { useState } from 'react';
import { PageHeader, Surface, ErrorBanner, Button } from '@/components/ui';
import { usePermission } from './lib/permissions';
import {
  useQueueHealth,
  useQueueEvents,
  useQueueThroughput,
  useRetryQueueEvent,
  useRetryBulkQueueEvents,
  useManualEnqueue,
  type QueueName,
  type QueueEvent,
} from './useAdminQueues';

export function QueuesPage() {
  const canRead = usePermission('queues:read');
  const canWrite = usePermission('queues:write');
  const health = useQueueHealth();
  const events = useQueueEvents();
  const throughput = useQueueThroughput();
  const retry = useRetryQueueEvent();
  const retryBulk = useRetryBulkQueueEvents();
  const enqueue = useManualEnqueue();

  const [selected, setSelected] = useState<string[]>([]);
  const [openPayload, setOpenPayload] = useState<QueueEvent | null>(null);
  const [openEnqueue, setOpenEnqueue] = useState(false);

  if (!canRead) return <ErrorBanner message="You need queues:read permission" />;
  if (health.isError) return <ErrorBanner message={(health.error as Error).message} />;

  return (
    <div className="space-y-6">
      <PageHeader title="Queues & Jobs" sub="Live visibility into audit, notifications, and invoices queues" />

      <section aria-label="Queue tiles" className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {(health.data ?? []).map((q) => (
          <Surface key={q.queue} className="p-4">
            <div className="text-sm uppercase text-ink-500">{q.queue}</div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
              <div>Backlog</div><div>{q.backlog}</div>
              <div>Acks (1h)</div><div>{q.ackLast1h}</div>
              <div>Errors (1h)</div><div className={q.errLast1h > 0 ? 'text-amber-600' : ''}>{q.errLast1h}</div>
              <div>p50</div><div>{q.p50Ms} ms</div>
              <div>p95</div><div>{q.p95Ms} ms</div>
            </div>
          </Surface>
        ))}
      </section>

      <Surface className="p-4">
        <h3 className="text-sm font-medium mb-2">Throughput (24h, 5-min buckets)</h3>
        <ThroughputBars points={throughput.data ?? []} />
      </Surface>

      <Surface className="p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Failed messages</h3>
          {canWrite && selected.length > 0 && (
            <Button
              size="sm"
              onClick={() => {
                if (confirm(`Replay ${selected.length} messages?`)) {
                  retryBulk.mutate({ eventIds: selected }, { onSuccess: () => setSelected([]) });
                }
              }}
            >
              Replay {selected.length} selected
            </Button>
          )}
        </div>
        <table className="mt-2 w-full text-sm">
          <thead>
            <tr className="text-left text-ink-500">
              <th className="py-2"></th>
              <th>Queue</th>
              <th>Msg id</th>
              <th>Event</th>
              <th>Error</th>
              <th>When</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(events.data ?? []).map((e) => (
              <tr key={e.id} className="border-t border-ink/10">
                <td className="py-2">
                  {canWrite ? (
                    <input
                      type="checkbox"
                      aria-label={`Select ${e.id}`}
                      onChange={(ev) =>
                        setSelected((cur) => (ev.target.checked ? [...cur, e.id] : cur.filter((x) => x !== e.id)))
                      }
                    />
                  ) : null}
                </td>
                <td>{e.queue}</td>
                <td className="font-mono text-xs">{e.msgId.slice(0, 12)}</td>
                <td>{e.event}</td>
                <td className="text-red-600">{e.error ?? ''}</td>
                <td>{new Date(e.createdAt).toISOString()}</td>
                <td className="space-x-2">
                  {canWrite ? (
                    <Button size="sm" variant="ghost" onClick={() => retry.mutate({ id: e.id })}>
                      Retry
                    </Button>
                  ) : null}
                  <Button size="sm" variant="ghost" onClick={() => setOpenPayload(e)}>
                    View
                  </Button>
                </td>
              </tr>
            ))}
            {!events.data?.length ? (
              <tr><td colSpan={7} className="py-4 text-center text-ink-500">No failures recorded</td></tr>
            ) : null}
          </tbody>
        </table>
      </Surface>

      {canWrite && (
        <Surface className="p-4">
          <button className="text-sm underline" onClick={() => setOpenEnqueue((v) => !v)}>
            {openEnqueue ? 'Hide' : 'Show'} manual enqueue
          </button>
          {openEnqueue && (
            <EnqueueForm
              onSubmit={(queue, payload) => {
                if (confirm(`Send to ${queue}?`)) enqueue.mutate({ queue, payload });
              }}
            />
          )}
          {enqueue.isSuccess && (
            <div className="mt-2 text-xs text-emerald-600">
              Sent msgId={enqueue.data?.msgId} eventId={enqueue.data?.eventId}
            </div>
          )}
          {enqueue.isError && (
            <div className="mt-2 text-xs text-red-600">{(enqueue.error as Error).message}</div>
          )}
        </Surface>
      )}

      {openPayload && (
        <PayloadModal event={openPayload} onClose={() => setOpenPayload(null)} />
      )}
    </div>
  );
}

function ThroughputBars({ points }: { points: Array<{ ts: number; queue: QueueName; acks: number }> }) {
  if (!points.length) return <div className="text-xs text-ink-500">No data yet</div>;
  const max = Math.max(1, ...points.map((p) => p.acks));
  const queues: QueueName[] = ['audit', 'notifications', 'invoices'];
  return (
    <div className="space-y-2">
      {queues.map((q) => {
        const filtered = points.filter((p) => p.queue === q);
        return (
          <div key={q} className="flex items-center gap-2 text-xs">
            <div className="w-24 text-ink-500">{q}</div>
            <div className="flex-1 h-3 bg-ink/5 rounded overflow-hidden flex">
              {filtered.map((p, i) => (
                <div
                  key={i}
                  className="bg-volt/60"
                  style={{ width: `${(p.acks / max) * 100}%` }}
                  title={`${new Date(p.ts).toISOString()} ${p.acks}`}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EnqueueForm({ onSubmit }: { onSubmit: (queue: QueueName, payload: unknown) => void }) {
  const [queue, setQueue] = useState<QueueName>('audit');
  const [raw, setRaw] = useState('{}');
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="mt-3 space-y-2">
      <select value={queue} onChange={(e) => setQueue(e.target.value as QueueName)} className="rounded border p-1 text-sm">
        <option value="audit">audit</option>
        <option value="notifications">notifications</option>
        <option value="invoices">invoices</option>
      </select>
      <textarea
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        className="w-full h-32 font-mono text-xs rounded border p-2"
        aria-label="Queue payload JSON"
      />
      {err && <div className="text-red-600 text-xs">{err}</div>}
      <Button
        size="sm"
        onClick={() => {
          try {
            onSubmit(queue, JSON.parse(raw));
            setErr(null);
          } catch (e) {
            setErr(String(e));
          }
        }}
      >
        Send
      </Button>
    </div>
  );
}

function PayloadModal({ event, onClose }: { event: QueueEvent; onClose: () => void }) {
  return (
    <div
      role="dialog"
      aria-label={`Payload ${event.id}`}
      className="fixed inset-0 bg-black/40 flex items-center justify-center"
      onClick={onClose}
    >
      <div className="bg-white rounded p-4 max-w-xl w-full" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-medium">Payload {event.id}</div>
          <button className="text-xs underline" onClick={onClose}>close</button>
        </div>
        <div className="text-xs text-ink-500 mb-1">
          {event.queue} / {event.event} / {new Date(event.createdAt).toISOString()}
        </div>
        <pre className="text-xs whitespace-pre-wrap break-all bg-ink/5 p-2 rounded">
          {event.error ?? '(no error stored — fetch /events/:id for payload)'}
        </pre>
      </div>
    </div>
  );
}