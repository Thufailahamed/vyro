import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLead, useSetLeadTag, useSetLeadStatus } from '../useLeadManager';
import type { LeadConversionStatus, LeadTag } from '@vyro/validation';
import { useToast } from '@vyro/ui';
import { ConversionBadge } from './ConversionBadge';
import { VerifiedBuyerBadge } from './VerifiedBuyerBadge';
import { TagPicker } from './TagPicker';
import { NotesPanel } from './NotesPanel';
import { XIcon, FileTextIcon, ArrowRightIcon, CalendarIcon, CheckCircle2Icon } from '@/components/icons';
import { formatLKR } from '@/lib/format';

const STATUS_OPTIONS: LeadConversionStatus[] = ['new', 'contacted', 'quoted', 'won', 'lost'];

interface Props {
  supplierId: string;
  leadId: string | null;
  onClose: () => void;
}

export function LeadDetailDrawer({ supplierId, leadId, onClose }: Props) {
  const toast = useToast();
  const open = !!leadId;
  const lead = useLead(supplierId, leadId ?? '');
  const setTag = useSetLeadTag(supplierId);
  const setStatus = useSetLeadStatus(supplierId);

  const [tagDraft, setTagDraft] = useState<LeadTag | null | undefined>(undefined);
  const [statusDraft, setStatusDraft] = useState<LeadConversionStatus | null>(null);

  if (!open) return null;

  const data = lead.data?.lead ?? null;
  const effectiveTag = tagDraft === undefined ? data?.tag ?? null : tagDraft;
  const effectiveStatus = statusDraft ?? data?.conversionStatus ?? null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-ink/50 backdrop-blur-xs animate-fade-in"
      onClick={onClose}
    >
      <div
        className="h-full w-full max-w-lg overflow-y-auto bg-paper p-6 shadow-2xl border-l border-ink/10 flex flex-col justify-between"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          {/* Header */}
          <div className="flex items-start justify-between pb-4 border-b border-ink/10">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-ink-4">
                  RFQ Lead Details
                </span>
                {data?.buyerVerified && (
                  <VerifiedBuyerBadge
                    verified={data.buyerVerified}
                    level={data.buyerKycLevel}
                    verifiedAt={data.buyerVerifiedAt}
                  />
                )}
              </div>
              <div className="text-xl font-bold font-mono text-ink-1 mt-1">
                RFQ {data?.rfqId ?? leadId ?? 'Loading…'}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <ConversionBadge status={effectiveStatus} />
                {effectiveTag && (
                  <span className="inline-flex items-center rounded-full border border-ink/20 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider font-semibold">
                    {effectiveTag}
                  </span>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close drawer"
              className="rounded-lg p-2 text-ink-3 hover:bg-bone hover:text-ink-1 transition-colors cursor-pointer"
            >
              <XIcon size={18} />
            </button>
          </div>

          {lead.isLoading ? (
            <div className="py-12 text-center text-sm text-ink-4">
              <div className="inline-block size-6 animate-spin rounded-full border-2 border-ink border-t-transparent mb-2" />
              <div>Loading lead details…</div>
            </div>
          ) : lead.isError || !data ? (
            <div className="mt-6 rounded-xl border border-rose/20 bg-rose/5 p-4 text-sm text-rose">
              Could not load lead information. Confirm the Lead Manager feature is enabled for your platform.
            </div>
          ) : (
            <div className="mt-6 space-y-6">
              {/* Quick Link to Quote Details */}
              <Link
                to={`/supplier/quotes/${data.rfqId}`}
                className="group flex items-center justify-between rounded-xl bg-ink px-4 py-3 text-paper hover:bg-charcoal transition-all shadow-sm"
              >
                <div className="flex items-center gap-2.5">
                  <FileTextIcon size={16} className="text-volt" />
                  <div>
                    <div className="text-xs font-semibold text-paper group-hover:text-volt transition-colors">
                      Open in Quote Management
                    </div>
                    <div className="text-[11px] text-paper/60 font-mono">
                      Prepare price breakdown & submit quote
                    </div>
                  </div>
                </div>
                <ArrowRightIcon size={14} className="text-paper/70 group-hover:text-volt group-hover:translate-x-1 transition-all" />
              </Link>

              {/* Tag Selection */}
              <section className="space-y-2 rounded-xl border border-ink/10 bg-bone/30 p-4">
                <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-ink-3">
                  Lead Priority / Temperature
                </div>
                <TagPicker
                  value={effectiveTag}
                  onChange={(next) => {
                    setTagDraft(next);
                    setTag.mutate(
                      { leadId: leadId!, tag: next },
                      {
                        onSuccess: () => {
                          toast.success(next ? `Tagged as ${next}` : 'Tag cleared');
                        },
                        onError: () => toast.error('Could not update tag'),
                      },
                    );
                  }}
                  disabled={setTag.isPending}
                />
              </section>

              {/* Conversion Pipeline Status */}
              <section className="space-y-2 rounded-xl border border-ink/10 bg-bone/30 p-4">
                <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-ink-3">
                  Conversion Pipeline Status
                </div>
                <div className="flex flex-wrap gap-2">
                  {STATUS_OPTIONS.map((s) => {
                    const active = effectiveStatus === s;
                    return (
                      <button
                        key={s}
                        type="button"
                        disabled={setStatus.isPending}
                        onClick={() => {
                          setStatusDraft(s);
                          setStatus.mutate(
                            { leadId: leadId!, status: s },
                            {
                              onSuccess: () => toast.success(`Status updated to ${s}`),
                              onError: (e) =>
                                toast.error(
                                  e instanceof Error ? e.message : 'Could not update status',
                                ),
                            },
                          );
                        }}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold capitalize transition-all cursor-pointer ${
                          active
                            ? 'border-ink bg-ink text-paper shadow-xs'
                            : 'border-ink/15 bg-paper text-ink-3 hover:border-ink/40 hover:text-ink-1'
                        } ${setStatus.isPending ? 'opacity-50 cursor-wait' : ''}`}
                      >
                        {active && <CheckCircle2Icon size={12} className="text-volt" />}
                        {s}
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Lead Timeline & Commercials Grid */}
              <section className="grid grid-cols-2 gap-3 rounded-xl border border-ink/10 bg-paper p-4 text-xs shadow-xs">
                <div className="space-y-1">
                  <div className="text-[11px] font-mono uppercase tracking-wider text-ink-4 flex items-center gap-1">
                    <CalendarIcon size={12} />
                    Invited At
                  </div>
                  <div className="font-medium text-ink-1 font-mono text-[12px]">
                    {new Date(data.invitedAt).toLocaleDateString([], {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-[11px] font-mono uppercase tracking-wider text-ink-4">
                    Quoted At
                  </div>
                  <div className="font-medium text-ink-1 font-mono text-[12px]">
                    {data.quotedAt
                      ? new Date(data.quotedAt).toLocaleDateString([], {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : 'Not submitted yet'}
                  </div>
                </div>
                <div className="space-y-1 pt-2 border-t border-ink/10">
                  <div className="text-[11px] font-mono uppercase tracking-wider text-ink-4">
                    Order Reference
                  </div>
                  <div className="font-mono text-ink-1 text-[12px]">
                    {data.orderId ? (
                      <span className="text-ink font-semibold">{data.orderId}</span>
                    ) : (
                      '—'
                    )}
                  </div>
                </div>
                <div className="space-y-1 pt-2 border-t border-ink/10">
                  <div className="text-[11px] font-mono uppercase tracking-wider text-ink-4">
                    Order Value
                  </div>
                  <div className="font-semibold text-ink-1 font-mono text-[12px]">
                    {data.orderValueCents != null ? formatLKR(data.orderValueCents) : '—'}
                  </div>
                </div>
              </section>

              {/* Notes Feed */}
              <section className="rounded-xl border border-ink/10 bg-paper p-4 shadow-xs">
                <NotesPanel supplierId={supplierId} leadId={leadId!} />
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
