import { useMemo, useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { Button, ErrorBanner, Surface, EmptyState } from '@/components/ui';
import { usePermission } from './lib/permissions';
import { useAdminAuth } from './Shell';
import { RoleBadge } from './RoleBadge';
import { InviteAdminDialog } from './InviteAdminDialog';
import { AdminRoleSelect } from './AdminRoleSelect';
import { ADMIN_ROLES, ROLE_META, type AdminRole } from './lib/roles';
import { isAdminRole } from '@vyro/auth';
import { api } from '@/lib/api';
import {
  ShieldCheckIcon,
  UsersIcon,
  UserCheckIcon,
  AlertTriangleIcon,
  SearchIcon,
  XIcon,
  PlusIcon,
  MailIcon,
  CheckCircleIcon,
  ClockIcon,
  LayersIcon,
  ArrowRightIcon,
  ExternalLinkIcon,
  RefreshCwIcon,
} from '@/components/icons';

interface AdminUser {
  id: string;
  email: string;
  name?: string;
  phone?: string | null;
  adminRole: AdminRole | null;
  status?: 'active' | 'suspended';
  lastActivityAt: number | null;
  createdAt?: number;
}

interface Invite {
  id: string;
  email: string;
  role: AdminRole;
  expiresAt: number;
  acceptedAt: number | null;
  revokedAt?: number | null;
  createdAt?: number;
}

type Tab = 'admins' | 'invites' | 'matrix' | 'promote';

function formatActivityTime(ts: number | null | undefined): string {
  if (!ts) return 'No activity recorded';
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'Just now';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  return new Date(ts).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getInitials(name?: string, email?: string): string {
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/);
    const first = parts[0];
    const second = parts[1];
    if (first && second && first[0] && second[0]) {
      return (first[0] + second[0]).toUpperCase();
    }
    if (first && first[0]) {
      return first[0].toUpperCase();
    }
  }
  if (email) {
    return email.slice(0, 2).toUpperCase();
  }
  return 'AD';
}

