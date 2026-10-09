import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@vyro/ui';
import { useAdminLessons, useAdminDeleteLesson } from './hooks/useAdminLearning';
import {
  AdminPage,
  AdminPageHeader,
  EmptyBlock,
  Pill,
  Skeleton,
  StatCard,
  StatGrid,
  Tabs,
  buttonClass,
  controlClass,
} from '../ui';
import {
  ArrowRightIcon,
  CheckCircleIcon,
  Edit3Icon,
  FileTextIcon,
  GraduationCapIcon,
  LayersIcon,
  PlusIcon,
  SearchIcon,
  ShieldCheckIcon,
  Trash2Icon,
} from '@/components/icons';

type Track = 'onboarding' | 'operations';

export interface AdminLessonRow {
  id: string;
  slug: string;
  title: string;
  summary: string;
  bodyMarkdown?: string;
  track: Track;
  orderIndex: number;
  isPublished: boolean;
  isRequiredForPublish: boolean;
}

const TRACKS: Record<Track, { label: string; blurb: string }> = {
  onboarding: { label: 'Onboarding', blurb: 'First-run lessons every new supplier works through.' },
  operations: { label: 'Operations', blurb: 'Day-to-day playbooks for running a storefront well.' },
};

function toRow(raw: Record<string, unknown>): AdminLessonRow {
  return {
    id: String(raw.id),
    slug: String(raw.slug ?? ''),
    title: String(raw.title ?? ''),
    summary: String(raw.summary ?? ''),
    bodyMarkdown: typeof raw.bodyMarkdown === 'string' ? raw.bodyMarkdown : '',
    track: raw.track === 'operations' ? 'operations' : 'onboarding',
    orderIndex: Number(raw.orderIndex ?? 0),
    isPublished: Boolean(raw.isPublished),
    isRequiredForPublish: Boolean(raw.isRequiredForPublish),
  };
}

export function readMinutes(markdown: string | undefined) {
  const words = (markdown ?? '').trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}

