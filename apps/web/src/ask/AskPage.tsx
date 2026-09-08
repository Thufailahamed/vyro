import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useVyroAI } from './hooks/useVyroAI';
import { renderComponent, ToolTimeline, MetricTile } from './components';
import { FeedbackButtons } from './components/FeedbackButtons';
import { PageHeader } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import {
  SparklesIcon,
  SearchIcon,
  TrendingUpIcon,
  ArrowRightIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
  XIcon,
  StoreIcon,
} from '@/components/icons';

const CORE_SUGGESTIONS = [
  {
    label: 'Find cheapest suppliers',
    payload: 'find cheapest suppliers for bulk staples',
    category: 'Market Intelligence',
    desc: 'Compare wholesale mill rates across 25 Sri Lankan districts',
  },
  {
    label: 'Build my usual order',
    payload: 'build my usual reorder from past history',
    category: 'Smart Reordering',
    desc: 'Draft purchase order matched to consumption velocity',
  },
  {
    label: 'What should I reorder?',
    payload: 'what should I reorder this week',
    category: 'Stock Replenishment',
    desc: 'Identifies inventory safety thresholds & lead times',
  },
  {
    label: 'Where can I save?',
    payload: 'where can I save money on recent purchases',
    category: 'Spend Arbitrage',
    desc: 'Spot lower cost wholesale tier substitutions',
  },
];

