import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiBase } from '@/lib/api';
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

interface DocRow { id: string; fileName: string; mimeType?: string | null; sizeBytes?: number | null; kind: string; createdAt: number; downloadUrl?: string }

export function RfqDocsUpload({ rfqId }: { rfqId: string; quoteId?: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const docs = useQuery({
    queryKey: ['rfq-docs', rfqId],
    queryFn: () => api.get<{ documents: DocRow[] }>(`/rfqs/${rfqId}/documents`),
  });

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!ALLOWED.includes(file.type)) { setError(`File type ${file.type} not allowed`); return; }
    if (file.size > 10 * 1024 * 1024) { setError('File exceeds 10 MB'); return; }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('kind', 'specification');
      const res = await fetch(`${apiBase}/rfqs/${rfqId}/attachments`, { method: 'POST', credentials: 'include', body: fd });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: { message?: string }; message?: string };
        throw new Error(body?.error?.message ?? body?.message ?? res.statusText);
      }
      void qc.invalidateQueries({ queryKey: ['rfq-docs', rfqId] });
      toast.show(toast.success('Document attached'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 space-y-2">
      {error && <ErrorBanner message={error} />}
      <label className="inline-flex min-h-[44px] cursor-pointer items-center rounded-lg border border-line px-3 py-2 text-sm">
        {busy ? 'Uploading…' : 'Attach specification / certificate'}
        <input type="file" className="hidden" onChange={(ev) => void onPick(ev)} disabled={busy} />
      </label>
      <ul className="space-y-1 text-xs text-ink-3">
        {(docs.data?.documents ?? []).map((d) => (
          <li key={d.id}>
            {d.downloadUrl ? <a className="underline" href={d.downloadUrl}>{d.fileName}</a> : d.fileName}
            {d.sizeBytes ? ` · ${Math.round(d.sizeBytes / 1024)} KB` : ''} · {new Date(d.createdAt).toLocaleDateString()}
          </li>
        ))}
        {(docs.data?.documents ?? []).length === 0 && <li className="text-ink-4">No attachments yet.</li>}
      </ul>
    </div>
  );
}
