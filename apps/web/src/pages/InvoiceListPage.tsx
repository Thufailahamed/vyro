import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHeader, Button, EmptyState } from '@/components/ui';
import { FileTextIcon, ArrowRightIcon } from '@/components/icons';

interface UploadRow {
  id: string;
  originalFilename: string;
  status: string;
  ocrConfidence: number | null;
  createdAt: number;
  totalCents: number | null;
}

const STATUS_LABEL: Record<string, { label: string; tone: string }> = {
  pending:         { label: 'Queued',                tone: 'text-ink-3' },
  processing:      { label: 'Reading…',              tone: 'text-copper' },
  ready:           { label: 'Awaiting review',       tone: 'text-amber' },
  reviewed:        { label: 'Reviewed',              tone: 'text-mint' },
  failed:          { label: 'Could not read',        tone: 'text-rose' },
  manual_required: { label: 'Manual entry required', tone: 'text-amber' },
};

export function InvoiceListPage() {
  const { data, refetch } = useQuery({
    queryKey: ['invoices'],
    queryFn: () => api.get<{ uploads: UploadRow[] }>('/documents'),
    refetchInterval: (q) => {
      const list = (q.state.data as { uploads: UploadRow[] } | undefined)?.uploads ?? [];
      return list.some((u) => u.status === 'pending' || u.status === 'processing') ? 2000 : false;
    },
  });

  const rows = data?.uploads ?? [];
  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Document Intelligence"
        title="Uploaded invoices"
        sub="Every invoice you upload is read automatically. Review extracted lines before they affect your analytics."
        actions={
          <Link to="/invoices/upload">
            <Button icon={<ArrowRightIcon size={14} />}>Upload invoice</Button>
          </Link>
        }
      />
      {rows.length === 0 ? (
        <EmptyState
          icon={<FileTextIcon size={24} />}
          title="No invoices yet"
          description="Upload a supplier invoice to start tracking categorized spend."
          action={
            <Link to="/invoices/upload">
              <Button>Upload your first invoice</Button>
            </Link>
          }
        />
      ) : (
        <ul className="space-y-3">
          {rows.map((u) => {
            const s = STATUS_LABEL[u.status] ?? STATUS_LABEL.pending!;
            return (
              <li key={u.id} className="bg-paper border border-ink/15 p-4 flex items-center justify-between gap-4">
                <div className="space-y-1 min-w-0">
                  <Link to={`/invoices/${u.id}/review`} className="font-display text-base text-ink hover:text-copper truncate block">
                    {u.originalFilename}
                  </Link>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-ink-4">
                    <span className={`font-mono font-bold uppercase tracking-wider ${s.tone}`}>{s.label}</span>
                    {u.ocrConfidence !== null && (
                      <span className="font-mono">OCR {u.ocrConfidence}%</span>
                    )}
                    {u.totalCents !== null && (
                      <span className="font-mono">Rs. {(u.totalCents / 100).toLocaleString('en-LK')}</span>
                    )}
                    <span className="font-mono">{new Date(u.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
                <Link to={`/invoices/${u.id}/review`}>
                  <Button size="sm" variant="secondary">Review</Button>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <button
        type="button"
        onClick={() => refetch()}
        className="text-[10px] font-mono uppercase tracking-wider text-ink-4 hover:text-ink"
      >
        Refresh
      </button>
    </div>
  );
}
