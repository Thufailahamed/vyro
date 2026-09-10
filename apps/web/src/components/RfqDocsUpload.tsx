import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiBase, ApiError } from '@/lib/api';
import { ErrorBanner } from '@/components/ui';
import { useToast } from '@vyro/ui';

const ALLOWED = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
];

export function RfqDocsUpload({ rfqId, quoteId }: { rfqId: string; quoteId?: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const docs = useQuery({
    queryKey: ['rfq-docs', rfqId],
    queryFn: () => api.get<{ documents: Array<{ id: string; fileName: string; mimeType?: string | null; sizeBytes?: number | null; kind: string; createdAt: number }> }>(`/rfqs/${rfqId}/documents`),
  });

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ALLOWED.includes(file.type)) { setError(`File type ${file.type} not allowed`); return; }
    if (file.size > 10 * 1024 * 1024) { setError('File exceeds 10 MB'); return; }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(apiBase + '/documents/upload-direct', { method: 'POST', credentials: 'include', body: fd });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: { code?: string; message?: string }; message?: string };
        throw new ApiError(res.status, body?.error?.code ?? 'UNKNOWN', body?.error?.message ?? body?.message ?? res.statusText);
      }
      const up = (await res.json()) as { uploadId: string };
      await api.post(`/rfqs/${rfqId}/documents`, { r2Key: up.uploadId, fileName: file.name, mimeType: file.type, sizeBytes: file.size, kind: 'specification', quoteId });
      void qc.invalidateQueries({ queryKey: ['rfq-docs', rfqId] });
      toast.show(toast.success('Document uploaded'));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 space-y-2">
      {error && <ErrorBanner message={error} />}
      <label className="inline-flex min-h-[44px] cursor-pointer items-center rounded-lg border border-line px-3 py-2 text-sm">
        {busy ? 'Uploading…' : 'Attach document'}
        <input type="file" className="hidden" onChange={onPick} disabled={busy} />
      </label>
      <ul className="text-xs text-ink-3">
        {(docs.data?.documents ?? []).map((d) => (
          <li key={d.id}>{d.fileName}{d.sizeBytes ? ` · ${Math.round(d.sizeBytes / 1024)} KB` : ''} · {new Date(d.createdAt).toLocaleDateString()}</li>
        ))}
      </ul>
    </div>
  );
}
