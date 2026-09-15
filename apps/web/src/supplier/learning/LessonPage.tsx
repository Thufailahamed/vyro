import { Link, useParams } from 'react-router-dom';
import { ArrowLeftIcon, CheckCircleIcon, CheckIcon } from '@/components/icons';
import { useSupplierId } from '../useSupplierId';
import { useLesson, useCompleteArticle } from './hooks/useLearning';
import { renderLessonMarkdown } from './markdownSafe';
import { QuizForm } from './QuizForm';
import { ApiError } from '@/lib/api';

export function LessonPage() {
  const { supplierId } = useSupplierId();
  const { slug = '' } = useParams<{ slug: string }>();
  const { data, isLoading, isError, error } = useLesson(supplierId, slug);
  const complete = useCompleteArticle(supplierId, slug);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="h-8 w-48 rounded bg-paper animate-pulse" />
        <div className="h-64 rounded-2xl bg-paper animate-pulse" />
      </div>
    );
  }

  if (isError) {
    if (error instanceof ApiError && error.code === 'FEATURE_DISABLED') {
      return (
        <div className="space-y-3">
          <Link
            to="/supplier/learning"
            className="inline-flex items-center gap-1 text-xs text-ink-3 hover:text-volt transition-colors"
          >
            <ArrowLeftIcon size={12} /> Back to training
          </Link>
          <div className="rounded-2xl border border-ink/10 bg-paper p-8 text-center">
            <h1 className="text-lg font-semibold text-ink">Training center unavailable</h1>
            <p className="mt-1 text-sm text-ink-3">
              The training center is not enabled in this environment yet.
            </p>
          </div>
        </div>
      );
    }
    return (
      <div className="rounded-2xl border border-rose/30 bg-rose/5 p-6 text-sm text-rose">
        Failed to load lesson: {(error as Error)?.message ?? 'unknown error'}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-2xl border border-ink/10 bg-paper p-8 text-center">
        <h1 className="text-lg font-semibold">Lesson not found</h1>
        <p className="mt-1 text-sm text-ink-3">
          It may have been unpublished or your access changed.
        </p>
        <Link to="/supplier/learning" className="mt-3 inline-block text-sm text-volt underline">
          ← Back to training center
        </Link>
      </div>
    );
  }

  const { lesson, quiz } = data;
  const required = lesson.isRequiredForPublish;

  return (
    <div className="space-y-5">
      <Link
        to="/supplier/learning"
        className="inline-flex items-center gap-1 text-xs text-ink-3 hover:text-volt transition-colors"
      >
        <ArrowLeftIcon size={12} /> Back to training
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Article */}
        <article className="lg:col-span-2 space-y-4">
          <header className="rounded-2xl border border-ink/10 bg-paper p-6">
            <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-ink-4">
              <span>{lesson.track}</span>
              <span>·</span>
              <span>Lesson {lesson.orderIndex + 1}</span>
              {required ? (
                <>
                  <span>·</span>
                  <span className="text-volt">Required for publish</span>
                </>
              ) : null}
            </div>
            <h1 className="mt-2 text-2xl font-semibold text-ink">{lesson.title}</h1>
            <p className="mt-1 text-sm text-ink-3">{lesson.summary}</p>
          </header>

          <div
            className="rounded-2xl border border-ink/10 bg-paper p-6 prose prose-sm max-w-none text-ink prose-headings:text-ink prose-headings:font-semibold prose-p:text-ink-2 prose-p:leading-relaxed prose-strong:text-ink prose-code:rounded prose-code:bg-bone prose-code:px-1 prose-code:py-0.5 prose-code:text-ink"
            dangerouslySetInnerHTML={{ __html: renderLessonMarkdown(lesson.bodyMarkdown) }}
          />
        </article>

        {/* Sidebar: progress + actions */}
        <aside className="space-y-3 lg:sticky lg:top-4 lg:self-start">
          {/* Article status */}
          <div className="rounded-2xl border border-ink/10 bg-paper p-4">
            <div className="text-[10px] font-mono uppercase tracking-wider text-ink-4">
              Article progress
            </div>
            {lesson.articleCompleted ? (
              <div className="mt-2 flex items-center gap-2 text-sm text-mint">
                <CheckCircleIcon size={16} />
                <span className="font-medium">Read</span>
              </div>
            ) : (
              <>
                <div className="mt-2 text-sm text-ink-3">Not yet read</div>
                <button
                  type="button"
                  onClick={() => complete.mutate()}
                  disabled={complete.isPending}
                  className="mt-3 w-full rounded-lg bg-ink px-3 py-2 text-sm font-semibold text-paper hover:bg-volt hover:text-ink disabled:opacity-50 transition-colors"
                >
                  {complete.isPending ? 'Saving…' : 'Mark article read'}
                </button>
              </>
            )}
          </div>

          {/* Quiz */}
          {quiz ? (
            <div className="rounded-2xl border border-ink/10 bg-paper p-4">
              <div className="text-[10px] font-mono uppercase tracking-wider text-ink-4">
                Knowledge check
              </div>
              <div className="mt-1 text-sm text-ink-2">
                {quiz.questions.length} questions · pass at{' '}
                <span className="font-mono">{quiz.passThreshold}</span> correct
              </div>
              {lesson.quizPassed ? (
                <div className="mt-3 flex items-center gap-2 rounded-lg bg-mint/10 border border-mint/30 px-3 py-2 text-sm text-mint">
                  <CheckIcon size={14} />
                  <span className="font-medium">Quiz passed</span>
                </div>
              ) : (
                <div className="mt-3">
                  <QuizForm
                    supplierId={supplierId}
                    slug={slug}
                    questions={quiz.questions}
                  />
                </div>
              )}
            </div>
          ) : null}

          {/* Track meta */}
          <div className="rounded-2xl border border-ink/10 bg-paper p-4 text-xs text-ink-3">
            <div className="font-mono uppercase tracking-wider text-[10px] text-ink-4">
              Track
            </div>
            <div className="mt-1 font-medium text-ink capitalize">{lesson.track}</div>
          </div>
        </aside>
      </div>
    </div>
  );
}
