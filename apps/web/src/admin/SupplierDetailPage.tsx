import { Link, useParams } from 'react-router-dom';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { PageHeader, Button, Badge } from '@/components/ui';
import { Surface } from '@/components/brand/Surface';
import { useToast } from '@vyro/ui';

type VerificationStatus = 'pending' | 'verified' | 'rejected' | 'suspended';

type Detail = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  verificationStatus: VerificationStatus;
  createdAt: number;
  members: Array<{ userId: string; role: string; email: string | null }>;
  offerCount: number;
  activePoCount: number;
};

const VERIFICATION_VARIANT: Record<
  VerificationStatus,
  'success' | 'danger' | 'warning' | 'neutral'
> = {
  verified: 'success',
  pending: 'warning',
  rejected: 'danger',
  suspended: 'neutral',
};

export function SupplierDetailPage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const detail = useQuery({
    queryKey: ['admin-supplier', id],
    queryFn: () => api.get<{ supplier: Detail }>(`/admin/suppliers/${id}`),
    retry: false,
  });

  const toggleFreeze = useMutation({
    mutationFn: () =>
      detail.data?.supplier.status === 'suspended'
        ? api.post(`/admin/suppliers/${id}/unfreeze`)
        : api.post(`/admin/suppliers/${id}/freeze`, { reason: 'admin' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin-supplier', id] });
      void qc.invalidateQueries({ queryKey: ['admin-suppliers'] });
      toast.success('Supplier updated');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Failed'),
  });

  const verify = useMutation({
    mutationFn: (input: { status: 'verified' | 'rejected' | 'pending'; reason: string; expectStatus: VerificationStatus }) =>
      api.post(`/admin/suppliers/${id}/verification`, input),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ['admin-supplier', id] });
      void qc.invalidateQueries({ queryKey: ['admin-suppliers'] });
      toast.success(
        vars.status === 'verified'
          ? 'Supplier verified'
          : vars.status === 'rejected'
            ? 'Verification rejected'
            : 'Sent back to review',
      );
      setRejectOpen(false);
      setRejectReason('');
    },
    onError: (e) => {
      const msg = e instanceof ApiError ? e.message : 'Verification update failed';
      toast.error(msg);
    },
  });

  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  if (detail.isError) {
    return (
      <div className="space-y-4">
        <p className="text-[11px] uppercase tracking-[0.14em] text-ink-4">Admin</p>
        <h1 className="vyro-display text-2xl">Supplier not found</h1>
        <Link to="/admin/suppliers" className="text-volt underline text-sm">
          ← Back to suppliers
        </Link>
      </div>
    );
  }
  if (!detail.data) return <p className="text-sm text-ink-4">Loading…</p>;

  const s = detail.data.supplier;
  const isFrozen = s.status === 'suspended';
  const verification = s.verificationStatus;
  const rejectReasonOk = rejectReason.trim().length >= 5;

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Supplier"
        title={s.name}
        sub={s.description ?? 'No description.'}
        actions={
          <Button
            variant={isFrozen ? 'primary' : 'danger'}
            onClick={() => toggleFreeze.mutate()}
            disabled={toggleFreeze.isPending}
          >
            {isFrozen ? 'Unfreeze supplier' : 'Freeze supplier'}
          </Button>
        }
      />

      <div className="grid sm:grid-cols-4 gap-px bg-ink/10">
        <div className="bg-paper p-5">
          <div className="text-[11px] uppercase tracking-[0.14em] text-ink-4">Status</div>
          <div className="mt-2">
            <Badge variant={isFrozen ? 'danger' : 'success'}>
              {isFrozen ? 'Frozen' : 'Active'}
            </Badge>
          </div>
        </div>
        <div className="bg-paper p-5">
          <div className="text-[11px] uppercase tracking-[0.14em] text-ink-4">Verification</div>
          <div className="mt-2">
            <Badge variant={VERIFICATION_VARIANT[verification]}>{verification}</Badge>
          </div>
        </div>
        <div className="bg-paper p-5">
          <div className="text-[11px] uppercase tracking-[0.14em] text-ink-4">Offers</div>
          <div className="text-2xl vyro-display mt-1">{s.offerCount}</div>
        </div>
        <div className="bg-paper p-5">
          <div className="text-[11px] uppercase tracking-[0.14em] text-ink-4">Active POs</div>
          <div className="text-2xl vyro-display mt-1">{s.activePoCount}</div>
        </div>
      </div>

      <Surface kind="elevated" className="p-6 space-y-4">
        <header className="flex items-end justify-between gap-4">
          <div>
            <h2 className="vyro-display text-lg">Verification</h2>
            <p className="text-xs text-ink-4">
              Approve or reject this supplier’s KYB submission. The supplier will be notified.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="primary"
              onClick={() =>
                verify.mutate({ status: 'verified', reason: '', expectStatus: verification })
              }
              disabled={verify.isPending || verification === 'verified'}
              aria-label="Approve verification"
            >
              Approve
            </Button>
            <Button
              variant="danger"
              onClick={() => setRejectOpen((v) => !v)}
              disabled={verify.isPending || verification === 'rejected'}
              aria-expanded={rejectOpen}
              aria-controls="supplier-reject-panel"
            >
              Reject
            </Button>
            {verification !== 'pending' && (
              <Button
                variant="ghost"
                onClick={() =>
                  verify.mutate({ status: 'pending', reason: '', expectStatus: verification })
                }
                disabled={verify.isPending}
              >
                Send back to review
              </Button>
            )}
          </div>
        </header>

        {rejectOpen && (
          <div id="supplier-reject-panel" className="space-y-3 border-t border-line pt-4">
            <label className="block text-xs uppercase tracking-[0.14em] text-ink-4">
              Rejection reason (sent to supplier)
            </label>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="w-full min-h-[96px] rounded border border-line bg-paper p-3 text-sm"
              maxLength={500}
              placeholder="Explain what the supplier needs to fix or send."
            />
            <div className="flex items-center justify-end gap-2">
              <Button variant="ghost" onClick={() => setRejectOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                disabled={!rejectReasonOk || verify.isPending}
                onClick={() =>
                  verify.mutate({
                    status: 'rejected',
                    reason: rejectReason.trim(),
                    expectStatus: verification,
                  })
                }
              >
                Confirm rejection
              </Button>
            </div>
          </div>
        )}
      </Surface>

      <Surface kind="elevated" className="p-6 space-y-4">
        <h2 className="vyro-display text-lg">Members ({s.members.length})</h2>
        {s.members.length === 0 ? (
          <p className="text-sm text-ink-4">No members on file.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-[0.14em] text-ink-4">
              <tr>
                <th className="text-left py-2 font-normal">Email</th>
                <th className="text-left py-2 font-normal">Role</th>
              </tr>
            </thead>
            <tbody>
              {s.members.map((m) => (
                <tr key={m.userId} className="border-t border-line">
                  <td className="py-2 font-mono text-xs">{m.email ?? '—'}</td>
                  <td className="py-2"><Badge variant="neutral">{m.role}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Surface>

      <Surface kind="elevated" className="p-6">
        <h2 className="vyro-display text-lg mb-2">Lifecycle</h2>
        <p className="text-xs text-ink-4">
          Created {new Date(s.createdAt).toLocaleString()} · ID <span className="font-mono">{s.id}</span>
        </p>
      </Surface>

      <Link to="/admin/suppliers" className="text-xs text-ink-4 hover:text-volt">
        ← Back to suppliers
      </Link>
    </div>
  );
}