export function AskPage() {
  const { user } = useAuth();
  const business = user?.memberships?.[0];
  const businessId = business?.businessId;
  const businessName = business?.businessName ?? 'Commercial Workspace';

  const { state, send, clear, regenerate } = useVyroAI();
  const [prompt, setPrompt] = useState('');
  const [catalogPrompts, setCatalogPrompts] = useState<Array<{ label: string; payload: string }>>([]);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/ai/suggestions', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const list = (d as { prompts?: Array<{ kind: 'product' | 'intent'; label: string; payload: string }> } | null)?.prompts;
        if (list?.length) {
          const items = list
            .filter((it) => it.kind === 'product' || !CORE_SUGGESTIONS.some((c) => c.label.toLowerCase() === it.label.toLowerCase()))
            .slice(0, 5)
            .map((item) => ({
              label: item.label,
              payload: item.payload,
            }));
          if (items.length > 0) setCatalogPrompts(items);
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [state.turns.length, state.status]);

  const submit = async (text: string) => {
    if (!text.trim() || state.loading) return;
    setPrompt('');
    await send(text, { businessId });
  };

  const lastUserPrompt = (() => {
    for (let i = state.turns.length - 1; i >= 0; i--) {
      if (state.turns[i]!.role === 'user') return state.turns[i]!.text;
    }
    return '';
  })();

  // Session-level aggregate for the metric tile grid. Honest scope:
  // reflects the current Ask session only, not the day's tenant totals.
  const sessionMetrics = (() => {
    const assistantTurns = state.turns.filter((t) => t.role === 'assistant');
    const completed = assistantTurns.filter((t) => t.meta && !t.error);
    const latencies = completed.map((t) => t.meta!.latencyMs);
    const totalLatency = latencies.reduce((a, b) => a + b, 0);
    const avgLatencyMs = latencies.length ? Math.round(totalLatency / latencies.length) : 0;
    const successRate = assistantTurns.length
      ? completed.length / assistantTurns.length
      : 0;
    const tokensIn = completed.reduce((a, t) => a + (t.meta?.tokensIn ?? 0), 0);
    const tokensOut = completed.reduce((a, t) => a + (t.meta?.tokensOut ?? 0), 0);
    // Approx USD: 0.02/1k in + 0.06/1k out (Workers AI class model).
    const costUsd = (tokensIn / 1000) * 0.02 + (tokensOut / 1000) * 0.06;
    return {
      turns: completed.length,
      avgLatencyMs,
      successRate,
      costUsd: Math.round(costUsd * 100) / 100,
    };
  })();

  return (
    <div className="mx-auto max-w-4xl px-4 pb-16 pt-6 space-y-8">
      {/* Executive Page Header */}
      <PageHeader
        kicker={
          <div className="flex flex-wrap items-center gap-2">
            <span className="vyro-kicker text-copper">Procurement Intelligence</span>
            <span className="text-ink-4">/</span>
            <span className="text-[11px] font-mono text-ink-3">{businessName}</span>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-volt/15 border border-volt/30 text-[10px] font-mono font-bold text-ink uppercase tracking-wider">
              <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Real-Time Catalog Engine
            </span>
          </div>
        }
        title="Ask VYRO"
        sub="Your autonomous procurement co-pilot — grounded in live Sri Lankan wholesale supplier quotes, verified stock allotments, and your historical purchasing ledger. Zero hallucination; every recommendation cites real prices."
        actions={
          state.turns.length > 0 ? (
            <button
              type="button"
              onClick={clear}
              className="inline-flex items-center gap-1.5 h-8 px-3.5 text-xs font-mono font-bold bg-paper border border-ink/20 hover:border-ink text-ink transition-colors shadow-xs"
            >
              <RefreshCwIcon size={12} />
              <span>Reset Session</span>
            </button>
          ) : (
            <Link
              to="/marketplace"
              className="hidden sm:inline-flex items-center gap-1.5 h-8 px-3.5 text-xs font-mono font-bold bg-paper border border-ink/15 hover:border-ink text-ink transition-colors shadow-xs"
            >
              <StoreIcon size={13} className="text-copper" />
              <span>Browse Catalog →</span>
            </Link>
          )
        }
      />

      {/* Session Metrics Tile Grid — only meaningful after first turn */}
      {sessionMetrics.turns > 0 && (
        <div
          className="grid grid-cols-2 sm:grid-cols-4 gap-3"
          data-testid="session-metrics"
        >
          <MetricTile
            kicker="Session"
            value={sessionMetrics.turns.toString()}
            suffix={sessionMetrics.turns === 1 ? 'request' : 'requests'}
          />
          <MetricTile
            kicker="Avg latency"
            value={sessionMetrics.avgLatencyMs.toString()}
            suffix="ms"
          />
          <MetricTile
            kicker="Success"
            value={`${Math.round(sessionMetrics.successRate * 100)}`}
            suffix="%"
          />
          <MetricTile
            kicker="Session cost"
            value={`$${sessionMetrics.costUsd.toFixed(2)}`}
            suffix="approx"
          />
        </div>
      )}

      {/* Empty State: Centered Hero Command Console & Intelligence Deck */}
      {state.turns.length === 0 && (
        <div className="space-y-8">
          {/* Hero Tactical Command Console */}
          <div className="bg-paper border border-ink/25 shadow-md p-2 space-y-2.5 transition-all focus-within:border-ink focus-within:shadow-lg">
            <div className="relative flex items-center gap-2">
              <div className="pl-3 text-copper flex items-center shrink-0">
                <SparklesIcon size={18} />
              </div>
              <input
                ref={inputRef}
                autoFocus
                aria-label="Ask VYRO Procurement AI"
                className="w-full h-13 text-sm sm:text-base bg-transparent placeholder:text-ink-4 text-ink font-sans focus:outline-none"
                placeholder="Ask VYRO e.g. cheapest 25kg samba rice, build my usual reorder, compare sugar prices…"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submit(prompt);
                  if (e.key === 'Escape') setPrompt('');
                }}
                disabled={state.loading}
              />
              {prompt && (
                <button
                  type="button"
                  onClick={() => setPrompt('')}
                  className="p-1.5 text-ink-4 hover:text-ink transition-colors shrink-0"
                  aria-label="Clear input"
                >
                  <XIcon size={14} />
                </button>
              )}
              <button
                type="button"
                className="inline-flex items-center gap-2 h-11 px-5 bg-ink text-paper hover:bg-charcoal disabled:opacity-40 disabled:pointer-events-none text-xs font-mono font-bold uppercase tracking-wider transition-all shrink-0 shadow-sm"
                onClick={() => submit(prompt)}
                disabled={state.loading || !prompt.trim()}
              >
                {state.loading ? (
                  <>
                    <span className="size-2 rounded-full bg-volt animate-ping" />
                    <span>Analyzing…</span>
                  </>
                ) : (
                  <>
                    <span>Consult</span>
                    <span className="text-[10px] px-1.5 py-0.5 bg-paper/20 text-paper font-mono">↵</span>
                  </>
                )}
              </button>
            </div>

            <div className="pt-2 pb-1 px-3 border-t border-ink/10 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-ink-4">
              <div className="flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-emerald-500" />
                <span>Grounded in active Sri Lanka wholesale catalog &amp; historical ledger</span>
              </div>
              <span>Zero hallucination · 25 districts</span>
            </div>
          </div>

          {/* Trending Live Inquiries (if loaded from catalog) */}
          {catalogPrompts.length > 0 && (
            <div className="space-y-2">
              <div className="text-[10px] font-mono uppercase tracking-wider font-bold text-ink-3">
                Live Commodity Inquiries
              </div>
              <div className="flex flex-wrap gap-2">
                {catalogPrompts.map((cp, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => submit(cp.payload)}
                    disabled={state.loading}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono bg-paper hover:bg-bone border border-ink/15 hover:border-ink text-ink transition-all shadow-xs group"
                  >
                    <span>{cp.label}</span>
                    <ArrowRightIcon size={11} className="text-ink-4 group-hover:text-ink transition-colors" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Quick Trigger Cards (Curated 2x2 Matrix) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase tracking-wider font-bold text-ink-3">
                Rapid Procurement Inquiries
              </span>
              <span className="text-[10px] font-mono text-ink-4">
                Click to initiate conversational execution
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {CORE_SUGGESTIONS.map((s, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => submit(s.payload)}
                  disabled={state.loading}
                  className="group relative p-4 bg-paper border border-ink/15 hover:border-ink text-left shadow-xs hover:shadow-md transition-all flex flex-col justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-copper font-bold">
                        {s.category}
                      </span>
                      <ArrowRightIcon
                        size={13}
                        className="text-ink-4 group-hover:text-ink group-hover:translate-x-0.5 transition-all"
                      />
                    </div>
                    <div className="font-display font-semibold text-ink text-sm group-hover:text-copper transition-colors">
                      {s.label}
                    </div>
                  </div>
                  <div className="text-[11px] text-ink-4 font-mono leading-relaxed">
                    {s.desc}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Intelligence Capabilities Architecture */}
          <div className="grid sm:grid-cols-3 gap-3 pt-2">
            <div className="p-3.5 bg-paper border border-ink/15 shadow-xs space-y-1.5">
              <div className="flex items-center gap-2">
                <div className="size-6 bg-bone border border-ink/10 flex items-center justify-center text-copper">
                  <TrendingUpIcon size={13} />
                </div>
                <div className="font-display font-semibold text-ink text-xs">Price Arbitrage</div>
              </div>
              <p className="text-[11px] text-ink-4 leading-relaxed font-sans">
                Evaluates multi-mill quotes across Colombo, Kurunegala, and Kandy to locate lowest landed wholesale cost.
              </p>
            </div>

            <div className="p-3.5 bg-paper border border-ink/15 shadow-xs space-y-1.5">
              <div className="flex items-center gap-2">
                <div className="size-6 bg-bone border border-ink/10 flex items-center justify-center text-volt-deep">
                  <SparklesIcon size={13} />
                </div>
                <div className="font-display font-semibold text-ink text-xs">Automated Reordering</div>
              </div>
              <p className="text-[11px] text-ink-4 leading-relaxed font-sans">
                Constructs complete multi-line purchase orders from previous orders and applies live supplier pack sizes.
              </p>
            </div>

            <div className="p-3.5 bg-paper border border-ink/15 shadow-xs space-y-1.5">
              <div className="flex items-center gap-2">
                <div className="size-6 bg-bone border border-ink/10 flex items-center justify-center text-mint">
                  <ShieldCheckIcon size={13} />
                </div>
                <div className="font-display font-semibold text-ink text-xs">Verified Suppliers Only</div>
              </div>
              <p className="text-[11px] text-ink-4 leading-relaxed font-sans">
                Strict guardrails prevent unverified vendors from bidding. Every SKU is tied to active fulfillment routes.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Conversation Thread */}
      <div className="space-y-6" aria-live="polite">
        {state.turns.map((turn, index) =>
          turn.role === 'user' ? (
            <div key={turn.id} className="flex justify-end">
              <div className="max-w-[85%] bg-ink text-paper border border-ink/20 px-4 py-3 shadow-sm">
                <div className="text-[10px] font-mono uppercase tracking-wider text-paper/50 mb-1">
                  Buyer Query
                </div>
                <div className="text-sm font-medium leading-relaxed font-sans">{turn.text}</div>
              </div>
            </div>
          ) : (
            <div key={turn.id} className="space-y-4">
              {turn.error && (
                <div className="p-4 bg-paper border border-rose/30 shadow-sm space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="size-2 rounded-full bg-rose animate-pulse" />
                      <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-rose">
                        {turn.error.code}
                      </span>
                    </div>
                    {lastUserPrompt && (
                      <button
                        type="button"
                        onClick={() => submit(lastUserPrompt)}
                        disabled={state.loading}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-mono font-bold bg-bone hover:bg-bone-dark border border-ink/15 text-ink transition-colors"
                      >
                        <RefreshCwIcon size={11} className={state.loading ? 'animate-spin' : ''} />
                        <span>Retry Query</span>
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-ink leading-relaxed font-sans">
                    {turn.error.message}
                  </p>
                </div>
              )}

              {/* Tool Execution Timeline */}
              {turn.tools.length > 0 && <ToolTimeline tools={turn.tools} />}

              {/* Dynamic Interactive Cards (Recommendations, Supplier comparison, Savings, etc.) */}
              {turn.components.map((c, i) => renderComponent(c, i, (opt) => submit(opt)))}

              {/* Telemetry Bar */}
              {turn.meta && (
                <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-bone/60 border border-ink/10 text-[10px] font-mono text-ink-4 uppercase tracking-wider">
                  <div className="flex items-center gap-2">
                    <span className="text-copper font-semibold">{turn.meta.intent}</span>
                    <span>·</span>
                    <span>{turn.meta.provider}</span>
                    <span>·</span>
                    <span>{turn.meta.model.replace(/^@cf\/[^/]+\//, '')}</span>
                    <span>·</span>
                    <span className="num-tabular">{turn.meta.latencyMs}ms</span>
                    <span>·</span>
                    <span className="num-tabular">{turn.meta.tokensIn + turn.meta.tokensOut} tokens</span>
                  </div>
                  {index === state.turns.length - 1 && lastUserPrompt && (
                    <button
                      type="button"
                      onClick={() => regenerate()}
                      disabled={state.loading}
                      className="text-ink hover:text-copper font-semibold transition-colors"
                    >
                      ↺ Regenerate Analysis
                    </button>
                  )}
                </div>
              )}

              {/* Assistant Plain Narrative */}
              {turn.text && (
                <div className="p-5 bg-paper border border-ink/15 shadow-sm space-y-3">
                  <div className="flex items-center gap-2">
                    <SparklesIcon size={14} className="text-volt-deep" />
                    <span className="text-[10px] font-mono uppercase tracking-wider font-bold text-ink-3">
                      Procurement Verdict
                    </span>
                  </div>
                  <div className="whitespace-pre-wrap text-sm leading-relaxed text-ink font-sans">
                    {turn.text}
                  </div>
                  {turn.actions.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-ink/10 flex flex-wrap gap-2">
                      {turn.actions.map((a, i) => (
                        <Link
                          key={i}
                          to={a.href}
                          className="inline-flex items-center gap-1.5 h-8 px-3.5 text-xs font-mono font-bold uppercase tracking-wider bg-ink text-paper hover:bg-charcoal transition-colors shadow-sm"
                        >
                          <span>{a.label}</span>
                          <ArrowRightIcon size={11} className="text-volt" />
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Feedback (final, successful turn only). */}
              {index === state.turns.length - 1 && !turn.error && turn.requestId && !state.loading && (
                <FeedbackButtons
                  requestId={turn.requestId}
                  {...(turn.meta?.intent ? { intentHint: turn.meta.intent } : {})}
                />
              )}
            </div>
          ),
        )}

        {/* Live Streaming Indicator */}
        {state.loading && (
          <div className="p-4 bg-paper border border-ink/15 shadow-sm flex items-center justify-between gap-3 animate-pulse">
            <div className="flex items-center gap-3">
              <span className="size-2 rounded-full bg-volt-deep animate-ping" />
              <span className="text-xs font-mono text-ink font-medium">
                {state.status ? `${state.status}…` : 'Synthesizing wholesale market data…'}
              </span>
            </div>
            <span className="text-[10px] font-mono uppercase text-ink-4">VYRO AI v2.4</span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Suggested Follow-ups after interaction */}
      {state.turns.length > 0 && !state.loading && (
        <div className="space-y-2 pt-2">
          <span className="text-[10px] font-mono uppercase tracking-wider text-ink-4 font-bold">
            Suggested Next Inquiries
          </span>
          <div className="flex flex-wrap gap-2">
            {CORE_SUGGESTIONS.map((s, i) => (
              <button
                key={`followup-${i}`}
                type="button"
                onClick={() => submit(s.payload)}
                className="px-3 py-1.5 text-xs font-mono bg-paper hover:bg-bone border border-ink/15 hover:border-ink text-ink transition-colors shadow-xs"
              >
                {s.label} →
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Floating Tactical Command Console (Only active when in conversation) */}
      {state.turns.length > 0 && (
        <div className="sticky bottom-6 z-20">
          <div className="p-2 bg-paper/95 backdrop-blur-md border border-ink/20 shadow-xl">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <SearchIcon
                  size={16}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-4"
                />
                <input
                  ref={inputRef}
                  aria-label="Ask VYRO Procurement AI"
                  className="w-full h-11 pl-10 pr-8 text-sm bg-transparent placeholder:text-ink-4 text-ink font-sans focus:outline-none"
                  placeholder="Ask a follow-up e.g. compare with Pettah mills, draft purchase order…"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') submit(prompt);
                    if (e.key === 'Escape') setPrompt('');
                  }}
                  disabled={state.loading}
                />
                {prompt && (
                  <button
                    type="button"
                    onClick={() => setPrompt('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-ink-4 hover:text-ink transition-colors"
                    aria-label="Clear input"
                  >
                    <XIcon size={13} />
                  </button>
                )}
              </div>

              <button
                type="button"
                className="inline-flex items-center gap-2 h-11 px-5 bg-ink text-paper hover:bg-charcoal disabled:opacity-40 disabled:pointer-events-none text-xs font-mono font-bold uppercase tracking-wider transition-all shrink-0 shadow-sm"
                onClick={() => submit(prompt)}
                disabled={state.loading || !prompt.trim()}
              >
                {state.loading ? (
                  <>
                    <span className="size-2 rounded-full bg-volt animate-ping" />
                    <span>Analyzing…</span>
                  </>
                ) : (
                  <>
                    <span>Consult</span>
                    <span className="text-[10px] px-1.5 py-0.5 bg-paper/20 text-paper font-mono">↵</span>
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="mt-2 flex items-center justify-between px-2 text-[10px] font-mono text-ink-4">
            <span>Grounding: Active Sri Lanka Wholesale Catalog &amp; Past Ledger</span>
            <span>Confirmation required before issuing Purchase Orders</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default AskPage;
