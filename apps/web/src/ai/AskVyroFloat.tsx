import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useVyroAI } from '@/ask/hooks/useVyroAI';
import { useAuth } from '@/lib/auth';
import { SparklesIcon, XIcon, ArrowRightIcon } from '@/components/icons';
import { Surface } from '@/components/brand/Surface';
import { buildAskContext, type AskContextEntity } from './floatHelpers';

/**
 * Floating Ask VYRO panel — always-available entry point on every buyer page.
 * Collapsed by default; opens to a 380px panel above the mobile tab bar.
 * Page context is derived from the current pathname so the buyer can ask
 * "find something cheaper" while viewing a product and the AI fills the
 * entity from the page.
 */
export function AskVyroFloat() {
  const location = useLocation();
  const { user } = useAuth();
  const businessId = user?.memberships?.[0]?.businessId;
  const entity: AskContextEntity = useMemo(() => {
    if (typeof window === 'undefined') return {};
    // Best-effort: pick up cart lines from the cached react-query store when
    // present. The cart page also passes them via context prop on ask; for
    // now, we just attach page-level context.
    return {};
  }, [location.pathname]);
  const context = useMemo(() => buildAskContext(location.pathname, entity), [location.pathname, entity]);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { state, send } = useVyroAI();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const submit = async () => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    await send(text, { businessId, context: context as unknown });
  };

  const lastTurn = state.turns[state.turns.length - 1];

  return (
    <>
      {!open && (
        <button
          type="button"
          aria-label="Open Ask VYRO"
          onClick={() => setOpen(true)}
          className="fixed bottom-24 right-6 lg:bottom-8 z-30 size-14 rounded-full bg-ink text-volt shadow-lg hover:bg-ink/90 transition flex items-center justify-center"
        >
          <SparklesIcon size={20} />
        </button>
      )}

      {open && (
        <div
          role="dialog"
          aria-label="Ask VYRO"
          className="fixed bottom-24 right-6 lg:bottom-8 z-30 w-[calc(100vw-3rem)] max-w-[380px]"
        >
          <Surface kind="floating" className="border border-line p-0 max-h-[70vh] flex flex-col bg-paper">
            <div className="flex items-center justify-between px-4 py-3 border-b border-line">
              <div className="flex items-center gap-2">
                <SparklesIcon size={16} />
                <span className="vyro-kicker text-copper">Ask VYRO</span>
                {context?.page && context.page !== 'other' && (
                  <span className="text-[10px] font-mono uppercase text-ink/40">
                    · {context.page}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <a href="/ask" className="vyro-link text-xs">Open full →</a>
                <button
                  type="button"
                  aria-label="Close Ask VYRO"
                  onClick={() => setOpen(false)}
                  className="text-ink/40 hover:text-ink/80"
                >
                  <XIcon size={14} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 text-sm">
              {state.loading && (
                <div className="text-ink/60 text-xs font-mono uppercase">VYRO is thinking…</div>
              )}
              {state.error && (
                <div className="text-rose text-xs">{state.error.message}</div>
              )}
              {state.turns.slice(-2).map((t) => (
                <div key={t.id} className={t.role === 'user' ? 'text-right' : 'text-left'}>
                  {t.text && (
                    <div className={t.role === 'user' ? 'inline-block bg-ink/5 px-3 py-2' : 'text-ink/90'}>
                      {t.text}
                    </div>
                  )}
                </div>
              ))}
              {!state.turns.length && !state.loading && (
                <div className="text-ink/50 text-xs leading-relaxed">
                  Ask anything about your procurement. Try "find something cheaper", "build my usual order", or "why did spending increase".
                </div>
              )}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
              className="border-t border-line p-3 flex items-center gap-2"
            >
              <input
                ref={inputRef}
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Ask VYRO…"
                className="flex-1 bg-transparent outline-none text-sm"
              />
              <button
                type="submit"
                disabled={state.loading || !draft.trim()}
                aria-label="Send"
                className="text-ink/60 hover:text-ink disabled:opacity-30"
              >
                <ArrowRightIcon size={16} />
              </button>
            </form>
          </Surface>
        </div>
      )}
    </>
  );
}
