import { useParams, Link } from 'react-router-dom';
import { useSupplierId } from '../useSupplierId';
import { useLesson, useCompleteArticle } from './hooks/useLearning';
import { renderLessonMarkdown } from './markdownSafe';
import { QuizForm } from './QuizForm';

export function LessonPage() {
  const { supplierId } = useSupplierId();
  const { slug = '' } = useParams<{ slug: string }>();
  const { data, isLoading } = useLesson(supplierId, slug);
  const complete = useCompleteArticle(supplierId, slug);

  if (isLoading) return <div>Loading…</div>;
  if (!data) return <div>Lesson not found.</div>;

  const { lesson, quiz } = data;
  return (
    <div className="grid grid-cols-3 gap-6">
      <article
        className="col-span-2 prose"
        dangerouslySetInnerHTML={{ __html: renderLessonMarkdown(lesson.bodyMarkdown) }}
      />
      <aside className="space-y-3">
        <Link to="/supplier/learning" className="text-sm text-sky-700 underline">← Back to training</Link>
        <div className="rounded border p-3">
          <div className="font-medium">{lesson.title}</div>
          <div className="text-sm text-slate-600">{lesson.summary}</div>
          <div className="mt-1 text-xs uppercase tracking-wide text-slate-500">{lesson.track}</div>
        </div>
        {!lesson.articleCompleted && (
          <button
            onClick={() => complete.mutate()}
            disabled={complete.isPending}
            className="rounded bg-emerald-600 px-3 py-1 text-white disabled:opacity-50"
          >
            Mark article read
          </button>
        )}
        {lesson.articleCompleted && !quiz && <div className="text-emerald-700">Article complete.</div>}
        {quiz && (
          <div>
            {lesson.quizPassed ? (
              <div className="text-emerald-700">Quiz passed ✓</div>
            ) : (
              <QuizForm supplierId={supplierId} slug={slug} questions={quiz.questions} />
            )}
          </div>
        )}
      </aside>
    </div>
  );
}