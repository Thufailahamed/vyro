import { useMemo, useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { cn } from '@vyro/ui';
import { Button, Label } from '@/components/ui';
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
  LayersIcon,
  ArrowRightIcon,
  ExternalLinkIcon,
  RefreshCwIcon,
} from '@/components/icons';
import {
  AdminPage,
  AdminPageHeader,
  Callout,
  Card,
  CellStack,
  DetailList,
  EmptyBlock,
  Pill,
  StatCard,
  StatGrid,
  TableCard,
  TableSkeleton,
  Tabs,
  Toolbar,
  controlClass,
} from './ui';

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

const linkBtnClass =
  'inline-flex h-10 items-center gap-2 rounded-lg bg-paper px-4 text-sm font-medium text-ink shadow-[inset_0_0_0_1px_rgba(12,14,11,0.16)] transition-colors hover:bg-ink hover:text-paper';

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

function Avatar({ name, email }: { name?: string | undefined; email?: string | undefined }) {
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ink font-mono text-xs font-bold text-paper">
      {getInitials(name, email)}
    </span>
  );
}

export function RolesPage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab | null) ?? 'admins';

  const switchTab = (next: string) => {
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

  const filtered = search.trim() !== '' || roleFilter !== 'all';
  const resetFilters = () => {
    setSearch('');
    setRoleFilter('all');
  };

  return (
    <AdminPage>
      <AdminPageHeader
        kicker={
          <>
            <span>Governance &amp; Access</span>
            <span className="text-ink-4">/</span>
            <span>Role-Based Access Control</span>
          </>
        }
        title="Roles & Invites"
        description="Manage platform administrator tiers, delegate functional privileges, and invite verified team members."
        actions={
          <>
            {canInvite ? (
              <Button variant="primary" size="sm" className="h-10" onClick={() => setInviteOpen(true)} icon={<PlusIcon size={14} />}>
                Invite administrator
              </Button>
            ) : null}
            <Link to="/admin/users" className={linkBtnClass}>
              All users directory
              <ExternalLinkIcon size={14} />
            </Link>
            <Link to="/admin/audit" className={linkBtnClass}>
              Audit trail
              <ArrowRightIcon size={14} />
            </Link>
          </>
        }
      />

      <StatGrid cols={4}>
        <StatCard
          label="Active administrators"
          value={activeAdmins.length}
          sub="Platform staff across 4 tiers"
          icon={<ShieldCheckIcon size={16} />}
          loading={adminUsersQuery.isLoading}
        />
        <StatCard
          label="Super admins"
          value={superAdminsCount}
          sub="Root access · full governance"
          icon={<UserCheckIcon size={16} />}
          tone={superAdminsCount > 0 ? 'neutral' : 'warning'}
          loading={adminUsersQuery.isLoading}
        />
        <StatCard
          label="Operational staff"
          value={opsCount + financeCount + supportCount}
          sub={`${opsCount} ops · ${financeCount} finance · ${supportCount} support`}
          icon={<UsersIcon size={16} />}
          loading={adminUsersQuery.isLoading}
        />
        <StatCard
          label="Pending invitations"
          value={activeInvites.length}
          sub={activeInvites.length > 0 ? 'Awaiting onboarding' : 'All onboarded'}
          icon={<MailIcon size={16} />}
          tone={activeInvites.length > 0 ? 'warning' : 'neutral'}
          loading={canInvite && invites.isLoading}
        />
      </StatGrid>

      <Tabs
        items={[
          { key: 'admins', label: 'Active administrators', icon: <ShieldCheckIcon size={15} />, count: activeAdmins.length },
          { key: 'invites', label: 'Pending invitations', icon: <MailIcon size={15} />, count: activeInvites.length > 0 ? activeInvites.length : undefined },
          { key: 'matrix', label: 'Permissions matrix', icon: <LayersIcon size={15} /> },
          { key: 'promote', label: 'Promote existing user', icon: <UsersIcon size={15} /> },
        ]}
        value={tab}
        onChange={switchTab}
        ariaLabel="Roles & invites sections"
      />

      {errMsg ? (
        <Callout
          tone="danger"
          title="Could not load administrators"
          action={
            <Button variant="secondary" size="sm" onClick={() => void adminUsersQuery.refetch()}>
              Retry
            </Button>
          }
        >
          {errMsg}
        </Callout>
      ) : null}
      {changeErr ? <Callout tone="danger" title="Role change failed">{changeErr}</Callout> : null}
      {revokeErr ? <Callout tone="danger" title="Invite revocation failed">{revokeErr}</Callout> : null}

      {/* TAB 1: Active Administrators */}
      {tab === 'admins' && (
        <TableCard
          title="Administrator directory"
          description="Every account currently holding a platform admin role."
          toolbar={
            <Toolbar
              actions={
                <>
                  <Tabs
                    items={[
                      { key: 'all', label: 'All roles' },
                      { key: 'super_admin', label: 'Super admin' },
                      { key: 'ops', label: 'Ops' },
                      { key: 'finance', label: 'Finance' },
                      { key: 'support', label: 'Support' },
                    ]}
                    value={roleFilter}
                    onChange={setRoleFilter}
                    ariaLabel="Filter by role"
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-10"
                    onClick={() => void adminUsersQuery.refetch()}
                    loading={adminUsersQuery.isFetching}
                    icon={<RefreshCwIcon size={14} />}
                  >
                    Refresh
                  </Button>
                </>
              }
            >
              <div className="relative min-w-0 flex-1 sm:max-w-sm">
                <SearchIcon size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-4" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search administrators by name, email, or role…"
                  className={cn(controlClass, 'w-full pl-9 pr-8')}
                />
                {search ? (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-4 transition-colors hover:text-ink"
                    title="Clear search"
                    aria-label="Clear search"
                  >
                    <XIcon size={14} />
                  </button>
                ) : null}
              </div>
            </Toolbar>
          }
          footer={
            <>
              <span>
                Showing <strong className="text-ink">{filteredAdmins.length}</strong> of {activeAdmins.length}{' '}
                {activeAdmins.length === 1 ? 'administrator' : 'administrators'}
                {filtered ? ' · filters applied' : ''}
              </span>
              {filtered ? (
                <button type="button" onClick={resetFilters} className="font-semibold text-copper transition-colors hover:text-ink">
                  Reset filters
                </button>
              ) : null}
            </>
          }
        >
          {adminUsersQuery.isLoading ? (
            <TableSkeleton rows={4} cols={4} />
          ) : filteredAdmins.length === 0 ? (
            <EmptyBlock
              icon={<ShieldCheckIcon size={22} />}
              title="No administrators found"
              description={
                filtered
                  ? 'No administrators match the current search and role filters.'
                  : 'No accounts currently hold an administrative role.'
              }
              action={
                filtered ? (
                  <Button variant="secondary" size="sm" onClick={resetFilters}>
                    Reset filters
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Administrator</th>
                  <th>Role &amp; tier</th>
                  <th>Last audit activity</th>
                  <th>
                    <span className="sr-only">Access controls</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredAdmins.map((u) => {
                  const isSelf = Boolean(currentAdmin?.email && u.email === currentAdmin.email);
                  const role = (u.adminRole ?? 'ops') as AdminRole;

                  return (
                    <tr key={u.id}>
                      <td>
                        <div className="flex items-center gap-3">
                          <Avatar name={u.name} email={u.email} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="truncate font-medium text-ink">
                                {u.name || u.email.split('@')[0]}
                              </span>
                              {isSelf ? (
                                <Pill tone="info">You</Pill>
                              ) : null}
                            </div>
                            <div className="mt-0.5 truncate font-mono text-xs text-ink-4">{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <RoleBadge role={role} />
                      </td>
                      <td>
                        <CellStack primary={formatActivityTime(u.lastActivityAt)} />
                      </td>
                      <td className="text-right">
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
                              className="text-rose hover:bg-rose/10"
                            >
                              Demote
                            </Button>
                          </div>
                        ) : (
                          <span className="font-mono text-xs text-ink-4">View only</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </TableCard>
      )}

      {/* TAB 2: Pending Invitations */}
      {tab === 'invites' && (
        <TableCard
          title="Administrative invitations"
          description="Track sent invitations, expiration timelines, and revoke unaccepted tokens."
          actions={
            canInvite ? (
              <Button variant="primary" size="sm" onClick={() => setInviteOpen(true)} icon={<PlusIcon size={14} />}>
                Send invite
              </Button>
            ) : undefined
          }
          footer={
            <span>
              <strong className="text-ink">{(invites.data ?? []).length}</strong>{' '}
              {(invites.data ?? []).length === 1 ? 'invitation' : 'invitations'} on record ·{' '}
              {activeInvites.length} pending
            </span>
          }
        >
          {invites.isLoading ? (
            <TableSkeleton rows={4} cols={5} />
          ) : (invites.data ?? []).length === 0 ? (
            <EmptyBlock
              icon={<MailIcon size={22} />}
              title="No pending invitations"
              description="There are currently no administrative invitations on record."
              action={
                canInvite ? (
                  <Button variant="primary" size="sm" onClick={() => setInviteOpen(true)} icon={<PlusIcon size={14} />}>
                    Invite an administrator
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Recipient</th>
                  <th>Assigned role</th>
                  <th>Status</th>
                  <th>Timeline</th>
                  <th>
                    <span className="sr-only">Action</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {(invites.data ?? []).map((i) => {
                  const now = Date.now();
                  const isExpired = i.expiresAt <= now;
                  const isAccepted = !!i.acceptedAt;
                  const isRevoked = !!i.revokedAt;

                  const statusPill = isAccepted ? (
                    <Pill tone="success" dot>
                      Accepted
                    </Pill>
                  ) : isRevoked ? (
                    <Pill tone="neutral">Revoked</Pill>
                  ) : isExpired ? (
                    <Pill tone="danger">Expired</Pill>
                  ) : (
                    <Pill tone="warning" dot>
                      Pending acceptance
                    </Pill>
                  );

                  return (
                    <tr key={i.id}>
                      <td>
                        <CellStack mono primary={i.email} secondary={i.createdAt ? `Sent ${new Date(i.createdAt).toLocaleDateString()}` : undefined} />
                      </td>
                      <td>
                        <RoleBadge role={i.role} />
                      </td>
                      <td>{statusPill}</td>
                      <td>
                        <CellStack
                          primary={
                            isAccepted
                              ? `Accepted ${new Date(i.acceptedAt!).toLocaleDateString()}`
                              : `${isExpired ? 'Expired' : 'Expires'} ${new Date(i.expiresAt).toLocaleDateString()}`
                          }
                        />
                      </td>
                      <td className="text-right">
                        {!isAccepted && !isRevoked ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-rose hover:bg-rose/10"
                            onClick={() => {
                              if (window.confirm(`Revoke invitation for ${i.email}?`)) {
                                revokeInvite.mutate(i.id);
                              }
                            }}
                            loading={revokeInvite.isPending && revokeInvite.variables === i.id}
                            disabled={revokeInvite.isPending}
                          >
                            Revoke
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </TableCard>
      )}

      {/* TAB 3: Permissions Matrix */}
      {tab === 'matrix' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            {ADMIN_ROLES.map((r) => {
              const meta = ROLE_META[r];
              return (
                <Card key={r} className="flex flex-col justify-between gap-4">
                  <div>
                    <RoleBadge role={r} />
                    <h3 className="mt-3 text-sm font-semibold text-ink">{meta.label}</h3>
                    <p className="mt-1.5 text-xs leading-relaxed text-ink-4">{meta.description}</p>
                  </div>
                  <div className="border-t border-ink/[0.07] pt-3 font-mono text-[11px] text-ink-4">
                    Tier scope: <span className="font-semibold uppercase text-ink">{r}</span>
                  </div>
                </Card>
              );
            })}
          </div>

          <TableCard
            title="Administrative capability matrix"
            description="Detailed breakdown of RBAC authorization boundaries across platform operations."
          >
            <table className="admin-table">
              <thead>
                <tr>
                  <th>System permission area</th>
                  <th className="text-center">Super admin</th>
                  <th className="text-center">Operations</th>
                  <th className="text-center">Finance</th>
                  <th className="text-center">Support</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { area: 'Invite & modify admin roles', cells: ['✓ Full', '—', '—', '—'] },
                  { area: 'User suspend / unsuspend', cells: ['✓ Full', '✓ Ops', '—', '—'] },
                  { area: 'Catalog & supplier moderation', cells: ['✓ Full', '✓ Full', '—', 'Read only'] },
                  { area: 'Payouts & disbursement batches', cells: ['✓ Full', '—', '✓ Full', '—'] },
                  { area: 'Direct refunds & ledger modifications', cells: ['✓ Full', '—', '✓ Full', '—'] },
                  { area: 'Dispute mediation & order notes', cells: ['✓ Full', '✓ Full', '✓ Full', '✓ Full'] },
                  { area: 'Global audit trail inspection & export', cells: ['✓ Full', '—', '✓ Export', '—'] },
                ].map((row) => (
                  <tr key={row.area}>
                    <td className="font-medium text-ink">{row.area}</td>
                    {row.cells.map((c, i) => (
                      <td key={i} className="text-center">
                        {c === '—' ? (
                          <span className="text-ink-4">—</span>
                        ) : c === 'Read only' ? (
                          <span className="text-xs text-ink-3">Read only</span>
                        ) : (
                          <span className="text-xs font-semibold text-mint">{c}</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </TableCard>
        </div>
      )}

      {/* TAB 4: Promote Existing User */}
      {tab === 'promote' && (
        <TableCard
          title="Platform users directory"
          description="Promote existing verified platform accounts to administrative personnel without creating duplicate credentials."
          toolbar={
            <Toolbar>
              <div className="relative min-w-0 flex-1 sm:max-w-sm">
                <SearchIcon size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-4" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search user by name or email…"
                  className={cn(controlClass, 'w-full pl-9 pr-8')}
                />
                {search ? (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-4 transition-colors hover:text-ink"
                    title="Clear search"
                    aria-label="Clear search"
                  >
                    <XIcon size={14} />
                  </button>
                ) : null}
              </div>
            </Toolbar>
          }
          footer={
            <span>
              Showing <strong className="text-ink">{filteredNonAdmins.length}</strong> of {nonAdminUsers.length}{' '}
              non-admin {nonAdminUsers.length === 1 ? 'user' : 'users'}
              {!search && nonAdminUsers.length > 25 ? ' · first 25 shown, search to narrow' : ''}
            </span>
          }
        >
          {allUsersQuery.isLoading ? (
            <TableSkeleton rows={5} cols={4} />
          ) : filteredNonAdmins.length === 0 ? (
            <EmptyBlock
              icon={<UsersIcon size={22} />}
              title="No eligible users"
              description={
                search
                  ? `No non-admin users match "${search}".`
                  : 'Every platform account already holds an administrative role.'
              }
              action={
                search ? (
                  <Button variant="secondary" size="sm" onClick={() => setSearch('')}>
                    Clear search
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Contact</th>
                  <th>Status</th>
                  <th>
                    <span className="sr-only">Action</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredNonAdmins.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <Avatar name={u.name} email={u.email} />
                        <CellStack primary={u.name || 'User'} secondary={u.email} />
                      </div>
                    </td>
                    <td>
                      <span className="font-mono text-xs text-ink-4">{u.phone || '—'}</span>
                    </td>
                    <td>
                      <Pill tone={u.status === 'suspended' ? 'danger' : 'success'} dot className="capitalize">
                        {u.status || 'Active'}
                      </Pill>
                    </td>
                    <td className="text-right">
                      {canChange ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setPromoteTarget(u);
                            setPromoteRole('ops');
                          }}
                          icon={<UserCheckIcon size={13} />}
                        >
                          Grant admin role
                        </Button>
                      ) : (
                        <span className="font-mono text-xs text-ink-4">No permission</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </TableCard>
      )}

      {/* Invite Admin Modal */}
      {canInvite && inviteOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm animate-fade-in"
          role="dialog"
          aria-modal="true"
          onClick={() => setInviteOpen(false)}
        >
          <div className="vyro-surface w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 border-b border-ink/[0.07] bg-bone/40 px-5 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-copper/15 text-copper">
                  <ShieldCheckIcon size={15} />
                </span>
                <h3 className="text-base font-semibold text-ink">Invite platform administrator</h3>
              </div>
              <button
                type="button"
                onClick={() => setInviteOpen(false)}
                aria-label="Close"
                className="flex size-8 items-center justify-center rounded-lg text-ink-4 transition-colors hover:bg-ink/5 hover:text-ink"
              >
                <XIcon size={16} />
              </button>
            </div>
            <div className="p-5 sm:p-6">
              <InviteAdminDialog onClose={() => setInviteOpen(false)} />
            </div>
          </div>
        </div>
      ) : null}

      {/* Demote Confirmation Modal */}
      {demoteTarget ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm animate-fade-in"
          role="dialog"
          aria-modal="true"
          onClick={() => setDemoteTarget(null)}
        >
          <div className="vyro-surface w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 border-b border-ink/[0.07] bg-rose/[0.07] px-5 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-rose/15 text-rose">
                  <AlertTriangleIcon size={16} />
                </span>
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-ink">Revoke administrator role</h3>
                  <p className="mt-0.5 truncate font-mono text-[11px] text-ink-4">{demoteTarget.email}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDemoteTarget(null)}
                aria-label="Close"
                className="flex size-8 items-center justify-center rounded-lg text-ink-4 transition-colors hover:bg-ink/5 hover:text-ink"
              >
                <XIcon size={16} />
              </button>
            </div>
            <div className="space-y-4 p-5 sm:p-6">
              <Callout tone="danger" title="Security warning">
                This will immediately remove the administrative role (
                <span className="font-mono text-xs">{demoteTarget.adminRole}</span>) for{' '}
                <strong className="font-mono text-xs">{demoteTarget.email}</strong> and revoke all administrative
                dashboard access.
              </Callout>
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="ghost" size="sm" onClick={() => setDemoteTarget(null)} disabled={change.isPending}>
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  loading={change.isPending}
                  onClick={() => change.mutate({ id: demoteTarget.id, role: null })}
                >
                  Confirm demote
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Promote User Modal */}
      {promoteTarget ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm animate-fade-in"
          role="dialog"
          aria-modal="true"
          onClick={() => setPromoteTarget(null)}
        >
          <div className="vyro-surface w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 border-b border-ink/[0.07] bg-bone/40 px-5 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-copper/15 text-copper">
                  <UserCheckIcon size={15} />
                </span>
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-ink">Grant administrative privileges</h3>
                  <p className="mt-0.5 truncate font-mono text-[11px] text-ink-4">{promoteTarget.email}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPromoteTarget(null)}
                aria-label="Close"
                className="flex size-8 items-center justify-center rounded-lg text-ink-4 transition-colors hover:bg-ink/5 hover:text-ink"
              >
                <XIcon size={16} />
              </button>
            </div>
            <div className="space-y-4 p-5 sm:p-6">
              <DetailList
                items={[
                  { label: 'User', value: promoteTarget.name || promoteTarget.email },
                  { label: 'Email', value: <span className="font-mono text-xs">{promoteTarget.email}</span> },
                ]}
              />
              <div>
                <Label>Role to grant</Label>
                <AdminRoleSelect
                  value={promoteRole}
                  onChange={setPromoteRole}
                  allowedRoles={ADMIN_ROLES}
                  className="w-full"
                  disabled={change.isPending}
                />
              </div>
              <div className="flex justify-end gap-2 border-t border-ink/[0.07] pt-4">
                <Button variant="ghost" size="sm" onClick={() => setPromoteTarget(null)} disabled={change.isPending}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  loading={change.isPending}
                  onClick={() => change.mutate({ id: promoteTarget.id, role: promoteRole })}
                >
                  Confirm promotion
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </AdminPage>
  );
}