export function LessonsAdmin() {
  const { data, isLoading } = useAdminLessons();
  const [tab, setTab] = useState<'all' | Track>('all');
  const [query, setQuery] = useState('');

  const lessons = useMemo(() => (data?.lessons ?? []).map(toRow), [data]);
  const published = lessons.filter((l) => l.isPublished);
  const gate = lessons
    .filter((l) => l.isRequiredForPublish)
    .sort((a, b) => (a.track === b.track ? a.orderIndex - b.orderIndex : a.track === 'onboarding' ? -1 : 1));
  const liveGate = gate.filter((l) => l.isPublished);

  const q = query.trim().toLowerCase();
  const visible = lessons.filter(
    (l) =>
      (tab === 'all' || l.track === tab) &&
      (!q || l.title.toLowerCase().includes(q) || l.slug.includes(q) || l.summary.toLowerCase().includes(q)),
  );
  const groups = (['onboarding', 'operations'] as const)
    .map((track) => ({ track, items: visible.filter((l) => l.track === track).sort((a, b) => a.orderIndex - b.orderIndex) }))
    .filter((g) => g.items.length > 0);

  const count = (t: Track) => lessons.filter((l) => l.track === t).length;

  return (
    <AdminPage>
      <AdminPageHeader
        kicker="Learning"
        title="Training center"
        description="Author onboarding and operations lessons, and choose which ones gate supplier publishing."
        actions={
          <Link to="/admin/learning/new" className={buttonClass('primary')}>
            <PlusIcon size={15} />
            New lesson
          </Link>
        }
      />

      <StatGrid cols={4}>
        <StatCard label="Lessons" value={lessons.length} sub="Across both tracks" icon={<LayersIcon size={16} />} loading={isLoading} />
        <StatCard
          label="Published"
          value={published.length}
          sub={`${lessons.length - published.length} in draft`}
          icon={<CheckCircleIcon size={16} />}
          loading={isLoading}
        />
        <StatCard
          label="Publish gate"
          value={liveGate.length}
          sub="Required before suppliers go live"
          icon={<ShieldCheckIcon size={16} />}
          loading={isLoading}
        />
        <StatCard
          label="Reading time"
          value={`${published.reduce((m, l) => m + readMinutes(l.bodyMarkdown), 0)}m`}
          sub="Total for published lessons"
          icon={<FileTextIcon size={16} />}
          loading={isLoading}
        />
      </StatGrid>

      {!isLoading && gate.length > 0 && <GatePath lessons={gate} />}

      <section className="vyro-surface overflow-hidden">
        <div className="flex flex-col gap-3 px-5 pt-5 pb-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <Tabs
            ariaLabel="Tracks"
            value={tab}
            onChange={setTab}
            items={[
              { key: 'all', label: 'All lessons', count: lessons.length },
              { key: 'onboarding', label: 'Onboarding', count: count('onboarding') },
              { key: 'operations', label: 'Operations', count: count('operations') },
            ]}
          />
          <label className="relative block sm:w-72">
            <span className="sr-only">Search lessons</span>
            <SearchIcon size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-5" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search title, slug or summary"
              className={cn(controlClass, 'w-full pl-8')}
            />
          </label>
        </div>

        {isLoading ? (
          <div className="divide-y divide-ink/[0.06] border-t border-ink/[0.07]">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-6 py-4">
                <Skeleton className="size-9 rounded-[10px]" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-56" />
                  <Skeleton className="h-3 w-80" />
                </div>
                <Skeleton className="h-5 w-20 rounded-full" />
              </div>
            ))}
          </div>
        ) : lessons.length === 0 ? (
          <div className="border-t border-ink/[0.07]">
            <EmptyBlock
              icon={<GraduationCapIcon size={22} />}
              title="No lessons yet"
              description="Create the first lesson to start building the training center."
              action={
                <Link to="/admin/learning/new" className={buttonClass('primary')}>
                  <PlusIcon size={15} />
                  New lesson
                </Link>
              }
            />
          </div>
        ) : groups.length === 0 ? (
          <div className="border-t border-ink/[0.07]">
            <EmptyBlock
              icon={<SearchIcon size={20} />}
              title="No matching lessons"
              description="Try a different search or switch tracks."
              action={
                <button type="button" className={buttonClass('secondary', 'sm')} onClick={() => { setQuery(''); setTab('all'); }}>
                  Clear filters
                </button>
              }
            />
          </div>
        ) : (
          groups.map((g) => (
            <div key={g.track}>
              <div className="flex items-baseline justify-between gap-3 border-y border-ink/[0.07] bg-bone/50 px-5 py-2.5 sm:px-6">
                <div className="flex items-baseline gap-2.5">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-3">{TRACKS[g.track].label}</span>
                  <span className="hidden text-xs text-ink-5 sm:inline">{TRACKS[g.track].blurb}</span>
                </div>
                <span className="text-xs text-ink-5 num-tabular">
                  {g.items.length} {g.items.length === 1 ? 'lesson' : 'lessons'}
                </span>
              </div>
              <ul className="divide-y divide-ink/[0.06]">
                {g.items.map((l, i) => (
                  <LessonRow key={l.id} lesson={l} step={i + 1} />
                ))}
              </ul>
            </div>
          ))
        )}
      </section>
    </AdminPage>
  );
}

