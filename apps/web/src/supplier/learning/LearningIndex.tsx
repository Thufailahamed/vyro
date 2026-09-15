import { Link } from 'react-router-dom';
import { GraduationCapIcon, CheckCircleIcon, CheckIcon, ClockIcon } from '@/components/icons';
import { useSupplierId } from '../useSupplierId';
import { useLessons, useOnboardingGate } from './hooks/useLearning';
import type { LessonSummary } from '@vyro/validation';

type Status = 'not_started' | 'article' | 'passed';
const STATUS: Record<Status, { label: string; chip: string; dot: string }> = {
  not_started: {
    label: 'Not started',
    chip: 'bg-paper border border-ink/15 text-ink-3',
    dot: 'bg-ink-4',
  },
  article: {
    label: 'Article read',
    chip: 'bg-amber/10 border border-amber/30 text-amber',
    dot: 'bg-amber',
  },
  passed: {
    label: 'Quiz passed',
    chip: 'bg-mint/10 border border-mint/30 text-mint',
    dot: 'bg-mint',
  },
};

function statusOf(l: LessonSummary): Status {
  if (l.quizPassed) return 'passed';
  if (l.articleCompleted) return 'article';
  return 'not_started';
}

function LessonCard({ lesson }: { lesson: LessonSummary }) {
  const s = STATUS[statusOf(lesson)];
  const required = lesson.isRequiredForPublish;
  return (
    <Link
      to={`/supplier/learning/${lesson.slug}`}
      className="group block rounded-2xl border border-ink/10 bg-paper p-4 transition-all hover:border-volt/60 hover:shadow-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span
            className={`inline-block size-1.5 rounded-full ${s.dot}`}
            aria-hidden
          />
          <span className="text-[10px] font-mono uppercase tracking-wider text-ink-4">
            Lesson {lesson.orderIndex + 1}
          </span>
        </div>
        {required ? (
          <span className="rounded-full bg-volt/10 px-2 py-0.5 text-[9px] font-mono uppercase tracking-wider text-volt border border-volt/30">
            Required
          </span>
        ) : null}
      </div>
      <h3 className="mt-2 text-base font-semibold text-ink leading-snug group-hover:text-volt transition-colors">
        {lesson.title}
      </h3>
      <p className="mt-1 text-sm text-ink-3 line-clamp-2">{lesson.summary}</p>
      <div className="mt-3 flex items-center justify-between">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-mono ${s.chip}`}
        >
          {s.label}
        </span>
        {statusOf(lesson) === 'passed' ? (
          <CheckCircleIcon size={14} className="text-mint" />
        ) : null}
      </div>
    </Link>
  );
}

function TrackSection({
  title,
  subtitle,
  lessons,
  emptyHint,
}: {
  title: string;
  subtitle: string;
  lessons: LessonSummary[];
  emptyHint: string;
}) {
  return (
    <section className="space-y-3">
      <header className="flex items-baseline justify-between">
        <div>
          <h2 className="text-lg font-semibold text-ink">{title}</h2>
          <p className="text-xs text-ink-3">{subtitle}</p>
        </div>
        <span className="text-[10px] font-mono uppercase tracking-wider text-ink-4">
          {lessons.length} {lessons.length === 1 ? 'lesson' : 'lessons'}
        </span>
      </header>
      {lessons.length === 0 ? (
        <div className="rounded-xl border border-dashed border-ink/15 bg-paper/50 p-6 text-center text-sm text-ink-3">
          {emptyHint}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {lessons.map((l) => (
            <LessonCard key={l.slug} lesson={l} />
          ))}
        </div>
      )}
    </section>
  );
}

function ProgressMeter({
  passed,
  total,
  requiredDone,
  requiredTotal,
}: {
  passed: number;
  total: number;
  requiredDone: number;
  requiredTotal: number;
}) {
  const pct = total === 0 ? 0 : Math.round((passed / total) * 100);
  return (
    <div className="grid grid-cols-3 gap-3">
      <div className="rounded-xl border border-ink/10 bg-paper p-4">
        <div className="text-[10px] font-mono uppercase tracking-wider text-ink-4">
          Overall
        </div>
        <div className="mt-1 flex items-baseline gap-1">
          <span className="text-2xl font-bold text-ink">{pct}%</span>
          <span className="text-xs text-ink-3">
            {passed}/{total}
          </span>
        </div>
        <div className="mt-2 h-1.5 rounded-full bg-ink/10 overflow-hidden">
          <div
            className="h-full bg-volt"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      <div className="rounded-xl border border-ink/10 bg-paper p-4">
        <div className="text-[10px] font-mono uppercase tracking-wider text-ink-4">
          Onboarding
        </div>
        <div className="mt-1 flex items-baseline gap-1">
          <span className="text-2xl font-bold text-ink">{requiredDone}</span>
          <span className="text-xs text-ink-3">/ {requiredTotal} required</span>
        </div>
        <div className="mt-1 text-xs text-ink-3">
          {requiredDone === requiredTotal ? (
            <span className="inline-flex items-center gap-1 text-mint">
              <CheckIcon size={12} /> Gate cleared
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-amber">
              <ClockIcon size={12} /> {requiredTotal - requiredDone} remaining
            </span>
          )}
        </div>
      </div>
      <div className="rounded-xl border border-ink/10 bg-paper p-4">
        <div className="text-[10px] font-mono uppercase tracking-wider text-ink-4">
          Publish access
        </div>
        <div className="mt-1 text-2xl font-bold text-ink">
          {requiredDone === requiredTotal ? '✓' : '—'}
        </div>
        <div className="mt-1 text-xs text-ink-3">
          {requiredDone === requiredTotal
            ? 'You can publish products'
            : 'Complete onboarding to publish'}
        </div>
      </div>
    </div>
  );
}

export function LearningIndex() {
  const { supplierId } = useSupplierId();
  const { data, isLoading, isError, error } = useLessons(supplierId);
  const gate = useOnboardingGate(supplierId);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-32 rounded-2xl bg-paper animate-pulse" />
        <div className="h-64 rounded-2xl bg-paper animate-pulse" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-2xl border border-rose/30 bg-rose/5 p-6 text-sm text-rose">
        Failed to load training: {(error as Error)?.message ?? 'unknown error'}
      </div>
    );
  }

  const lessons = data?.lessons ?? [];
  const onboarding = lessons.filter((l) => l.track === 'onboarding');
  const operations = lessons.filter((l) => l.track === 'operations');
  const totalPassed = lessons.filter((l) => l.quizPassed).length;
  const requiredLessons = lessons.filter((l) => l.isRequiredForPublish);
  const requiredDone = requiredLessons.filter((l) => l.quizPassed).length;
  const hasAny = lessons.length > 0;
  const gateRequired = gate.data?.required ?? false;

  if (!hasAny) {
    return (
      <div className="space-y-6">
        <div className="rounded-2xl border border-ink/10 bg-paper p-8 text-center">
          <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-bone">
            <GraduationCapIcon size={22} className="text-ink-3" />
          </div>
          <h1 className="text-xl font-semibold text-ink">No lessons available yet</h1>
          <p className="mt-1 text-sm text-ink-3">
            The training catalog is empty. An admin needs to publish lessons before you can start.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-ink/10 bg-gradient-to-br from-void to-ink p-6 text-paper">
        <div className="flex items-start gap-4">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-volt/15 text-volt border border-volt/30">
            <GraduationCapIcon size={22} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-mono uppercase tracking-widest text-volt">
              Supplier training
            </div>
            <h1 className="mt-1 text-2xl font-semibold">Training center</h1>
            <p className="mt-1 text-sm text-paper/70 max-w-2xl">
              Short articles + quick quizzes. Complete onboarding to unlock product publishing,
              and level up on operations as you grow.
            </p>
          </div>
        </div>
      </div>

      {/* Progress meter */}
      <ProgressMeter
        passed={totalPassed}
        total={lessons.length}
        requiredDone={requiredDone}
        requiredTotal={requiredLessons.length}
      />

      {/* Soft-gate notice when required lessons still missing */}
      {gateRequired ? (
        <div className="flex items-start gap-3 rounded-xl border border-amber/30 bg-amber/5 p-4 text-sm text-amber">
          <ClockIcon size={16} className="mt-0.5 shrink-0" />
          <div>
            <div className="font-semibold">Finish onboarding to publish products</div>
            <div className="text-xs mt-0.5 text-amber/80">
              You can browse lessons freely, but product publishing unlocks after all required
              quizzes are passed.
            </div>
          </div>
        </div>
      ) : null}

      <TrackSection
        title="Onboarding"
        subtitle="Required for product publishing"
        lessons={onboarding}
        emptyHint="No onboarding lessons published yet."
      />
      <TrackSection
        title="Operations"
        subtitle="Level up your day-to-day"
        lessons={operations}
        emptyHint="No operations lessons published yet."
      />
    </div>
  );
}
