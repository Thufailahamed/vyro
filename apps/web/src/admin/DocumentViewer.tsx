// apps/web/src/admin/DocumentViewer.tsx
import { useState } from 'react';
import { useCaseDocuments, previewUrl, type CaseDocument } from './useAdminDocuments';

function kindOf(mime: string): 'image' | 'pdf' | 'other' {
  if (mime.startsWith('image/')) return 'image';
  if (mime === 'application/pdf') return 'pdf';
  return 'other';
}

export function DocumentViewer({ kycId }: { kycId: string }) {
  const { data, isLoading, isError } = useCaseDocuments(kycId);
  const [open, setOpen] = useState<CaseDocument | null>(null);
  if (isLoading) return <p className="text-sm text-ink-500">Loading documents…</p>;
  if (isError) return <p className="text-sm text-rose">Could not load documents.</p>;
  const docs = data?.documents ?? [];
  if (!docs.length) return <p className="text-sm text-ink-500">No documents on file.</p>;
  const kind = open ? kindOf(open.mimeType) : null;
  return (
    <div className="space-y-1">
      {docs.map((d) => (
        <button
          key={d.id}
          type="button"
          onClick={() => setOpen(d)}
          className="w-full text-left font-mono text-xs underline"
        >
          {d.filename} <span className="text-ink-500">({Math.round(d.sizeBytes / 1024)} KB)</span>
        </button>
      ))}
      {open ? (
        <div
          className="fixed inset-0 z-50 bg-ink/60 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setOpen(null)}
        >
          <div className="bg-paper border border-ink/10 max-w-3xl w-full p-4 space-y-2" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h4 className="font-mono text-xs break-all">{open.filename}</h4>
              <div className="flex gap-2">
                <a href={previewUrl(open.id, true)} className="text-xs underline">Download</a>
                <button type="button" onClick={() => setOpen(null)} className="text-xs underline">Close</button>
              </div>
            </div>
            {kind === 'image' ? (
              <img src={previewUrl(open.id)} alt={open.filename} className="max-h-[70vh] mx-auto" />
            ) : kind === 'pdf' ? (
              <iframe src={previewUrl(open.id)} title={open.filename} className="w-full h-[70vh]" />
            ) : (
              <p className="text-sm">Preview not available — use Download.</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