/** Dark band showing the ordered lessons a supplier must pass before publishing. */
function GatePath({ lessons }: { lessons: AdminLessonRow[] }) {
  return (
    <section className="relative overflow-hidden rounded-[18px] bg-ink p-5 text-paper shadow-[0_24px_48px_-28px_rgba(12,14,11,0.7)] sm:p-6">
      <div
        className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-volt/20 blur-3xl"
        aria-hidden
      />
      <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-sm">
          <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-volt">
            <ShieldCheckIcon size={13} />
            Publishing gate
          </div>
          <p className="mt-2 text-sm leading-relaxed text-paper/70 text-pretty">
            Suppliers must pass these lessons, in order, before they can publish products.
          </p>
        </div>
        <ol className="flex flex-wrap items-center gap-2">
          {lessons.map((l, i) => (
            <li key={l.id} className="flex items-center gap-2">
              <Link
                to={`/admin/learning/${l.id}/edit`}
                className={cn(
                  'group flex items-center gap-2.5 rounded-xl py-1.5 pl-1.5 pr-3 text-[13px] font-medium transition-colors',
                  l.isPublished
                    ? 'bg-paper/[0.07] text-paper shadow-[inset_0_0_0_1px_rgba(250,247,240,0.1)] hover:bg-paper/[0.12]'
                    : 'text-paper/45 shadow-[inset_0_0_0_1px_rgba(250,247,240,0.12)] [border-style:dashed] hover:text-paper/70',
                )}
                title={l.isPublished ? l.title : `${l.title} (draft, not enforced)`}
              >
                <span
                  className={cn(
                    'flex size-6 items-center justify-center rounded-lg text-[11px] font-bold num-tabular',
                    l.isPublished ? 'bg-volt text-ink' : 'bg-paper/10 text-paper/60',
                  )}
                >
                  {i + 1}
                </span>
                <span className="max-w-[12rem] truncate">{l.title}</span>
              </Link>
              {i < lessons.length - 1 && <ArrowRightIcon size={13} className="text-paper/30" aria-hidden />}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function LessonRow({ lesson: l, step }: { lesson: AdminLessonRow; step: number }) {
  const del = useAdminDeleteLesson();
  const [confirming, setConfirming] = useState(false);
  const editPath = `/admin/learning/${l.id}/edit`;

  return (
    <li
      className="group relative flex items-center gap-4 px-5 py-4 transition-colors hover:bg-bone/40 sm:px-6">
      <span
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-[10px] text-[13px] font-bold num-tabular transition-all duration-200',
          l.isPublished
            ? 'bg-gradient-to-b from-paper to-bone text-ink-2 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.08),0_1px_2px_rgba(12,14,11,0.06)] group-hover:from-ink group-hover:to-charcoal group-hover:text-volt'
            : 'text-ink-5 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.12)] [border-style:dashed]',
        )}
        aria-hidden
      >
        {String(step).padStart(2, '0')}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <Link
            to={editPath}
            className="truncate text-[0.9375rem] font-semibold tracking-[-0.01em] text-ink outline-none after:absolute after:inset-0 focus-visible:underline"
          >
            {l.title}
          </Link>
          <span className="hidden font-mono text-[11px] text-ink-5 md:inline">/{l.slug}</span>
        </div>
        <p className="mt-0.5 line-clamp-1 text-[13px] text-ink-4">{l.summary || 'No summary yet.'}</p>
      </div>

      <div className="relative hidden shrink-0 items-center gap-1.5 sm:flex">
        <span className="mr-2 hidden text-xs text-ink-5 num-tabular lg:inline">{readMinutes(l.bodyMarkdown)} min read</span>
        {l.isRequiredForPublish && (
          <Pill tone="brand" icon={<ShieldCheckIcon size={11} />}>
            Gate
          </Pill>
        )}
        {l.isPublished ? (
          <Pill tone="success" dot>
            Published
          </Pill>
        ) : (
          <Pill tone="warning" dot>
            Draft
          </Pill>
        )}
      </div>

      <div className="relative z-10 flex shrink-0 items-center gap-1">
        {confirming ? (
          <>
            <button
              type="button"
              className={buttonClass('danger', 'sm')}
              disabled={del.isPending}
              onClick={() => del.mutate(l.id, { onSettled: () => setConfirming(false) })}
            >
              {del.isPending ? 'Deleting…' : 'Delete'}
            </button>
            <button type="button" className={buttonClass('ghost', 'sm')} onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </>
        ) : (
          <>
            <Link
              to={editPath}
              className={cn(buttonClass('ghost', 'sm'), 'opacity-70 group-hover:opacity-100')}
              aria-label={`Edit ${l.title}`}
            >
              <Edit3Icon size={13} />
              <span className="hidden md:inline">Edit</span>
            </Link>
            <button
              type="button"
              className="flex size-8 items-center justify-center rounded-lg text-ink-5 opacity-0 transition-all hover:bg-rose/[0.08] hover:text-rose focus-visible:opacity-100 group-hover:opacity-100"
              aria-label={`Delete ${l.title}`}
              onClick={() => setConfirming(true)}
            >
              <Trash2Icon size={14} />
            </button>
          </>
        )}
      </div>
    </li>
  );
}
