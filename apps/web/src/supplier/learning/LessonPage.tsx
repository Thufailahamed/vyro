import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeftIcon,
  CheckCircle2Icon,
  CheckIcon,
  FileTextIcon,
  GraduationCapIcon,
} from '@/components/icons';
import { Button } from '@/components/ui';
import { useSupplierId } from '../useSupplierId';
import { useLesson, useCompleteArticle } from './hooks/useLearning';
import { renderLessonMarkdown } from './markdownSafe';
import { QuizForm } from './QuizForm';
import { ApiError } from '@/lib/api';
import { cn } from '@vyro/ui';

function HeroChip({ done, label }: { done: boolean; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-paper/15 bg-paper/5 px-3 py-1 font-mono text-[11px]">
      <span className={cn('size-1.5 rounded-full', done ? 'bg-volt' : 'bg-paper/30')} />
      <span className={done ? 'font-semibold text-paper' : 'text-paper/50'}>{label}</span>
    </span>
  );
}

function ProgressRow({ done, title, hint }: { done: boolean; title: string; hint: string }) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={cn(
          'flex size-7 shrink-0 items-center justify-center rounded-full border',
          done ? 'border-mint/40 bg-mint/10 text-mint' : 'border-ink/15 bg-bone text-ink-4',
        )}
      >
        {done ? <CheckIcon size={13} /> : <span className="size-1.5 rounded-full bg-ink-4/60" />}
      </span>
      <div className="min-w-0">
        <div className={cn('text-sm font-semibold', done ? 'text-ink' : 'text-ink-2')}>{title}</div>
        <div className="text-[11px] text-ink-4">{hint}</div>
      </div>
    </div>
  );
}

