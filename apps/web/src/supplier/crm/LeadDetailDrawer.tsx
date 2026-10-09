import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLead, useSetLeadTag, useSetLeadStatus } from '../useLeadManager';
import type { LeadConversionStatus, LeadTag } from '@vyro/validation';
import { cn, useToast } from '@vyro/ui';
import { ConversionBadge } from './ConversionBadge';
import { VerifiedBuyerBadge } from './VerifiedBuyerBadge';
import { TagPicker } from './TagPicker';
import { NotesPanel } from './NotesPanel';
import { StageStepper, TagChip, fmtDate, relTime } from './crmUi';
import { XIcon, FileTextIcon, ArrowRightIcon, CalendarIcon, CheckCircle2Icon, BanknoteIcon, PackageIcon } from '@/components/icons';
import { formatLKR } from '@/lib/format';

interface Props {
  supplierId: string;
  leadId: string | null;
  onClose: () => void;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3.5 rounded-2xl bg-paper p-5 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.08),0_1px_2px_rgba(12,14,11,0.04)]">
      <h3 className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink-3">{title}</h3>
      {children}
    </section>
  );
}

function Fact({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: React.ReactNode; sub?: string | undefined }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-ink-4">
        {icon}
        {label}
      </div>
      <div className="text-[13px] font-semibold text-ink">{value}</div>
      {sub ? <div className="text-[11px] text-ink-4">{sub}</div> : null}
    </div>
  );
}

