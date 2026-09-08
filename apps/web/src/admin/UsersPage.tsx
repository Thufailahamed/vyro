import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { PageHeader } from '@/components/ui';
import { useToast } from '@vyro/ui';
import { useAdminTable } from '@/lib/useAdminTable';
import {
  UsersIcon,
  SearchIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  ShieldCheckIcon,
} from '@/components/icons';

type User = {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  isAdmin: boolean;
  status: 'active' | 'suspended';
  membershipsCount: number;
  createdAt: number;
};

export function UsersPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const table = useAdminTable<User>({
    endpoint: '/admin/users',
    queryKey: ['admin-users'],
    rowKey: 'items',
  });

  const suspend = useMutation({
    mutationFn: (id: string) => api.post(`/admin/users/${id}/suspend`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin-users'] });
      toast.success('User suspended');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Action failed'),
  });

  const unsuspend = useMutation({
    mutationFn: (id: string) => api.post(`/admin/users/${id}/unsuspend`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin-users'] });
      toast.success('User account restored');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Action failed'),
  });

  const list = table.rows;
  const adminCount = list.filter((u) => u.isAdmin).length;
  const activeCount = list.filter((u) => u.status !== 'suspended').length;
  const suspendedCount = list.filter((u) => u.status === 'suspended').length;

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Executive Page Header */}
      <PageHeader
        kicker={
          <div className="flex flex-wrap items-center gap-2">
            <span className="vyro-kicker text-volt">Access Control</span>
            <span className="text-ink-4">/</span>
            <span className="text-[11px] font-mono text-ink-3">Identity Registry</span>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-volt/15 border border-volt/30 text-[10px] font-mono font-bold text-ink uppercase tracking-wider">
              <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Auth Directory
            </span>
          </div>
        }
        title="Users &amp; Personnel"
        sub="Manage system identities, administrator access credentials, security suspensions, and linked organization memberships."
        actions={
          <span className="inline-flex items-center gap-1.5 h-8 px-3.5 text-xs font-mono font-bold bg-paper border border-ink/15 text-ink shadow-sm">
            <UsersIcon size={14} className="text-volt-deep" />
            <span>{list.length} Identities Loaded{table.hasMore ? '+' : ''}</span>
          </span>
        }
      />

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 bg-paper border border-ink/15 shadow-sm space-y-1">
          <div className="text-[10px] font-mono uppercase tracking-wider text-ink-4 font-bold">
            Total Loaded Users
          </div>
          <div className="vyro-metric text-3xl font-bold text-ink">{list.length}</div>
          <div className="text-[10px] text-ink-4">In current query scope</div>
        </div>

        <div className="p-4 bg-paper border border-ink/15 shadow-sm space-y-1">
          <div className="text-[10px] font-mono uppercase tracking-wider text-ink-4 font-bold">
            Active Accounts
          </div>
          <div className="vyro-metric text-3xl font-bold text-mint flex items-center gap-2">
            <span>{activeCount}</span>
            <span className="size-2 rounded-full bg-mint" />
          </div>
          <div className="text-[10px] text-ink-4">Normal operating state</div>
        </div>

        <div className="p-4 bg-paper border border-ink/15 shadow-sm space-y-1">
          <div className="text-[10px] font-mono uppercase tracking-wider text-ink-4 font-bold">
            Suspended Accounts
          </div>
          <div className="vyro-metric text-3xl font-bold text-rose">{suspendedCount}</div>
          <div className="text-[10px] text-ink-4">Held by trust &amp; safety</div>
        </div>

        <div className="p-4 bg-paper border border-ink/15 shadow-sm space-y-1">
          <div className="text-[10px] font-mono uppercase tracking-wider text-ink-4 font-bold">
            System Administrators
          </div>
          <div className="vyro-metric text-3xl font-bold text-volt-deep">{adminCount}</div>
          <div className="text-[10px] text-ink-4">Elevated control privileges</div>
        </div>
      </div>

      {/* Search Input Bar */}
      <div className="max-w-md relative">
        <SearchIcon size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-4" />
        <input
          type="text"
          placeholder="Search by user email, display name, phone…"
          value={table.searchInput}
          onChange={(e) => table.setSearchInput(e.target.value)}
          className="w-full h-10 pl-10 pr-3 text-sm bg-paper placeholder:text-ink-4 focus:outline-none border border-ink/15 focus:border-ink shadow-sm"
        />
      </div>

      {/* Users Ledger Table */}
      <div className="bg-paper border border-ink/15 overflow-hidden shadow-sm">
        {list.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <UsersIcon size={28} className="mx-auto text-ink-4" />
            <div className="vyro-display text-lg font-bold text-ink">No users found</div>
            <p className="text-xs text-ink-4">No accounts match the current filter query.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-ink/15 bg-bone/70 text-[10px] font-mono uppercase tracking-wider text-ink-3">
                  <th className="py-3 px-4">User Name</th>
                  <th className="py-3 px-4">Direct Email</th>
                  <th className="py-3 px-4">Role / Access</th>
                  <th className="py-3 px-4 text-center">Orgs</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Moderation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/10">
                {list.map((u) => (
                  <tr key={u.id} className="hover:bg-bone/40 transition-colors">
                    <td className="py-3.5 px-4 font-semibold text-ink">
                      <div>{u.name || 'Unnamed Identity'}</div>
                      <div className="text-[10px] font-mono text-ink-4 mt-0.5">
                        ID: {u.id.slice(0, 14)}…
                      </div>
                    </td>

                    <td className="py-3.5 px-4 font-mono text-xs text-ink-2">
                      <a href={`mailto:${u.email}`} className="hover:text-copper transition-colors">
                        {u.email}
                      </a>
                    </td>

                    <td className="py-3.5 px-4">
                      {u.isAdmin ? (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-volt/20 border border-volt/35 text-[10px] font-mono font-bold text-ink uppercase tracking-wider">
                          <ShieldCheckIcon size={11} className="text-ink" />
                          <span>Admin</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 bg-mist border border-line text-[10px] font-mono font-semibold text-ink-3 uppercase tracking-wider">
                          Standard
                        </span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-center font-mono text-xs font-semibold text-ink">
                      {u.membershipsCount}
                    </td>

                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-mono font-semibold uppercase tracking-wider ${
                          u.status === 'suspended'
                            ? 'bg-rose/15 text-rose border border-rose/30'
                            : 'bg-mint/15 text-mint border border-mint/30'
                        }`}
                      >
                        <span
                          className={`size-1.5 rounded-full ${
                            u.status === 'suspended' ? 'bg-rose' : 'bg-mint'
                          }`}
                        />
                        {u.status === 'suspended' ? 'Suspended' : 'Active'}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      {u.status === 'suspended' ? (
                        <button
                          type="button"
                          onClick={() => unsuspend.mutate(u.id)}
                          disabled={unsuspend.isPending}
                          className="px-3 py-1 text-xs font-mono font-bold uppercase tracking-wider bg-paper border border-ink/20 hover:border-ink text-ink transition-colors"
                        >
                          {unsuspend.isPending ? 'Restoring…' : 'Restore'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => suspend.mutate(u.id)}
                          disabled={suspend.isPending || u.isAdmin}
                          title={u.isAdmin ? 'Admin accounts cannot be suspended directly' : undefined}
                          className="px-3 py-1 text-xs font-mono font-bold uppercase tracking-wider bg-paper border border-rose/30 hover:bg-rose hover:text-paper text-rose disabled:opacity-30 disabled:pointer-events-none transition-all"
                        >
                          {suspend.isPending ? 'Suspending…' : 'Suspend'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {table.hasMore && (
          <div className="border-t border-ink/10 p-4 text-center bg-bone/30">
            <button
              type="button"
              onClick={table.loadMore}
              disabled={table.fetchingMore}
              className="text-xs font-mono font-bold uppercase tracking-wider text-ink hover:text-copper disabled:opacity-50 px-4 py-2 border border-ink/15 hover:border-ink bg-paper transition-all"
            >
              {table.fetchingMore ? 'Loading More Users…' : 'Load Next Page ↓'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
