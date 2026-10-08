/**
 * AI product upload: supplier stages a price list CSV, a photographed/PDF
 * price list, or single product photos. The AI extracts candidate offer rows
 * through Cloudflare AI Gateway; the supplier reviews every row in the
 * staging table, then commit runs the existing import pipeline. AI proposals
 * for unknown products land in admin catalog moderation.
 */
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { Button, Input } from '@/components/ui';
import { UploadCloudIcon, CheckIcon, XIcon, AlertTriangleIcon } from '@/components/icons';
import { useToast } from '@vyro/ui';
import { useSupplierId } from './useSupplierId';
import { SupplierErrorState, SupplierLoadingState } from './SupplierPageState';

const apiMsg = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong');

type UploadSession = {
  id: string;
  status: string;
  errorMessage: string | null;
  sourceKind: string;
};

type UploadRow = {
  id: string;
  rowIndex: number;
  productName: string;
  supplierSku: string | null;
  unit: string | null;
  priceLkr: number | null;
  minOrderQty: number | null;
  stockQty: number | null;
  confidence: number;
  matchType: 'offer' | 'product' | 'proposal' | 'none';
  matchProductId: string | null;
  decision: 'accepted' | 'edited' | 'rejected';
};

type CommitResult = {
  proposals: string[];
  summary: { created: number; updated: number; errors: number; rows: number };
  results: Array<{ row: number; status: string; message?: string }>;
};

const ACCEPT_TYPES = '.csv,.tsv,.txt,.jpg,.jpeg,.png,.webp,.pdf';

const SOURCE_LABEL: Record<string, string> = {
  csv: 'Spreadsheet (CSV)',
  tsv: 'Spreadsheet (TSV)',
  photo_pdf: 'Photo / PDF price list',
  product_photo: 'Product photo',
};

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = reader.result as string;
      const base64 = res.split(',')[1] || res;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function matchBadge(row: UploadRow): string {
  switch (row.matchType) {
    case 'offer':
      return 'Matches a listing';
    case 'product':
      return 'Matches catalog';
    case 'proposal':
      return 'New → admin review';
    default:
      return 'No match — skipped';
  }
}