export function LeadDetailDrawer({ supplierId, leadId, onClose }: Props) {
  const toast = useToast();
  const open = !!leadId;
  const lead = useLead(supplierId, leadId ?? '');
  const setTag = useSetLeadTag(supplierId);
  const setStatus = useSetLeadStatus(supplierId);

  const [tagDraft, setTagDraft] = useState<LeadTag | null | undefined>(undefined);
  const [statusDraft, setStatusDraft] = useState<LeadConversionStatus | null>(null);
  const [entered, setEntered] = useState(false);

  // Fresh drafts per lead, slide-in on open, Esc to close.
  useEffect(() => {
    setTagDraft(undefined);
    setStatusDraft(null);
  }, [leadId]);

  useEffect(() => {
    if (!open) {
      setEntered(false);
      return;
    }
    const raf = requestAnimationFrame(() => setEntered(true));
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const data = lead.data?.lead ?? null;
  const effectiveTag = tagDraft === undefined ? (data?.tag ?? null) : tagDraft;
  const effectiveStatus = statusDraft ?? data?.conversionStatus ?? null;

  const changeStatus = (s: LeadConversionStatus) => {
    setStatusDraft(s);
    setStatus.mutate(
      { leadId: leadId!, status: s },
      {
        onSuccess: () => toast.success(`Status updated to ${s}`),
        onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not update status'),
      },
    );
  };

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 flex justify-end bg-ink/50 backdrop-blur-sm transition-opacity duration-300',
        entered ? 'opacity-100' : 'opacity-0',
      )}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Lead details"
    >
      <div
        className={cn(
          'flex h-full w-full max-w-[34rem] flex-col bg-bone shadow-[-24px_0_60px_-20px_rgba(12,14,11,0.5)] transition-transform duration-500 ease-vyro',
          entered ? 'translate-x-0' : 'translate-x-full',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Dark header */}
        <header className="relative overflow-hidden bg-charcoal px-6 pb-6 pt-5 text-paper">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{ background: 'radial-gradient(70% 120% at 0% 0%, rgba(198,220,74,0.18), transparent 60%)' }}
          />
          <div className="relative flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-paper/50">RFQ lead</span>
                {data?.buyerVerified && (
                  <VerifiedBuyerBadge verified={data.buyerVerified} level={data.buyerKycLevel} verifiedAt={data.buyerVerifiedAt} />
                )}
              </div>
              <h2 className="mt-1.5 truncate font-display text-2xl font-bold tracking-[-0.03em]">
                RFQ #{data?.rfqId ?? leadId ?? '…'}
              </h2>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <ConversionBadge status={effectiveStatus} className="!bg-paper !ring-paper/0" />
                {effectiveTag && <TagChip tag={effectiveTag} className="!bg-paper" />}
                {data ? <span className="text-xs text-paper/50">Invited {relTime(data.invitedAt)}</span> : null}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close drawer"
              className="flex size-9 shrink-0 items-center justify-center rounded-lg text-paper/60 transition-colors hover:bg-paper/10 hover:text-paper"
            >
              <XIcon size={18} />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5 scrollbar-thin">
          {lead.isLoading ? (
            <div className="space-y-4 animate-pulse">
              <div className="h-16 rounded-2xl bg-ink/[0.05]" />
              <div className="h-40 rounded-2xl bg-ink/[0.05]" />
              <div className="h-32 rounded-2xl bg-ink/[0.05]" />
            </div>
          ) : lead.isError || !data ? (
            <div className="rounded-2xl bg-rose/5 p-5 text-sm text-rose shadow-[inset_0_0_0_1px_rgba(196,90,74,0.25)]">
              Could not load lead information. Confirm the Lead Manager feature is enabled for your platform.
            </div>
          ) : (
            <>
              <Link
                to={`/supplier/quotes/${data.rfqId}`}
                className="group flex items-center justify-between gap-3 rounded-2xl bg-ink px-5 py-4 text-paper shadow-[0_12px_24px_-12px_rgba(12,14,11,0.6)] transition-all hover:bg-charcoal"
              >
                <div className="flex items-center gap-3">
                  <span className="flex size-9 items-center justify-center rounded-[10px] bg-volt text-ink">
                    <FileTextIcon size={16} />
                  </span>
                  <div>
                    <div className="text-sm font-semibold">Open in Quote Management</div>
                    <div className="text-xs text-paper/55">Prepare price breakdown & submit your quote</div>
                  </div>
                </div>
                <ArrowRightIcon size={16} className="text-paper/60 transition-all group-hover:translate-x-1 group-hover:text-volt" />
              </Link>

              <Section title="Pipeline stage">
                <StageStepper status={effectiveStatus} onSelect={changeStatus} disabled={setStatus.isPending} />
              </Section>

              <Section title="Lead temperature">
                <TagPicker
                  value={effectiveTag}
                  disabled={setTag.isPending}
                  onChange={(next) => {
                    setTagDraft(next);
                    setTag.mutate(
                      { leadId: leadId!, tag: next },
                      {
                        onSuccess: () => toast.success(next ? `Tagged as ${next}` : 'Tag cleared'),
                        onError: () => toast.error('Could not update tag'),
                      },
                    );
                  }}
                />
              </Section>

              <Section title="Commercials & timeline">
                <div className="grid grid-cols-2 gap-x-4 gap-y-5">
                  <Fact icon={<CalendarIcon size={12} />} label="Invited" value={fmtDate(data.invitedAt)} sub={relTime(data.invitedAt)} />
                  <Fact
                    icon={<CheckCircle2Icon size={12} />}
                    label="Quoted"
                    value={data.quotedAt ? fmtDate(data.quotedAt) : <span className="font-medium text-ink-4">Not yet</span>}
                    sub={data.quotedAt ? relTime(data.quotedAt) : undefined}
                  />
                  <Fact
                    icon={<PackageIcon size={12} />}
                    label="Order reference"
                    value={data.orderId ? <span className="font-mono text-xs">{data.orderId}</span> : <span className="font-medium text-ink-4">—</span>}
                  />
                  <Fact
                    icon={<BanknoteIcon size={12} />}
                    label="Order value"
                    value={
                      data.orderValueCents != null ? (
                        <span className="font-display text-lg font-bold tracking-[-0.02em]">{formatLKR(data.orderValueCents)}</span>
                      ) : (
                        <span className="font-medium text-ink-4">—</span>
                      )
                    }
                  />
                </div>
              </Section>

              <section className="rounded-2xl bg-paper p-5 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.08),0_1px_2px_rgba(12,14,11,0.04)]">
                <NotesPanel supplierId={supplierId} leadId={leadId!} />
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
