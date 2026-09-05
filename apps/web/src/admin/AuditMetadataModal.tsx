import { useEffect } from 'react';

interface AuditRow {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string;
  actorUserId: string | null;
  createdAt: number;
  metadata: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

export function AuditMetadataModal({ row, onClose }: { row: AuditRow; onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const parsed = row.metadata ? safeParse(row.metadata) : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-paper max-w-lg w-full max-h-[80vh] overflow-auto shadow-elevated"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-5 py-4 border-b border-ink/10">
          <div>
            <div className="text-[10px] uppercase tracking-[0.14em] text-ink-4">Audit event</div>
            <h2 className="font-display text-lg">{row.action}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-7 w-7 inline-flex items-center justify-center text-ink-4 hover:text-ink"
            aria-label="Close"
          >
            ×
          </button>
        </header>
        <div className="p-5 space-y-3 text-sm">
          <Field label="Resource" value={`${row.resourceType} (${row.resourceId})`} />
          <Field label="Actor" value={row.actorUserId ?? 'system'} />
          <Field label="When" value={new Date(row.createdAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'medium' })} />
          {row.ip && <Field label="IP" value={row.ip} />}
          {row.userAgent && <Field label="User-Agent" value={row.userAgent} />}
          <div>
            <div className="text-[10px] uppercase tracking-[0.14em] text-ink-4 mb-1">Metadata</div>
            <pre className="bg-mist text-xs font-mono p-3 overflow-auto max-h-64 whitespace-pre-wrap">
              {parsed ? JSON.stringify(parsed, null, 2) : '—'}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <div className="w-24 shrink-0 text-[10px] uppercase tracking-[0.14em] text-ink-4 self-center">{label}</div>
      <div className="font-mono text-xs break-all">{value}</div>
    </div>
  );
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}
