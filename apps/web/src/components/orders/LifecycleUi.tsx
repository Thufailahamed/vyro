import { useState, type ReactNode } from 'react';
import {
  PAYMENT_STATE_LABEL,
  RETURN_STATUS_LABEL,
  type PaymentState,
  type PaymentSummary,
  type ReturnStatus,
} from '@vyro/shared';
import { Badge, Button, ErrorBanner, Input, Label, Textarea } from '@/components/ui';
import { XIcon } from '@/components/icons';
import { formatLKR } from '@/lib/format';
import { ApiError } from '@/lib/api';
import { lifecycleErrorMessage, postMultipart, type DeliveryInfo } from '@/lib/orderLifecycle';

/* ── Modal shell (matches the refund modal on the buyer order page) ── */

export function Modal({
  open,
  title,
  subtitle,
  icon,
  tone = 'ink',
  busy,
  onClose,
  footer,
  children,
  wide,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  tone?: 'ink' | 'rose' | 'mint' | 'copper';
  busy?: boolean;
  onClose: () => void;
  footer?: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  if (!open) return null;
  const toneBg = {
    ink: 'bg-bone/40',
    rose: 'bg-rose/[0.06]',
    mint: 'bg-mint/[0.06]',
    copper: 'bg-copper/[0.06]',
  }[tone];
  const iconBg = {
    ink: 'bg-ink/10 text-ink-2',
    rose: 'bg-rose/15 text-rose',
    mint: 'bg-mint/15 text-mint',
    copper: 'bg-copper/15 text-copper-deep',
  }[tone];
  return (
    <div
      className="fixed inset-0 z-50 bg-ink/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={() => !busy && onClose()}
    >
      <div
        className={`bg-paper rounded-2xl border border-ink/10 shadow-2xl w-full overflow-hidden max-h-[90vh] flex flex-col ${wide ? 'max-w-2xl' : 'max-w-md'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`flex items-center justify-between p-5 border-b border-ink/10 ${toneBg}`}>
          <div className="flex items-center gap-3 min-w-0">
            {icon && (
              <div className={`flex items-center justify-center size-10 rounded-xl shrink-0 ${iconBg}`}>{icon}</div>
            )}
            <div className="min-w-0">
              <h2 className="font-display text-lg font-semibold text-ink-1">{title}</h2>
              {subtitle && <p className="text-[11px] text-ink-3 mt-0.5 font-mono">{subtitle}</p>}
            </div>
          </div>
          <button
            type="button"
            onClick={() => !busy && onClose()}
            className="flex items-center justify-center size-8 rounded-full hover:bg-ink/5 transition-colors text-ink-3"
            aria-label="Close"
          >
            <XIcon size={16} />
          </button>
        </div>
        <div className="p-5 space-y-4 overflow-y-auto">{children}</div>
        {footer && <div className="flex justify-end gap-2 p-5 border-t border-ink/10 bg-bone/30">{footer}</div>}
      </div>
    </div>
  );
}

/* ── Reason prompt (reject / cancel / dispute / return reject …) ── */

export function ReasonDialog({
  open,
  title,
  subtitle,
  description,
  confirmLabel,
  placeholder,
  danger = true,
  icon,
  onClose,
  onSubmit,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  description?: ReactNode;
  confirmLabel: string;
  placeholder?: string;
  danger?: boolean;
  icon?: ReactNode;
  onClose: () => void;
  /** Resolve to close; throw to show the error inline. */
  onSubmit: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const valid = reason.trim().length >= 3;

  async function submit() {
    if (!valid) return;
    setBusy(true);
    setErr('');
    try {
      await onSubmit(reason.trim());
      setReason('');
      onClose();
    } catch (e) {
      setErr(lifecycleErrorMessage(e, 'Action failed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      title={title}
      {...(subtitle ? { subtitle } : {})}
      icon={icon}
      tone={danger ? 'rose' : 'ink'}
      busy={busy}
      onClose={() => {
        setErr('');
        onClose();
      }}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Back
          </Button>
          <Button
            variant={danger ? 'danger' : 'success'}
            onClick={() => void submit()}
            disabled={!valid}
            loading={busy}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {description && <div className="text-xs text-ink-3 leading-relaxed">{description}</div>}
      <ErrorBanner message={err} />
      <div>
        <Label htmlFor="lifecycle-reason">Reason (required)</Label>
        <Textarea
          id="lifecycle-reason"
          rows={4}
          maxLength={500}
          placeholder={placeholder ?? 'Explain why…'}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <div className="text-right text-[10px] text-ink-4 mt-1 font-mono">
          {reason.trim().length < 3 ? 'At least 3 characters' : `${reason.length}/500`}
        </div>
      </div>
    </Modal>
  );
}

/* ── Payment badge + summary ── */

const PAYMENT_VARIANT: Record<PaymentState, 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'purple'> = {
  unpaid: 'warning',
  partially_paid: 'warning',
  paid: 'success',
  partially_refunded: 'purple',
  refunded: 'neutral',
  cod_pending: 'brand',
  credit: 'brand',
};

export function PaymentStateBadge({ state, className }: { state: PaymentState | string | null | undefined; className?: string }) {
  if (!state) return null;
  const label = PAYMENT_STATE_LABEL[state as PaymentState] ?? state.replace(/_/g, ' ');
  return (
    <Badge variant={PAYMENT_VARIANT[state as PaymentState] ?? 'neutral'} {...(className ? { className } : {})}>
      {label}
    </Badge>
  );
}

export function PaymentSummaryList({ summary }: { summary: PaymentSummary }) {
  const rows: Array<[string, number, string | undefined]> = [
    ['Order total', summary.totalCents, undefined],
    ['Paid', summary.paidCents, 'text-mint'],
    ['Due', summary.dueCents, summary.dueCents > 0 ? 'text-amber' : undefined],
  ];
  if (summary.refundedCents > 0) rows.push(['Refunded', summary.refundedCents, undefined]);
  if (summary.pendingRefundCents > 0) rows.push(['Refund pending', summary.pendingRefundCents, undefined]);
  return (
    <dl className="space-y-1.5 text-xs">
      {rows.map(([label, cents, cls]) => (
        <div key={label} className="flex justify-between gap-3">
          <dt className="text-ink-4">{label}</dt>
          <dd className={`font-mono font-semibold text-ink-1 ${cls ?? ''}`}>{formatLKR(cents)}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ── Return status badge ── */

const RETURN_VARIANT: Record<ReturnStatus, 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'purple'> = {
  requested: 'warning',
  approved: 'brand',
  rejected: 'danger',
  received: 'purple',
  refunded: 'success',
  cancelled: 'neutral',
  closed: 'success',
};

export function ReturnStatusBadge({ status }: { status: ReturnStatus }) {
  return <Badge variant={RETURN_VARIANT[status] ?? 'neutral'}>{RETURN_STATUS_LABEL[status] ?? status}</Badge>;
}

/* ── Proof-of-delivery capture ── */

export function PodDialog({
  open,
  poId,
  delivery,
  onClose,
  onCaptured,
}: {
  open: boolean;
  poId: string;
  delivery?: DeliveryInfo | null;
  onClose: () => void;
  /** Called after POD is saved — typically performs the → delivered transition. */
  onCaptured: () => Promise<void>;
}) {
  const [recipientName, setRecipientName] = useState(delivery?.recipientName ?? '');
  const [note, setNote] = useState(delivery?.podNote ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const hasEvidence = !!file || note.trim().length > 0 || !!delivery?.hasPodPhoto;
  const valid = recipientName.trim().length > 0 && hasEvidence;

  async function submit() {
    if (!valid) return;
    setBusy(true);
    setErr('');
    try {
      const form = new FormData();
      form.set('recipientName', recipientName.trim());
      if (note.trim()) form.set('note', note.trim());
      if (file) form.set('file', file);
      await postMultipart(`/deliveries/${poId}/pod`, form);
      await onCaptured();
      setFile(null);
      onClose();
    } catch (e) {
      setErr(
        e instanceof ApiError && e.code === 'PAYLOAD_TOO_LARGE'
          ? 'Photo exceeds 8 MB.'
          : lifecycleErrorMessage(e, 'Could not record proof of delivery'),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      title="Proof of delivery"
      subtitle="Required before marking delivered"
      tone="mint"
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="success" onClick={() => void submit()} disabled={!valid} loading={busy}>
            Save &amp; mark delivered
          </Button>
        </>
      }
    >
      <p className="text-xs text-ink-3 leading-relaxed">
        Record who received the goods, plus a photo or a note. The buyer can see this on their order.
      </p>
      <ErrorBanner message={err} />
      <div>
        <Label htmlFor="pod-recipient">Recipient name (required)</Label>
        <Input
          id="pod-recipient"
          value={recipientName}
          maxLength={120}
          onChange={(e) => setRecipientName(e.target.value)}
          placeholder="e.g. K. Perera (stores)"
        />
      </div>
      <div>
        <Label htmlFor="pod-note">Delivery note</Label>
        <Textarea
          id="pod-note"
          rows={3}
          maxLength={500}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Left at receiving dock 2, signed GRN #4471"
        />
      </div>
      <div>
        <Label htmlFor="pod-photo">Photo (JPEG / PNG / WebP, ≤ 8 MB)</Label>
        <input
          id="pod-photo"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-xs text-ink-3 file:mr-3 file:rounded-md file:border-0 file:bg-ink file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-paper"
        />
        {delivery?.hasPodPhoto && !file && (
          <p className="text-[11px] text-ink-4 mt-1">A photo is already on file.</p>
        )}
      </div>
      {!hasEvidence && (
        <p className="text-[11px] text-amber font-semibold">Add a photo or a note.</p>
      )}
    </Modal>
  );
}
