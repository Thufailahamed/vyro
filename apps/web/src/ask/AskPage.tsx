import { useEffect, useRef, useState, type RefObject } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@vyro/ui';
import { useVyroAI, type ChatTurn, type ToolEntry } from './hooks/useVyroAI';
import { renderComponent, ToolTimeline } from './components';
import { FeedbackButtons } from './components/FeedbackButtons';
import { Button } from '@/components/ui';
import { Surface } from '@/components/brand/Surface';
import { FlowCanvas } from '@/components/brand/FlowLine';
import { useAuth } from '@/lib/auth';
import { usePageTitle } from '@/lib/usePageTitle';
import {
  SparklesIcon,
  ArrowRightIcon,
  RefreshCwIcon,
  XIcon,
  TrendingUpIcon,
  PackageIcon,
  StoreIcon,
  ShieldCheckIcon,
  CheckIcon,
} from '@/components/icons';

const CORE_SUGGESTIONS = [
  {
    label: 'Find cheapest suppliers',
    payload: 'find cheapest suppliers for bulk staples',
    category: 'Prices',
    desc: 'Compare mill rates across districts',
    icon: TrendingUpIcon,
  },
  {
    label: 'Build my usual order',
    payload: 'build my usual reorder from past history',
    category: 'Reorder',
    desc: 'Draft a PO from what you usually buy',
    icon: PackageIcon,
  },
  {
    label: 'What should I reorder?',
    payload: 'what should I reorder this week',
    category: 'Stock',
    desc: 'Flag items that are due based on past deliveries',
    icon: RefreshCwIcon,
  },
  {
    label: 'Where can I save?',
    payload: 'where can I save money on recent purchases',
    category: 'Savings',
    desc: 'Spot cheaper equivalent mill lots',
    icon: StoreIcon,
  },
];

const TRUST = [
  { icon: StoreIcon, label: 'Live mill prices' },
  { icon: ShieldCheckIcon, label: 'Verified suppliers' },
  { icon: CheckIcon, label: 'Confirm before any PO' },
];

function clarificationQuestions(turn: ChatTurn): string[] {
  return turn.components
    .filter((c) => c.type === 'clarification_card')
    .map((c) => String((c.data as { question?: string } | undefined)?.question ?? '').trim())
    .filter(Boolean);
}

function assistantNarrative(turn: ChatTurn): string | null {
  const text = turn.text.trim();
  if (!text) return null;
  const questions = clarificationQuestions(turn);
  if (questions.some((q) => q === text)) return null;
  return text;
}

function toolsStillRunning(tools: ToolEntry[]): boolean {
  return tools.some((t) => t.durationMs === undefined);
}

function friendlyStatus(stage?: string): string {
  if (!stage) return 'Looking at the catalog…';
  if (stage === 'Understanding your request') return 'Reading your question…';
  if (stage === 'Preparing recommendation') return 'Putting this together…';
  return stage.endsWith('…') ? stage : `${stage}…`;
}

function AskComposer({
  variant,
  prompt,
  setPrompt,
  onSubmit,
  loading,
  inputRef,
  autoFocus,
}: {
  variant: 'hero' | 'dock';
  prompt: string;
  setPrompt: (value: string) => void;
  onSubmit: (text: string) => void;
  loading: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  autoFocus?: boolean;
}) {
  const hero = variant === 'hero';
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(prompt);
      }}
      className={cn(
        'rounded-xl border bg-paper transition-shadow duration-200',
        hero
          ? 'border-ink/10 p-2.5 shadow-[0_28px_56px_-24px_rgba(12,14,11,0.65)]'
          : 'border-ink/15 p-1.5 shadow-md backdrop-blur-md bg-paper/95',
        'focus-within:border-ink focus-within:shadow-[0_0_0_3px_rgba(198,220,74,0.35)]',
      )}
    >
      <div className="flex items-center gap-2">
        <SparklesIcon size={16} className="ml-3 shrink-0 text-copper" />
        <label htmlFor="ask-vyro-input" className="sr-only">
          Ask VYRO
        </label>
        <input
          id="ask-vyro-input"
          ref={inputRef}
          autoFocus={autoFocus}
          aria-label="Ask VYRO"
          className={cn(
            'w-full min-h-12 bg-transparent text-sm text-ink placeholder:text-ink-4 focus:outline-none',
            hero && 'sm:text-base',
          )}
          placeholder={
            hero
              ? 'Cheapest 25kg samba rice, usual reorder, compare sugar…'
              : 'Ask a follow-up…'
          }
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setPrompt('');
          }}
          disabled={loading}
        />
        {prompt ? (
          <button
            type="button"
            onClick={() => setPrompt('')}
            className="inline-flex size-11 shrink-0 items-center justify-center text-ink-4 hover:text-ink"
            aria-label="Clear question"
          >
            <XIcon size={14} />
          </button>
        ) : null}
        <Button
          type="submit"
          size={hero ? 'lg' : 'md'}
          className="shrink-0"
          disabled={loading || !prompt.trim()}
          loading={loading}
        >
          {loading ? 'Looking…' : 'Ask'}
        </Button>
      </div>
    </form>
  );
}

