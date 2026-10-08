/**
 * AI product upload: supplier stages a price list CSV, a photographed/PDF
 * price list, or single product photos. The AI extracts candidate offer rows
 * through Cloudflare AI Gateway; the supplier reviews every row in the
 * staging table, then commit runs the existing import pipeline. AI proposals
 * for unknown products land in admin catalog moderation.
 */
import { useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import {
  UploadCloudIcon,
  CheckIcon,
  XIcon,
  AlertTriangleIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  FileTextIcon,
  LayersIcon,
  PackageIcon,
  SparklesIcon,
  ShieldCheckIcon,
  RefreshCwIcon,
} from '@/components/icons';
import { cn, useToast } from '@vyro/ui';
import { useSupplierId } from './useSupplierId';
import { SupplierErrorState } from './SupplierPageState';

const apiMsg = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong');

type UploadSession = {
  id: string;
  status: string;
  errorMessage: string | null;
  sourceKind: string;
};

type UploadRow = {
  id: string;
  rowIndex: number;
  productName: string;
  supplierSku: string | null;
  unit: string | null;
  priceLkr: number | null;
  minOrderQty: number | null;
  stockQty: number | null;
  confidence: number;
  matchType: 'offer' | 'product' | 'proposal' | 'none';
  matchProductId: string | null;
  decision: 'accepted' | 'edited' | 'rejected';
};

type CommitResult = {
  proposals: string[];
  summary: { created: number; updated: number; errors: number; rows: number };
  results: Array<{ row: number; status: string; message?: string }>;
};

const ACCEPT_TYPES = '.csv,.tsv,.txt,.jpg,.jpeg,.png,.webp,.pdf';

const SOURCE_LABEL: Record<string, string> = {
  csv: 'Spreadsheet (CSV)',
  tsv: 'Spreadsheet (TSV)',
  photo_pdf: 'Photo / PDF price list',
  product_photo: 'Product photo',
};

const MATCH_META: Record<UploadRow['matchType'], { label: string; className: string }> = {
  offer: { label: 'Updates listing', className: 'bg-mint/10 text-mint ring-mint/20' },
  product: { label: 'Matches catalog', className: 'bg-volt/20 text-volt-deep ring-volt/30' },
  proposal: { label: 'New · admin review', className: 'bg-amber/10 text-amber ring-amber/25' },
  none: { label: 'No match · skipped', className: 'bg-ink/[0.05] text-ink-4 ring-ink/10' },
};

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = reader.result as string;
      const base64 = res.split(',')[1] || res;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* ---------- Shared chrome ---------- */

type Step = 'upload' | 'extract' | 'review' | 'done';
const STEPS: Array<{ id: Step; label: string }> = [
  { id: 'upload', label: 'Upload' },
  { id: 'extract', label: 'AI extraction' },
  { id: 'review', label: 'Review' },
  { id: 'done', label: 'Commit' },
];

function PageShell({
  step,
  title,
  description,
  aside,
  children,
}: {
  step: Step;
  title: string;
  description?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
}) {
  const current = STEPS.findIndex((s) => s.id === step);
  return (
    <div className="mx-auto max-w-6xl space-y-8 pb-16">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Link
            to="/supplier/products"
            className="group inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-4 hover:text-ink transition-colors"
          >
            <ArrowLeftIcon size={14} className="transition-transform group-hover:-translate-x-0.5" />
            Products
          </Link>
          <ol className="flex items-center gap-1.5" aria-label="Upload progress">
            {STEPS.map((s, i) => {
              const done = i < current;
              const active = i === current;
              return (
                <li key={s.id} className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      'inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium transition-colors',
                      active && 'bg-ink text-paper',
                      done && 'text-ink-2',
                      !active && !done && 'text-ink-5',
                    )}
                  >
                    <span
                      className={cn(
                        'grid size-4 place-items-center rounded-full text-[9px] font-bold',
                        active && 'bg-volt text-ink',
                        done && 'bg-ink text-volt',
                        !active && !done && 'ring-1 ring-ink/20',
                      )}
                    >
                      {done ? <CheckIcon size={9} /> : i + 1}
                    </span>
                    <span className={cn(!active && 'hidden sm:inline')}>{s.label}</span>
                  </span>
                  {i < STEPS.length - 1 && <span className={cn('h-px w-4 sm:w-6', done ? 'bg-ink/40' : 'bg-ink/10')} />}
                </li>
              );
            })}
          </ol>
        </div>

        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-5">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full bg-ink px-3 py-1 text-[11px] font-mono uppercase tracking-[0.16em] text-volt">
              <SparklesIcon size={12} />
              AI catalog import
            </span>
            <h1 className="mt-4 font-display text-[32px] sm:text-[40px] leading-[1.05] font-bold tracking-[-0.035em] text-ink">
              {title}
            </h1>
            {description && <p className="mt-3 text-[15px] leading-relaxed text-ink-3">{description}</p>}
          </div>
          {aside}
        </div>
      </div>
      {children}
    </div>
  );
}