export function RolesPage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab | null) ?? 'admins';

  const switchTab = (next: Tab) => {
    const p = new URLSearchParams(params);
    p.set('tab', next);
    setParams(p);
  };

  const canInvite = usePermission('admin:invite');
  const canChange = usePermission('admin:role_change');
  const { user: currentAdmin } = useAdminAuth();
  const qc = useQueryClient();

  const [inviteOpen, setInviteOpen] = useState(false);
  const [demoteTarget, setDemoteTarget] = useState<AdminUser | null>(null);
  const [promoteTarget, setPromoteTarget] = useState<AdminUser | null>(null);
  const [promoteRole, setPromoteRole] = useState<AdminRole>('ops');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');

  // Query admin users
  const adminUsersQuery = useQuery({
    queryKey: ['admin-users', 'admins-only'],
    queryFn: async () => {
      const r = await api.get<{ items: AdminUser[] }>('/admin/users?isAdmin=true');
      return r.items;
    },
  });

  // Query all users for promote directory
  const allUsersQuery = useQuery({
    queryKey: ['admin-users', 'all'],
    queryFn: async () => {
      const r = await api.get<{ items: AdminUser[] }>('/admin/users');
      return r.items;
    },
    enabled: tab === 'promote',
  });

  // Query invites
  const invites = useQuery({
    queryKey: ['admin-invites'],
    queryFn: async () => {
      const r = await api.get<{ invites: Invite[] }>('/admin/invites');
      return r.invites;
    },
    enabled: canInvite,
  });

  // Role mutation (promote, change, demote)
  const change = useMutation({
    mutationFn: async (vars: { id: string; role: AdminRole | null }) => {
      if (vars.role) {
        await api.patch(`/admin/users/${vars.id}/role`, { role: vars.role });
      } else {
        await api.del(`/admin/users/${vars.id}/role`);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] });
      setDemoteTarget(null);
      setPromoteTarget(null);
    },
  });

  // Revoke invite mutation
  const revokeInvite = useMutation({
    mutationFn: async (id: string) => {
      await api.del(`/admin/invites/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-invites'] }),
  });

  // Filter only true administrators (users with an adminRole)
  const activeAdmins = useMemo(() => {
    const list = adminUsersQuery.data ?? [];
    return list.filter((u) => u.adminRole && isAdminRole(u.adminRole));
  }, [adminUsersQuery.data]);

  // Non-admin platform users for promotion directory
  const nonAdminUsers = useMemo(() => {
    const list = allUsersQuery.data ?? [];
    return list.filter((u) => !u.adminRole);
  }, [allUsersQuery.data]);

  // Filtered active admins based on search & role filter
  const filteredAdmins = useMemo(() => {
    const q = search.trim().toLowerCase();
    return activeAdmins.filter((u) => {
      const matchQuery =
        !q ||
        u.email.toLowerCase().includes(q) ||
        (u.name && u.name.toLowerCase().includes(q)) ||
        (u.adminRole && u.adminRole.toLowerCase().includes(q));

      const matchRole = roleFilter === 'all' || u.adminRole === roleFilter;
      return matchQuery && matchRole;
    });
  }, [activeAdmins, search, roleFilter]);

  // Filtered non-admin users for promotion tab
  const filteredNonAdmins = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return nonAdminUsers.slice(0, 25);
    return nonAdminUsers.filter(
      (u) =>
        u.email.toLowerCase().includes(q) ||
        (u.name && u.name.toLowerCase().includes(q)),
    );
  }, [nonAdminUsers, search]);

  const activeInvites = useMemo(() => {
    const list = invites.data ?? [];
    const now = Date.now();
    return list.filter((i) => !i.acceptedAt && !i.revokedAt && i.expiresAt > now);
  }, [invites.data]);

  const superAdminsCount = activeAdmins.filter((u) => u.adminRole === 'super_admin').length;
  const opsCount = activeAdmins.filter((u) => u.adminRole === 'ops').length;
  const financeCount = activeAdmins.filter((u) => u.adminRole === 'finance').length;
  const supportCount = activeAdmins.filter((u) => u.adminRole === 'support').length;

  const errMsg = adminUsersQuery.error instanceof Error ? adminUsersQuery.error.message : null;
  const changeErr = change.error instanceof Error ? change.error.message : null;
  const revokeErr = revokeInvite.error instanceof Error ? revokeInvite.error.message : null;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-ink/10 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-ink/60 mb-1">
            <span>Governance & Access</span>
            <span>/</span>
            <span className="text-copper font-bold">Role-Based Access Control</span>
          </div>
          <h1 className="vyro-display text-3xl md:text-4xl text-ink tracking-tight">Roles & Invites</h1>
          <p className="text-sm text-ink-500 mt-1 max-w-2xl">
            Manage platform administrator tiers, delegate functional privileges, and invite verified team members.
          </p>
        </div>

        <div className="flex items-center flex-wrap gap-2">
          {canInvite && (
            <Button
              variant="primary"
              onClick={() => setInviteOpen(true)}
              icon={<PlusIcon size={14} />}
              className="text-xs h-9 px-3.5"
            >
              Invite Administrator
            </Button>
          )}
          <Link
            to="/admin/users"
            className="vyro-btn vyro-btn-secondary text-xs h-9 px-3 gap-1.5 flex items-center font-medium"
          >
            All Users Directory
            <ExternalLinkIcon size={13} />
          </Link>
          <Link
            to="/admin/audit"
            className="vyro-btn vyro-btn-secondary text-xs h-9 px-3 gap-1.5 flex items-center font-medium"
          >
            Audit Trail
            <ArrowRightIcon size={13} />
          </Link>
        </div>
      </header>

      {/* KPI Cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Admins */}
        <Surface className="p-4 relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono uppercase tracking-wider text-ink-500 font-semibold">
              Active Administrators
            </span>
            <div className="p-2 rounded-md bg-sand/30 text-ink">
              <ShieldCheckIcon size={18} />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold font-mono text-ink tracking-tight">
              {activeAdmins.length}
            </div>
            <div className="flex items-center gap-2 mt-1 text-xs text-ink-500">
              <span className="font-semibold text-mint">• Platform Staff</span>
              <span>Across 4 tiers</span>
            </div>
          </div>
        </Surface>

        {/* Super Admins */}
        <Surface className="p-4 relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono uppercase tracking-wider text-ink-500 font-semibold">
              Super Admins
            </span>
            <div className="p-2 rounded-md bg-rose/10 text-rose">
              <UserCheckIcon size={18} />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold font-mono text-ink tracking-tight">
              {superAdminsCount}
            </div>
            <div className="flex items-center gap-2 mt-1 text-xs text-ink-500">
              <span className="font-semibold text-rose">• Root Access</span>
              <span>Full governance</span>
            </div>
          </div>
        </Surface>

        {/* Operational Staff */}
        <Surface className="p-4 relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono uppercase tracking-wider text-ink-500 font-semibold">
              Operational Staff
            </span>
            <div className="p-2 rounded-md bg-amber/10 text-amber">
              <UsersIcon size={18} />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold font-mono text-ink tracking-tight">
              {opsCount + financeCount + supportCount}
            </div>
            <div className="flex items-center gap-2 mt-1 text-xs text-ink-500">
              <span>{opsCount} Ops</span>
              <span>•</span>
              <span>{financeCount} Finance</span>
              <span>•</span>
              <span>{supportCount} Support</span>
            </div>
          </div>
        </Surface>

        {/* Pending Invites */}
        <Surface className="p-4 relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono uppercase tracking-wider text-ink-500 font-semibold">
              Pending Invitations
            </span>
            <div className={`p-2 rounded-md ${activeInvites.length > 0 ? 'bg-amber/10 text-amber' : 'bg-sand/30 text-ink'}`}>
              <MailIcon size={18} />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold font-mono text-ink tracking-tight">
              {activeInvites.length}
            </div>
            <div className="flex items-center gap-2 mt-1 text-xs text-ink-500">
              {activeInvites.length > 0 ? (
                <span className="font-semibold text-amber">• Awaiting onboarding</span>
              ) : (
                <span className="font-semibold text-mint">• All onboarded</span>
              )}
            </div>
          </div>
        </Surface>
      </section>

      {/* Modern High-Contrast Navigation Tabs */}
      <nav className="flex items-center gap-1 border-b border-ink/15 overflow-x-auto pt-2">
        <TabButton
          active={tab === 'admins'}
          onClick={() => switchTab('admins')}
          icon={<ShieldCheckIcon size={15} />}
          badge={activeAdmins.length}
        >
          Active Administrators
        </TabButton>
        <TabButton
          active={tab === 'invites'}
          onClick={() => switchTab('invites')}
          icon={<MailIcon size={15} />}
          badge={activeInvites.length > 0 ? activeInvites.length : undefined}
          badgeColor="danger"
        >
          Pending Invitations
        </TabButton>
        <TabButton
          active={tab === 'matrix'}
          onClick={() => switchTab('matrix')}
          icon={<LayersIcon size={15} />}
        >
          Permissions Matrix
        </TabButton>
        <TabButton
          active={tab === 'promote'}
          onClick={() => switchTab('promote')}
          icon={<UsersIcon size={15} />}
        >
          Promote Existing User
        </TabButton>
      </nav>

      {/* Error Banners */}
      {errMsg && <ErrorBanner message={errMsg} />}
      {changeErr && <ErrorBanner message={changeErr} />}
      {revokeErr && <ErrorBanner message={revokeErr} />}

      {/* =================================================================== */}
      {/* TAB 1: Active Administrators                                        */}
      {/* =================================================================== */}
      {tab === 'admins' && (
        <div className="space-y-4">
          {/* Filter Toolbar */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-paper p-3 rounded-lg border border-ink/10">
            <div className="relative flex-1 max-w-md">
              <SearchIcon
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-4 pointer-events-none"
              />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search administrators by name, email, or role…"
                className="w-full pl-9 pr-8 py-1.5 text-sm bg-paper border border-ink/20 rounded focus:border-ink focus:outline-none placeholder:text-ink-4 text-ink"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-4 hover:text-ink"
                >
                  <XIcon size={14} />
                </button>
              )}
            </div>

            {/* Role Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
              {[
                { id: 'all', label: 'All Roles' },
                { id: 'super_admin', label: 'Super Admin' },
                { id: 'ops', label: 'Ops' },
                { id: 'finance', label: 'Finance' },
                { id: 'support', label: 'Support' },
              ].map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setRoleFilter(r.id)}
                  className={`px-2.5 py-1 text-xs font-mono font-medium rounded transition whitespace-nowrap ${
                    roleFilter === r.id
                      ? 'bg-ink text-paper'
                      : 'bg-sand/30 text-ink hover:bg-sand/60'
                  }`}
                >
                  {r.label}
                </button>
              ))}
              <Button
                variant="secondary"
                size="sm"
                onClick={() => adminUsersQuery.refetch()}
                loading={adminUsersQuery.isFetching}
                icon={<RefreshCwIcon size={13} />}
                className="h-7 text-xs ml-1"
              >
                Refresh
              </Button>
            </div>
          </div>

          {/* Table */}
          {adminUsersQuery.isLoading ? (
            <Surface className="p-8 text-center space-y-3">
              <div className="animate-spin w-6 h-6 border-2 border-ink border-t-transparent rounded-full mx-auto" />
              <p className="text-sm text-ink-500 font-mono">Loading administrator directory…</p>
            </Surface>
          ) : filteredAdmins.length === 0 ? (
            <Surface className="p-8 text-center text-ink-500 space-y-3">
              <p className="text-sm">No administrators found matching your filter.</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearch('');
                  setRoleFilter('all');
                }}
              >
                Reset filters
              </Button>
            </Surface>
          ) : (
            <Surface className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead>
                    <tr className="bg-sand/20 border-b border-ink/10 text-xs font-mono uppercase tracking-wider text-ink-500">
                      <th className="py-3 px-4">Administrator</th>
                      <th className="py-3 px-4">Role & Tier</th>
                      <th className="py-3 px-4">Last Audit Activity</th>
                      <th className="py-3 px-4 text-right">Access Controls</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink/10">
                    {filteredAdmins.map((u) => {
                      const isSelf = Boolean(currentAdmin?.email && u.email === currentAdmin.email);
                      const role = (u.adminRole ?? 'ops') as AdminRole;

                      return (
                        <tr key={u.id} className="hover:bg-sand/10 transition">
                          {/* User Column */}
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-ink text-paper font-mono font-bold text-xs flex items-center justify-center shrink-0">
                                {getInitials(u.name, u.email)}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-ink truncate">
                                    {u.name || u.email.split('@')[0]}
                                  </span>
                                  {isSelf && (
                                    <span className="px-1.5 py-0.2 text-[10px] font-mono font-bold bg-copper/15 text-copper border border-copper/30 rounded">
                                      You
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs font-mono text-ink-500 truncate">
                                  {u.email}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Role Column */}
                          <td className="py-3 px-4">
                            <RoleBadge role={role} />
                          </td>

                          {/* Last Activity */}
                          <td className="py-3 px-4 text-xs text-ink-500 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <ClockIcon size={13} className="text-ink-4 shrink-0" />
                              <span>{formatActivityTime(u.lastActivityAt)}</span>
                            </div>
                          </td>

                          {/* Role Select & Actions */}
                          <td className="py-3 px-4 text-right">
                            {canChange ? (
                              <div className="flex items-center justify-end gap-2">
                                <AdminRoleSelect
                                  value={role}
                                  onChange={(newRole) => {
                                    if (newRole !== role) {
                                      change.mutate({ id: u.id, role: newRole });
                                    }
                                  }}
                                  allowedRoles={ADMIN_ROLES}
                                  disabled={change.isPending || (isSelf && role === 'super_admin')}
                                />
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={change.isPending || isSelf}
                                  title={isSelf ? 'Cannot demote your own account' : 'Revoke administrative privileges'}
                                  onClick={() => setDemoteTarget(u)}
                                  className="text-xs text-rose hover:bg-rose/10 h-7 px-2 border border-rose/20"
                                >
                                  Demote
                                </Button>
                              </div>
                            ) : (
                              <span className="text-xs text-ink-4 font-mono">View only</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Surface>
          )}
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 2: Pending Invitations                                          */}
      {/* =================================================================== */}
      {tab === 'invites' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-paper p-3 rounded-lg border border-ink/10">
            <div>
              <h2 className="text-sm font-bold text-ink">Administrative Invitations</h2>
              <p className="text-xs text-ink-500">Track sent invitations, expiration timelines, and revoke unaccepted tokens.</p>
            </div>
            {canInvite && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => setInviteOpen(true)}
                icon={<PlusIcon size={14} />}
                className="text-xs"
              >
                Send Invite
              </Button>
            )}
          </div>

          {invites.isLoading ? (
            <Surface className="p-8 text-center space-y-3">
              <div className="animate-spin w-6 h-6 border-2 border-ink border-t-transparent rounded-full mx-auto" />
              <p className="text-sm text-ink-500 font-mono">Checking pending invites…</p>
            </Surface>
          ) : (invites.data ?? []).length === 0 ? (
            <EmptyState
              icon={<MailIcon size={24} />}
              title="No Pending Invitations"
              description="There are currently no active administrative invitations pending onboarding."
              action={
                canInvite ? (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => setInviteOpen(true)}
                    icon={<PlusIcon size={14} />}
                    className="text-xs"
                  >
                    Invite an Administrator
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <Surface className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead>
                    <tr className="bg-sand/20 border-b border-ink/10 text-xs font-mono uppercase tracking-wider text-ink-500">
                      <th className="py-3 px-4">Recipient Email</th>
                      <th className="py-3 px-4">Assigned Role</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Timeline</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink/10">
                    {(invites.data ?? []).map((i) => {
                      const now = Date.now();
                      const isExpired = i.expiresAt <= now;
                      const isAccepted = !!i.acceptedAt;
                      const isRevoked = !!i.revokedAt;

                      let statusBadge = (
                        <span className="inline-flex items-center gap-1 text-xs font-mono font-medium text-amber">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber animate-pulse" />
                          Pending Acceptance
                        </span>
                      );
                      if (isAccepted) {
                        statusBadge = (
                          <span className="inline-flex items-center gap-1 text-xs font-mono font-medium text-mint">
                            <span className="w-1.5 h-1.5 rounded-full bg-mint" />
                            Accepted
                          </span>
                        );
                      } else if (isRevoked) {
                        statusBadge = (
                          <span className="inline-flex items-center gap-1 text-xs font-mono font-medium text-ink-4">
                            Revoked
                          </span>
                        );
                      } else if (isExpired) {
                        statusBadge = (
                          <span className="inline-flex items-center gap-1 text-xs font-mono font-medium text-rose">
                            Expired
                          </span>
                        );
                      }

                      return (
                        <tr key={i.id} className="hover:bg-sand/10 transition">
                          <td className="py-3 px-4 font-mono text-xs font-semibold text-ink">
                            {i.email}
                          </td>
                          <td className="py-3 px-4">
                            <RoleBadge role={i.role} />
                          </td>
                          <td className="py-3 px-4">
                            {statusBadge}
                          </td>
                          <td className="py-3 px-4 text-xs text-ink-500 whitespace-nowrap">
                            {isAccepted ? (
                              <span>Accepted {new Date(i.acceptedAt!).toLocaleDateString()}</span>
                            ) : (
                              <span>
                                {isExpired ? 'Expired' : 'Expires'}{' '}
                                {new Date(i.expiresAt).toLocaleDateString()}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right">
                            {!isAccepted && !isRevoked && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  if (window.confirm(`Revoke invitation for ${i.email}?`)) {
                                    revokeInvite.mutate(i.id);
                                  }
                                }}
                                loading={revokeInvite.isPending && revokeInvite.variables === i.id}
                                disabled={revokeInvite.isPending}
                                className="text-xs text-rose hover:bg-rose/10 h-7 px-2 border border-rose/20"
                              >
                                Revoke
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Surface>
          )}
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 3: Permissions Matrix                                           */}
      {/* =================================================================== */}
      {tab === 'matrix' && (
        <div className="space-y-6">
          {/* Role Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {ADMIN_ROLES.map((r) => {
              const meta = ROLE_META[r];
              return (
                <Surface key={r} className="p-4 space-y-2.5 flex flex-col justify-between">
                  <div>
                    <RoleBadge role={r} />
                    <h3 className="font-bold text-ink text-sm mt-2">{meta.label}</h3>
                    <p className="text-xs text-ink-500 mt-1 leading-relaxed">{meta.description}</p>
                  </div>
                  <div className="pt-2 border-t border-ink/10 text-[11px] font-mono text-ink-4">
                    Tier Scope: <span className="uppercase font-semibold text-ink">{r}</span>
                  </div>
                </Surface>
              );
            })}
          </div>

          {/* Detailed Matrix Table */}
          <Surface className="p-6 space-y-4">
            <h2 className="text-base font-bold text-ink">Administrative Capability Matrix</h2>
            <p className="text-xs text-ink-500">
              Detailed breakdown of RBAC authorization boundaries across platform operations.
            </p>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="bg-sand/20 border-b border-ink/10 font-mono uppercase text-ink-500">
                    <th className="py-2.5 px-3">System Permission Area</th>
                    <th className="py-2.5 px-3 text-center">Super Admin</th>
                    <th className="py-2.5 px-3 text-center">Operations</th>
                    <th className="py-2.5 px-3 text-center">Finance</th>
                    <th className="py-2.5 px-3 text-center">Support</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/10">
                  <tr>
                    <td className="py-2.5 px-3 font-semibold text-ink">Invite & Modify Admin Roles</td>
                    <td className="py-2.5 px-3 text-center text-mint font-bold">✓ Full</td>
                    <td className="py-2.5 px-3 text-center text-ink-4">—</td>
                    <td className="py-2.5 px-3 text-center text-ink-4">—</td>
                    <td className="py-2.5 px-3 text-center text-ink-4">—</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-semibold text-ink">User Suspend / Unsuspend</td>
                    <td className="py-2.5 px-3 text-center text-mint font-bold">✓ Full</td>
                    <td className="py-2.5 px-3 text-center text-mint font-bold">✓ Ops</td>
                    <td className="py-2.5 px-3 text-center text-ink-4">—</td>
                    <td className="py-2.5 px-3 text-center text-ink-4">—</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-semibold text-ink">Catalog & Supplier Moderation</td>
                    <td className="py-2.5 px-3 text-center text-mint font-bold">✓ Full</td>
                    <td className="py-2.5 px-3 text-center text-mint font-bold">✓ Full</td>
                    <td className="py-2.5 px-3 text-center text-ink-4">—</td>
                    <td className="py-2.5 px-3 text-center text-ink-500">Read only</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-semibold text-ink">Payouts & Disbursement Batches</td>
                    <td className="py-2.5 px-3 text-center text-mint font-bold">✓ Full</td>
                    <td className="py-2.5 px-3 text-center text-ink-4">—</td>
                    <td className="py-2.5 px-3 text-center text-mint font-bold">✓ Full</td>
                    <td className="py-2.5 px-3 text-center text-ink-4">—</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-semibold text-ink">Direct Refunds & Ledger Modifications</td>
                    <td className="py-2.5 px-3 text-center text-mint font-bold">✓ Full</td>
                    <td className="py-2.5 px-3 text-center text-ink-4">—</td>
                    <td className="py-2.5 px-3 text-center text-mint font-bold">✓ Full</td>
                    <td className="py-2.5 px-3 text-center text-ink-4">—</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-semibold text-ink">Dispute Mediation & Order Notes</td>
                    <td className="py-2.5 px-3 text-center text-mint font-bold">✓ Full</td>
                    <td className="py-2.5 px-3 text-center text-mint font-bold">✓ Full</td>
                    <td className="py-2.5 px-3 text-center text-mint font-bold">✓ Full</td>
                    <td className="py-2.5 px-3 text-center text-mint font-bold">✓ Full</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-semibold text-ink">Global Audit Trail Inspection & Export</td>
                    <td className="py-2.5 px-3 text-center text-mint font-bold">✓ Full</td>
                    <td className="py-2.5 px-3 text-center text-ink-4">—</td>
                    <td className="py-2.5 px-3 text-center text-mint font-bold">✓ Export</td>
                    <td className="py-2.5 px-3 text-center text-ink-4">—</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Surface>
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 4: Promote Existing User Directory                              */}
      {/* =================================================================== */}
      {tab === 'promote' && (
        <div className="space-y-4">
          <div className="bg-paper p-4 rounded-lg border border-ink/10 space-y-1">
            <h2 className="text-sm font-bold text-ink">Platform Users Directory</h2>
            <p className="text-xs text-ink-500">
              Promote existing verified platform accounts (e.g. suppliers, operators) to administrative personnel without creating duplicate credentials.
            </p>
          </div>

          <div className="relative max-w-md">
            <SearchIcon
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-4 pointer-events-none"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search user by name or email…"
              className="w-full pl-9 pr-8 py-1.5 text-sm bg-paper border border-ink/20 rounded focus:border-ink focus:outline-none placeholder:text-ink-4 text-ink"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-4 hover:text-ink"
              >
                <XIcon size={14} />
              </button>
            )}
          </div>

          {allUsersQuery.isLoading ? (
            <Surface className="p-8 text-center space-y-3">
              <div className="animate-spin w-6 h-6 border-2 border-ink border-t-transparent rounded-full mx-auto" />
              <p className="text-sm text-ink-500 font-mono">Loading user directory…</p>
            </Surface>
          ) : filteredNonAdmins.length === 0 ? (
            <Surface className="p-8 text-center text-ink-500">
              <p className="text-sm">No eligible non-admin users match your search.</p>
            </Surface>
          ) : (
            <Surface className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead>
                    <tr className="bg-sand/20 border-b border-ink/10 text-xs font-mono uppercase tracking-wider text-ink-500">
                      <th className="py-3 px-4">User</th>
                      <th className="py-3 px-4">Contact</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink/10">
                    {filteredNonAdmins.map((u) => (
                      <tr key={u.id} className="hover:bg-sand/10 transition">
                        <td className="py-3 px-4">
                          <div className="font-semibold text-ink">{u.name || 'User'}</div>
                          <div className="text-xs font-mono text-ink-500">{u.email}</div>
                        </td>
                        <td className="py-3 px-4 text-xs font-mono text-ink-500">
                          {u.phone || '—'}
                        </td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 text-xs font-mono bg-mint/15 text-mint border border-mint/30 rounded">
                            {u.status || 'Active'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          {canChange ? (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => {
                                setPromoteTarget(u);
                                setPromoteRole('ops');
                              }}
                              className="text-xs h-8 font-medium"
                              icon={<UserCheckIcon size={13} />}
                            >
                              Grant Admin Role
                            </Button>
                          ) : (
                            <span className="text-xs text-ink-4">No permission</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Surface>
          )}
        </div>
      )}

      {/* =================================================================== */}
      {/* MODALS & DIALOGS                                                    */}
      {/* =================================================================== */}

      {/* Invite Admin Modal */}
      {canInvite && inviteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-paper w-full max-w-md rounded-xl shadow-2xl border border-ink/20 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-ink/10 pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheckIcon size={18} className="text-copper" />
                <h3 className="font-bold text-ink text-base">Invite Platform Administrator</h3>
              </div>
              <button
                type="button"
                onClick={() => setInviteOpen(false)}
                className="text-ink-4 hover:text-ink p-1 rounded transition"
              >
                <XIcon size={16} />
              </button>
            </div>
            <InviteAdminDialog onClose={() => setInviteOpen(false)} />
          </div>
        </div>
      )}

      {/* Demote Confirmation Modal */}
      {demoteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-paper w-full max-w-md rounded-xl shadow-2xl border border-ink/20 p-6 space-y-4">
            <div className="flex items-center gap-2 text-rose">
              <AlertTriangleIcon size={20} />
              <h3 className="font-bold text-base">Revoke Administrator Role</h3>
            </div>

            <p className="text-xs text-ink-500 leading-relaxed">
              Are you sure you want to demote{' '}
              <strong className="text-ink font-mono">{demoteTarget.email}</strong>?
            </p>

            <div className="p-3 bg-rose/10 border border-rose/20 rounded-md text-xs text-rose space-y-1">
              <p className="font-semibold">Security Warning</p>
              <p>
                This will immediately remove their administrative role ({demoteTarget.adminRole})
                and revoke all administrative dashboard access.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDemoteTarget(null)}
                disabled={change.isPending}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                loading={change.isPending}
                onClick={() => change.mutate({ id: demoteTarget.id, role: null })}
              >
                Confirm Demote
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Promote User Modal */}
      {promoteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-paper w-full max-w-md rounded-xl shadow-2xl border border-ink/20 p-6 space-y-4">
            <div className="flex items-center gap-2 text-ink">
              <UserCheckIcon size={20} className="text-copper" />
              <h3 className="font-bold text-base">Grant Administrative Privileges</h3>
            </div>

            <div className="p-3 bg-sand/20 rounded-md text-xs space-y-1">
              <div>
                <span className="text-ink-500">User:</span>{' '}
                <strong className="text-ink">{promoteTarget.name || promoteTarget.email}</strong>
              </div>
              <div>
                <span className="text-ink-500">Email:</span>{' '}
                <strong className="text-ink font-mono">{promoteTarget.email}</strong>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink mb-1">
                Select Role to Grant
              </label>
              <AdminRoleSelect
                value={promoteRole}
                onChange={setPromoteRole}
                allowedRoles={ADMIN_ROLES}
                className="w-full text-sm py-2"
                disabled={change.isPending}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-ink/10">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPromoteTarget(null)}
                disabled={change.isPending}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                loading={change.isPending}
                onClick={() => change.mutate({ id: promoteTarget.id, role: promoteRole })}
              >
                Confirm Promotion
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  badge,
  badgeColor = 'default',
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
  badge?: number | undefined;
  badgeColor?: 'default' | 'danger' | undefined;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-3 text-sm font-medium transition flex items-center gap-2 border-b-2 -mb-px whitespace-nowrap ${
        active
          ? 'bg-sand/30 border-ink text-ink font-semibold shadow-sm'
          : 'border-transparent text-ink-500 hover:text-ink hover:bg-sand/10'
      }`}
    >
      {icon}
      <span>{children}</span>
      {badge !== undefined && (
        <span
          className={`px-1.5 py-0.5 text-xs font-mono font-bold rounded-full ${
            badgeColor === 'danger'
              ? 'bg-rose text-paper'
              : 'bg-ink/10 text-ink'
          }`}
        >
          {badge}
        </span>
      )}
    </button>
  );
}
