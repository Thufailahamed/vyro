import { Link, useParams } from 'react-router-dom';
import { useId, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { Button, Label, Textarea } from '@/components/ui';
import { cn, useToast } from '@vyro/ui';
import {
  StoreIcon,
  ShieldCheckIcon,
  AlertCircleIcon,
} from './icons';
import {
  CheckCircleIcon,
  ClockIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  CalendarIcon,
  CheckIcon,
  PackageIcon,
  TruckIcon,
  UserIcon,
  UsersIcon,
  XIcon,
} from '@/components/icons';
import { CopyId, Monogram, formatDate, relativeTime } from './registryUi';
import { SupplierTrustSignalsCard } from './trust/SupplierTrustSignalsCard';
import {
  AdminPage,
  AdminPageHeader,
  Card,
  Callout,
  DetailList,
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
  const [freezeOpen, setFreezeOpen] = useState(false);

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
      {/* Hero */}
      <section className="vyro-surface relative overflow-hidden">
        <div
          className="pointer-events-none absolute -right-32 -top-40 size-96 rounded-full bg-volt/25 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(rgba(12,14,11,0.07)_1px,transparent_1px)] [background-size:18px_18px] [mask-image:linear-gradient(110deg,transparent_40%,black)]"
          aria-hidden
        />
        <div className="relative p-5 sm:p-7">
          <div className="flex items-center justify-between gap-3">
            <Link
              to="/admin/suppliers"
              className="group flex w-fit items-center gap-1.5 rounded-full bg-paper py-1 pl-2 pr-3 text-xs font-medium text-ink-3 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.1)] transition-all hover:text-ink hover:shadow-[inset_0_0_0_1px_rgba(12,14,11,0.25)]"
            >
              <ArrowLeftIcon size={13} className="transition-transform group-hover:-translate-x-0.5" />
              Suppliers registry
            </Link>
            <div className="hidden items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-4 sm:inline-flex">
              <span className="size-1.5 rotate-45 bg-volt-deep" aria-hidden />
              Registry / Supplier hub
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div className="flex min-w-0 items-start gap-4 sm:gap-5">
              <Monogram
                name={s.name}
                seed={s.id}
                size="lg"
                badge={
                  verification === 'verified' ? (
                    <span className="flex size-6 items-center justify-center rounded-full bg-mint text-paper ring-[3px] ring-paper">
                      <CheckIcon size={12} />
                    </span>
                  ) : undefined
                }
              />
              <div className="min-w-0">
                <h1 className="font-display text-[1.75rem] font-bold leading-[1.08] tracking-[-0.035em] text-ink text-balance sm:text-[2.125rem]">
                  {s.name}
                </h1>
                <p className="mt-2 max-w-2xl text-[0.9375rem] leading-relaxed text-ink-4 text-pretty">
                  {s.description ||
                    'Primary agricultural milling & commercial distribution hub registered on the VYRO wholesale network.'}
                </p>
                <div className="mt-3.5 flex flex-wrap items-center gap-2">
                  <Pill tone={verificationTone} dot>
                    {verificationLabel} facility
                  </Pill>
                  <Pill tone={isFrozen ? 'danger' : 'success'} dot>
                    {isFrozen ? 'Suspended' : 'Operational'}
                  </Pill>
                  <span className="mx-1 h-4 w-px bg-ink/10" aria-hidden />
                  <CopyId id={s.id} />
                  <span className="inline-flex items-center gap-1.5 text-xs text-ink-4">
                    <CalendarIcon size={12} className="text-ink-5" />
                    Joined {formatDate(s.createdAt)}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {verification === 'pending' ? (
                <a href="#kyb" className="admin-btn admin-btn-volt admin-btn-sm">
                  <ShieldCheckIcon size={13} />
                  Review KYB
                </a>
              ) : null}
              <Button
                variant={isFrozen ? 'success' : 'secondary'}
                size="sm"
                className={isFrozen ? '' : 'text-rose hover:bg-rose/10'}
                onClick={() => setFreezeOpen(true)}
                loading={toggleFreeze.isPending}
              >
                {isFrozen ? 'Unfreeze hub' : 'Freeze hub'}
              </Button>
            </div>
          </div>
        </div>
      </section>

      {isFrozen ? (
        <Callout tone="danger" title="Trading is frozen for this hub">
          This supplier account is suspended. It stays on hold until an admin unfreezes it.
        </Callout>
      ) : null}

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

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div id="kyb" className="scroll-mt-24">
            <Panel
              title="KYB verification"
              description="Verify compliance certificates, Sri Lanka business registration (BR), food hygiene standards, and factory milling permits."
              icon={<ShieldCheckIcon size={16} />}
            >
              <KybStepper status={verification} />

              {rejectOpen ? (
                <Callout tone="danger" title="Required feedback for supplier" className="mt-6">
                  <div className="mt-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="reject-reason" className="mb-0">
                        Rejection reason
                      </Label>
                      <span className="font-mono text-[10px] text-ink-4">{rejectReason.length}/500 · min 5</span>
                    </div>
                    <Textarea
                      id="reject-reason"
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      rows={3}
                      maxLength={500}
                      autoFocus
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
                <div className="mt-6 flex flex-col gap-4 rounded-xl bg-bone/60 p-4 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.06)] sm:flex-row sm:items-center sm:justify-between">
                  <p className="max-w-md text-xs leading-relaxed text-ink-4">
                    Approving authorizes the hub to publish offers and clear purchase orders. Rejecting returns the
                    submission to the supplier with your feedback.
                  </p>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
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
                    <Button
                      variant="secondary"
                      size="sm"
                      className="text-rose hover:bg-rose/10"
                      onClick={() => setRejectOpen(true)}
                      disabled={verify.isPending || verification === 'rejected'}
                      icon={<XIcon size={13} />}
                    >
                      Reject
                    </Button>
                    <Button
                      variant="success"
                      size="sm"
                      onClick={() => verify.mutate({ status: 'verified', reason: '', expectStatus: verification })}
                      disabled={verify.isPending || verification === 'verified'}
                      icon={<CheckCircleIcon size={13} />}
                    >
                      Approve &amp; authorize
                    </Button>
                  </div>
                </div>
              )}
            </Panel>
          </div>

          <SupplierTrustSignalsCard supplierId={s.id} />
        </div>

        <aside className="space-y-6">
          <Panel title="Facility profile" icon={<StoreIcon size={16} />}>
            <DetailList
              items={[
                { label: 'Supplier ID', value: <CopyId id={s.id} label="" className="text-xs" /> },
                {
                  label: 'Registered',
                  value: (
                    <span>
                      {new Date(s.createdAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
                      <span className="block text-xs text-ink-4">{relativeTime(s.createdAt)}</span>
                    </span>
                  ),
                },
                { label: 'Verification', value: <Pill tone={verificationTone} dot>{verificationLabel}</Pill> },
                {
                  label: 'Team',
                  value: `${s.members.length} ${s.members.length === 1 ? 'member' : 'members'} with access`,
                },
              ]}
            />
          </Panel>

          <section className="vyro-surface overflow-hidden">
            <div className="px-5 pt-5 sm:px-6">
              <h2 className="text-[0.9375rem] font-semibold tracking-[-0.01em] text-ink">Account controls</h2>
              <p className="mt-0.5 text-xs leading-relaxed text-ink-4">
                {isFrozen
                  ? 'Restore trading so the hub can publish offers and accept purchase orders again.'
                  : 'Suspends the supplier account and holds trading until an admin unfreezes it. The action is logged to the audit trail.'}
              </p>
            </div>
            <div className="px-5 pb-5 pt-4 sm:px-6">
              <Button
                variant={isFrozen ? 'success' : 'secondary'}
                size="sm"
                className={cn('w-full justify-center', !isFrozen && 'text-rose hover:bg-rose/10')}
                onClick={() => setFreezeOpen(true)}
                loading={toggleFreeze.isPending}
              >
                {isFrozen ? 'Unfreeze supplier hub' : 'Freeze supplier hub'}
              </Button>
            </div>
          </section>
        </aside>
      </div>

      <TableCard
        title={
          <span className="inline-flex items-center gap-2">
            <UsersIcon size={15} className="text-ink-3" />
            Authorized personnel &amp; operators
          </span>
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
                <th>Member</th>
                <th>Role</th>
                <th>User ID</th>
              </tr>
            </thead>
            <tbody>
              {s.members.map((m) => (
                <tr key={m.userId}>
                  <td>
                    <div className="flex items-center gap-3">
                      <Monogram name={m.email ?? '?'} seed={m.userId} size="sm" />
                      {m.email ? (
                        <a
                          href={`mailto:${m.email}`}
                          className="truncate text-[13px] font-medium text-ink transition-colors hover:text-copper-deep"
                        >
                          {m.email}
                        </a>
                      ) : (
                        <span className="text-ink-4">No email on file</span>
                      )}
                    </div>
                  </td>
                  <td>
                    <Pill tone={m.role === 'owner' ? 'dark' : 'neutral'} className="capitalize">
                      {m.role}
                    </Pill>
                  </td>
                  <td>
                    <CopyId id={m.userId} label="" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </TableCard>

      <FreezeDialog
        open={freezeOpen}
        frozen={isFrozen}
        name={s.name}
        pending={toggleFreeze.isPending}
        onCancel={() => setFreezeOpen(false)}
        onConfirm={() => toggleFreeze.mutate(undefined, { onSettled: () => setFreezeOpen(false) })}
      />
    </AdminPage>
  );
}

const KYB_STEPS = ['Application submitted', 'Compliance review', 'Decision'] as const;

function KybStepper({ status }: { status: VerificationStatus }) {
  // Index of the step currently in focus; every earlier step is complete.
  const current = status === 'pending' ? 1 : 2;
  const decision =
    status === 'verified'
      ? { label: 'Approved', cls: 'bg-mint text-paper', text: 'text-mint', icon: <CheckIcon size={13} /> }
      : status === 'rejected'
        ? { label: 'Rejected', cls: 'bg-rose text-paper', text: 'text-rose', icon: <XIcon size={13} /> }
        : status === 'suspended'
          ? { label: 'Suspended', cls: 'bg-ink text-paper', text: 'text-ink', icon: <AlertCircleIcon size={13} /> }
          : null;

  return (
    <ol className="grid gap-4 sm:grid-cols-3 sm:gap-0">
      {KYB_STEPS.map((label, i) => {
        const done = i < current || (i === 2 && decision);
        const active = i === current && !done;
        const isDecision = i === 2 && decision;
        return (
          <li key={label} className="relative flex items-center gap-3 sm:flex-col sm:items-start sm:gap-3 sm:pr-6">
            {i < KYB_STEPS.length - 1 ? (
              <span
                className={cn(
                  'absolute left-8 right-0 top-[13px] hidden h-px sm:block',
                  i < current ? 'bg-ink/40' : 'bg-ink/10',
                )}
                aria-hidden
              />
            ) : null}
            <span
              className={cn(
                'relative z-[1] flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ring-4 ring-paper',
                isDecision
                  ? decision.cls
                  : done
                    ? 'bg-ink text-volt'
                    : active
                      ? 'bg-amber text-paper shadow-[0_0_0_6px_rgba(196,132,58,0.18)]'
                      : 'bg-bone text-ink-4 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.12)]',
              )}
            >
              {isDecision ? decision.icon : done ? <CheckIcon size={13} /> : active ? <ClockIcon size={13} /> : i + 1}
            </span>
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-ink">{label}</div>
              <div className={cn('mt-0.5 text-xs', isDecision ? decision.text : active ? 'text-[#a86c28]' : 'text-ink-4')}>
                {isDecision ? decision.label : done ? 'Complete' : active ? 'Awaiting admin decision' : 'Not started'}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function FreezeDialog({
  open,
  frozen,
  name,
  pending,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  frozen: boolean;
  name: string;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const titleId = useId();
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4 backdrop-blur-sm animate-fade-in"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="vyro-floating w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <span
          className={cn(
            'flex size-11 items-center justify-center rounded-2xl',
            frozen ? 'bg-mint/[0.12] text-mint' : 'bg-rose/[0.1] text-rose',
          )}
        >
          {frozen ? <CheckCircleIcon size={20} /> : <AlertCircleIcon size={20} />}
        </span>
        <h3 id={titleId} className="mt-4 font-sans text-lg font-semibold tracking-normal text-ink">
          {frozen ? `Unfreeze ${name}?` : `Freeze ${name}?`}
        </h3>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-3">
          {frozen
            ? 'The supplier account returns to active and can trade again. This is recorded in the audit trail.'
            : 'The supplier account will be suspended and trading held until you unfreeze it. This is recorded in the audit trail.'}
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant={frozen ? 'success' : 'danger'} size="sm" loading={pending} onClick={onConfirm}>
            {frozen ? 'Unfreeze hub' : 'Freeze hub'}
          </Button>
        </div>
      </div>
    </div>
  );
}
