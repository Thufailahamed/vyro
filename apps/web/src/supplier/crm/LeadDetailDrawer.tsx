import { useState } from 'react';
import { useLead, useSetLeadTag, useSetLeadStatus } from '../useLeadManager';
import type { LeadConversionStatus, LeadTag } from '@vyro/validation';
import { useToast } from '@vyro/ui';
import { ConversionBadge } from './ConversionBadge';
import { TagPicker } from './TagPicker';
import { NotesPanel } from './NotesPanel';
import { XIcon } from '@/components/icons';

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
    <div className="fixed inset-0 z-40 flex justify-end bg-ink/40" onClick={onClose}>
      <div
        className="h-full w-full max-w-md overflow-y-auto bg-paper p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs uppercase tracking-wide text-ink-4">RFQ lead</div>
            <div className="text-lg font-semibold text-ink-1">
              {data?.rfqId ?? leadId ?? 'Loading…'}
            </div>
            <div className="mt-1">
              <ConversionBadge status={data?.conversionStatus ?? null} />
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close drawer"
            className="rounded-md p-1 text-ink-3 hover:bg-ink-3/10"
          >
            <XIcon size={18} />
          </button>
        </div>

        {lead.isLoading ? (
          <div className="mt-6 text-sm text-ink-4">Loading lead…</div>
        ) : lead.isError || !data ? (
          <div className="mt-6 text-sm text-red-600">Could not load lead.</div>
        ) : (
          <div className="mt-6 space-y-6">
            <section className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-ink-4">Tag</div>
              <TagPicker
                value={effectiveTag}
                onChange={(next) => {
                  setTagDraft(next);
                  setTag.mutate(
                    { leadId: leadId!, tag: next },
                    {
                      onSuccess: () => {
                        toast.success(next ? `Tagged ${next}` : 'Tag cleared');
                      },
                      onError: () => toast.error('Could not update tag'),
                    },
                  );
                }}
                disabled={setTag.isPending}
              />
            </section>

            <section className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-ink-4">
                Conversion status
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
                            onSuccess: () => toast.success(`Status → ${s}`),
                            onError: (e) =>
                              toast.error(
                                e instanceof Error ? e.message : 'Could not update status',
                              ),
                          },
                        );
                      }}
                      className={`rounded-full border px-3 py-1 text-xs font-semibold capitalize ${
                        active
                          ? 'border-ink bg-ink text-paper'
                          : 'border-ink-3 bg-paper text-ink-3 hover:border-ink-2'
                      }`}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="grid grid-cols-2 gap-3 rounded-md border border-ink-3 bg-paper p-3 text-xs">
              <div>
                <div className="text-ink-4">Invited</div>
                <div className="text-ink-1">{new Date(data.invitedAt).toLocaleString()}</div>
              </div>
              <div>
                <div className="text-ink-4">Quoted</div>
                <div className="text-ink-1">
                  {data.quotedAt ? new Date(data.quotedAt).toLocaleString() : '—'}
                </div>
              </div>
              <div>
                <div className="text-ink-4">Order</div>
                <div className="text-ink-1">{data.orderId ?? '—'}</div>
              </div>
              <div>
                <div className="text-ink-4">Order value</div>
                <div className="text-ink-1">
                  {data.orderValueCents != null ? `${(data.orderValueCents / 100).toFixed(2)} LKR` : '—'}
                </div>
              </div>
            </section>

            <section>
              <NotesPanel supplierId={supplierId} leadId={leadId!} />
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
