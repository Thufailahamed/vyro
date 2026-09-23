// apps/web/src/admin/DocumentViewer.tsx
import { useState } from 'react';
import { Button } from '@/components/ui';
import { FileTextIcon } from '@/components/icons';
import { useCaseDocuments, previewUrl, type CaseDocument } from './useAdminDocuments';
import { Skeleton } from './ui';

function kindOf(mime: string): 'image' | 'pdf' | 'other' {
  if (mime.startsWith('image/')) return 'image';
  if (mime === 'application/pdf') return 'pdf';
  return 'other';
}

export function DocumentViewer({ kycId }: { kycId: string }) {
  const { data, isLoading, isError } = useCaseDocuments(kycId);
  const [open, setOpen] = useState<CaseDocument | null>(null);
  if (isLoading)
    return (
      <div className="space-y-2" aria-busy="true">
        <span className="sr-only">Loading documents…</span>
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  if (isError) return <p className="text-sm text-rose">Could not load documents.</p>;
  const docs = data?.documents ?? [];
  if (!docs.length) return <p className="text-sm text-ink-4">No documents on file.</p>;
  const kind = open ? kindOf(open.mimeType) : null;
  return (
    <div className="space-y-2">
      {docs.map((d) => (
        <button
          key={d.id}
          type="button"
          onClick={() => setOpen(d)}
          className="group flex w-full items-center gap-3 rounded-lg bg-bone/50 px-3 py-2.5 text-left shadow-[inset_0_0_0_1px_rgba(12,14,11,0.06)] transition-colors hover:bg-bone"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-paper text-ink-3 group-hover:text-ink">
            <FileTextIcon size={15} />
          </span>
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-ink">{d.filename}</span>
          <span className="shrink-0 text-xs text-ink-4 num-tabular">({Math.round(d.sizeBytes / 1024)} KB)</span>
        </button>
      ))}
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onClick={() => setOpen(null)}
        >
          <div className="vyro-floating w-full max-w-3xl space-y-4 p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h4 className="font-sans text-base font-semibold text-ink">Document preview</h4>
                <p className="mt-0.5 break-all font-mono text-xs text-ink-4">{open.filename}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <a
                  href={previewUrl(open.id, true)}
                  className="inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium text-ink shadow-[inset_0_0_0_1px_rgba(12,14,11,0.16)] transition-colors hover:bg-bone"
                >
                  Download
                </a>
                <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(null)}>
                  Close
                </Button>
              </div>
            </div>
            <div className="overflow-hidden rounded-xl bg-bone/60">
              {kind === 'image' ? (
                <img src={previewUrl(open.id)} alt={open.filename} className="mx-auto max-h-[70vh]" />
              ) : kind === 'pdf' ? (
                <iframe src={previewUrl(open.id)} title={open.filename} className="h-[70vh] w-full" />
              ) : (
                <p className="p-6 text-center text-sm text-ink-3">Preview not available — use Download.</p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
