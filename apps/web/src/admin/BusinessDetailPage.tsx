import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/ui';
import { formatLKR } from '@/lib/format';
import { BusinessSuspendButton } from './BusinessSuspendButton';
import {
  Building2Icon,
  AlertCircleIcon,
  FileTextIcon,
} from './icons';
import {
  CheckCircleIcon,
  ArrowRightIcon,
  ArrowLeftIcon,
  ShoppingCartIcon,
  UserIcon,
} from '@/components/icons';

type Detail = {
  id: string;
  name: string;
  status: string;
  createdAt: number;
  members: Array<{ userId: string; role: string; email: string | null }>;
  orderCount: number;
  recentOrders: Array<{ id: string; status: string; totalCents: number; createdAt: number }>;
};

export function BusinessDetailPage() {
  const { id = '' } = useParams();
  const detail = useQuery({
    queryKey: ['admin-business', id],
    queryFn: () => api.get<{ business: Detail }>(`/admin/businesses/${id}`),
    retry: false,
  });

  if (detail.isError) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <Link
          to="/admin/businesses"
          className="inline-flex items-center gap-1.5 text-xs font-mono text-ink-4 hover:text-copper transition-colors"
        >
          <ArrowLeftIcon size={14} /> Back to Commercial Businesses
        </Link>
        <div className="p-10 bg-paper border border-ink/15 text-center space-y-3">
          <AlertCircleIcon size={32} className="mx-auto text-rose" />
          <h2 className="vyro-display text-2xl font-bold text-ink">Business account not found</h2>
          <p className="text-xs text-ink-4">
            Could not find an active commercial purchasing account with ID{' '}
            <code className="font-mono text-ink">{id}</code>.
          </p>
          <div className="pt-2">
            <Link
              to="/admin/businesses"
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
        <div className="grid sm:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-paper border border-ink/10 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const b = detail.data.business;
  const isSuspended = b.status === 'suspended';

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Breadcrumbs & Navigation */}
      <div className="flex items-center justify-between">
        <Link
          to="/admin/businesses"
          className="inline-flex items-center gap-1.5 text-xs font-mono font-medium text-ink-4 hover:text-copper transition-colors"
        >
          <ArrowLeftIcon size={13} />
          <span>Back to Businesses Registry</span>
        </Link>
        <span className="text-[10px] font-mono text-ink-4">ID: {b.id}</span>
      </div>

      {/* Executive Page Header */}
      <PageHeader
        kicker={
          <div className="flex flex-wrap items-center gap-2">
            <span className="vyro-kicker text-copper">Registry</span>
            <span className="text-ink-4">/</span>
            <span className="text-[11px] font-mono text-ink-3">Commercial Buyer</span>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-volt/15 border border-volt/30 text-[10px] font-mono font-bold text-ink uppercase tracking-wider">
              <Building2Icon size={12} className="text-copper" />
              Wholesale Client
            </span>
          </div>
        }
        title={b.name}
        sub="Commercial wholesale buyer entity authorized to issue institutional purchase orders and negotiate supplier pricing terms."
        actions={<BusinessSuspendButton businessId={b.id} status={b.status} />}
      />

      {/* KPI Status Ribbon */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Operating Status */}
        <div className="p-4 bg-paper border border-ink/15 shadow-sm space-y-1">
          <div className="text-[10px] font-mono uppercase tracking-wider text-ink-4 font-bold">
            Account Status
          </div>
          <div className="flex items-center gap-2 pt-1">
            <span
              className={`size-2.5 rounded-full ${isSuspended ? 'bg-rose animate-ping' : 'bg-emerald-500'}`}
            />
            <span
              className={`vyro-display text-lg font-bold uppercase ${
                isSuspended ? 'text-rose' : 'text-mint'
              }`}
            >
              {isSuspended ? 'Suspended' : 'Active Account'}
            </span>
          </div>
          <div className="text-[10px] text-ink-4">
            {isSuspended ? 'PO placement paused by administrator' : 'Authorized for checkout & invoicing'}
          </div>
        </div>

        {/* Total Active Orders */}
        <div className="p-4 bg-paper border border-ink/15 shadow-sm space-y-1">
          <div className="text-[10px] font-mono uppercase tracking-wider text-ink-4 font-bold flex items-center justify-between">
            <span>Lifetime PO Volume</span>
            <ShoppingCartIcon size={13} className="text-ink-4" />
          </div>
          <div className="vyro-metric text-3xl font-bold text-ink">{b.orderCount}</div>
          <div className="text-[10px] text-ink-4">Active &amp; completed purchase orders</div>
        </div>

        {/* Authorized Team Members */}
        <div className="p-4 bg-paper border border-ink/15 shadow-sm space-y-1">
          <div className="text-[10px] font-mono uppercase tracking-wider text-ink-4 font-bold flex items-center justify-between">
            <span>Procurement Team</span>
            <UserIcon size={13} className="text-ink-4" />
          </div>
          <div className="vyro-metric text-3xl font-bold text-copper-deep">
            {b.members.length} Users
          </div>
          <div className="text-[10px] text-ink-4">Linked purchasing agents &amp; admins</div>
        </div>
      </div>

      {/* Authorized Organization Members */}
      <div className="bg-paper border border-ink/15 shadow-sm overflow-hidden">
        <div className="p-4 sm:px-6 border-b border-ink/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserIcon size={16} className="text-copper" />
            <h2 className="vyro-display text-lg font-bold text-ink">
              Procurement Personnel &amp; Roles ({b.members.length})
            </h2>
          </div>
          <span className="text-[10px] font-mono text-ink-4 uppercase tracking-wider">
            RBAC Access Ledger
          </span>
        </div>

        {b.members.length === 0 ? (
          <div className="p-8 text-center text-xs text-ink-4">
            No authorized members on file for this business account.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-ink/10 bg-bone/60 text-[10px] font-mono uppercase tracking-wider text-ink-3">
                  <th className="py-2.5 px-4 sm:px-6">Member Email</th>
                  <th className="py-2.5 px-4 sm:px-6">Assigned Role</th>
                  <th className="py-2.5 px-4 sm:px-6">Account ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/10">
                {b.members.map((m) => (
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

      {/* Recent Orders Ledger */}
      <div className="bg-paper border border-ink/15 shadow-sm overflow-hidden">
        <div className="p-4 sm:px-6 border-b border-ink/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileTextIcon size={16} className="text-volt-deep" />
            <h2 className="vyro-display text-lg font-bold text-ink">
              Recent Purchase Orders (Last {b.recentOrders.length})
            </h2>
          </div>
          <span className="text-[10px] font-mono text-ink-4 uppercase tracking-wider">
            Transactional Audit
          </span>
        </div>

        {b.recentOrders.length === 0 ? (
          <div className="p-8 text-center text-xs text-ink-4">
            No purchase orders have been submitted by this business yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-ink/10 bg-bone/60 text-[10px] font-mono uppercase tracking-wider text-ink-3">
                  <th className="py-2.5 px-4 sm:px-6">PO Reference</th>
                  <th className="py-2.5 px-4 sm:px-6">Fulfillment Status</th>
                  <th className="py-2.5 px-4 sm:px-6 text-right">Gross Total (LKR)</th>
                  <th className="py-2.5 px-4 sm:px-6 text-right">Created Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/10">
                {b.recentOrders.map((o) => (
                  <tr key={o.id} className="hover:bg-bone/40 transition-colors">
                    <td className="py-3 px-4 sm:px-6 font-mono text-xs font-semibold text-ink">
                      {o.id.slice(0, 16)}…
                    </td>
                    <td className="py-3 px-4 sm:px-6">
                      <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider bg-mist text-ink border border-line">
                        {o.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 sm:px-6 text-right font-mono text-xs font-semibold text-ink num-tabular">
                      {formatLKR(o.totalCents)}
                    </td>
                    <td className="py-3 px-4 sm:px-6 text-right text-xs text-ink-4 num-tabular">
                      {new Date(o.createdAt).toLocaleString('en-US', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Footer Metadata */}
      <div className="p-5 bg-bone/50 border border-ink/10 text-xs text-ink-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-0.5">
          <div>
            Account initialized on{' '}
            <span className="font-mono text-ink font-semibold">
              {new Date(b.createdAt).toLocaleString('en-US', {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </span>
          </div>
          <div className="text-[10px]">
            Commercial entity ID: <span className="font-mono text-ink-3">{b.id}</span>
          </div>
        </div>
        <Link
          to="/admin/businesses"
          className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-copper hover:text-ink transition-colors self-start sm:self-auto"
        >
          <span>View All Registered Businesses</span>
          <ArrowRightIcon size={12} />
        </Link>
      </div>
    </div>
  );
}
