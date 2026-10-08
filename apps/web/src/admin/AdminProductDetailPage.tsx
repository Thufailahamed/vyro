import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { cn, useToast } from '@vyro/ui';
import { ApiError } from '@/lib/api';
import { ErrorBanner } from '@/components/ui';
import {
  ArrowLeftIcon,
  SparklesIcon,
  CopyIcon,
  CheckCheckIcon,
  ClockIcon,
  ShieldCheckIcon,
  RefreshCwIcon,
  CheckIcon,
} from '@/components/icons';
import { useAdminProduct, useUpdateProduct, useToggleFeatured, type ProductDetail } from './useAdminCatalog';
import { usePermission } from './lib/permissions';
import { Skeleton, controlClass } from './ui';
import { ProductThumb, Switch } from './catalogUi';

const fieldClass = cn(controlClass, 'h-11 w-full rounded-xl');
const areaClass = cn(controlClass, 'h-auto w-full rounded-xl py-2.5 leading-relaxed resize-y');

function fmtDate(ms: number) {
  return new Date(ms).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function relative(ms: number) {
  const diff = Date.now() - ms;
  const m = Math.round(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return fmtDate(ms);
}

export function AdminProductDetailPage() {
  const { id = '' } = useParams();
  const q = useAdminProduct(id ?? null);
  const err = q.error instanceof Error ? q.error.message : null;

  if (err) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 pb-16">
        <BackLink />
        <ErrorBanner message={err} />
      </div>
    );
  }
  if (!q.data) return <DetailSkeleton />;
  // Remount the editor when the record changes so defaults reflect the saved state.
  return <ProductEditor key={q.data.product.updatedAt} data={q.data} />;
}

function BackLink() {
  return (
    <Link
      to="/admin/catalog"
      className="group inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-4 transition-colors hover:text-ink"
    >
      <ArrowLeftIcon size={14} className="transition-transform group-hover:-translate-x-0.5" />
      Catalog
    </Link>
  );
}

