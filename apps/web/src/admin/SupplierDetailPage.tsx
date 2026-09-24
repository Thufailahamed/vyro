import { Link, useParams } from 'react-router-dom';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { Button, Label, Textarea } from '@/components/ui';
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
  PackageIcon,
  TruckIcon,
  UserIcon,
  XIcon,
} from '@/components/icons';
import { SupplierTrustSignalsCard } from './trust/SupplierTrustSignalsCard';
import {
  AdminPage,
  AdminPageHeader,
  Card,
  Callout,
  EmptyBlock,
  Panel,
  Pill,
  Skeleton,
  StatCard,
  StatGrid,
  TableCard,
  TableSkeleton,
} from './ui';

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
      <AdminPage>
        <AdminPageHeader
          back={{ to: '/admin/suppliers', label: 'Suppliers registry' }}
          kicker="Registry"
          title="Supplier not found"
        />
        <Card>
          <EmptyBlock
            icon={<AlertCircleIcon size={22} />}
            title="Supplier not found"
            description={
              <>
                Could not find an active or archived supplier hub with ID{' '}
                <code className="font-mono text-ink">{id}</code>.
              </>
            }
            action={
              <Link to="/admin/suppliers">
                <Button variant="secondary" size="sm" icon={<ArrowRightIcon size={13} />}>
                  Return to registry
                </Button>
              </Link>
            }
          />
        </Card>
      </AdminPage>
    );
  }

  if (!detail.data) {
    return (
      <AdminPage>
        <Skeleton className="h-4 w-44" />
        <div className="space-y-2">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-56" />
      </AdminPage>
    );
  }

  const s = detail.data.supplier;
  const isFrozen = s.status === 'suspended';
  const verification = s.verificationStatus;
  const rejectReasonOk = rejectReason.trim().length >= 5;

  const verificationTone =
    verification === 'verified'
      ? 'success'
      : verification === 'pending'
        ? 'warning'
        : verification === 'rejected'
          ? 'danger'
          : 'neutral';
  const verificationLabel =
    verification === 'verified'
      ? 'Verified'
      : verification === 'pending'
        ? 'In review'
        : verification === 'rejected'
          ? 'Rejected'
          : 'Suspended';

  return (
    <AdminPage>
      <AdminPageHeader
        back={{ to: '/admin/suppliers', label: 'Suppliers registry' }}
        kicker={
          <>
            <span>Registry</span>
            <span className="text-ink-5">/</span>
            <span>Supplier Hub</span>
          </>
        }
        title={s.name}
        description={
          s.description ||
          'Primary agricultural milling & commercial distribution hub registered on the VYRO wholesale network.'
        }
        meta={
          <>
            <Pill tone={verificationTone} dot>
              {verificationLabel} facility
            </Pill>
            <Pill tone={isFrozen ? 'danger' : 'success'} dot>
              {isFrozen ? 'Suspended' : 'Operational'}
            </Pill>
            <span className="font-mono text-[11px] text-ink-4">ID: {s.id}</span>
          </>
        }
        actions={
          <Button
            variant={isFrozen ? 'success' : 'secondary'}
            size="sm"
            className={isFrozen ? '' : 'text-rose hover:bg-rose/10'}
            onClick={() => toggleFreeze.mutate()}
            loading={toggleFreeze.isPending}
          >
            {isFrozen ? 'Unfreeze supplier hub' : 'Freeze supplier hub'}
          </Button>
        }
      />

      <StatGrid cols={4}>
        <StatCard
          label="Operating status"
          value={isFrozen ? 'Suspended' : 'Operational'}
          sub={isFrozen ? 'Trading held by admin action' : 'Allowed to publish & clear POs'}
          icon={<StoreIcon size={16} />}
          tone={isFrozen ? 'danger' : 'success'}
        />
        <StatCard
          label="KYB compliance"
          value={verificationLabel}
          sub="Business registration status"
          icon={<ShieldCheckIcon size={16} />}
          tone={verificationTone}
        />
        <StatCard
          label="Catalog offers"
          value={s.offerCount}
          sub="Active product listings"
          icon={<PackageIcon size={16} />}
        />
        <StatCard
          label="Active orders"
          value={s.activePoCount}
          sub="Open fulfillment batches"
          icon={<TruckIcon size={16} />}
        />
      </StatGrid>

      <Panel
        title="KYB verification"
        description="Verify compliance certificates, Sri Lanka business registration (BR), food hygiene standards, and factory milling permits."
        icon={<ShieldCheckIcon size={16} />}
        actions={
          <>
            <Button
              variant="success"
              size="sm"
              onClick={() => verify.mutate({ status: 'verified', reason: '', expectStatus: verification })}
              disabled={verify.isPending || verification === 'verified'}
              icon={<CheckCircleIcon size={13} />}
            >
              Approve &amp; authorize
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="text-rose hover:bg-rose/10"
              onClick={() => setRejectOpen((v) => !v)}
              disabled={verify.isPending || verification === 'rejected'}
              icon={<XIcon size={13} />}
            >
              Reject submission
            </Button>
            {verification !== 'pending' ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => verify.mutate({ status: 'pending', reason: '', expectStatus: verification })}
                disabled={verify.isPending}
                icon={<ClockIcon size={13} />}
              >
                Return to review
              </Button>
            ) : null}
          </>
        }
      >
        {rejectOpen ? (
          <Callout tone="danger" title="Required feedback for supplier">
            <div className="mt-3 space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="reject-reason" className="mb-0">
                  Rejection reason
                </Label>
                <span className="font-mono text-[10px] text-ink-4">
                  {rejectReason.length}/500 · min 5
                </span>
              </div>
              <Textarea
                id="reject-reason"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder="State reasons for KYB rejection (e.g. invalid tax identification number, expired municipal food health license, unverified contact information)…"
              />
              <div className="flex items-center justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setRejectOpen(false)}>
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  disabled={!rejectReasonOk}
                  loading={verify.isPending}
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
          </Callout>
        ) : (
          <p className="text-xs leading-relaxed text-ink-4">
            Current status: <span className="font-semibold text-ink">{verificationLabel}</span>. Approving authorizes the
            hub to publish offers and clear purchase orders; rejecting returns the submission to the supplier with your
            feedback.
          </p>
        )}
      </Panel>

      <SupplierTrustSignalsCard supplierId={s.id} />

      <TableCard
        title={
          <>
            <span className="inline-flex items-center gap-2">
              <UserIcon size={15} className="text-ink-3" />
              Authorized personnel &amp; operators
            </span>
          </>
        }
        description={`${s.members.length} linked ${s.members.length === 1 ? 'member' : 'members'} · RBAC access ledger`}
      >
        {s.members.length === 0 ? (
          <EmptyBlock
            icon={<UserIcon size={22} />}
            title="No team members"
            description="No linked team members found for this supplier entity."
          />
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Member / email</th>
                <th>Assigned role</th>
                <th>User ID</th>
              </tr>
            </thead>
            <tbody>
              {s.members.map((m) => (
                <tr key={m.userId}>
                  <td>
                    <span className="font-mono text-[13px] font-medium text-ink">{m.email || '—'}</span>
                  </td>
                  <td>
                    <Pill tone="neutral">{m.role}</Pill>
                  </td>
                  <td>
                    <span className="font-mono text-[11px] text-ink-4">{m.userId}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </TableCard>

      <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1 text-xs text-ink-4">
          <div>
            Entity registered on{' '}
            <span className="font-mono font-semibold text-ink">
              {new Date(s.createdAt).toLocaleString('en-US', {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </span>
          </div>
          <div className="font-mono text-[11px]">Wholesale clearing ID: {s.id}</div>
        </div>
        <Link
          to="/admin/suppliers"
          className="inline-flex items-center gap-1.5 self-start text-xs font-semibold text-copper transition-colors hover:text-ink sm:self-auto"
        >
          View all registered suppliers
          <ArrowRightIcon size={12} />
        </Link>
      </Card>
    </AdminPage>
  );
}
