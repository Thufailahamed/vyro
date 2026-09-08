import { useEffect, useState } from 'react';
import { useVyroAI } from './hooks/useVyroAI';
import { renderComponent } from './components';

const SUGGESTIONS_KEY = 'vyro-ai-suggestions';

export function AskPage() {
  const { state, send } = useVyroAI();
  const [prompt, setPrompt] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([
    'Find my cheapest suppliers',
    'Build my usual order',
    'What should I reorder?',
    'Where can I save?',
    'How much did I spend this month?',
  ]);

  useEffect(() => {
    fetch('/api/ai/suggestions', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const list = (d as { suggestions?: string[] } | null)?.suggestions;
        if (list?.length) setSuggestions(list);
      })
      .catch(() => undefined);
  }, []);

  const submit = async (text: string) => {
    if (!text.trim() || state.loading) return;
    setPrompt('');
    await send(text);
  };

  return (
    <div className="max-w-3xl mx-auto p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Ask VYRO</h1>
        <p className="text-sm text-slate-600 mt-1">
          Procurement intelligence — search, compare, and optimize using your real purchase data.
        </p>
      </header>

      <div className="rounded-lg border border-slate-200 bg-white p-3 flex gap-2">
        <input
          aria-label="Ask VYRO"
          className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="e.g. cheapest samba rice, how much did I spend last month"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(prompt); }}
          disabled={state.loading}
        />
        <button
          type="button"
          className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          onClick={() => submit(prompt)}
          disabled={state.loading || !prompt.trim()}
        >
          {state.loading ? 'Thinking…' : 'Ask'}
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            className="text-xs px-3 py-1 rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200"
            onClick={() => submit(s)}
            disabled={state.loading}
          >
            {s}
          </button>
        ))}
      </div>

      {state.status && (
        <div className="mt-4 text-xs text-slate-500">{state.status}…</div>
      )}

      {state.error && (
        <div className="mt-4 rounded border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          <strong>{state.error.code}</strong> — {state.error.message}
        </div>
      )}

      <div className="mt-6 space-y-4">
        {state.components.map((c, i) => renderComponent(c, i))}
      </div>

      {state.summary && (
        <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="text-sm text-slate-700 whitespace-pre-wrap">{state.summary}</div>
          {state.actions.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {state.actions.map((a, i) => (
                <a
                  key={i}
                  href={a.href}
                  className="text-xs px-2 py-1 rounded border border-slate-300 hover:bg-white"
                >
                  {a.label}
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default AskPage;
