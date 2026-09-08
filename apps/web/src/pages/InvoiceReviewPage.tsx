import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { Button, PageHeader } from '@/components/ui';
import { AlertCircleIcon, CheckCircleIcon, SaveIcon, RefreshCwIcon } from '@/components/icons';
import { CategoryBadge } from '@/ai/CategoryBadge';

interface LineItem {
  id: string;
  lineNumber: number;
  description: string;
  quantity: number | null;
  unit: string | null;
  unitPriceCents: number | null;
  totalCents: number | null;
  categorySlug: string | null;
  categorySource: 'rule' | 'default' | 'manual';
}
interface Upload {
  id: string;
  status: string;
  ocrConfidence: number | null;
  originalFilename: string;
  totalCents: number | null;
  items: LineItem[];
  rawExtractionJson: string | null;
}

const SLUGS = ['food', 'packaging', 'cleaning', 'office', 'equipment', 'other'] as const;
type Slug = (typeof SLUGS)[number];

function emptyLine(lineNumber: number): LineItem {
  return {
    id: '',
    lineNumber,
    description: '',
    quantity: null,
    unit: null,
    unitPriceCents: null,
    totalCents: null,
    categorySlug: 'other',
    categorySource: 'manual',
  };
}

export function InvoiceReviewPage() {
  const { id = '' } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['invoice', id],
    queryFn: () => api.get<{ upload: Upload }>(`/documents/${id}`),
    enabled: !!id,
    refetchInterval: (q) => {
      const u = (q.state.data as { upload: Upload } | undefined)?.upload;
      return u && (u.status === 'pending' || u.status === 'processing') ? 2000 : false;
    },
  });

  const upload = data?.upload;
  const [lines, setLines] = useState<LineItem[]>([]);
  const [totalCents, setTotalCents] = useState<number>(0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!upload) return;
    setLines(upload.items.map((it) => ({ ...it })));
    setTotalCents(upload.totalCents ?? 0);
    setSaved(false);
  }, [upload?.id, upload?.items, upload?.totalCents]);

  const dirty = useMemo(() => {
    if (!upload) return false;
    if ((upload.totalCents ?? 0) !== totalCents) return true;
    if (lines.length !== upload.items.length) return true;
    for (let i = 0; i < lines.length; i++) {
      const a = lines[i]!;
      const b = upload.items[i]!;
      if (a.description !== b.description || a.totalCents !== b.totalCents || a.categorySlug !== b.categorySlug) return true;
    }
    return false;
  }, [upload, lines, totalCents]);

  if (isLoading) return <div className="h-64 bg-mist animate-pulse" />;
  if (!upload) return <div className="py-12">Invoice not found.</div>;

  const status = upload.status;
  const lowConfidence = (upload.ocrConfidence ?? 0) < 60;
  const manualRequired = status === 'manual_required' || upload.items.length === 0;

  function updateLine(i: number, patch: Partial<LineItem>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await api.post(`/documents/${id}/review`, {
        totalCents,
        lines: lines.map((l, i) => ({
          lineNumber: l.lineNumber || i + 1,
          description: l.description.trim() || 'Untitled line',
          quantity: l.quantity,
          unit: l.unit,
          unitPriceCents: l.unitPriceCents,
          totalCents: l.totalCents,
          categorySlug: (l.categorySlug ?? 'other') as Slug,
        })),
      });
      setSaved(true);
      await qc.invalidateQueries({ queryKey: ['invoice', id] });
      await qc.invalidateQueries({ queryKey: ['invoices'] });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <PageHeader
        kicker={lowConfidence ? 'Awaiting manual entry' : 'Awaiting review'}
        title={upload.originalFilename}
        sub={
          manualRequired
            ? 'OCR could not read this invoice confidently. Add lines manually below.'
            : `OCR confidence ${upload.ocrConfidence ?? 0}%. Correct anything before saving.`
        }
        actions={
          <Link to="/invoices"><Button variant="secondary" size="sm">Back to list</Button></Link>
        }
      />

      {lowConfidence && (
        <div className="flex items-center gap-2 p-3 bg-amber/5 border border-amber/30 text-xs text-amber">
          <AlertCircleIcon size={14} />
          <span>Low confidence — please verify every line and category before saving.</span>
        </div>
      )}

      <div className="bg-paper border border-ink/15">
        <table className="w-full text-xs">
          <thead className="bg-bone text-[10px] font-mono uppercase tracking-wider text-ink-4">
            <tr>
              <th className="p-2 text-left w-12">#</th>
              <th className="p-2 text-left">Description</th>
              <th className="p-2 text-left w-20">Qty</th>
              <th className="p-2 text-left w-20">Unit</th>
              <th className="p-2 text-right w-28">Unit Rs.</th>
              <th className="p-2 text-right w-28">Line Rs.</th>
              <th className="p-2 text-left w-40">Category</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {lines.map((l, i) => (
              <tr key={l.id || `new-${i}`} className="hover:bg-bone/40">
                <td className="p-2 font-mono text-ink-4">{i + 1}</td>
                <td className="p-2">
                  <input
                    value={l.description}
                    onChange={(e) => updateLine(i, { description: e.target.value })}
                    className="w-full bg-transparent text-ink outline-none border-b border-transparent focus:border-copper"
                  />
                </td>
                <td className="p-2">
                  <input
                    type="number"
                    value={l.quantity ?? ''}
                    onChange={(e) => updateLine(i, { quantity: e.target.value === '' ? null : Number(e.target.value) })}
                    className="w-full bg-transparent text-right font-mono outline-none"
                  />
                </td>
                <td className="p-2">
                  <input
                    value={l.unit ?? ''}
                    onChange={(e) => updateLine(i, { unit: e.target.value })}
                    className="w-full bg-transparent font-mono outline-none"
                  />
                </td>
                <td className="p-2">
                  <input
                    type="number"
                    value={l.unitPriceCents != null ? l.unitPriceCents / 100 : ''}
                    onChange={(e) => updateLine(i, { unitPriceCents: e.target.value === '' ? null : Math.round(Number(e.target.value) * 100) })}
                    className="w-full bg-transparent text-right font-mono outline-none"
                  />
                </td>
                <td className="p-2">
                  <input
                    type="number"
                    value={l.totalCents != null ? l.totalCents / 100 : ''}
                    onChange={(e) => updateLine(i, { totalCents: e.target.value === '' ? null : Math.round(Number(e.target.value) * 100) })}
                    className="w-full bg-transparent text-right font-mono outline-none"
                  />
                </td>
                <td className="p-2">
                  <div className="flex items-center gap-2">
                    <select
                      value={l.categorySlug ?? 'other'}
                      onChange={(e) => updateLine(i, { categorySlug: e.target.value })}
                      className="bg-paper border border-ink/20 text-ink px-1 py-0.5 outline-none"
                    >
                      {SLUGS.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <CategoryBadge slug={l.categorySlug} source={l.categorySource} />
                  </div>
                </td>
              </tr>
            ))}
            {lines.length === 0 && (
              <tr><td colSpan={7} className="p-6 text-center text-ink-4">No lines detected. Add rows manually below.</td></tr>
            )}
          </tbody>
        </table>
        <div className="p-3 border-t border-ink/10 flex flex-wrap items-center gap-3 justify-between">
          <button
            type="button"
            onClick={() => setLines((p) => [...p, emptyLine(p.length + 1)])}
            className="text-[10px] font-mono uppercase tracking-wider text-copper hover:text-ink"
          >
            + Add line manually
          </button>
          <div className="flex items-center gap-2">
            <label className="text-[10px] font-mono uppercase tracking-wider text-ink-4">Invoice total Rs.</label>
            <input
              type="number"
              value={totalCents / 100}
              onChange={(e) => setTotalCents(Math.round(Number(e.target.value) * 100))}
              className="w-24 bg-paper border border-ink/20 text-right font-mono px-2 py-0.5"
            />
            <Button
              size="sm"
              onClick={save}
              disabled={!dirty || saving}
              icon={saving ? <RefreshCwIcon size={13} className="animate-spin" /> : <SaveIcon size={13} />}
            >
              {saving ? 'Saving…' : 'Save & categorize'}
            </Button>
            {saved && (
              <span className="inline-flex items-center gap-1 text-xs text-mint">
                <CheckCircleIcon size={13} /> Saved
              </span>
            )}
            {error && (
              <span className="inline-flex items-center gap-1 text-xs text-rose">
                <AlertCircleIcon size={13} /> {error}
              </span>
            )}
          </div>
        </div>
      </div>

      {upload.rawExtractionJson && (
        <details className="text-xs text-ink-4">
          <summary className="cursor-pointer font-mono uppercase tracking-wider">View raw OCR output</summary>
          <pre className="mt-2 p-3 bg-bone border border-ink/10 overflow-x-auto whitespace-pre-wrap break-all">
            {(() => { try { return JSON.stringify(JSON.parse(upload.rawExtractionJson), null, 2); } catch { return upload.rawExtractionJson; } })()}
          </pre>
        </details>
      )}
    </div>
  );
}
