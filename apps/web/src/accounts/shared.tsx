import { useState, type ReactNode } from 'react';
import { useAuth } from '@/lib/auth';
import { formatLKR } from '@/lib/format';
import { Button } from '@/components/ui';
import { cn } from '@vyro/ui';

export function useBusinessId(): string | undefined {
  const { user } = useAuth();
  return (user as unknown as { memberships?: Array<{ businessId: string }> })?.memberships?.[0]?.businessId;
}

const PILL: Record<string, string> = {
  pending: 'bg-amber/15 text-amber border-amber/30',
  pending_verification: 'bg-amber/15 text-amber border-amber/30',
  proof_submitted: 'bg-amber/15 text-amber border-amber/30',
  correction_requested: 'bg-amber/15 text-amber border-amber/30',
  processing: 'bg-violet/15 text-violet border-violet/30',
  authorized: 'bg-violet/15 text-violet border-violet/30',
  approved: 'bg-violet/15 text-violet border-violet/30',
  confirmed: 'bg-mint/15 text-mint border-mint/30',
  paid: 'bg-mint/15 text-mint border-mint/30',
  completed: 'bg-mint/15 text-mint border-mint/30',
  verified: 'bg-mint/15 text-mint border-mint/30',
  matched: 'bg-mint/15 text-mint border-mint/30',
  reconciled: 'bg-mint/15 text-mint border-mint/30',
  resolved: 'bg-mint/15 text-mint border-mint/30',
  failed: 'bg-rose/15 text-rose border-rose/30',
  rejected: 'bg-rose/15 text-rose border-rose/30',
  cancelled: 'bg-ink/10 text-ink-4 border-ink/20',
  expired: 'bg-ink/10 text-ink-4 border-ink/20',
  chargeback: 'bg-rose/15 text-rose border-rose/30',
  refunded: 'bg-copper/15 text-copper border-copper/30',
  partially_refunded: 'bg-copper/15 text-copper border-copper/30',
  eligible: 'bg-mint/15 text-mint border-mint/30',
  settled: 'bg-copper/15 text-copper border-copper/30',
  held: 'bg-amber/15 text-amber border-amber/30',
  ineligible: 'bg-ink/10 text-ink-4 border-ink/20',
  open: 'bg-amber/15 text-amber border-amber/30',
  partial: 'bg-amber/15 text-amber border-amber/30',
  collected: 'bg-mint/15 text-mint border-mint/30',
  unreconciled: 'bg-amber/15 text-amber border-amber/30',
  requested: 'bg-amber/15 text-amber border-amber/30',
  exception: 'bg-rose/15 text-rose border-rose/30',
};

export function StatusPill({ status }: { status?: string | null }) {
  const s = (status ?? 'unknown').toLowerCase();
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-wide', PILL[s] ?? 'bg-ink/10 text-ink-3 border-ink/20')}>
      <span className="size-1.5 rounded-full bg-current" />
      {s.replace(/_/g, ' ')}
    </span>
  );
}

export function Money({ cents, className }: { cents?: number | null; className?: string }) {
  if (cents == null) return <span className={cn('text-ink-4', className)}>—</span>;
  return <span className={cn('font-semibold tabular-nums', className)}>{formatLKR(cents)}</span>;
}

export function Stat({ label, cents, sub }: { label: string; cents?: number | null | undefined; sub?: string }) {
  return (
    <div className="rounded-xl border border-ink/10 bg-paper p-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-3">{label}</div>
      <div className="mt-1 text-2xl tracking-tight text-ink"><Money cents={cents ?? 0} /></div>
      {sub ? <div className="mt-0.5 text-xs text-ink-4">{sub}</div> : null}
    </div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-ink-3">{children}</h2>
      {action}
    </div>
  );
}

/** Explicit confirmation for irreversible money movement (spec §49). */
export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  busy,
  onConfirm,
  onClose,
}: {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-2xl bg-paper p-6 shadow-xl">
        <h3 className="vyro-display text-xl text-ink">{title}</h3>
        <div className="mt-2 text-sm text-ink-3">{body}</div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={onConfirm} disabled={busy}>{busy ? 'Working…' : confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}

export function useConfirm() {
  const [state, setState] = useState<null | {
    title: string;
    body: ReactNode;
    confirmLabel: string;
    action: () => Promise<void>;
  }>(null);
  const [busy, setBusy] = useState(false);
  const ask = (s: NonNullable<typeof state>) => setState(s);
  const dialog = state ? (
    <ConfirmDialog
      title={state.title}
      body={state.body}
      confirmLabel={state.confirmLabel}
      busy={busy}
      onClose={() => { if (!busy) setState(null); }}
      onConfirm={async () => {
        setBusy(true);
        try {
          await state.action();
          setState(null);
        } finally {
          setBusy(false);
        }
      }}
    />
  ) : null;
  return { ask, dialog };
}

export function time(ts?: number | null): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
