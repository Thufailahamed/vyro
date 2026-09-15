import { useState } from 'react';
import { useSubmitQuiz } from './hooks/useLearning';

interface Props {
  supplierId: string;
  slug: string;
  questions: Array<{ id: string; prompt: string; options: Array<{ id: string; label: string }> }>;
}

export function QuizForm({ supplierId, slug, questions }: Props) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ passed: boolean; correctCount: number; total: number } | null>(null);
  const submit = useSubmitQuiz(supplierId, slug);

  const allAnswered = questions.every((q) => answers[q.id]);
  const onSubmit = async () => {
    const res = await submit.mutateAsync(
      Object.entries(answers).map(([questionId, optionId]) => ({ questionId, optionId })),
    );
    setResult(res);
  };

  if (result) {
    return (
      <div className={result.passed ? 'text-emerald-700' : 'text-rose-700'}>
        {result.passed ? 'Quiz passed' : 'Quiz failed'} — {result.correctCount}/{result.total} correct
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      {questions.map((q) => (
        <fieldset key={q.id} className="mb-4">
          <legend className="font-medium">{q.prompt}</legend>
          {q.options.map((o) => (
            <label key={o.id} className="block">
              <input
                type="radio"
                name={q.id}
                value={o.id}
                onChange={() => setAnswers((a) => ({ ...a, [q.id]: o.id }))}
              />{' '}
              {o.label}
            </label>
          ))}
        </fieldset>
      ))}
      <button type="submit" disabled={!allAnswered || submit.isPending} className="rounded bg-sky-600 px-3 py-1 text-white disabled:opacity-50">
        Submit quiz
      </button>
    </form>
  );
}