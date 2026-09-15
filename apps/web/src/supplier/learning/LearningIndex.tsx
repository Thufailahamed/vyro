import { Link } from 'react-router-dom';
import { useSupplierId } from '../useSupplierId';
import { useLessons } from './hooks/useLearning';

const STATUS_LABEL = {
  none: 'Not started',
  article: 'Article read',
  quiz: 'Quiz passed',
} as const;

function status(articleCompleted: boolean, quizPassed: boolean) {
  if (quizPassed) return 'quiz' as const;
  if (articleCompleted) return 'article' as const;
  return 'none' as const;
}

export function LearningIndex() {
  const { supplierId } = useSupplierId();
  const { data, isLoading } = useLessons(supplierId);
  if (isLoading) return <div>Loading…</div>;
  const lessons = data?.lessons ?? [];
  const onboarding = lessons.filter((l) => l.track === 'onboarding');
  const operations = lessons.filter((l) => l.track === 'operations');
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Training center</h1>
      <section>
        <h2 className="text-lg font-medium">Onboarding</h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {onboarding.map((l) => (
            <li key={l.slug} className="rounded border p-3">
              <Link to={`/supplier/learning/${l.slug}`} className="font-medium hover:underline">{l.title}</Link>
              <div className="text-sm text-slate-600">{l.summary}</div>
              <div className="mt-1 text-xs text-slate-500">{STATUS_LABEL[status(l.articleCompleted, l.quizPassed)]}</div>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="text-lg font-medium">Operations</h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {operations.map((l) => (
            <li key={l.slug} className="rounded border p-3">
              <Link to={`/supplier/learning/${l.slug}`} className="font-medium hover:underline">{l.title}</Link>
              <div className="text-sm text-slate-600">{l.summary}</div>
              <div className="mt-1 text-xs text-slate-500">{STATUS_LABEL[status(l.articleCompleted, l.quizPassed)]}</div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}