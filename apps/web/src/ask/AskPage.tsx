import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useVyroAI } from './hooks/useVyroAI';
import { renderComponent } from './components';

export function AskPage() {
  const { state, send, clear } = useVyroAI();
  const [prompt, setPrompt] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([
    'Find my cheapest suppliers',
    'Build my usual order',
    'What should I reorder?',
    'Where can I save?',
    'How much did I spend this month?',
  ]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/ai/suggestions', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const list = (d as { suggestions?: string[] } | null)?.suggestions;
        if (list?.length) setSuggestions(list);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [state.turns.length, state.status]);

  const submit = async (text: string) => {
    if (!text.trim() || state.loading) return;
    setPrompt('');
    await send(text);
  };

  return (
    <div className="mx-auto max-w-3xl px-4 pb-16 pt-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-500">
            VYRO Intelligence
          </div>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-stone-900">
            Ask VYRO
          </h1>
          <p className="mt-1 max-w-xl text-sm leading-relaxed text-stone-600">
            Your procurement expert — grounded in your real purchase history, current supplier
            prices, and delivery options. It never guesses; every figure cites its source.
          </p>
        </div>
        {state.turns.length > 0 && (
          <button
            type="button"
            onClick={clear}
            className="shrink-0 rounded-full border border-stone-300 px-3 py-1 text-xs font-medium text-stone-600 hover:border-stone-900 hover:text-stone-900"
          >
            New chat
          </button>
        )}
      </header>

      {state.turns.length === 0 && (
        <div className="mt-6 grid gap-2 sm:grid-cols-2">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => submit(s)}
              disabled={state.loading}
              className="rounded-xl border border-stone-200 bg-white px-4 py-3 text-left text-sm font-medium text-stone-800 transition hover:border-stone-900 hover:shadow-sm disabled:opacity-50"
            >
              {s}
              <span aria-hidden className="ml-2 text-stone-400">→</span>
            </button>
          ))}
        </div>
      )}

      <div className="mt-6 space-y-5" aria-live="polite">
        {state.turns.map((turn) =>
          turn.role === 'user' ? (
            <div key={turn.id} className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-br-md bg-stone-900 px-4 py-2.5 text-sm text-white">
                {turn.text}
              </div>
            </div>
          ) : (
            <div key={turn.id} className="space-y-3">
              {turn.error && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
                  <strong>{turn.error.code}</strong> — {turn.error.message}
                </div>
              )}
              {turn.components.map((c, i) => renderComponent(c, i, (opt) => submit(opt)))}
              {turn.text && (
                <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
                  <div className="whitespace-pre-wrap text-sm leading-relaxed text-stone-800">{turn.text}</div>
                  {turn.actions.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {turn.actions.map((a, i) => (
                        <Link
                          key={i}
                          to={a.href}
                          className="rounded-full bg-stone-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-stone-700"
                        >
                          {a.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ),
        )}

        {state.loading && (
          <div className="flex items-center gap-2.5 rounded-xl border border-stone-200 bg-white px-4 py-3">
            <span aria-hidden className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-600" />
            </span>
            <span className="text-sm text-stone-600">
              {state.status ? `${state.status}…` : 'Working…'}
            </span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {state.turns.length > 0 && !state.loading && (
        <div className="mt-4 flex flex-wrap gap-2">
          {suggestions.slice(0, 4).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => submit(s)}
              className="rounded-full bg-stone-100 px-3 py-1 text-xs text-stone-700 hover:bg-stone-200"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="sticky bottom-4 mt-6">
        <div className="flex gap-2 rounded-2xl border border-stone-900/10 bg-white/95 p-2 shadow-lg backdrop-blur">
          <input
            aria-label="Ask VYRO"
            className="flex-1 rounded-xl px-3 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none"
            placeholder="e.g. cheapest 25kg samba rice, how much did I spend on chicken last month"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(prompt); }}
            disabled={state.loading}
          />
          <button
            type="button"
            className="shrink-0 rounded-xl bg-stone-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-stone-700 disabled:opacity-50"
            onClick={() => submit(prompt)}
            disabled={state.loading || !prompt.trim()}
          >
            {state.loading ? 'Thinking…' : 'Ask'}
          </button>
        </div>
        <p className="mt-2 text-center text-[11px] text-stone-400">
          VYRO AI answers from your business data. Confirm quantities before ordering.
        </p>
      </div>
    </div>
  );
}

export default AskPage;
