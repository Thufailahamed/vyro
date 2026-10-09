import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';
import { apiBase } from '@/lib/api';
import { cn } from '@vyro/ui';

export const proofUrl = (bankTransferId: string) =>
  `${apiBase}/finance/bank-transfer/proof/${encodeURIComponent(bankTransferId)}`;

/**
 * Inline bank-transfer receipt. Fetched with the session cookie (works when the
 * API is on another origin) and shown as an image; PDFs get an open link.
 * Clicking an image opens it full size.
 */
export function ProofPreview({
  bankTransferId,
  mimeType,
  fileName,
  className,
}: {
  bankTransferId: string;
  mimeType: string | null;
  fileName: string | null;
  className?: string;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [zoom, setZoom] = useState(false);
  const isImage = !mimeType || mimeType.startsWith('image/');

  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    setFailed(false);
    setSrc(null);
    fetch(proofUrl(bankTransferId), { credentials: 'include' })
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.blob();
      })
      .then((b) => {
        if (cancelled) return;
        url = URL.createObjectURL(b);
        setSrc(url);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [bankTransferId]);

  if (failed) return <div className="text-[11px] text-rose">Could not load the receipt.</div>;
  if (!src)
    return (
      <div
        className={cn('h-40 w-full animate-pulse rounded-lg bg-ink/[0.06]', className)}
        aria-label="Loading receipt"
      />
    );

  if (!isImage) {
    return (
      <a
        href={src}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-[11px] font-semibold text-copper hover:text-ink transition-colors"
      >
        Open receipt PDF{fileName ? ` (${fileName})` : ''} ↗
      </a>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setZoom(true)}
        className={cn(
          'block w-full overflow-hidden rounded-lg border border-ink/10 bg-ink/[0.03]',
          className,
        )}
        aria-label="View receipt full size"
      >
        <img
          src={src}
          alt={fileName ?? 'Bank transfer receipt'}
          className="max-h-72 w-full object-contain"
        />
      </button>
      {zoom &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Bank transfer receipt"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
            onClick={() => setZoom(false)}
            onKeyDown={(e) => e.key === 'Escape' && setZoom(false)}
            tabIndex={-1}
          >
            <img
              src={src}
              alt={fileName ?? 'Bank transfer receipt'}
              className="max-h-full max-w-full rounded-lg object-contain"
            />
            <button
              type="button"
              onClick={() => setZoom(false)}
              className="absolute right-4 top-4 rounded-full bg-white/10 px-3 py-1 text-sm font-semibold text-white hover:bg-white/20"
            >
              Close
            </button>
          </div>,
          document.body,
        )}
    </>
  );
}

/** Local preview of a file the buyer picked, before it is uploaded. */
export function LocalImagePreview({ file }: { file: File | null }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!file || !file.type.startsWith('image/')) return setSrc(null);
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  if (!src) return null;
  return (
    <div className="overflow-hidden rounded-lg border border-ink/10 bg-ink/[0.03]">
      <img src={src} alt="Selected receipt" className="max-h-56 w-full object-contain" />
    </div>
  );
}