function ProductEditor({ data }: { data: ProductDetail }) {
  const p = data.product;
  const toast = useToast();
  const canModerate = Boolean(usePermission('product:moderate'));
  const update = useUpdateProduct(p.id);
  const toggleFeatured = useToggleFeatured(p.id);
  const [dirty, setDirty] = useState(false);
  const [active, setActive] = useState(p.active);
  const [copied, setCopied] = useState(false);
  const readOnly = !canModerate;
  const categoryName = data.category?.name ?? p.categoryName ?? p.categoryId;

  const onError = (e: unknown) =>
    toast.error('Could not save', e instanceof ApiError ? e.message : 'Please refresh and try again.');

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(p.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <form
      className="mx-auto max-w-6xl space-y-6 pb-28"
      onChange={() => setDirty(true)}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        update.mutate(
          {
            name: String(fd.get('name') ?? p.name),
            description: fd.get('description') ? String(fd.get('description')) : null,
            brand: fd.get('brand') ? String(fd.get('brand')) : null,
            packSize: fd.get('packSize') ? String(fd.get('packSize')) : null,
            unit: String(fd.get('unit') ?? p.unit),
            hsCode: fd.get('hsCode') ? String(fd.get('hsCode')) : null,
            countryOfOrigin: fd.get('countryOfOrigin') ? String(fd.get('countryOfOrigin')).toUpperCase() : null,
            active,
            moderationNotes: fd.get('moderationNotes') ? String(fd.get('moderationNotes')) : null,
            expectedUpdatedAt: p.updatedAt,
          },
          {
            onSuccess: () => toast.success('Product saved'),
            onError,
          },
        );
      }}
    >
      <BackLink />

      {/* Identity header */}
      <header className="vyro-surface relative overflow-hidden rounded-2xl p-6 sm:p-7">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-volt/15 blur-3xl" />
        <div className="relative flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <ProductThumb
              productId={p.id}
              imageUrl={data.images?.[0]?.url}
              name={p.name}
              seed={p.categoryId}
              size="lg"
              muted={!p.active}
            />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-ink/[0.05] px-2.5 py-0.5 text-[11px] font-medium text-ink-2">{categoryName}</span>
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium',
                    p.active ? 'bg-mint/10 text-mint' : 'bg-ink/[0.06] text-ink-4',
                  )}
                >
                  <span className={cn('size-1.5 rounded-full', p.active ? 'bg-mint' : 'bg-ink-4')} />
                  {p.active ? 'Active in store' : 'Hidden'}
                </span>
                {p.featured && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-volt px-2.5 py-0.5 text-[11px] font-semibold text-ink">
                    <SparklesIcon size={11} /> Featured
                  </span>
                )}
              </div>
              <h1 className="mt-2 truncate font-display text-[26px] sm:text-[32px] font-bold leading-tight tracking-[-0.03em] text-ink">
                {p.name}
              </h1>
              <p className="mt-1 text-[14px] text-ink-4">
                {p.brand ?? 'No brand'} · {p.packSize ? `${p.packSize} / ` : ''}
                {p.unit}
              </p>
            </div>
          </div>
          {canModerate && (
            <button
              type="button"
              disabled={toggleFeatured.isPending}
              onClick={() =>
                toggleFeatured.mutate(!p.featured, {
                  onSuccess: () => toast.success(p.featured ? 'Removed from showcase' : 'Added to showcase'),
                  onError,
                })
              }
              className={cn(
                'inline-flex h-11 shrink-0 items-center gap-2 rounded-xl px-4 text-[13px] font-semibold transition-all cursor-pointer disabled:opacity-60',
                p.featured
                  ? 'bg-paper text-ink shadow-[inset_0_0_0_1px_rgba(12,14,11,0.15)] hover:bg-ink/[0.04]'
                  : 'bg-ink text-paper hover:-translate-y-px',
              )}
            >
              <SparklesIcon size={15} className={p.featured ? 'text-ink-4' : 'text-volt'} />
              {p.featured ? 'Unfeature' : 'Feature in showcase'}
            </button>
          )}
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-12">
        {/* Main form */}
        <div className="space-y-5 lg:col-span-8">
          <FormSection title="Basics" description="What buyers see on listings and search.">
            <Field label="Product name" htmlFor="name">
              <input id="name" name="name" defaultValue={p.name} required readOnly={readOnly} className={fieldClass} />
            </Field>
            <Field label="Description" htmlFor="description" hint="Shown on the product page. Plain text.">
              <textarea
                id="description"
                name="description"
                defaultValue={p.description ?? ''}
                rows={4}
                readOnly={readOnly}
                className={areaClass}
              />
            </Field>
          </FormSection>

          <FormSection title="Packaging" description="How the product is sold and counted.">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Brand" htmlFor="brand">
                <input id="brand" name="brand" defaultValue={p.brand ?? ''} readOnly={readOnly} className={fieldClass} />
              </Field>
              <Field label="Unit" htmlFor="unit">
                <input id="unit" name="unit" defaultValue={p.unit} required readOnly={readOnly} className={fieldClass} />
              </Field>
              <Field label="Pack size" htmlFor="packSize">
                <input
                  id="packSize"
                  name="packSize"
                  defaultValue={p.packSize ?? ''}
                  placeholder="e.g. 25kg"
                  readOnly={readOnly}
                  className={fieldClass}
                />
              </Field>
            </div>
          </FormSection>

          <FormSection title="Trade & compliance" description="Used on invoices and for import duty classification.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="HS / tariff code" htmlFor="hsCode">
                <input
                  id="hsCode"
                  name="hsCode"
                  defaultValue={p.hsCode ?? ''}
                  placeholder="0901.21"
                  readOnly={readOnly}
                  className={cn(fieldClass, 'font-mono')}
                />
              </Field>
              <Field label="Country of origin" htmlFor="countryOfOrigin" hint="ISO 2-letter code">
                <input
                  id="countryOfOrigin"
                  name="countryOfOrigin"
                  defaultValue={p.countryOfOrigin ?? ''}
                  placeholder="LK"
                  maxLength={2}
                  readOnly={readOnly}
                  className={cn(fieldClass, 'font-mono uppercase')}
                />
              </Field>
            </div>
          </FormSection>

          <FormSection title="Moderation notes" description="Internal only — never shown to sellers or buyers.">
            <textarea
              name="moderationNotes"
              aria-label="Moderation notes"
              defaultValue={p.moderationNotes ?? ''}
              rows={3}
              placeholder="Why this product was edited, hidden or merged…"
              readOnly={readOnly}
              className={areaClass}
            />
          </FormSection>
        </div>

        {/* Sidebar */}
        <aside className="space-y-5 lg:col-span-4">
          <div className="vyro-surface rounded-2xl p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[14px] font-semibold text-ink">Visible in store</div>
                <p className="mt-1 text-[12px] leading-relaxed text-ink-4">
                  Hidden products can't be listed or ordered. Existing orders are unaffected.
                </p>
              </div>
              <Switch
                checked={active}
                disabled={readOnly}
                label="Active in store"
                onChange={(next) => {
                  setActive(next);
                  setDirty(true);
                }}
              />
            </div>
          </div>

          <div className="vyro-surface rounded-2xl">
            <div className="border-b border-ink/[0.07] px-5 py-3.5 text-[13px] font-semibold text-ink">Record</div>
            <dl className="divide-y divide-ink/[0.06] text-[13px]">
              <Fact label="Product ID">
                <button
                  type="button"
                  onClick={() => void copyId()}
                  className="group/copy inline-flex items-center gap-1.5 rounded-md bg-ink/[0.05] px-2 py-0.5 font-mono text-[11px] text-ink-2 transition-colors hover:bg-ink/10 cursor-pointer"
                  title="Copy ID"
                >
                  {p.id.slice(0, 12)}
                  {copied ? <CheckCheckIcon size={12} className="text-mint" /> : <CopyIcon size={11} className="text-ink-4" />}
                </button>
              </Fact>
              <Fact label="Category">{categoryName}</Fact>
              <Fact label="Supplier offers">
                <span className="tabular-nums">{data.offers.length}</span>
              </Fact>
              <Fact label="Created">{fmtDate(p.createdAt)}</Fact>
              <Fact label="Last updated">{relative(p.updatedAt)}</Fact>
            </dl>
          </div>

          <div className="vyro-surface rounded-2xl">
            <div className="flex items-center justify-between border-b border-ink/[0.07] px-5 py-3.5">
              <span className="text-[13px] font-semibold text-ink">Admin activity</span>
              <span className="rounded-full bg-ink/[0.05] px-2 py-0.5 text-[11px] tabular-nums text-ink-3">
                {data.audit.length}
              </span>
            </div>
            {data.audit.length === 0 ? (
              <div className="px-5 py-8 text-center text-[13px] text-ink-4">
                <ClockIcon size={18} className="mx-auto mb-2 text-ink-5" />
                No activity recorded yet.
              </div>
            ) : (
              <ol className="relative px-5 py-4">
                {data.audit.map((a, i) => (
                  <li key={a.id} className="relative flex gap-3 pb-4 last:pb-0">
                    {i < data.audit.length - 1 && (
                      <span aria-hidden className="absolute left-[5px] top-4 bottom-0 w-px bg-ink/10" />
                    )}
                    <span className="relative mt-1.5 size-[11px] shrink-0 rounded-full bg-paper ring-2 ring-ink/25" />
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium text-ink-1">{a.action.replace(/[._]/g, ' ')}</div>
                      <div className="mt-0.5 truncate text-[11px] text-ink-4" title={fmtDate(a.createdAt)}>
                        {relative(a.createdAt)} · <span className="font-mono">{a.actorId.slice(0, 10)}</span>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </aside>
      </div>

      {/* Save bar */}
      {canModerate ? (
        <div className="sticky bottom-4 z-10">
          <div
            className={cn(
              'flex items-center justify-between gap-4 rounded-2xl px-5 py-3.5 transition-all duration-300',
              dirty
                ? 'bg-ink text-paper shadow-[0_24px_60px_-24px_rgba(12,14,11,0.7)]'
                : 'bg-paper text-ink-4 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.08)]',
            )}
          >
            <span className="flex items-center gap-2 text-[13px]">
              {dirty ? (
                <>
                  <span className="size-2 rounded-full bg-volt animate-pulse" />
                  Unsaved changes
                </>
              ) : (
                <>
                  <ShieldCheckIcon size={14} className="text-mint" />
                  All changes saved
                </>
              )}
            </span>
            <div className="flex items-center gap-2">
              {dirty && (
                <button
                  type="reset"
                  onClick={() => {
                    setActive(p.active);
                    setTimeout(() => setDirty(false));
                  }}
                  className="inline-flex h-10 items-center rounded-xl px-4 text-[13px] font-medium text-paper/70 transition-colors hover:bg-paper/[0.08] hover:text-paper cursor-pointer"
                >
                  Discard
                </button>
              )}
              <button
                type="submit"
                disabled={!dirty || update.isPending}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-volt px-5 text-[13px] font-semibold text-ink transition-all hover:bg-volt-glow disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
              >
                {update.isPending ? <RefreshCwIcon size={14} className="animate-spin" /> : <CheckIcon size={14} />}
                {update.isPending ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <p className="text-center text-[12px] text-ink-4">You have read-only access to this product.</p>
      )}
    </form>
  );
}

function FormSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="vyro-surface rounded-2xl p-5 sm:p-6">
      <div className="mb-5">
        <h2 className="font-sans text-[15px] font-semibold tracking-normal text-ink">{title}</h2>
        {description && <p className="mt-0.5 text-[12px] text-ink-4">{description}</p>}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-[12px] font-medium text-ink-3">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1.5 text-[11px] text-ink-4">{hint}</p>}
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-3">
      <dt className="text-ink-4">{label}</dt>
      <dd className="min-w-0 truncate text-right font-medium text-ink-2">{children}</dd>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-16">
      <BackLink />
      <div className="vyro-surface flex items-center gap-4 rounded-2xl p-7">
        <Skeleton className="size-16 rounded-2xl" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-7 w-72" />
        </div>
      </div>
      <div className="grid gap-5 lg:grid-cols-12">
        <div className="space-y-5 lg:col-span-8">
          <Skeleton className="h-56 rounded-2xl" />
          <Skeleton className="h-32 rounded-2xl" />
        </div>
        <div className="space-y-5 lg:col-span-4">
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-60 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
