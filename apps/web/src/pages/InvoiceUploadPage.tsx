import { useState, useCallback, type DragEvent, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiBase, ApiError } from '@/lib/api';
import { Button, PageHeader } from '@/components/ui';
import { UploadCloudIcon, FileTextIcon, AlertCircleIcon, CheckCircleIcon } from '@/components/icons';

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

interface UploadResponse {
  uploadId: string;
  status: string;
}

export function InvoiceUploadPage() {
  const navigate = useNavigate();
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneId, setDoneId] = useState<string | null>(null);

  const submit = useCallback(async (file: File) => {
    setError(null);
    setDoneId(null);
    if (!ALLOWED.includes(file.type)) { setError('Use JPG, PNG, WebP, or PDF.'); return; }
    if (file.size > MAX_BYTES) { setError('File exceeds 10MB.'); return; }
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(apiBase + '/documents/upload-direct', {
        method: 'POST',
        credentials: 'include',
        body: form,
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: { code?: string; message?: string }; message?: string };
        throw new ApiError(res.status, body?.error?.code ?? 'UNKNOWN', body?.error?.message ?? body?.message ?? res.statusText);
      }
      const r = (await res.json()) as UploadResponse;
      setDoneId(r.uploadId);
      navigate(`/invoices/${r.uploadId}/review`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  }, [navigate]);

  const onDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) submit(f);
  }, [submit]);

  const onPick = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) submit(f);
    e.target.value = '';
  }, [submit]);

  return (
    <div className="space-y-8 max-w-3xl mx-auto">
      <PageHeader
        kicker="Document Intelligence"
        title="Upload a supplier invoice"
        sub="OCR is automatic. You'll review every line before it counts toward your analytics."
      />
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`bg-paper border-2 border-dashed ${dragOver ? 'border-copper' : 'border-ink/20'} p-12 text-center space-y-4 transition-colors`}
      >
        <UploadCloudIcon size={48} className="mx-auto text-copper" />
        <div>
          <p className="font-display text-lg text-ink">Drop invoice here</p>
          <p className="text-xs text-ink-4 font-mono mt-1">JPG · PNG · WebP · PDF · max 10MB</p>
        </div>
        <label className="inline-block">
          <input type="file" hidden accept={ALLOWED.join(',')} onChange={onPick} disabled={busy} />
          <span className={`inline-flex items-center gap-2 px-4 py-2 font-mono font-bold text-xs uppercase tracking-wider bg-ink text-volt ${busy ? 'opacity-50' : 'cursor-pointer hover:bg-charcoal'}`}>
            <FileTextIcon size={14} />
            {busy ? 'Uploading…' : 'Choose file'}
          </span>
        </label>
        {error && (
          <div className="flex items-center gap-2 text-xs text-rose bg-rose/5 border border-rose/30 p-2 mx-auto max-w-md">
            <AlertCircleIcon size={13} />
            <span>{error}</span>
          </div>
        )}
        {doneId && (
          <div className="flex items-center gap-2 text-xs text-mint bg-mint/5 border border-mint/30 p-2 mx-auto max-w-md">
            <CheckCircleIcon size={13} />
            <span>Uploaded. Opening review…</span>
          </div>
        )}
        <Button variant="secondary" onClick={() => navigate('/invoices')} size="sm">View past invoices</Button>
      </div>
    </div>
  );
}
