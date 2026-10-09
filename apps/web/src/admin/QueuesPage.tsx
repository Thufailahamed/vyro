import { useEffect, useMemo, useState } from 'react';
import { cn, Sparkline } from '@vyro/ui';
import { AlertTriangleIcon, CheckCircleIcon, LayersIcon, RefreshCwIcon, TrendingUpIcon, XIcon } from '@/components/icons';
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
  type ThroughputPoint,
} from './useAdminQueues';
import { relativeTime } from './registryUi';
import { NavCount, ObservabilityNav, fmtClock } from './observabilityUi';
import {
  AdminPage,
  AdminPageHeader,
  Button,
  Callout,
  EmptyBlock,
  Panel,
  Pill,
  Segmented,
  Skeleton,
  TableCard,
  controlClass,
  type PillTone,
} from './ui';

const QUEUES: QueueName[] = ['audit', 'notifications', 'invoices'];
const QUEUE_COLOR: Record<QueueName, { bar: string; dot: string; spark: 'mint' | 'amber' | 'violet' }> = {
  audit: { bar: 'bg-ink/70', dot: 'bg-ink/70', spark: 'mint' },
  notifications: { bar: 'bg-volt-deep', dot: 'bg-volt-deep', spark: 'mint' },
  invoices: { bar: 'bg-copper', dot: 'bg-copper', spark: 'violet' },
};
const QUEUE_BLURB: Record<QueueName, string> = {
  audit: 'Audit log writes',
  notifications: 'Email, push and in-app',
  invoices: 'Invoice PDFs and ledgers',
};
const EVENT_TONE: Record<string, PillTone> = { dlq: 'danger', retry: 'warning', manual: 'info' };