export function AskPage() {
  usePageTitle('Ask VYRO');
  const { user } = useAuth();
  const membership = user?.memberships?.[0];
  const businessId = membership?.businessId;
  const workspaceName = membership?.businessName;

  const { state, send, clear, regenerate } = useVyroAI();
  const [prompt, setPrompt] = useState('');
  const [catalogPrompts, setCatalogPrompts] = useState<Array<{ label: string; payload: string }>>([]);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const inConversation = state.turns.length > 0;

  useEffect(() => {
    fetch((import.meta.env.VITE_API_URL?.replace(/\/$/, '') || '') + '/api/ai/suggestions', {
      credentials: 'include',
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const list = (d as { prompts?: Array<{ kind: 'product' | 'intent'; label: string; payload: string }> } | null)
          ?.prompts;
        if (!list?.length) return;
        const items = list
          .filter(
            (it) =>
              it.kind === 'product' ||
              !CORE_SUGGESTIONS.some((c) => c.label.toLowerCase() === it.label.toLowerCase()),
          )
          .slice(0, 3)
          .map((item) => ({ label: item.label, payload: item.payload }));
        if (items.length > 0) setCatalogPrompts(items);
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

  return (
    <div className={cn('pb-8', inConversation ? 'mx-auto max-w-3xl' : 'mx-auto max-w-4xl')}>
      {inConversation ? (
        <header className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-ink text-volt" aria-hidden>
              <SparklesIcon size={16} />
            </span>
            <div className="min-w-0">
              <h1 className="vyro-display text-xl text-ink sm:text-2xl">Ask VYRO</h1>
              <p className="text-xs text-ink-3">Live mill prices · nothing is ordered until you confirm</p>
            </div>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={clear} icon={<RefreshCwIcon size={13} />}>
            New chat
          </Button>
        </header>
      ) : null}

      {!inConversation ? (
        <div className="space-y-6">
          <Surface kind="ink" className="relative overflow-hidden grain p-6 sm:p-8 lg:p-10">
            <div className="pointer-events-none absolute inset-0 opacity-30">
              <FlowCanvas tone="paper" density="hero" />
            </div>
            <div className="relative z-10 space-y-6">
              <div className="max-w-2xl">
                <div className="inline-flex items-center gap-2 rounded-md border border-paper/15 bg-paper/10 px-3 py-1">
                  <span className="size-1.5 rounded-full bg-volt motion-safe:animate-pulse" />
                  <p className="vyro-kicker text-volt">
                    Ask VYRO{workspaceName ? ` · ${workspaceName}` : ''}
                  </p>
                </div>
                <h1 className="mt-4 vyro-display text-4xl leading-[0.92] text-paper sm:text-5xl">
                  What do you need?
                </h1>
                <p className="mt-3 max-w-xl text-sm leading-relaxed text-paper/75">
                  Ask in plain language. Quotes come from the live wholesale catalog — nothing is purchased until you confirm.
                </p>
              </div>

              <AskComposer
                variant="hero"
                prompt={prompt}
                setPrompt={setPrompt}
                onSubmit={submit}
                loading={state.loading}
                inputRef={inputRef}
                autoFocus
              />

              {catalogPrompts.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-[10px] font-mono font-bold uppercase tracking-[0.14em] text-paper/65">
                    From your catalog
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {catalogPrompts.map((cp) => (
                      <button
                        key={cp.payload}
                        type="button"
                        onClick={() => submit(cp.payload)}
                        disabled={state.loading}
                        className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-paper/20 bg-paper/10 px-3 text-xs text-paper hover:border-volt hover:text-volt"
                      >
                        <span>{cp.label}</span>
                        <ArrowRightIcon size={11} className="opacity-70" />
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              <ul className="grid gap-2 sm:grid-cols-3">
                {TRUST.map((item) => (
                  <li
                    key={item.label}
                    className="flex items-center gap-2.5 rounded-lg border border-paper/10 bg-paper/5 px-3 py-2.5"
                  >
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-volt/20 text-volt">
                      <item.icon size={13} />
                    </span>
                    <span className="text-xs font-medium text-paper/85">{item.label}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Surface>

          <div className="grid gap-3 sm:grid-cols-2">
            {CORE_SUGGESTIONS.map((s) => {
              const Icon = s.icon;
              return (
                <button
                  key={s.payload}
                  type="button"
                  onClick={() => submit(s.payload)}
                  disabled={state.loading}
                  className="group vyro-elevated p-5 text-left transition duration-200 hover:-translate-y-0.5 motion-reduce:transform-none"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="flex size-10 items-center justify-center rounded-lg bg-ink text-volt">
                      <Icon size={16} />
                    </span>
                    <ArrowRightIcon
                      size={14}
                      className="mt-1 shrink-0 text-ink-4 transition-transform group-hover:translate-x-0.5 group-hover:text-ink"
                    />
                  </div>
                  <span className="mt-4 block text-[10px] font-mono font-bold uppercase tracking-wider text-copper">
                    {s.category}
                  </span>
                  <div className="mt-1 font-display text-base font-semibold text-ink">{s.label}</div>
                  <p className="mt-1 text-sm leading-relaxed text-ink-3">{s.desc}</p>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {inConversation ? (
        <div className="mt-6 space-y-5" aria-live="polite">
          {state.turns.map((turn, index) => {
            if (turn.role === 'user') {
              return (
                <div key={turn.id} className="flex justify-end">
                  <div className="max-w-[min(85%,28rem)] rounded-xl bg-ink px-4 py-2.5 text-sm leading-relaxed text-paper">
                    {turn.text}
                  </div>
                </div>
              );
            }
            const pending =
              state.loading &&
              index === state.turns.length - 1 &&
              !turn.error &&
              !turn.text &&
              turn.components.length === 0 &&
              turn.tools.length === 0;
            if (pending) return null;
            return (
              <AssistantTurn
                key={turn.id}
                turn={turn}
                isLast={index === state.turns.length - 1}
                loading={state.loading}
                lastUserPrompt={lastUserPrompt}
                onRetry={() => submit(lastUserPrompt)}
                onRegenerate={() => regenerate()}
                onPick={(opt) => submit(opt)}
              />
            );
          })}

          {state.loading ? (
            <div className="flex items-center gap-3 text-sm text-ink-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-volt/25" aria-hidden>
                <SparklesIcon size={14} className="text-ink" />
              </span>
              <span className="flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-volt motion-safe:animate-pulse" />
                {friendlyStatus(state.status)}
              </span>
            </div>
          ) : null}
          <div ref={bottomRef} />
        </div>
      ) : null}

      {inConversation ? (
        <div className="sticky bottom-20 z-20 mt-6 lg:bottom-4">
          <AskComposer
            variant="dock"
            prompt={prompt}
            setPrompt={setPrompt}
            onSubmit={submit}
            loading={state.loading}
            inputRef={inputRef}
          />
        </div>
      ) : null}
    </div>
  );
}

function AssistantTurn({
  turn,
  isLast,
  loading,
  lastUserPrompt,
  onRetry,
  onRegenerate,
  onPick,
}: {
  turn: ChatTurn;
  isLast: boolean;
  loading: boolean;
  lastUserPrompt: string;
  onRetry: () => void;
  onRegenerate: () => void;
  onPick: (opt: string) => void;
}) {
  const narrative = assistantNarrative(turn);
  const showTools = turn.tools.length > 0 && (loading || toolsStillRunning(turn.tools));
  const actionLinks = turn.actions.map((a, i) => (
    <Link
      key={`${a.href}-${i}`}
      to={a.href}
      className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-ink/15 bg-paper px-3 text-xs font-medium text-ink hover:border-ink"
    >
      {a.label}
      <ArrowRightIcon size={11} className="text-ink-4" />
    </Link>
  ));

  return (
    <div className="flex items-start gap-3">
      <span
        className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-volt/25 text-ink"
        aria-hidden
      >
        <SparklesIcon size={14} />
      </span>
      <div className="min-w-0 flex-1 space-y-3">
        {turn.error ? (
          <Surface kind="flat" className="space-y-2 border-rose/25 p-4">
            <p className="text-sm leading-relaxed text-ink">{turn.error.message}</p>
            {lastUserPrompt ? (
              <button
                type="button"
                onClick={onRetry}
                disabled={loading}
                className="inline-flex min-h-11 items-center gap-1.5 text-xs font-medium text-ink hover:text-copper"
              >
                <RefreshCwIcon size={11} className={loading ? 'animate-spin' : ''} />
                Try again
              </button>
            ) : null}
          </Surface>
        ) : null}

        {showTools ? <ToolTimeline tools={turn.tools} /> : null}

        {narrative ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{narrative}</p>
        ) : null}

        {turn.components.map((c, i) => renderComponent(c, i, onPick))}

        {turn.actions.length > 0 ? <div className="flex flex-wrap gap-2">{actionLinks}</div> : null}

        {isLast && !turn.error && turn.requestId && !loading ? (
          <div className="flex flex-wrap items-center gap-1">
            <FeedbackButtons
              requestId={turn.requestId}
              {...(turn.meta?.intent ? { intentHint: turn.meta.intent } : {})}
            />
            {lastUserPrompt ? (
              <button
                type="button"
                onClick={onRegenerate}
                disabled={loading}
                className="inline-flex min-h-11 items-center px-2 text-[11px] text-ink-4 hover:text-ink"
              >
                Ask again
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default AskPage;
