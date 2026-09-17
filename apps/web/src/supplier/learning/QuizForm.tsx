import { useState } from 'react';
import { useSubmitQuiz } from './hooks/useLearning';
import { Button } from '@/components/ui';
import { CheckCircle2Icon, RefreshCwIcon, XCircleIcon } from '@/components/icons';
import { cn } from '@vyro/ui';

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
    const passed = result.passed;
    return (
      <div
        className={cn(
          'rounded-xl border p-5 text-center',
          passed ? 'border-mint/30 bg-mint/10' : 'border-rose/30 bg-rose/5',
        )}
      >
        <div
          className={cn(
            'mx-auto flex size-11 items-center justify-center rounded-full',
            passed ? 'bg-mint/15 text-mint' : 'bg-rose/10 text-rose',
          )}
        >
          {passed ? <CheckCircle2Icon size={20} /> : <XCircleIcon size={20} />}
        </div>
        <div className="mt-3 font-display text-base font-bold text-ink">
          {passed ? 'Quiz passed' : 'Not quite yet'}
        </div>
        <div className="mt-0.5 font-mono text-xs text-ink-3 tabular-nums">
          {result.correctCount}/{result.total} correct
        </div>
        {!passed ? (
          <Button
            variant="secondary"
            size="sm"
            className="mt-4 w-full"
            icon={<RefreshCwIcon size={13} />}
            onClick={() => {
              setResult(null);
              setAnswers({});
            }}
          >
            Try again
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        void onSubmit();
      }}
    >
      {questions.map((q, qi) => (
        <fieldset key={q.id} className="space-y-2.5">
          <legend className="text-sm font-semibold leading-snug text-ink">
            <span className="mr-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-copper">
              Q{qi + 1}
            </span>
            {q.prompt}
          </legend>
          <div className="space-y-2">
            {q.options.map((o) => {
              const selected = answers[q.id] === o.id;
              return (
                <label
                  key={o.id}
                  className={cn(
                    'flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-all',
                    selected
                      ? 'border-ink bg-ink/[0.04] shadow-xs'
                      : 'border-line bg-paper hover:border-ink/30 hover:bg-mist/40',
                  )}
                >
                  <input
                    type="radio"
                    name={q.id}
                    value={o.id}
                    checked={selected}
                    onChange={() => setAnswers((a) => ({ ...a, [q.id]: o.id }))}
                    className="sr-only"
                  />
                  <span
                    className={cn(
                      'flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors',
                      selected ? 'border-ink bg-ink' : 'border-ink/30 bg-paper',
                    )}
                    aria-hidden
                  >
                    {selected ? <span className="size-1.5 rounded-full bg-volt" /> : null}
                  </span>
                  <span className={selected ? 'font-medium text-ink' : 'text-ink-2'}>{o.label}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}
      <Button type="submit" className="w-full" disabled={!allAnswered} loading={submit.isPending}>
        Submit quiz
      </Button>
      {!allAnswered ? (
        <p className="text-center text-[11px] text-ink-4">Answer all questions to submit.</p>
      ) : null}
    </form>
  );
}