export function QueuesPage() {
  const canRead = usePermission('queues:read');
  const canWrite = usePermission('queues:write');
  const health = useQueueHealth();
  const events = useQueueEvents();
  const throughput = useQueueThroughput();
  const retry = useRetryQueueEvent();
  const retryBulk = useRetryBulkQueueEvents();

  const [selected, setSelected] = useState<string[]>([]);
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [openPayload, setOpenPayload] = useState<QueueEvent | null>(null);
  const [filter, setFilter] = useState<'all' | QueueName>('all');

  const failed = events.data ?? [];
  const visible = filter === 'all' ? failed : failed.filter((e) => e.queue === filter);
  const points = throughput.data ?? [];
  const errors1h = (health.data ?? []).reduce((n, q) => n + q.errLast1h, 0);

  const header = (
    <>
      <AdminPageHeader
        kicker="Infrastructure & reliability"
        title="Queues & jobs"
        description="Backlog, throughput and failures for the Worker queues that write audit logs, send notifications and generate invoices."
        actions={
          <Button
            onClick={() => {
              void health.refetch();
              void events.refetch();
              void throughput.refetch();
            }}
            disabled={health.isFetching}
          >
            <RefreshCwIcon size={14} className={cn(health.isFetching && 'animate-spin')} />
            Refresh
          </Button>
        }
      />
      <ObservabilityNav badges={{ queues: <NavCount n={failed.length} tone="danger" /> }} />
    </>
  );

  if (!canRead) {
    return (
      <AdminPage>
        {header}
        <Callout tone="warning" title="Permission required">You need the queues:read permission to view queues.</Callout>
      </AdminPage>
    );
  }
  if (health.isError) {
    return (
      <AdminPage>
        {header}
        <Callout tone="danger" title="Couldn’t load queue health">{(health.error as Error).message}</Callout>
      </AdminPage>
    );
  }

  const allSelected = visible.length > 0 && visible.every((e) => selected.includes(e.id));

  return (
    <AdminPage>
      {header}

      {errors1h > 0 && (
        <Callout tone="warning" title={`${errors1h} processing ${errors1h === 1 ? 'error' : 'errors'} in the last hour`}>
          Check the failed messages below and replay them once the cause is fixed.
        </Callout>
      )}

      <section aria-label="Queue health" className="grid gap-4 md:grid-cols-3">
        {health.isLoading
          ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-60 rounded-[18px]" />)
          : (health.data ?? []).map((q) => {
              const spark = points.filter((p) => p.queue === q.queue).sort((a, b) => a.ts - b.ts).map((p) => p.acks);
              const hasErr = q.errLast1h > 0;
              return (
                <article key={q.queue} className="vyro-surface flex flex-col overflow-hidden">
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <span className={cn('size-2.5 rounded-full', QUEUE_COLOR[q.queue].dot)} aria-hidden />
                        <div>
                          <div className="text-[15px] font-semibold capitalize tracking-[-0.01em] text-ink">{q.queue}</div>
                          <div className="text-xs text-ink-4">{QUEUE_BLURB[q.queue]}</div>
                        </div>
                      </div>
                      <Pill tone={hasErr ? 'warning' : 'success'} dot>
                        {hasErr ? 'Errors' : 'Healthy'}
                      </Pill>
                    </div>
                    <div className="mt-5 flex items-end justify-between gap-4">
                      <div>
                        <div className="vyro-metric text-[2.5rem] leading-none text-ink">{q.backlog}</div>
                        <div className="mt-1.5 text-xs text-ink-4">in backlog</div>
                      </div>
                      {spark.length >= 2 ? (
                        <Sparkline values={spark} width={140} height={40} tone={hasErr ? 'amber' : QUEUE_COLOR[q.queue].spark} className="h-10 w-36" />
                      ) : null}
                    </div>
                  </div>
                  <dl className="mt-auto grid grid-cols-4 divide-x divide-ink/[0.06] border-t border-ink/[0.07] bg-bone/40 text-center">
                    <QueueStat label="Acks 1h" value={q.ackLast1h} />
                    <QueueStat label="Errors 1h" value={q.errLast1h} warn={hasErr} />
                    <QueueStat label="p50" value={`${q.p50Ms}`} unit="ms" />
                    <QueueStat label="p95" value={`${q.p95Ms}`} unit="ms" warn={q.p95Ms > 2000} />
                  </dl>
                </article>
              );
            })}
      </section>

      <Panel
        title="Throughput"
        description="Messages acknowledged per 5-minute bucket over the last 24 hours."
        icon={<TrendingUpIcon size={16} />}
        actions={
          <div className="flex flex-wrap gap-3">
            {QUEUES.map((q) => (
              <span key={q} className="inline-flex items-center gap-1.5 text-xs capitalize text-ink-4">
                <span className={cn('size-2 rounded-sm', QUEUE_COLOR[q].bar)} aria-hidden />
                {q}
              </span>
            ))}
          </div>
        }
      >
        {throughput.isLoading ? <Skeleton className="h-40" /> : <ThroughputChart points={points} />}
      </Panel>

      <TableCard
        title="Failed messages"
        description={failed.length ? `${failed.length} messages in retry or the dead-letter queue` : 'Retry individual messages, or replay several together.'}
        toolbar={
          failed.length > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Segmented
                ariaLabel="Filter by queue"
                value={filter}
                onChange={(f) => {
                  setFilter(f);
                  setSelected([]);
                }}
                items={[{ key: 'all', label: 'All' }, ...QUEUES.map((q) => ({ key: q, label: q[0]!.toUpperCase() + q.slice(1) }))]}
              />
              {canWrite && selected.length > 0 && (
                <div className="flex items-center gap-2">
                  {confirmBulk ? (
                    <>
                      <span className="text-xs text-ink-3">Replay {selected.length} messages?</span>
                      <Button
                        size="sm"
                        variant="primary"
                        disabled={retryBulk.isPending}
                        onClick={() =>
                          retryBulk.mutate(
                            { eventIds: selected },
                            { onSuccess: () => setSelected([]), onSettled: () => setConfirmBulk(false) },
                          )
                        }
                      >
                        {retryBulk.isPending ? 'Replaying…' : 'Confirm'}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirmBulk(false)}>
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" variant="primary" onClick={() => setConfirmBulk(true)}>
                      <RefreshCwIcon size={13} />
                      Replay {selected.length} selected
                    </Button>
                  )}
                </div>
              )}
            </div>
          ) : undefined
        }
      >
        {retryBulk.data && retryBulk.data.failed.length > 0 && (
          <div className="px-5 pb-4 sm:px-6">
            <Callout tone="warning">
              Replayed {retryBulk.data.replayed}; {retryBulk.data.failed.length} could not be replayed.
            </Callout>
          </div>
        )}
        {events.isLoading ? (
          <div className="space-y-2 px-6 pb-6">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="border-t border-ink/[0.07]">
            <EmptyBlock
              icon={<CheckCircleIcon size={22} />}
              title={failed.length ? 'No failures in this queue' : 'No failed messages'}
              description="Every queued message has been processed successfully."
            />
          </div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th className="w-10">
                  {canWrite ? (
                    <input
                      type="checkbox"
                      aria-label="Select all"
                      className="size-4 cursor-pointer accent-ink"
                      checked={allSelected}
                      onChange={() => setSelected(allSelected ? [] : visible.map((e) => e.id))}
                    />
                  ) : (
                    <span className="sr-only">Select</span>
                  )}
                </th>
                <th>Message</th>
                <th>Error</th>
                <th className="text-right">When</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((e) => {
                const on = selected.includes(e.id);
                return (
                  <tr key={e.id} data-selected={on ? 'true' : undefined}>
                    <td>
                      {canWrite ? (
                        <input
                          type="checkbox"
                          aria-label={`Select ${e.msgId}`}
                          className="size-4 cursor-pointer accent-ink"
                          checked={on}
                          onChange={() => setSelected((cur) => (on ? cur.filter((x) => x !== e.id) : [...cur, e.id]))}
                        />
                      ) : null}
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <span className={cn('size-2 shrink-0 rounded-full', QUEUE_COLOR[e.queue].dot)} aria-hidden />
                        <span className="text-[13px] font-medium capitalize text-ink">{e.queue}</span>
                        <Pill tone={EVENT_TONE[e.event] ?? 'neutral'}>{e.event.toUpperCase()}</Pill>
                      </div>
                      <div className="mt-0.5 pl-4 font-mono text-[11px] text-ink-5">{e.msgId.slice(0, 16)}</div>
                    </td>
                    <td className="max-w-sm">
                      <span className="line-clamp-2 font-mono text-[11px] leading-relaxed text-rose" title={e.error ?? ''}>
                        {e.error ?? '—'}
                      </span>
                    </td>
                    <td className="whitespace-nowrap text-right">
                      <div className="text-xs text-ink-3">{relativeTime(e.createdAt)}</div>
                      <div className="font-mono text-[10px] text-ink-5">{fmtClock(e.createdAt)}</div>
                    </td>
                    <td className="whitespace-nowrap text-right">
                      <div className="inline-flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setOpenPayload(e)}>
                          Inspect
                        </Button>
                        {canWrite ? (
                          <Button
                            size="sm"
                            disabled={retry.isPending && retry.variables?.id === e.id}
                            onClick={() => retry.mutate({ id: e.id })}
                          >
                            {retry.isPending && retry.variables?.id === e.id ? 'Retrying…' : 'Retry'}
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </TableCard>

      {canWrite && <ManualEnqueue />}

      {openPayload && <PayloadModal event={openPayload} onClose={() => setOpenPayload(null)} />}
    </AdminPage>
  );
}

function QueueStat({ label, value, unit, warn }: { label: string; value: number | string; unit?: string; warn?: boolean }) {
  return (
    <div className="px-2 py-3">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-5">{label}</dt>
      <dd className={cn('mt-1 text-sm font-semibold num-tabular', warn ? 'text-amber' : 'text-ink')}>
        {value}
        {unit && <span className="ml-0.5 text-[10px] font-normal text-ink-4">{unit}</span>}
      </dd>
    </div>
  );
}

/** Stacked column chart: one column per time bucket, one segment per queue. */
function ThroughputChart({ points }: { points: ThroughputPoint[] }) {
  const buckets = useMemo(() => {
    const by = new Map<number, Record<QueueName, number>>();
    for (const p of points) {
      const b = by.get(p.ts) ?? { audit: 0, notifications: 0, invoices: 0 };
      b[p.queue] += p.acks;
      by.set(p.ts, b);
    }
    return [...by.entries()].sort((a, b) => a[0] - b[0]);
  }, [points]);

  if (!buckets.length) {
    return (
      <div className="flex h-40 flex-col items-center justify-center rounded-xl text-center shadow-[inset_0_0_0_1px_rgba(12,14,11,0.08)] [border-style:dashed]">
        <TrendingUpIcon size={18} className="text-ink-5" />
        <p className="mt-2 text-sm text-ink-4">No throughput recorded in the last 24 hours.</p>
      </div>
    );
  }

  const totals = buckets.map(([, b]) => b.audit + b.notifications + b.invoices);
  const max = Math.max(1, ...totals);
  const sum = totals.reduce((n, t) => n + t, 0);
  const first = buckets[0]![0];
  const last = buckets[buckets.length - 1]![0];
  const time = (t: number) => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  return (
    <div>
      <div className="mb-4 flex items-baseline gap-2">
        <span className="vyro-metric text-2xl leading-none text-ink">{sum.toLocaleString()}</span>
        <span className="text-xs text-ink-4">messages acknowledged · peak {max.toLocaleString()} per bucket</span>
      </div>
      <div className="relative">
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="h-px w-full bg-ink/[0.06]" />
          ))}
        </div>
        <div className="relative flex h-40 items-end gap-px" role="img" aria-label={`Throughput chart, ${sum} messages over 24 hours`}>
          {buckets.map(([ts, b], i) => (
            <div
              key={ts}
              className="group/bar flex h-full min-w-[2px] flex-1 flex-col justify-end"
              title={`${time(ts)} — audit ${b.audit}, notifications ${b.notifications}, invoices ${b.invoices}`}
            >
              <div className="flex flex-col-reverse overflow-hidden rounded-t-[2px] transition-opacity group-hover/bar:opacity-70" style={{ height: `${(totals[i]! / max) * 100}%` }}>
                {QUEUES.map((q) =>
                  b[q] > 0 ? <span key={q} className={QUEUE_COLOR[q].bar} style={{ height: `${(b[q] / totals[i]!) * 100}%` }} /> : null,
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-ink-5 num-tabular">
        <span>{time(first)}</span>
        <span>{time(first + (last - first) / 2)}</span>
        <span>{time(last)}</span>
      </div>
    </div>
  );
}

function ManualEnqueue() {
  const enqueue = useManualEnqueue();
  const [open, setOpen] = useState(false);
  const [queue, setQueue] = useState<QueueName>('audit');
  const [raw, setRaw] = useState('{\n  \n}');
  const [confirming, setConfirming] = useState(false);

  let parsed: unknown = undefined;
  let parseError: string | null = null;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    parseError = (e as Error).message;
  }

  return (
    <Panel
      title="Manual enqueue"
      description="Send a raw JSON payload straight to a queue. Use with care: consumers process it as-is."
      icon={<LayersIcon size={16} />}
      actions={
        <Button size="sm" variant="ghost" onClick={() => setOpen((v) => !v)}>
          {open ? 'Hide' : 'Open'}
        </Button>
      }
      bodyClassName={open ? undefined : 'hidden'}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-4">Queue</span>
          <Segmented
            ariaLabel="Target queue"
            value={queue}
            onChange={setQueue}
            items={QUEUES.map((q) => ({ key: q, label: q[0]!.toUpperCase() + q.slice(1) }))}
          />
        </div>
        <div>
          <textarea
            value={raw}
            onChange={(e) => {
              setRaw(e.target.value);
              setConfirming(false);
            }}
            spellCheck={false}
            className={cn(
              controlClass,
              'h-40 w-full resize-y py-3 font-mono text-xs leading-relaxed',
              parseError && 'shadow-[inset_0_0_0_1px_rgba(196,90,74,0.6)]',
            )}
            aria-label="Queue payload JSON"
          />
          <p className={cn('mt-1.5 text-xs', parseError ? 'text-rose' : 'text-mint')}>
            {parseError ? `Invalid JSON: ${parseError}` : 'Valid JSON'}
          </p>
        </div>
        <div className="flex items-center justify-end gap-2">
          {confirming ? (
            <>
              <span className="text-xs text-ink-3">
                Send to <span className="font-semibold capitalize text-ink">{queue}</span>?
              </span>
              <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                variant="primary"
                disabled={enqueue.isPending}
                onClick={() => enqueue.mutate({ queue, payload: parsed }, { onSettled: () => setConfirming(false) })}
              >
                {enqueue.isPending ? 'Sending…' : 'Confirm send'}
              </Button>
            </>
          ) : (
            <Button size="sm" variant="primary" disabled={Boolean(parseError)} onClick={() => setConfirming(true)}>
              Send message
            </Button>
          )}
        </div>
        {enqueue.isSuccess && (
          <Callout tone="success" title="Message queued">
            <span className="font-mono text-xs">
              msgId {enqueue.data?.msgId} · eventId {enqueue.data?.eventId}
            </span>
          </Callout>
        )}
        {enqueue.isError && <Callout tone="danger" title="Couldn’t send">{(enqueue.error as Error).message}</Callout>}
      </div>
    </Panel>
  );
}

function PayloadModal({ event, onClose }: { event: QueueEvent; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Message ${event.id}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div className="vyro-floating w-full max-w-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 p-6 pb-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-rose/[0.1] text-rose">
              <AlertTriangleIcon size={18} />
            </span>
            <div className="min-w-0">
              <h2 className="font-sans text-lg font-semibold tracking-normal text-ink">Failed message</h2>
              <p className="mt-0.5 truncate font-mono text-xs text-ink-4">{event.msgId}</p>
            </div>
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
        <dl className="grid grid-cols-3 gap-px border-y border-ink/[0.07] bg-ink/[0.06]">
          {[
            ['Queue', <span className="capitalize">{event.queue}</span>],
            ['Event', <Pill tone={EVENT_TONE[event.event] ?? 'neutral'}>{event.event.toUpperCase()}</Pill>],
            ['Recorded', fmtClock(event.createdAt)],
          ].map(([k, v]) => (
            <div key={String(k)} className="bg-paper px-5 py-3">
              <dt className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-5">{k}</dt>
              <dd className="mt-1 text-[13px] text-ink">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="p-6 pt-4">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-4">Error</div>
          <pre className="max-h-[45vh] overflow-auto whitespace-pre-wrap break-all rounded-xl bg-ink p-4 font-mono text-xs leading-relaxed text-paper/85">
            {event.error ?? 'No error message was stored for this event.'}
          </pre>
        </div>
      </div>
    </div>
  );
}