export function LessonPage() {
  const { supplierId } = useSupplierId();
  const { slug = '' } = useParams<{ slug: string }>();
  const { data, isLoading, isError, error, refetch } = useLesson(supplierId, slug);
  const complete = useCompleteArticle(supplierId, slug);

  if (isLoading) {
    return (
      <div className="space-y-5">
        <div className="h-4 w-32 animate-pulse rounded bg-paper" />
        <div className="h-48 animate-pulse rounded-xl bg-ink/90" />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="h-96 animate-pulse rounded-xl bg-paper lg:col-span-2" />
          <div className="h-64 animate-pulse rounded-xl bg-paper" />
        </div>
      </div>
    );
  }

  if (isError) {
    if (error instanceof ApiError && error.code === 'FEATURE_DISABLED') {
      return (
        <div className="space-y-4">
          <BackLink />
          <div className="rounded-xl border border-ink/10 bg-paper p-10 text-center shadow-soft-sm">
            <div className="mx-auto flex size-14 items-center justify-center rounded-full border border-volt-deep/30 bg-volt-soft text-volt-deep">
              <GraduationCapIcon size={24} />
            </div>
            <h1 className="mt-4 font-display text-xl font-bold text-ink">Training center unavailable</h1>
            <p className="mt-1 text-sm text-ink-3">The training center is not enabled in this environment yet.</p>
          </div>
        </div>
      );
    }
    return (
      <div className="rounded-xl border border-rose/30 bg-rose/5 p-6">
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <div className="text-sm font-semibold text-ink">Failed to load lesson</div>
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

  if (!data) {
    return (
      <div className="space-y-4">
        <BackLink />
        <div className="rounded-xl border border-ink/10 bg-paper p-10 text-center shadow-soft-sm">
          <h1 className="font-display text-xl font-bold text-ink">Lesson not found</h1>
          <p className="mt-1 text-sm text-ink-3">It may have been unpublished or your access changed.</p>
          <Link
            to="/supplier/learning"
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-copper hover:text-copper-deep"
          >
            <ArrowLeftIcon size={13} /> Back to training center
          </Link>
        </div>
      </div>
    );
  }

  const { lesson, quiz } = data;
  const required = lesson.isRequiredForPublish;

  return (
    <div className="space-y-6">
      <BackLink />

      <div className="grain relative overflow-hidden rounded-xl bg-ink text-paper shadow-soft-lg">
        <div className="pointer-events-none absolute -top-24 -right-16 size-72 rounded-full bg-volt/15 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-28 -left-16 size-64 rounded-full bg-copper/25 blur-3xl" aria-hidden />
        <div className="relative p-6 sm:p-8">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] font-mono uppercase tracking-[0.16em] text-paper/50">
            <span className="font-semibold text-volt">{lesson.track}</span>
            <span aria-hidden>·</span>
            <span>Lesson {lesson.orderIndex + 1}</span>
            {required ? (
              <>
                <span aria-hidden>·</span>
                <span className="font-semibold text-amber">Required for publish</span>
              </>
            ) : null}
          </div>
          <h1 className="vyro-display mt-2 max-w-2xl text-2xl sm:text-3xl font-bold">{lesson.title}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-paper/60">{lesson.summary}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <HeroChip done={lesson.articleCompleted} label={lesson.articleCompleted ? 'Article read' : 'Article unread'} />
            {quiz ? (
              <HeroChip done={lesson.quizPassed} label={lesson.quizPassed ? 'Quiz passed' : 'Quiz pending'} />
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <article className="space-y-4 lg:col-span-2">
          <div className="rounded-xl border border-ink/10 bg-paper shadow-soft-sm">
            <div className="flex items-center gap-2 border-b border-line px-6 py-4 text-[10px] font-mono uppercase tracking-[0.16em] font-semibold text-copper sm:px-8">
              <FileTextIcon size={13} />
              Lesson article
            </div>
            <div
              className="prose prose-sm max-w-none px-6 py-6 text-ink prose-headings:text-ink prose-headings:font-semibold prose-p:text-ink-2 prose-p:leading-relaxed prose-strong:text-ink prose-code:rounded prose-code:bg-bone prose-code:px-1 prose-code:py-0.5 prose-code:text-ink sm:px-8 sm:py-7"
              dangerouslySetInnerHTML={{ __html: renderLessonMarkdown(lesson.bodyMarkdown) }}
            />
          </div>
        </article>

        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <div className="rounded-xl border border-ink/10 bg-paper p-5 shadow-soft-sm">
            <div className="text-[10px] font-mono uppercase tracking-[0.16em] font-semibold text-copper">
              Your progress
            </div>
            <div className="mt-4 space-y-3.5">
              <ProgressRow
                done={lesson.articleCompleted}
                title="Read the article"
                hint={lesson.articleCompleted ? 'Completed' : 'Mark it read when finished'}
              />
              <ProgressRow
                done={lesson.quizPassed}
                title="Pass the quiz"
                hint={
                  quiz
                    ? `${quiz.questions.length} questions · pass at ${quiz.passThreshold} correct`
                    : 'No quiz for this lesson'
                }
              />
            </div>
            {!lesson.articleCompleted ? (
              <Button
                size="sm"
                className="mt-4 w-full"
                loading={complete.isPending}
                onClick={() => complete.mutate()}
              >
                Mark article read
              </Button>
            ) : null}
          </div>

          {quiz ? (
            <div className="rounded-xl border border-ink/10 bg-paper p-5 shadow-soft-sm">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[10px] font-mono uppercase tracking-[0.16em] font-semibold text-copper">
                  Knowledge check
                </div>
                <span className="rounded-full border border-ink/10 bg-bone px-2 py-0.5 font-mono text-[10px] font-semibold text-ink-3">
                  {quiz.questions.length} {quiz.questions.length === 1 ? 'question' : 'questions'}
                </span>
              </div>
              {lesson.quizPassed ? (
                <div className="mt-4 flex items-center gap-3 rounded-lg border border-mint/30 bg-mint/10 px-3.5 py-3">
                  <CheckCircle2Icon size={16} className="shrink-0 text-mint" />
                  <div>
                    <div className="text-sm font-semibold text-ink">Quiz passed</div>
                    <div className="text-[11px] text-ink-4">This lesson is complete.</div>
                  </div>
                </div>
              ) : (
                <div className="mt-4">
                  <QuizForm supplierId={supplierId} slug={slug} questions={quiz.questions} />
                </div>
              )}
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      to="/supplier/learning"
      className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-3 transition-colors hover:text-copper"
    >
      <ArrowLeftIcon size={12} /> Back to training
    </Link>
  );
}
