import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRightIcon,
  CheckCircle2Icon,
  CheckIcon,
  ClockIcon,
  GraduationCapIcon,
  ShieldCheckIcon,
  SparklesIcon,
} from '@/components/icons';
import { useSupplierId } from '../useSupplierId';
import { useLessons, useOnboardingGate } from './hooks/useLearning';
import type { LessonSummary } from '@vyro/validation';
import { ApiError } from '@/lib/api';
import { cn } from '@vyro/ui';

type Status = 'not_started' | 'article' | 'passed';

const STATUS: Record<Status, { label: string; chip: string; dot: string; cta: string }> = {
  not_started: {
    label: 'Not started',
    chip: 'border-ink/15 bg-bone text-ink-3',
    dot: 'bg-ink-4',
    cta: 'Start lesson',
  },
  article: {
    label: 'Article read',
    chip: 'border-amber/30 bg-amber/10 text-amber',
    dot: 'bg-amber',
    cta: 'Take quiz',
  },
  passed: {
    label: 'Quiz passed',
    chip: 'border-mint/30 bg-mint/10 text-mint',
    dot: 'bg-mint',
    cta: 'Review',
  },
};

function statusOf(l: LessonSummary): Status {
  if (l.quizPassed) return 'passed';
  if (l.articleCompleted) return 'article';
  return 'not_started';
}

function ProgressRing({ pct }: { pct: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative size-20 shrink-0">
      <svg viewBox="0 0 64 64" className="size-20 -rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" stroke="rgba(250,247,240,0.12)" strokeWidth="6" />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          stroke="#C6DC4A"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct / 100)}
          className="transition-all duration-700 ease-vyro"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="vyro-metric text-lg text-paper">{pct}%</span>
      </div>
    </div>
  );
}

