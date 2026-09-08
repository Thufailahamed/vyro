import { Link, useParams } from 'react-router-dom';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { PageHeader } from '@/components/ui';
import { useToast } from '@vyro/ui';
import {
  StoreIcon,
  ShieldCheckIcon,
  AlertCircleIcon,
} from './icons';
import {
  CheckCircleIcon,
  ClockIcon,
  ArrowRightIcon,
  ArrowLeftIcon,
  PackageIcon,
  TruckIcon,
  UserIcon,
} from '@/components/icons';

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
      toast.success(
        detail.data?.supplier.status === 'suspended'
          ? 'Supplier account restored'
          : 'Supplier account suspended',
      );
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Action failed'),
  });

  const verify = useMutation({
    mutationFn: (input: {
      status: 'verified' | 'rejected' | 'pending';
      reason: string;
      expectStatus: VerificationStatus;
    }) => api.post(`/admin/suppliers/${id}/verification`, input),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ['admin-supplier', id] });
      void qc.invalidateQueries({ queryKey: ['admin-suppliers'] });
      toast.success(
        vars.status === 'verified'
          ? 'Supplier verified & authorized for trading'
          : vars.status === 'rejected'
            ? 'KYB application rejected'
            : 'Sent back for review',
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
      <div className="max-w-4xl mx-auto space-y-6">
        <Link
          to="/admin/suppliers"
          className="inline-flex items-center gap-1.5 text-xs font-mono text-ink-4 hover:text-copper transition-colors"
        >
          <ArrowLeftIcon size={14} /> Back to Wholesale Suppliers
        </Link>
        <div className="p-10 bg-paper border border-ink/15 text-center space-y-3">
          <AlertCircleIcon size={32} className="mx-auto text-rose" />
          <h2 className="vyro-display text-2xl font-bold text-ink">Supplier not found</h2>
          <p className="text-xs text-ink-4">
            Could not find an active or archived supplier hub with ID{' '}
            <code className="font-mono text-ink">{id}</code>.
          </p>
          <div className="pt-2">
            <Link
              to="/admin/suppliers"
              className="inline-flex items-center gap-2 px-4 py-2 bg-ink text-paper text-xs font-mono font-bold uppercase tracking-wider hover:bg-charcoal transition-colors"
            >
              Return to Registry
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!detail.data) {
    return (
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="h-8 w-48 bg-bone border border-ink/10 animate-pulse" />
        <div className="h-28 bg-paper border border-ink/10 animate-pulse" />
        <div className="grid sm:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 bg-paper border border-ink/10 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const s = detail.data.supplier;
  const isFrozen = s.status === 'suspended';
  const verification = s.verificationStatus;
  const rejectReasonOk = rejectReason.trim().length >= 5;

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Breadcrumbs & Navigation */}
      <div className="flex items-center justify-between">
        <Link
          to="/admin/suppliers"
          className="inline-flex items-center gap-1.5 text-xs font-mono font-medium text-ink-4 hover:text-copper transition-colors"
        >
          <ArrowLeftIcon size={13} />
          <span>Back to Suppliers Registry</span>
        </Link>
        <span className="text-[10px] font-mono text-ink-4">ID: {s.id}</span>
      </div>

      {/* Executive Page Header */}
      <PageHeader
        kicker={
          <div className="flex flex-wrap items-center gap-2">
            <span className="vyro-kicker text-copper">Registry</span>
            <span className="text-ink-4">/</span>
            <span className="text-[11px] font-mono text-ink-3">Supplier Hub</span>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-volt/15 border border-volt/30 text-[10px] font-mono font-bold text-ink uppercase tracking-wider">
              <StoreIcon size={12} className="text-volt-deep" />
              Verified Facility
            </span>
          </div>
        }
        title={s.name}
        sub={s.description || 'Primary agricultural milling & commercial distribution hub registered on the VYRO wholesale network.'}
        actions={
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => toggleFreeze.mutate()}
              disabled={toggleFreeze.isPending}
              className={`inline-flex items-center gap-2 h-9 px-4 text-xs font-mono font-bold uppercase tracking-wider border transition-all ${
                isFrozen
                  ? 'bg-ink text-paper border-ink hover:bg-charcoal'
                  : 'bg-paper text-rose border-rose/30 hover:bg-rose/10 hover:border-rose'
              }`}
            >
              {toggleFreeze.isPending
                ? 'Updating…'
                : isFrozen
                  ? 'Unfreeze Supplier Hub'
                  : 'Freeze Supplier Hub'}
            </button>
          </div>
        }
      />

      {/* KPI Status Ribbon */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Operating Status */}
        <div className="p-4 bg-paper border border-ink/15 shadow-sm space-y-1">
          <div className="text-[10px] font-mono uppercase tracking-wider text-ink-4 font-bold">
            Operating Status
          </div>
          <div className="flex items-center gap-2 pt-1">
            <span
              className={`size-2.5 rounded-full ${isFrozen ? 'bg-rose animate-ping' : 'bg-emerald-500'}`}
            />
            <span
              className={`vyro-display text-lg font-bold uppercase ${
                isFrozen ? 'text-rose' : 'text-mint'
              }`}
            >
              {isFrozen ? 'Suspended' : 'Operational'}
            </span>
          </div>
          <div className="text-[10px] text-ink-4">
            {isFrozen ? 'Trading held by admin action' : 'Allowed to publish & clear POs'}
          </div>
        </div>

        {/* Verification KYB Status */}
        <div className="p-4 bg-paper border border-ink/15 shadow-sm space-y-1">
          <div className="text-[10px] font-mono uppercase tracking-wider text-ink-4 font-bold">
            KYB Compliance
          </div>
          <div className="flex items-center gap-2 pt-1">
            {verification === 'verified' && (
              <>
                <CheckCircleIcon size={16} className="text-mint" />
                <span className="vyro-display text-lg font-bold text-mint uppercase">Verified</span>
              </>
            )}
            {verification === 'pending' && (
              <>
                <ClockIcon size={16} className="text-amber" />
                <span className="vyro-display text-lg font-bold text-amber uppercase">In Review</span>
              </>
            )}
            {verification === 'rejected' && (
              <>
                <AlertCircleIcon size={16} className="text-rose" />
                <span className="vyro-display text-lg font-bold text-rose uppercase">Rejected</span>
              </>
            )}
            {verification === 'suspended' && (
              <>
                <AlertCircleIcon size={16} className="text-ink-4" />
                <span className="vyro-display text-lg font-bold text-ink-4 uppercase">Suspended</span>
              </>
            )}
          </div>
          <div className="text-[10px] text-ink-4">Business registration status</div>
        </div>

        {/* Published Offers */}
        <div className="p-4 bg-paper border border-ink/15 shadow-sm space-y-1">
          <div className="text-[10px] font-mono uppercase tracking-wider text-ink-4 font-bold flex items-center justify-between">
            <span>Catalog Offers</span>
            <PackageIcon size={13} className="text-ink-4" />
          </div>
          <div className="vyro-metric text-3xl font-bold text-ink">{s.offerCount}</div>
          <div className="text-[10px] text-ink-4">Active product listings</div>
        </div>

        {/* Active Purchase Orders */}
        <div className="p-4 bg-paper border border-ink/15 shadow-sm space-y-1">
          <div className="text-[10px] font-mono uppercase tracking-wider text-ink-4 font-bold flex items-center justify-between">
            <span>Active Orders</span>
            <TruckIcon size={13} className="text-ink-4" />
          </div>
          <div className="vyro-metric text-3xl font-bold text-copper-deep">{s.activePoCount}</div>
          <div className="text-[10px] text-ink-4">Open fulfillment batches</div>
        </div>
      </div>

      {/* KYB Verification Decision Console */}
      <div className="p-6 bg-paper border border-ink/15 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-ink/10">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <ShieldCheckIcon size={18} className="text-copper" />
              <h2 className="vyro-display text-lg font-bold text-ink">
                Wholesale KYB Verification Control
              </h2>
            </div>
            <p className="text-xs text-ink-4 leading-relaxed">
              Verify compliance certificates, Sri Lanka business registration (BR), food hygiene standards, and factory milling permits.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() =>
                verify.mutate({ status: 'verified', reason: '', expectStatus: verification })
              }
              disabled={verify.isPending || verification === 'verified'}
              className="inline-flex items-center gap-1.5 h-9 px-4 text-xs font-mono font-bold uppercase tracking-wider bg-ink text-paper hover:bg-charcoal disabled:opacity-40 disabled:pointer-events-none transition-colors"
            >
              <CheckCircleIcon size={13} className="text-volt" />
              <span>Approve &amp; Authorize</span>
            </button>

            <button
              type="button"
              onClick={() => setRejectOpen((v) => !v)}
              disabled={verify.isPending || verification === 'rejected'}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 text-xs font-mono font-bold uppercase tracking-wider bg-paper text-rose border border-rose/30 hover:bg-rose/10 disabled:opacity-40 disabled:pointer-events-none transition-colors"
            >
              <AlertCircleIcon size={13} />
              <span>Reject Submission</span>
            </button>

            {verification !== 'pending' && (
              <button
                type="button"
                onClick={() =>
                  verify.mutate({ status: 'pending', reason: '', expectStatus: verification })
                }
                disabled={verify.isPending}
                className="inline-flex items-center gap-1.5 h-9 px-3.5 text-xs font-mono font-semibold uppercase tracking-wider bg-bone text-ink-3 hover:text-ink hover:bg-mist border border-ink/15 disabled:opacity-40 transition-colors"
              >
                <ClockIcon size={13} />
                <span>Return to Review</span>
              </button>
            )}
          </div>
        </div>

        {/* Rejection Form Drawer */}
        {rejectOpen && (
          <div className="p-4 bg-rose/5 border border-rose/25 space-y-3 animate-fadeIn">
            <div className="flex items-center justify-between">
              <label className="text-xs font-mono font-bold uppercase tracking-wider text-rose">
                Required Feedback for Supplier
              </label>
              <span className="text-[10px] font-mono text-ink-4">
                {rejectReason.length}/500 chars (min 5)
              </span>
            </div>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="w-full min-h-[88px] bg-paper p-3 text-sm text-ink border border-ink/20 focus:border-rose focus:outline-none placeholder:text-ink-4 font-mono shadow-sm"
              maxLength={500}
              placeholder="State reasons for KYB rejection (e.g. invalid tax identification number, expired municipal food health license, unverified contact information)..."
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setRejectOpen(false)}
                className="px-3 py-1.5 text-xs font-mono font-medium text-ink-3 hover:text-ink"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!rejectReasonOk || verify.isPending}
                onClick={() =>
                  verify.mutate({
                    status: 'rejected',
                    reason: rejectReason.trim(),
                    expectStatus: verification,
                  })
                }
                className="px-4 py-1.5 text-xs font-mono font-bold uppercase tracking-wider bg-rose text-paper hover:bg-rose-deep disabled:opacity-50 transition-colors shadow-sm"
              >
                Confirm Rejection Notice
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Authorized Organization Members */}
      <div className="bg-paper border border-ink/15 shadow-sm overflow-hidden">
        <div className="p-4 sm:px-6 border-b border-ink/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserIcon size={16} className="text-copper" />
            <h2 className="vyro-display text-lg font-bold text-ink">
              Authorized Personnel &amp; Operators ({s.members.length})
            </h2>
          </div>
          <span className="text-[10px] font-mono text-ink-4 uppercase tracking-wider">
            RBAC Access Ledger
          </span>
        </div>

        {s.members.length === 0 ? (
          <div className="p-8 text-center text-xs text-ink-4">
            No linked team members found for this supplier entity.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-ink/10 bg-bone/60 text-[10px] font-mono uppercase tracking-wider text-ink-3">
                  <th className="py-2.5 px-4 sm:px-6">Member / Email</th>
                  <th className="py-2.5 px-4 sm:px-6">Assigned Role</th>
                  <th className="py-2.5 px-4 sm:px-6">User ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/10">
                {s.members.map((m) => (
                  <tr key={m.userId} className="hover:bg-bone/40 transition-colors">
                    <td className="py-3 px-4 sm:px-6">
                      <div className="font-mono text-xs font-semibold text-ink">
                        {m.email || '—'}
                      </div>
                    </td>
                    <td className="py-3 px-4 sm:px-6">
                      <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider bg-mist text-ink border border-line">
                        {m.role}
                      </span>
                    </td>
                    <td className="py-3 px-4 sm:px-6 font-mono text-[11px] text-ink-4">
                      {m.userId}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Facility Metadata & Audit Info */}
      <div className="p-5 bg-bone/50 border border-ink/10 text-xs text-ink-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-0.5">
          <div>
            Entity registered on{' '}
            <span className="font-mono text-ink font-semibold">
              {new Date(s.createdAt).toLocaleString('en-US', {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </span>
          </div>
          <div className="text-[10px]">
            Wholesale clearing identification:{' '}
            <span className="font-mono text-ink-3">{s.id}</span>
          </div>
        </div>
        <Link
          to="/admin/suppliers"
          className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-copper hover:text-ink transition-colors self-start sm:self-auto"
        >
          <span>View All Registered Suppliers</span>
          <ArrowRightIcon size={12} />
        </Link>
      </div>
    </div>
  );
}