function AiUploadPageStaged({
  supplierId,
  sessionId,
}: {
  supplierId: string;
  sessionId: string;
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const q = useQuery<{ session: UploadSession; rows: UploadRow[] }>({
    queryKey: ['ai-upload', sessionId],
    queryFn: () => api.get(`/ai/product-uploads/${sessionId}`),
    // Poll while the queue works.
    refetchInterval: (query) => {
      const st = query.state.data?.session.status;
      return st === 'pending' || st === 'extracting' ? 2000 : false;
    },
  });

  const editRow = useMutation({
    mutationFn: async ({ row, patch }: { row: UploadRow; patch: Record<string, unknown> }) =>
      api.patch(`/ai/product-uploads/${sessionId}/rows/${row.id}`, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai-upload', sessionId] }),
    onError: (e) => toast.error('Could not save the row', apiMsg(e)),
  });

  const shippable = q.data?.session.status === 'extracted';
  const commit = useMutation({
    mutationFn: async () => api.post<CommitResult>(`/ai/product-uploads/${sessionId}/commit`, {}),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['ai-upload', sessionId] });
      toast.success(
        data.summary.errors > 0
          ? `Committed with ${data.summary.errors} error(s)`
          : 'Upload committed',
        data.proposals.length
          ? `${data.proposals.length} new product(s) await admin review`
          : undefined,
      );
    },
    onError: (e) => toast.error('Commit failed', apiMsg(e)),
  });

  if (q.isLoading) return <SupplierLoadingState label="Reading the upload…" />;
  if (q.isError) return <SupplierErrorState message={apiMsg(q.error)} onRetry={() => q.refetch()} />;

  const { session, rows } = q.data!;
  const rejected = rows.filter((r) => r.decision === 'rejected');
  const active = rows.filter((r) => r.decision !== 'rejected');
  const named = active.filter((r) => r.productName.trim().length > 0);
  const commitResult = commit.data;

  if (commitResult || session.status === 'committed') {
    return (
      <div className="max-w-3xl mx-auto p-6 space-y-6">
        <h1 className="text-2xl font-semibold">Upload processed</h1>
        {commitResult ? (
          <div className="border rounded-lg p-4 space-y-2 bg-emerald-50/50">
            <p className="text-sm">
              {commitResult.summary.created} created · {commitResult.summary.updated} updated ·{' '}
              {commitResult.summary.errors} errors
            </p>
            {commitResult.proposals.length > 0 && (
              <p className="text-sm text-amber-700">
                {commitResult.proposals.length} new product
                {commitResult.proposals.length > 1 ? 's' : ''} sent for admin review:{' '}
                {commitResult.proposals.join(', ')}
              </p>
            )}
            {commitResult.results
              .filter((r) => r.status === 'error')
              .map((r) => (
                <p key={r.row} className="text-sm text-rose-700">
                  Row {r.row}: {r.message}
                </p>
              ))}
          </div>
        ) : (
          <p className="text-sm text-stone-600">This upload was already committed.</p>
        )}
        <Link className="underline" to="/supplier/products">
          Back to products
        </Link>
      </div>
    );
  }

  if (session.status === 'failed') {
    return (
      <div className="max-w-3xl mx-auto p-6 space-y-4">
        <h1 className="text-2xl font-semibold">Upload failed</h1>
        <div className="border border-rose-200 rounded-lg p-4 bg-rose-50/60 text-sm flex items-start gap-2">
          <AlertTriangleIcon className="w-4 h-4 mt-0.5 text-rose-600" />
          <span>{session.errorMessage ?? 'Could not read this file.'}</span>
        </div>
        <Link className="underline" to="/supplier/ai-upload">
          Try another file
        </Link>
      </div>
    );
  }

  const inFlight = session.status === 'pending' || session.status === 'extracting';
  if (inFlight) {
    return (
      <div className="max-w-3xl mx-auto p-6 space-y-3 text-center">
        <p className="text-lg">{SOURCE_LABEL[session.sourceKind]} — extracting…</p>
        <p className="text-sm text-stone-500">
          The AI is reading your upload through the gateway. This takes a few seconds.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Review staged rows</h1>
        <span className="text-xs text-stone-500">
          {named.length} of {active.length} rows ready · {rejected.length} rejected
        </span>
      </div>
      {session.errorMessage && (
        <p className="text-sm text-amber-700 flex items-center gap-2">
          <AlertTriangleIcon className="w-4 h-4" /> {session.errorMessage}
        </p>
      )}
      <div className="border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-stone-500 border-b">
              <th className="px-3 py-2">Product</th>
              <th className="px-3 py-2">SKU</th>
              <th className="px-3 py-2">Unit</th>
              <th className="px-3 py-2">Price (LKR)</th>
              <th className="px-3 py-2">MOQ</th>
              <th className="px-3 py-2">Match</th>
              <th className="px-3 py-2">Confidence</th>
              <th className="px-3 py-2">Keep</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className={row.decision === 'rejected' ? 'opacity-50' : ''}>
                <td className="px-3 py-2">
                  <Input
                    className="w-56"
                    value={row.productName}
                    onChange={(e) =>
                      editRow.mutate({
                        row,
                        patch: { decision: 'edited', edited: { productName: e.target.value } },
                      })
                    }
                  />
                </td>
                <td className="px-3 py-2">{row.supplierSku ?? '—'}</td>
                <td className="px-3 py-2">{row.unit ?? '—'}</td>
                <td className="px-3 py-2 w-32">
                  <Input
                    type="number"
                    min="0"
                    className="w-28"
                    value={row.priceLkr ?? ''}
                    onChange={(e) =>
                      editRow.mutate({
                        row,
                        patch: {
                          decision: 'edited',
                          edited: { priceLkr: Number(e.target.value) },
                        },
                      })
                    }
                  />
                </td>
                <td className="px-3 py-2">{row.minOrderQty ?? '—'}</td>
                <td className="px-3 py-2 text-xs">{matchBadge(row)}</td>
                <td className={`px-3 py-2 text-xs ${row.confidence < 60 ? 'text-rose-600' : 'text-stone-500'}`}>
                  {row.confidence}%
                </td>
                <td className="px-3 py-2">
                  {row.decision === 'rejected' ? (
                    <Button variant="outline" onClick={() => editRow.mutate({ row, patch: { decision: 'accepted' } })}>
                      <CheckIcon className="w-4 h-4" /> Keep
                    </Button>
                  ) : (
                    <Button variant="ghost" onClick={() => editRow.mutate({ row, patch: { decision: 'rejected' } })}>
                      <XIcon className="w-4 h-4" /> Drop
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex justify-end">
        <Button
          disabled={!shippable || named.length === 0 || editRow.isPending}
          onClick={() => commit.mutate()}
        >
          Commit {named.length} rows
        </Button>
      </div>
      <p className="text-xs text-stone-500">
        Rows flagged “New → admin review” create catalog products that stay hidden until an admin
        approves them. Supplier: {supplierId ? supplierId.slice(0, 10) : ''}…
      </p>
      <span className="hidden">{void supplierId}</span>
    </div>
  );
}

export function AiUploadLanding({ supplierId }: { supplierId: string | null }) {
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const base64 = await fileToBase64(file);
      return api.post<{ sessionId: string; status: string }>('/ai/product-uploads', {
        supplierId,
        filename: file.name,
        contentType: file.type || 'text/csv',
        base64,
      });
    },
    onSuccess: (data) => setSessionId(data.sessionId),
    onError: (e) => {
      setErrorCode(apiMsg(e));
      toast.error('Upload failed', apiMsg(e));
    },
  });

  if (sessionId) return <AiUploadPageStaged supplierId={supplierId ?? ''} sessionId={sessionId} />;

  const pick = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file || !supplierId) return;
    if (!/\.(csv|tsv|txt|jpe?g|png|webp|pdf)$/i.test(file.name)) {
      setErrorCode('Spreadsheets must be re-exported as CSV — photos, PDFs, JPEG/PNG/WebP are fine');
      return;
    }
    if (file.size > 7.5 * 1024 * 1024) {
      setErrorCode('File too large (max 7.5 MB)');
      return;
    }
    setErrorCode(null);
    setUploading(true);
    try {
      await upload.mutateAsync(file);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Upload products with AI</h1>
        <p className="text-sm text-stone-600">
          Drop a price list (CSV export, a photo or PDF, WhatsApp-sent images work too) or a single
          product photo. The AI reads it and stages every row for your review — nothing goes live
          until you commit.
        </p>
      </div>
      <div
        className="border-2 border-dashed rounded-xl p-10 text-center space-y-3"
        onClick={() => fileInput.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === 'Enter' ? fileInput.current?.click() : undefined)}
      >
        <UploadCloudIcon className="w-8 h-8 mx-auto text-stone-400" />
        <p className="text-sm">{uploading ? 'Uploading…' : 'Click to choose a file'}</p>
        <p className="text-xs text-stone-500">
          Spreadsheets must be CSV exports (.xlsx is not read) · photos/PDF up to 7.5 MB · up to 200 rows
        </p>
      </div>
      <input
        ref={fileInput}
        type="file"
        accept={ACCEPT_TYPES}
        className="hidden"
        onChange={(e) => void pick(e.target.files)}
      />
      {errorCode && (
        <p className="text-sm text-amber-700 flex items-center gap-2">
          <AlertTriangleIcon className="w-4 h-4" /> {errorCode}
        </p>
      )}
    </div>
  );
}

export default function AiUploadPage() {
  const { supplierId } = useSupplierId();
  return <AiUploadLanding supplierId={supplierId} />;
}