function LessonCard({ lesson }: { lesson: LessonSummary }) {
  const status = statusOf(lesson);
  const s = STATUS[status];
  const passed = status === 'passed';
  return (
    <Link
      to={`/supplier/learning/${lesson.slug}`}
      className={cn(
        'group relative flex flex-col rounded-xl border bg-paper p-5 shadow-soft-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-soft-md',
        passed ? 'border-mint/30 hover:border-mint/50' : 'border-ink/10 hover:border-ink/25',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className={cn(
            'flex size-9 items-center justify-center rounded-lg font-mono text-xs font-bold',
            passed ? 'bg-mint/10 text-mint' : 'bg-bone text-ink-3',
          )}
        >
          {passed ? <CheckIcon size={15} /> : String(lesson.orderIndex + 1).padStart(2, '0')}
        </span>
        {lesson.isRequiredForPublish ? (
          <span className="rounded-full border border-volt-deep/30 bg-volt-soft px-2 py-0.5 text-[9px] font-mono font-semibold uppercase tracking-wider text-volt-deep">
            Required
          </span>
        ) : null}
      </div>

      <h3 className="mt-3 font-display text-base font-bold leading-snug text-ink transition-colors group-hover:text-copper-deep">
        {lesson.title}
      </h3>
      <p className="mt-1 text-sm leading-relaxed text-ink-3 line-clamp-2">{lesson.summary}</p>

      <div className="mt-4 flex items-center justify-between gap-2 pt-1 mt-auto">
        <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-mono font-semibold', s.chip)}>
          <span className={cn('size-1.5 rounded-full', s.dot)} />
          {s.label}
        </span>
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-ink-4 transition-colors group-hover:text-ink">
          {s.cta}
          <ArrowRightIcon size={12} className="transition-transform duration-200 group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  );
}

function TrackSection({
  kicker,
  title,
  subtitle,
  lessons,
  emptyHint,
}: {
  kicker: string;
  title: string;
  subtitle: string;
  lessons: LessonSummary[];
  emptyHint: string;
}) {
  const passed = lessons.filter((l) => l.quizPassed).length;
  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-line pb-3">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-[0.16em] text-copper font-semibold">{kicker}</div>
          <h2 className="mt-0.5 font-display text-xl font-bold text-ink">{title}</h2>
          <p className="mt-0.5 text-xs text-ink-3">{subtitle}</p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-paper px-3 py-1 text-[10px] font-mono font-semibold uppercase tracking-wider text-ink-4 shadow-soft-sm">
          {passed}/{lessons.length} passed
        </span>
      </header>
      {lessons.length === 0 ? (
        <div className="rounded-xl border border-dashed border-ink/20 bg-paper/60 p-8 text-center">
          <GraduationCapIcon size={18} className="mx-auto text-ink-4" />
          <p className="mt-2 text-sm text-ink-3">{emptyHint}</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {lessons.map((l) => (
            <LessonCard key={l.slug} lesson={l} />
          ))}
        </div>
      )}
    </section>
  );
}

function HeroShell({ children }: { children: ReactNode }) {
  return (
    <div className="grain relative overflow-hidden rounded-xl bg-ink text-paper shadow-soft-lg">
      <div className="pointer-events-none absolute -top-28 -right-20 size-80 rounded-full bg-volt/15 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -bottom-32 -left-20 size-72 rounded-full bg-copper/25 blur-3xl" aria-hidden />
      <div className="relative p-6 sm:p-8">{children}</div>
    </div>
  );
}

export function LearningIndex() {
  const { supplierId } = useSupplierId();
  const { data, isLoading, isError, error, refetch } = useLessons(supplierId);
  const gate = useOnboardingGate(supplierId);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-56 animate-pulse rounded-xl bg-ink/90" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-44 animate-pulse rounded-xl bg-paper" />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    if (error instanceof ApiError && error.code === 'FEATURE_DISABLED') {
      return (
        <div className="space-y-6">
          <HeroShell>
            <div className="flex items-start gap-4">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-volt/30 bg-volt/15 text-volt">
                <GraduationCapIcon size={22} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-mono uppercase tracking-[0.16em] font-semibold text-volt">Supplier training</div>
                <h1 className="vyro-display mt-2 text-2xl sm:text-3xl font-bold">Training center</h1>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-paper/60">
                  The training center is not enabled for this environment yet. Short articles and quick quizzes will
                  appear here once it ships.
                </p>
              </div>
            </div>
          </HeroShell>
          <div className="rounded-xl border border-dashed border-ink/20 bg-paper/60 p-8 text-center text-sm text-ink-3">
            Coming soon — check back shortly.
          </div>
        </div>
      );
    }
    return (
      <div className="rounded-xl border border-rose/30 bg-rose/5 p-6">
        <div className="flex items-start gap-3">
          <ClockIcon size={16} className="mt-0.5 shrink-0 text-rose" />
          <div className="flex-1">
            <div className="text-sm font-semibold text-ink">Failed to load training</div>
            <p className="mt-0.5 text-xs text-ink-3">{(error as Error)?.message ?? 'unknown error'}</p>
          </div>
          <button
            type="button"
            onClick={() => void refetch()}
            className="rounded-lg border border-ink/15 bg-paper px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:bg-mist/60"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const lessons = data?.lessons ?? [];
  const onboarding = lessons.filter((l) => l.track === 'onboarding');
  const operations = lessons.filter((l) => l.track === 'operations');
  const totalPassed = lessons.filter((l) => l.quizPassed).length;
  const requiredLessons = lessons.filter((l) => l.isRequiredForPublish);
  const requiredDone = requiredLessons.filter((l) => l.quizPassed).length;
  const gateCleared = requiredLessons.length > 0 && requiredDone === requiredLessons.length;
  const hasAny = lessons.length > 0;
  const gateRequired = gate.data?.required ?? false;
  const pct = lessons.length === 0 ? 0 : Math.round((totalPassed / lessons.length) * 100);
  const nextUp =
    [...onboarding].sort((a, b) => a.orderIndex - b.orderIndex).find((l) => !l.quizPassed) ??
    [...operations].sort((a, b) => a.orderIndex - b.orderIndex).find((l) => !l.quizPassed);

  if (!hasAny) {
    return (
      <div className="rounded-xl border border-ink/10 bg-paper p-10 text-center shadow-soft-sm">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full border border-volt-deep/30 bg-volt-soft text-volt-deep">
          <GraduationCapIcon size={24} />
        </div>
        <h1 className="mt-4 font-display text-xl font-bold text-ink">No lessons available yet</h1>
        <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-ink-3">
          The training catalog is empty. An admin needs to publish lessons before you can start.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <HeroShell>
        <div className="flex flex-wrap items-center justify-between gap-6">
          <div className="min-w-0 max-w-xl">
            <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.16em] font-semibold text-volt">
              <GraduationCapIcon size={13} />
              Supplier training
            </div>
            <h1 className="vyro-display mt-2 text-2xl sm:text-3xl font-bold">Training center</h1>
            <p className="mt-2 text-sm leading-relaxed text-paper/60">
              Short articles and quick quizzes. Complete onboarding to unlock product publishing, and level up on
              operations as you grow.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <ProgressRing pct={pct} />
            <div>
              <div className="vyro-metric text-3xl text-paper">
                {totalPassed}
                <span className="text-xl text-paper/40">/{lessons.length}</span>
              </div>
              <div className="mt-1 text-[10px] font-mono uppercase tracking-[0.14em] text-paper/50">
                quizzes passed
              </div>
            </div>
          </div>
        </div>

        <div className="mt-7 grid gap-4 border-t border-paper/10 pt-5 sm:grid-cols-3">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-paper/50">Onboarding gate</div>
            <div className="mt-1.5 flex items-center gap-2 text-sm font-semibold text-paper">
              {gateCleared ? (
                <>
                  <CheckCircle2Icon size={15} className="text-volt" />
                  Gate cleared
                </>
              ) : (
                <>
                  <ClockIcon size={15} className="text-amber" />
                  {requiredDone}/{requiredLessons.length} required passed
                </>
              )}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-paper/50">Publish access</div>
            <div className="mt-1.5 flex items-center gap-2 text-sm font-semibold text-paper">
              {gateCleared ? (
                <>
                  <SparklesIcon size={15} className="text-volt" />
                  Unlocked
                </>
              ) : (
                <>
                  <ShieldCheckIcon size={15} className="text-amber" />
                  Locked until onboarding
                </>
              )}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-paper/50">Next up</div>
            {nextUp ? (
              <Link
                to={`/supplier/learning/${nextUp.slug}`}
                className="group mt-1.5 inline-flex max-w-full items-center gap-1.5 text-sm font-semibold text-volt hover:text-volt-glow"
              >
                <span className="truncate">{nextUp.title}</span>
                <ArrowRightIcon size={13} className="shrink-0 transition-transform group-hover:translate-x-0.5" />
              </Link>
            ) : (
              <div className="mt-1.5 flex items-center gap-2 text-sm font-semibold text-paper">
                <CheckCircle2Icon size={15} className="text-volt" />
                All lessons complete
              </div>
            )}
          </div>
        </div>
      </HeroShell>

      {gateRequired ? (
        <div className="flex items-start gap-3 rounded-xl border border-amber/30 bg-amber/10 p-4">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-amber/15 text-amber">
            <ClockIcon size={15} />
          </span>
          <div>
            <div className="text-sm font-semibold text-ink">Finish onboarding to publish products</div>
            <div className="mt-0.5 text-xs leading-relaxed text-ink-3">
              You can browse lessons freely, but product publishing unlocks after all required quizzes are passed.
            </div>
          </div>
        </div>
      ) : null}

      <TrackSection
        kicker="Track 01"
        title="Onboarding"
        subtitle="Required for product publishing"
        lessons={onboarding}
        emptyHint="No onboarding lessons published yet."
      />
      <TrackSection
        kicker="Track 02"
        title="Operations"
        subtitle="Level up your day-to-day"
        lessons={operations}
        emptyHint="No operations lessons published yet."
      />
    </div>
  );
}
