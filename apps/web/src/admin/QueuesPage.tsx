import { useState } from 'react';
import { cn } from '@vyro/ui';
import { ErrorBanner, Button } from '@/components/ui';
import { CheckCircleIcon, LayersIcon, TrendingUpIcon, XIcon } from '@/components/icons';
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
import {
  AdminPage,
  AdminPageHeader,
  Callout,
  Card,
  CardHeader,
  EmptyBlock,
  Panel,
  Pill,
  TableCard,
  controlClass,
} from './ui';

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
    <AdminPage>
      <AdminPageHeader
        kicker="Infrastructure"
        title="Queues & Jobs"
        description="Live visibility into audit, notifications, and invoices queues"
      />

      <section aria-label="Queue tiles" className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {(health.data ?? []).map((q) => (
          <Card key={q.queue} padded={false} className="p-5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold capitalize text-ink">{q.queue}</span>
              {q.errLast1h > 0 ? (
                <Pill tone="warning" dot>
                  Errors
                </Pill>
              ) : (
                <Pill tone="success" dot>
                  Healthy
                </Pill>
              )}
            </div>
            <div className="mt-4 flex items-baseline gap-2">
              <span className="vyro-metric text-3xl leading-none text-ink">{q.backlog}</span>
              <span className="text-xs text-ink-4">Backlog</span>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-ink/[0.07] pt-4 text-sm">
              <dt className="text-ink-4">Acks (1h)</dt>
              <dd className="text-right num-tabular text-ink">{q.ackLast1h}</dd>
              <dt className="text-ink-4">Errors (1h)</dt>
              <dd className={cn('text-right num-tabular', q.errLast1h > 0 ? 'font-semibold text-amber' : 'text-ink')}>
                {q.errLast1h}
              </dd>
              <dt className="text-ink-4">p50</dt>
              <dd className="text-right num-tabular text-ink">{q.p50Ms} ms</dd>
              <dt className="text-ink-4">p95</dt>
              <dd className="text-right num-tabular text-ink">{q.p95Ms} ms</dd>
            </dl>
          </Card>
        ))}
      </section>

      <Panel title="Throughput (24h, 5-min buckets)" icon={<TrendingUpIcon size={16} />}>
        <ThroughputBars points={throughput.data ?? []} />
      </Panel>

      <TableCard
        title="Failed messages"
        description="Retry individual messages, or select several to replay them together."
        actions={
          canWrite && selected.length > 0 ? (
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
          ) : undefined
        }
      >
        <table className="admin-table">
          <thead>
            <tr>
              <th className="w-10">
                <span className="sr-only">Select</span>
              </th>
              <th>Queue</th>
              <th>Msg id</th>
              <th>Event</th>
              <th>Error</th>
              <th>When</th>
              <th>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {(events.data ?? []).map((e) => (
              <tr key={e.id} data-selected={selected.includes(e.id) ? 'true' : undefined}>
                <td>
                  {canWrite ? (
                    <input
                      type="checkbox"
                      aria-label={`Select ${e.id}`}
                      className="size-4 cursor-pointer accent-ink"
                      onChange={(ev) =>
                        setSelected((cur) => (ev.target.checked ? [...cur, e.id] : cur.filter((x) => x !== e.id)))
                      }
                    />
                  ) : null}
                </td>
                <td>
                  <Pill tone="neutral" className="capitalize">
                    {e.queue}
                  </Pill>
                </td>
                <td className="font-mono text-xs text-ink-3">{e.msgId.slice(0, 12)}</td>
                <td className="font-mono text-xs">{e.event}</td>
                <td className="max-w-xs truncate text-rose" title={e.error ?? ''}>
                  {e.error ?? ''}
                </td>
                <td className="whitespace-nowrap font-mono text-xs text-ink-3">{new Date(e.createdAt).toISOString()}</td>
                <td className="whitespace-nowrap text-right">
                  <div className="inline-flex gap-1">
                    {canWrite ? (
                      <Button size="sm" variant="ghost" onClick={() => retry.mutate({ id: e.id })}>
                        Retry
                      </Button>
                    ) : null}
                    <Button size="sm" variant="ghost" onClick={() => setOpenPayload(e)}>
                      View
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {!events.data?.length ? (
              <tr>
                <td colSpan={7} className="!p-0">
                  <EmptyBlock
                    icon={<CheckCircleIcon size={20} />}
                    title="No failures recorded"
                    description="Every queued message has been processed."
                  />
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </TableCard>

      {canWrite && (
        <Card padded={false} className="p-5 sm:p-6">
          <CardHeader
            title="Manual enqueue"
            description="Send a raw JSON payload straight to a queue."
            icon={<LayersIcon size={16} />}
            actions={
              <Button size="sm" variant="outline" onClick={() => setOpenEnqueue((v) => !v)}>
                {openEnqueue ? 'Hide' : 'Show'} manual enqueue
              </Button>
            }
          />
          {openEnqueue && (
            <EnqueueForm
              onSubmit={(queue, payload) => {
                if (confirm(`Send to ${queue}?`)) enqueue.mutate({ queue, payload });
              }}
            />
          )}
          {enqueue.isSuccess && (
            <Callout tone="success" className="mt-4">
              <span className="font-mono text-xs">
                Sent msgId={enqueue.data?.msgId} eventId={enqueue.data?.eventId}
              </span>
            </Callout>
          )}
          {enqueue.isError && (
            <Callout tone="danger" className="mt-4">
              {(enqueue.error as Error).message}
            </Callout>
          )}
        </Card>
      )}

      {openPayload && <PayloadModal event={openPayload} onClose={() => setOpenPayload(null)} />}
    </AdminPage>
  );
}

function ThroughputBars({ points }: { points: Array<{ ts: number; queue: QueueName; acks: number }> }) {
  if (!points.length) return <div className="py-6 text-center text-sm text-ink-4">No data yet</div>;
  const max = Math.max(1, ...points.map((p) => p.acks));
  const queues: QueueName[] = ['audit', 'notifications', 'invoices'];
  return (
    <div className="space-y-3">
      {queues.map((q) => {
        const filtered = points.filter((p) => p.queue === q);
        return (
          <div key={q} className="flex items-center gap-3 text-xs">
            <div className="w-24 shrink-0 font-medium capitalize text-ink-3">{q}</div>
            <div className="flex h-3 flex-1 overflow-hidden rounded-full bg-ink/[0.06]">
              {filtered.map((p, i) => (
                <div
                  key={i}
                  className="bg-volt-deep/80"
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
    <div className="mt-5 space-y-3 border-t border-ink/[0.07] pt-5">
      <label className="block text-sm font-medium text-ink-3">
        Queue
        <select
          value={queue}
          onChange={(e) => setQueue(e.target.value as QueueName)}
          className={cn(controlClass, 'mt-1.5 block w-full sm:w-64')}
        >
          <option value="audit">audit</option>
          <option value="notifications">notifications</option>
          <option value="invoices">invoices</option>
        </select>
      </label>
      <textarea
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        className={cn(controlClass, 'h-32 w-full py-2.5 font-mono text-xs leading-relaxed')}
        aria-label="Queue payload JSON"
      />
      {err && <Callout tone="danger">{err}</Callout>}
      <div className="flex justify-end">
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
    </div>
  );
}

function PayloadModal({ event, onClose }: { event: QueueEvent; onClose: () => void }) {
  return (
    <div
      role="dialog"
      aria-label={`Payload ${event.id}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div className="vyro-floating w-full max-w-xl p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-sans text-lg font-semibold tracking-normal text-ink">Payload</h2>
            <p className="mt-0.5 truncate font-mono text-xs text-ink-4">{event.id}</p>
          </div>
          <button
            type="button"
            aria-label="Close"
            className="flex size-8 shrink-0 items-center justify-center rounded-full text-ink-4 transition-colors hover:bg-ink/5 hover:text-ink"
            onClick={onClose}
          >
            <XIcon size={16} />
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Pill tone="neutral" className="capitalize">
            {event.queue}
          </Pill>
          <Pill tone="info">{event.event}</Pill>
          <Pill tone="neutral" className="font-mono">
            {new Date(event.createdAt).toISOString()}
          </Pill>
        </div>
        <pre className="mt-4 max-h-[50vh] overflow-auto whitespace-pre-wrap break-all rounded-xl bg-bone p-4 font-mono text-xs text-ink shadow-[inset_0_0_0_1px_rgba(12,14,11,0.06)]">
          {event.error ?? '(no error stored — fetch /events/:id for payload)'}
        </pre>
        <div className="mt-6 flex justify-end">
          <Button size="sm" variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
