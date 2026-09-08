import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { greetingForHour, savingsHeadline, moveHeadline, healthHeadline, concentrationLabel, type HomePayload } from './home';

/**
 * VYRO AI home: proactive procurement intelligence, pulled on demand.
 * Each card shows evidence + action; per-card failure degrades gracefully.
 */
export function AiHomePage() {
  const { user } = useAuth();
  const businessName = user?.memberships?.[0]?.businessName ?? 'Your business';
  const [data, setData] = useState<HomePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/ai/home', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => {
        if (!cancelled) {
          setData(d as HomePayload);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load');
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const greeting = greetingForHour(new Date().getHours());

  return (
    <div className="mx-auto max-w-4xl px-4 pb-16 pt-6 space-y-8">
      <PageHeader
        kicker={<span className="vyro-kicker text-copper">VYRO AI</span>}
        title={`${greeting} — here's what VYRO found for ${businessName}.`}
        sub="Proactive procurement intelligence, grounded in your purchase history and live supplier offers."
        actions={
          <Link
            to="/ask"
            className="inline-flex items-center gap-1.5 h-8 px-3.5 text-xs font-mono font-bold bg-ink text-paper hover:bg-charcoal transition-colors shadow-xs"
          >
            <span>Ask VYRO →</span>
          </Link>
        }
      />

      {loading && <div className="p-4 bg-paper border border-ink/15 text-xs font-mono text-ink-4 animate-pulse">Loading intelligence…</div>}
      {error && <div className="p-4 bg-paper border border-rose/30 text-xs text-ink">Could not load intelligence ({error}). Try Ask VYRO instead.</div>}

      {data && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="p-4 bg-paper border border-ink/15 shadow-xs space-y-2">
            <div className="text-[10px] font-mono uppercase tracking-wider font-bold text-ink-3">Potential savings</div>
            <div className="font-display text-lg font-semibold text-ink">{savingsHeadline(data.savingsTotal)}</div>
            <Link to="/analytics" className="text-xs font-mono font-bold text-copper hover:underline">Explore savings →</Link>
          </div>
          <div className="p-4 bg-paper border border-ink/15 shadow-xs space-y-2">
            <div className="text-[10px] font-mono uppercase tracking-wider font-bold text-ink-3">Price moves</div>
            <div className="font-display text-lg font-semibold text-ink">{moveHeadline(data.topMoves)}</div>
            <Link to="/analytics" className="text-xs font-mono font-bold text-copper hover:underline">View changes →</Link>
          </div>
          <div className="p-4 bg-paper border border-ink/15 shadow-xs space-y-2">
            <div className="text-[10px] font-mono uppercase tracking-wider font-bold text-ink-3">Supplier concentration</div>
            <div className="font-display text-lg font-semibold text-ink">
              {concentrationLabel(data.concentrationRisk.topSupplierShare)}
            </div>
            <div className="text-xs text-ink-3">
              {data.concentration.length
                ? `${data.concentration[0]!.supplierName}: ${Math.round(data.concentration[0]!.share * 100)}% of spend · ${data.concentrationRisk.alternativeCount} alternatives`
                : 'No concentration signal.'}
            </div>
            <Link to="/ask" className="text-xs font-mono font-bold text-copper hover:underline">Review suppliers →</Link>
          </div>
          <div className="p-4 bg-paper border border-ink/15 shadow-xs space-y-2">
            <div className="text-[10px] font-mono uppercase tracking-wider font-bold text-ink-3">Procurement health</div>
            <div className="flex items-baseline gap-2">
              <span className="font-display text-3xl font-bold tracking-tight text-ink num-tabular">
                {data.healthScore.score}
              </span>
              <span className="font-mono text-xs text-ink-4">/ 100 · {healthHeadline(data.healthScore.score)}</span>
            </div>
            <ul className="grid grid-cols-5 gap-1 pt-1">
              {Object.entries(data.healthScore.breakdown).map(([k, v]) => (
                <li key={k} className="space-y-0.5">
                  <div className="text-[9px] font-mono uppercase tracking-wider text-ink-4 truncate" title={k}>
                    {k.replace(/([A-Z])/g, ' $1').trim().slice(0, 10)}
                  </div>
                  <div className="h-1 bg-bone rounded-sm overflow-hidden">
                    <div className="h-full bg-volt" style={{ width: `${Math.min(100, ((v as number) / 20) * 100)}%` }} />
                  </div>
                  <div className="font-mono text-[10px] num-tabular text-ink-2">{v as number}</div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

export default AiHomePage;