function SafetyNote() {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-paper px-3.5 py-2 text-[12px] font-medium text-ink-3 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.08)]">
      <ShieldCheckIcon size={14} className="text-mint" />
      Nothing goes live until you commit
    </span>
  );
}

/* ---------- Staged session ---------- */

function AiUploadPageStaged({ sessionId, onReset }: { sessionId: string; onReset: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const q = useQuery<{ session: UploadSession; rows: UploadRow[] }>({
    queryKey: ['ai-upload', sessionId],
    queryFn: () => api.get(`/ai/product-uploads/${sessionId}`),
    // Poll while the queue works.
    refetchInterval: (query) => {
      const st = query.state.data?.session.status;
      return st === 'pending' || st === 'extracting' ? 2000 : false;
    },
  });

  const editRow = useMutation({
    mutationFn: async ({ row, patch }: { row: UploadRow; patch: Record<string, unknown> }) =>
      api.patch(`/ai/product-uploads/${sessionId}/rows/${row.id}`, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai-upload', sessionId] }),
    onError: (e) => toast.error('Could not save the row', apiMsg(e)),
  });

  const shippable = q.data?.session.status === 'extracted';
  const commit = useMutation({
    mutationFn: async () => api.post<CommitResult>(`/ai/product-uploads/${sessionId}/commit`, {}),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['ai-upload', sessionId] });
      toast.success(
        data.summary.errors > 0
          ? `Committed with ${data.summary.errors} error(s)`
          : 'Upload committed',
        data.proposals.length
          ? `${data.proposals.length} new product(s) await admin review`
          : undefined,
      );
    },
    onError: (e) => toast.error('Commit failed', apiMsg(e)),
  });

  if (q.isLoading || (q.data && ['pending', 'extracting'].includes(q.data.session.status))) {
    return <ExtractingState sourceKind={q.data?.session.sourceKind} />;
  }
  if (q.isError) {
    return (
      <PageShell step="extract" title="Couldn't load this upload">
        <SupplierErrorState message={apiMsg(q.error)} onRetry={() => q.refetch()} />
      </PageShell>
    );
  }

  const { session, rows } = q.data!;
  const rejected = rows.filter((r) => r.decision === 'rejected');
  const active = rows.filter((r) => r.decision !== 'rejected');
  const named = active.filter((r) => r.productName.trim().length > 0);
  const lowConfidence = active.filter((r) => r.confidence < 60).length;
  const proposals = active.filter((r) => r.matchType === 'proposal').length;
  const commitResult = commit.data;

  if (commitResult || session.status === 'committed') {
    return <CommittedState result={commitResult} onReset={onReset} />;
  }

  if (session.status === 'failed') {
    return (
      <PageShell step="extract" title="We couldn't read that file">
        <div className="mx-auto max-w-2xl vyro-surface rounded-2xl p-8 text-center">
          <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-rose/10 text-rose">
            <AlertTriangleIcon size={22} />
          </div>
          <p className="mt-5 text-[15px] text-ink-2">{session.errorMessage ?? 'Could not read this file.'}</p>
          <p className="mt-2 text-[13px] text-ink-4">
            Try a clearer photo, a CSV export, or a PDF with selectable text.
          </p>
          <button type="button" onClick={onReset} className={cn(primaryBtn, 'mt-6')}>
            <UploadCloudIcon size={15} />
            Try another file
          </button>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell
      step="review"
      title="Review staged rows"
      description={
        <>
          {SOURCE_LABEL[session.sourceKind] ?? 'Upload'} · edit names and prices inline, drop anything you
          don't want. Changes save when you leave a field.
        </>
      }
      aside={<SafetyNote />}
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label="Ready to commit" value={named.length} sub={`of ${active.length} kept rows`} tone="ink" />
        <StatTile label="Needs a look" value={lowConfidence} sub="Confidence under 60%" tone={lowConfidence ? 'rose' : 'muted'} />
        <StatTile label="New products" value={proposals} sub="Sent to admin review" tone={proposals ? 'amber' : 'muted'} />
        <StatTile label="Dropped" value={rejected.length} sub="Won't be imported" tone="muted" />
      </div>

      {session.errorMessage && (
        <div className="flex items-start gap-3 rounded-xl bg-amber/[0.08] px-4 py-3 text-[13px] text-ink-2 ring-1 ring-inset ring-amber/20">
          <AlertTriangleIcon size={16} className="mt-0.5 shrink-0 text-amber" />
          {session.errorMessage}
        </div>
      )}

      <div className="vyro-surface rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink/[0.08] bg-ink/[0.025] text-left text-[11px] font-medium uppercase tracking-[0.12em] text-ink-4">
                <th className="pl-5 pr-3 py-3 w-10">#</th>
                <th className="px-3 py-3 min-w-[240px]">Product</th>
                <th className="px-3 py-3">Unit</th>
                <th className="px-3 py-3">Price (LKR)</th>
                <th className="px-3 py-3">MOQ</th>
                <th className="px-3 py-3">Match</th>
                <th className="px-3 py-3">Confidence</th>
                <th className="pl-3 pr-5 py-3 text-right">Keep</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/[0.06]">
              {rows.map((row) => {
                const dropped = row.decision === 'rejected';
                const match = MATCH_META[row.matchType] ?? MATCH_META.none;
                return (
                  <tr
                    key={row.id}
                    className={cn('group transition-colors hover:bg-ink/[0.02]', dropped && 'bg-ink/[0.015]')}
                  >
                    <td className="pl-5 pr-3 py-3 text-[12px] tabular-nums text-ink-5">{row.rowIndex + 1}</td>
                    <td className={cn('px-3 py-3', dropped && 'opacity-45')}>
                      <InlineField
                        key={`${row.id}:${row.productName}`}
                        initial={row.productName}
                        placeholder="Product name"
                        disabled={dropped}
                        onCommit={(v) =>
                          editRow.mutate({ row, patch: { decision: 'edited', edited: { productName: v } } })
                        }
                      />
                      {row.supplierSku && (
                        <div className="mt-1 pl-2.5 font-mono text-[11px] text-ink-4">SKU {row.supplierSku}</div>
                      )}
                    </td>
                    <td className={cn('px-3 py-3 text-[13px] text-ink-3', dropped && 'opacity-45')}>
                      {row.unit ?? <span className="text-ink-5">—</span>}
                    </td>
                    <td className={cn('px-3 py-3 w-36', dropped && 'opacity-45')}>
                      <InlineField
                        key={`${row.id}:${row.priceLkr ?? ''}`}
                        initial={row.priceLkr == null ? '' : String(row.priceLkr)}
                        placeholder="0"
                        numeric
                        disabled={dropped}
                        onCommit={(v) =>
                          v !== '' &&
                          editRow.mutate({ row, patch: { decision: 'edited', edited: { priceLkr: Number(v) } } })
                        }
                      />
                    </td>
                    <td className={cn('px-3 py-3 text-[13px] tabular-nums text-ink-3', dropped && 'opacity-45')}>
                      {row.minOrderQty ?? <span className="text-ink-5">—</span>}
                    </td>
                    <td className={cn('px-3 py-3', dropped && 'opacity-45')}>
                      <span
                        className={cn(
                          'inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ring-inset',
                          match.className,
                        )}
                      >
                        {match.label}
                      </span>
                    </td>
                    <td className={cn('px-3 py-3', dropped && 'opacity-45')}>
                      <ConfidenceMeter value={row.confidence} />
                    </td>
                    <td className="pl-3 pr-5 py-3 text-right">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={!dropped}
                        aria-label={dropped ? 'Keep row' : 'Drop row'}
                        disabled={editRow.isPending}
                        onClick={() =>
                          editRow.mutate({ row, patch: { decision: dropped ? 'accepted' : 'rejected' } })
                        }
                        className={cn(
                          'inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12px] font-medium transition-all cursor-pointer disabled:opacity-60',
                          dropped
                            ? 'bg-paper text-ink-3 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.15)] hover:text-ink'
                            : 'bg-ink/[0.05] text-ink-2 hover:bg-rose/10 hover:text-rose',
                        )}
                      >
                        {dropped ? <CheckIcon size={13} /> : <XIcon size={13} />}
                        {dropped ? 'Keep' : 'Drop'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && (
          <div className="px-6 py-14 text-center">
            <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-ink/[0.05] text-ink-3">
              <FileTextIcon size={18} />
            </div>
            <div className="mt-4 font-display text-[15px] font-semibold text-ink">No rows found</div>
            <p className="mt-1 text-[13px] text-ink-4">The AI couldn't find product rows in this file.</p>
          </div>
        )}
      </div>

      {/* Sticky commit bar */}
      <div className="sticky bottom-4 z-10">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-2xl bg-ink px-5 py-4 text-paper shadow-[0_24px_60px_-24px_rgba(12,14,11,0.7)]">
          <div className="min-w-0">
            <div className="text-[14px] font-semibold">
              {named.length} row{named.length === 1 ? '' : 's'} ready to import
            </div>
            <p className="text-[12px] text-paper/50 mt-0.5">
              Rows marked “New · admin review” stay hidden until an admin approves them.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onReset}
              className="inline-flex h-11 items-center rounded-xl px-4 text-[13px] font-medium text-paper/70 hover:text-paper hover:bg-paper/[0.08] transition-colors cursor-pointer"
            >
              Start over
            </button>
            <button
              type="button"
              disabled={!shippable || named.length === 0 || editRow.isPending || commit.isPending}
              onClick={() => commit.mutate()}
              className="group inline-flex h-11 items-center gap-2 rounded-xl bg-volt px-5 text-sm font-semibold text-ink transition-all hover:bg-volt-glow hover:-translate-y-px disabled:opacity-40 disabled:hover:translate-y-0 cursor-pointer disabled:cursor-not-allowed"
            >
              {commit.isPending ? <RefreshCwIcon size={15} className="animate-spin" /> : <CheckIcon size={15} />}
              {commit.isPending ? 'Committing…' : `Commit ${named.length} row${named.length === 1 ? '' : 's'}`}
            </button>
          </div>
        </div>
      </div>
    </PageShell>
  );
}

function ExtractingState({ sourceKind }: { sourceKind?: string | undefined }) {
  return (
    <PageShell
      step="extract"
      title="Reading your upload…"
      description="The AI is extracting product names, units, prices and MOQs. This usually takes a few seconds."
    >
      <div className="mx-auto max-w-3xl vyro-surface rounded-2xl overflow-hidden">
        <div className="relative h-56 overflow-hidden bg-ink">
          <div
            aria-hidden
            className="absolute inset-0 opacity-[0.07] [background-image:linear-gradient(rgba(250,247,240,1)_1px,transparent_1px),linear-gradient(90deg,rgba(250,247,240,1)_1px,transparent_1px)] [background-size:24px_24px]"
          />
          <div className="absolute inset-x-10 top-8 bottom-8 space-y-3">
            {[92, 74, 86, 60, 80].map((w, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-2.5 rounded-full bg-paper/10" style={{ width: `${w * 0.55}%` }} />
                <div className="h-2.5 w-16 rounded-full bg-paper/10" />
                <div className="ml-auto h-2.5 w-12 rounded-full bg-volt/30" />
              </div>
            ))}
          </div>
          <div
            aria-hidden
            className="absolute inset-x-0 h-16 bg-gradient-to-b from-transparent via-volt/25 to-transparent animate-[ai-scan_2.2s_ease-in-out_infinite]"
          />
          <div className="absolute bottom-4 left-5 inline-flex items-center gap-2 rounded-full bg-paper/10 px-3 py-1.5 text-[12px] text-paper/80 backdrop-blur">
            <span className="size-1.5 rounded-full bg-volt animate-pulse" />
            {sourceKind ? SOURCE_LABEL[sourceKind] ?? 'Upload' : 'Upload'}
          </div>
        </div>
        <ul className="grid sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-ink/[0.08]">
          {['Detecting table & columns', 'Matching against catalog', 'Scoring confidence'].map((t, i) => (
            <li key={t} className="flex items-center gap-3 px-5 py-4 text-[13px] text-ink-3">
              <span
                className="size-2 rounded-full bg-volt-deep animate-pulse"
                style={{ animationDelay: `${i * 300}ms` }}
              />
              {t}
            </li>
          ))}
        </ul>
      </div>
      <style>{'@keyframes ai-scan{0%{top:-4rem}100%{top:100%}}'}</style>
    </PageShell>
  );
}

function CommittedState({ result, onReset }: { result?: CommitResult | undefined; onReset: () => void }) {
  const errors = result?.results.filter((r) => r.status === 'error') ?? [];
  return (
    <PageShell step="done" title={result ? 'Upload processed' : 'Already committed'}>
      <div className="mx-auto max-w-3xl space-y-5">
        <div className="vyro-surface rounded-2xl p-7 sm:p-9 text-center">
          <div className="mx-auto grid size-16 place-items-center rounded-full bg-mint/10 ring-8 ring-mint/[0.05] text-mint">
            <CheckIcon size={26} />
          </div>
          <h2 className="mt-5 font-display text-2xl tracking-[-0.03em] text-ink">
            {result ? 'Your catalog is updated' : 'This upload was already committed'}
          </h2>
          <p className="mt-2 text-[14px] text-ink-4">
            {result
              ? `${result.summary.rows} row${result.summary.rows === 1 ? '' : 's'} went through the import pipeline.`
              : 'Its rows are already in your products list.'}
          </p>

          {result && (
            <div className="mt-7 grid grid-cols-3 gap-px overflow-hidden rounded-xl bg-ink/[0.08] ring-1 ring-ink/[0.08]">
              {[
                { label: 'Created', value: result.summary.created, tone: 'text-mint' },
                { label: 'Updated', value: result.summary.updated, tone: 'text-ink' },
                { label: 'Errors', value: result.summary.errors, tone: result.summary.errors ? 'text-rose' : 'text-ink-5' },
              ].map((s) => (
                <div key={s.label} className="bg-paper px-4 py-5">
                  <div className={cn('text-[30px] font-semibold leading-none tabular-nums tracking-[-0.03em]', s.tone)}>
                    {s.value}
                  </div>
                  <div className="mt-2 text-[12px] text-ink-4">{s.label}</div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-7 flex flex-wrap items-center justify-center gap-2.5">
            <Link to="/supplier/products" className={primaryBtn}>
              View products
              <ArrowRightIcon size={15} />
            </Link>
            <button type="button" onClick={onReset} className={secondaryBtn}>
              <UploadCloudIcon size={15} />
              Upload another
            </button>
          </div>
        </div>

        {result && result.proposals.length > 0 && (
          <div className="flex items-start gap-3 rounded-2xl bg-amber/[0.07] px-5 py-4 ring-1 ring-inset ring-amber/20">
            <SparklesIcon size={16} className="mt-0.5 shrink-0 text-amber" />
            <div className="text-[13px] text-ink-2">
              <div className="font-semibold">
                {result.proposals.length} new product{result.proposals.length > 1 ? 's' : ''} sent for admin review
              </div>
              <div className="mt-1 text-ink-4">{result.proposals.join(', ')}</div>
            </div>
          </div>
        )}

        {errors.length > 0 && (
          <div className="vyro-surface rounded-2xl overflow-hidden">
            <div className="px-5 py-3 border-b border-ink/[0.08] text-[13px] font-semibold text-rose">
              {errors.length} row{errors.length === 1 ? '' : 's'} failed
            </div>
            <ul className="divide-y divide-ink/[0.06]">
              {errors.map((r) => (
                <li key={r.row} className="flex items-start gap-3 px-5 py-3 text-[13px]">
                  <span className="shrink-0 rounded-md bg-rose/10 px-1.5 py-0.5 font-mono text-[11px] text-rose">
                    Row {r.row}
                  </span>
                  <span className="text-ink-3">{r.message}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </PageShell>
  );
}

/* ---------- Small pieces ---------- */

const primaryBtn =
  'group inline-flex h-11 items-center gap-2 rounded-xl bg-ink px-5 text-sm font-semibold text-paper transition-all hover:-translate-y-px cursor-pointer';
const secondaryBtn =
  'inline-flex h-11 items-center gap-2 rounded-xl bg-paper px-5 text-sm font-semibold text-ink shadow-[inset_0_0_0_1px_rgba(12,14,11,0.14)] transition-colors hover:bg-ink hover:text-paper cursor-pointer';

/** Text cell that edits locally and saves once on blur / Enter. */
function InlineField({
  initial,
  placeholder,
  numeric,
  disabled,
  onCommit,
}: {
  initial: string;
  placeholder?: string;
  numeric?: boolean;
  disabled?: boolean;
  onCommit: (value: string) => void;
}) {
  const [value, setValue] = useState(initial);
  const save = () => {
    const v = value.trim();
    if (v !== initial) onCommit(v);
  };
  return (
    <input
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      type={numeric ? 'number' : 'text'}
      min={numeric ? 0 : undefined}
      inputMode={numeric ? 'decimal' : undefined}
      onChange={(e) => setValue(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          setValue(initial);
          e.currentTarget.blur();
        }
      }}
      className={cn(
        'w-full rounded-lg bg-transparent px-2.5 py-1.5 text-[13px] text-ink-1 outline-none transition-all',
        'hover:bg-ink/[0.04] focus:bg-paper focus:shadow-[inset_0_0_0_1.5px_rgba(12,14,11,0.7)]',
        'placeholder:text-ink-5 disabled:pointer-events-none',
        numeric ? 'tabular-nums font-medium' : 'font-medium',
      )}
    />
  );
}

function ConfidenceMeter({ value }: { value: number }) {
  const tone = value >= 85 ? 'bg-mint' : value >= 60 ? 'bg-amber' : 'bg-rose';
  return (
    <div className="flex items-center gap-2 min-w-[96px]">
      <div className="h-1.5 w-14 overflow-hidden rounded-full bg-ink/[0.07]">
        <div className={cn('h-full rounded-full', tone)} style={{ width: `${Math.max(4, Math.min(100, value))}%` }} />
      </div>
      <span className={cn('text-[12px] tabular-nums', value < 60 ? 'text-rose font-medium' : 'text-ink-3')}>
        {value}%
      </span>
    </div>
  );
}

function StatTile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: number;
  sub: string;
  tone: 'ink' | 'rose' | 'amber' | 'muted';
}) {
  return (
    <div className="vyro-surface rounded-2xl p-5">
      <div className="flex items-center gap-2 text-[12px] font-medium text-ink-3">
        <span
          className={cn(
            'size-2 rounded-full',
            tone === 'ink' && 'bg-volt-deep',
            tone === 'rose' && 'bg-rose',
            tone === 'amber' && 'bg-amber',
            tone === 'muted' && 'bg-ink/15',
          )}
        />
        {label}
      </div>
      <div
        className={cn(
          'mt-2.5 text-[30px] font-semibold leading-none tabular-nums tracking-[-0.03em]',
          tone === 'muted' && value === 0 ? 'text-ink-5' : 'text-ink',
        )}
      >
        {value}
      </div>
      <div className="mt-2 text-[12px] text-ink-4">{sub}</div>
    </div>
  );
}

/* ---------- Landing ---------- */

const SOURCES = [
  {
    icon: <FileTextIcon size={17} />,
    title: 'Spreadsheet',
    body: 'CSV or TSV export from Excel, Sheets or your POS.',
    meta: '.csv · .tsv',
  },
  {
    icon: <LayersIcon size={17} />,
    title: 'Price list photo or PDF',
    body: 'Printed lists, scans, even WhatsApp-forwarded images.',
    meta: '.jpg · .png · .pdf',
  },
  {
    icon: <PackageIcon size={17} />,
    title: 'Single product photo',
    body: 'Snap a pack — AI reads brand, size and unit.',
    meta: '.jpg · .png · .webp',
  },
];

export function AiUploadLanding({ supplierId }: { supplierId: string | null }) {
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const base64 = await fileToBase64(file);
      return api.post<{ sessionId: string; status: string }>('/ai/product-uploads', {
        supplierId,
        filename: file.name,
        contentType: file.type || 'text/csv',
        base64,
      });
    },
    onSuccess: (data) => setSessionId(data.sessionId),
    onError: (e) => {
      setErrorCode(apiMsg(e));
      toast.error('Upload failed', apiMsg(e));
    },
  });

  const reset = () => {
    setSessionId(null);
    setFileName(null);
    setErrorCode(null);
    if (fileInput.current) fileInput.current.value = '';
  };

  if (sessionId) return <AiUploadPageStaged sessionId={sessionId} onReset={reset} />;

  const pick = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file || !supplierId) return;
    if (!/\.(csv|tsv|txt|jpe?g|png|webp|pdf)$/i.test(file.name)) {
      setErrorCode('Spreadsheets must be re-exported as CSV — photos, PDFs, JPEG/PNG/WebP are fine');
      return;
    }
    if (file.size > 7.5 * 1024 * 1024) {
      setErrorCode('File too large (max 7.5 MB)');
      return;
    }
    setErrorCode(null);
    setFileName(file.name);
    setUploading(true);
    try {
      await upload.mutateAsync(file);
    } catch {
      setFileName(null);
    } finally {
      setUploading(false);
    }
  };

  return (
    <PageShell
      step="upload"
      title="Upload products with AI"
      description="Drop a price list or product photo. The AI reads it and stages every row for your review."
      aside={<SafetyNote />}
    >
      <div className="grid lg:grid-cols-12 gap-5">
        {/* Dropzone */}
        <div
          role="button"
          tabIndex={0}
          aria-disabled={uploading || !supplierId}
          onClick={() => !uploading && fileInput.current?.click()}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === ' ') && !uploading) {
              e.preventDefault();
              fileInput.current?.click();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            if (!dragging) setDragging(true);
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (!uploading) void pick(e.dataTransfer.files);
          }}
          className={cn(
            'lg:col-span-8 group relative flex min-h-[380px] cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl p-10 text-center transition-all duration-300 outline-none',
            'bg-paper shadow-[inset_0_0_0_1px_rgba(12,14,11,0.08)] hover:shadow-[0_24px_60px_-30px_rgba(12,14,11,0.35),inset_0_0_0_1px_rgba(12,14,11,0.14)]',
            'focus-visible:shadow-[inset_0_0_0_2px_rgba(12,14,11,0.8)]',
            dragging && 'bg-volt/[0.08] shadow-[inset_0_0_0_2px_rgba(122,143,34,0.7)]',
            uploading && 'cursor-progress',
          )}
        >
          {/* dashed inner frame */}
          <div
            aria-hidden
            className={cn(
              'pointer-events-none absolute inset-3 rounded-xl border-2 border-dashed transition-colors',
              dragging ? 'border-volt-deep/50' : 'border-ink/[0.09] group-hover:border-ink/20',
            )}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -top-24 left-1/2 size-80 -translate-x-1/2 rounded-full bg-volt/20 blur-3xl opacity-60 transition-opacity group-hover:opacity-100"
          />

          <div className="relative">
            <div
              className={cn(
                'mx-auto grid size-20 place-items-center rounded-[22px] bg-ink text-volt shadow-[0_18px_40px_-16px_rgba(12,14,11,0.7)] transition-transform duration-300',
                dragging ? 'scale-110 -rotate-3' : 'group-hover:-translate-y-1',
              )}
            >
              {uploading ? <RefreshCwIcon size={28} className="animate-spin" /> : <UploadCloudIcon size={30} />}
            </div>

            <h2 className="mt-7 font-display text-[22px] font-bold tracking-[-0.02em] text-ink">
              {uploading ? 'Uploading…' : dragging ? 'Release to upload' : 'Drop your file here'}
            </h2>
            <p className="mt-2 text-[14px] text-ink-4">
              {uploading && fileName ? (
                <span className="font-medium text-ink-2">{fileName}</span>
              ) : (
                <>
                  or <span className="font-semibold text-ink underline decoration-volt decoration-2 underline-offset-4">browse your device</span>
                </>
              )}
            </p>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
              {['CSV', 'TSV', 'PDF', 'JPG', 'PNG', 'WebP'].map((t) => (
                <span
                  key={t}
                  className="rounded-md bg-ink/[0.045] px-2 py-1 font-mono text-[10px] font-semibold tracking-wider text-ink-3"
                >
                  {t}
                </span>
              ))}
            </div>
            <p className="mt-4 text-[12px] text-ink-4">
              Up to 7.5 MB · up to 200 rows · .xlsx must be exported as CSV first
            </p>
          </div>
        </div>

        {/* Sources */}
        <div className="lg:col-span-4 flex flex-col gap-3">
          <div className="px-1 text-[11px] font-mono uppercase tracking-[0.18em] text-ink-4">What you can upload</div>
          {SOURCES.map((s) => (
            <div key={s.title} className="vyro-surface rounded-2xl p-4 flex items-start gap-3.5">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-ink/[0.05] text-ink-2">{s.icon}</span>
              <div className="min-w-0">
                <div className="text-[14px] font-semibold text-ink">{s.title}</div>
                <p className="mt-0.5 text-[12px] leading-relaxed text-ink-4">{s.body}</p>
                <div className="mt-1.5 font-mono text-[10px] tracking-wide text-ink-5">{s.meta}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <input
        ref={fileInput}
        type="file"
        accept={ACCEPT_TYPES}
        className="hidden"
        onChange={(e) => void pick(e.target.files)}
      />

      {errorCode && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl bg-amber/[0.08] px-4 py-3 text-[13px] text-ink-2 ring-1 ring-inset ring-amber/25"
        >
          <AlertTriangleIcon size={16} className="mt-0.5 shrink-0 text-amber" />
          <span className="flex-1">{errorCode}</span>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => setErrorCode(null)}
            className="text-ink-4 hover:text-ink cursor-pointer"
          >
            <XIcon size={14} />
          </button>
        </div>
      )}

      {/* How it works */}
      <div className="grid sm:grid-cols-3 gap-px overflow-hidden rounded-2xl bg-ink/[0.08] ring-1 ring-ink/[0.08]">
        {[
          { n: '01', t: 'AI extracts', d: 'Names, units, prices and MOQs are read into a staging table.' },
          { n: '02', t: 'You review', d: 'Fix anything inline, drop rows you don’t want, check confidence.' },
          { n: '03', t: 'Commit', d: 'Matches update listings; unknown products go to admin review.' },
        ].map((s) => (
          <div key={s.n} className="bg-paper p-5">
            <div className="font-mono text-[11px] font-semibold text-volt-deep">{s.n}</div>
            <div className="mt-2 text-[14px] font-semibold text-ink">{s.t}</div>
            <p className="mt-1 text-[12px] leading-relaxed text-ink-4">{s.d}</p>
          </div>
        ))}
      </div>
    </PageShell>
  );
}

export default function AiUploadPage() {
  const { supplierId } = useSupplierId();
  return <AiUploadLanding supplierId={supplierId} />;
}
