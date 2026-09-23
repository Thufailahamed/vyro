import { useState } from 'react';
import { View } from 'react-native';
import { ShieldAlert, UserRound } from 'lucide-react-native';
import { api, errorMessage } from '@/lib/api';
import { formatDate, humanize } from '@/lib/format';
import { roleLabel } from '@/features/admin/common/permissions';
import {
  Avatar,
  Button,
  Card,
  ChipRow,
  ConfirmSheet,
  QueryView,
  Screen,
  SearchBar,
  StatusBadge,
  Text,
  useToast,
} from '@/ui';
import { useAdminGet } from '@/features/admin/common/api';
import { Can } from '@/features/admin/platform/kit';
import { AdminHeaderActions } from '@/features/admin/ops/kit';

interface PlatformUser {
  id: string;
  name: string;
  email: string;
  role?: string | null;
  isAdmin?: boolean;
  adminRole?: string | null;
  status?: string | null;
  createdAt?: number | null;
}

type Filter = 'all' | 'admins' | 'suspended';

/** Mirrors web UsersPage + RolesPage lists (GET /admin/users). */
export function UsersScreen() {
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const path = filter === 'admins' ? '/admin/users?isAdmin=true' : '/admin/users';
  const q = useAdminGet<{ users?: PlatformUser[]; items?: PlatformUser[] }>(['admin-users', filter], path);
  const toast = useToast();
  const [target, setTarget] = useState<PlatformUser | null>(null);
  const [busy, setBusy] = useState(false);

  const rows = q.data?.users ?? q.data?.items ?? [];
  const needle = search.trim().toLowerCase();
  const visible = needle
    ? rows.filter((u) => `${u.name} ${u.email}`.toLowerCase().includes(needle))
    : filter === 'suspended'
      ? rows.filter((u) => u.status === 'suspended')
      : rows;

  const suspend = async (suspendIt: boolean) => {
    if (!target) return;
    setBusy(true);
    try {
      await api.post(`/admin/users/${target.id}/${suspendIt ? 'suspend' : 'unsuspend'}`, {});
      toast.success(suspendIt ? 'User suspended' : 'User reinstated');
      setTarget(null);
      void q.refetch();
    } catch (e) {
      toast.error('Action failed', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const suspended = target?.status === 'suspended';

  return (
    <Screen
      back
      kicker="Registry"
      title="Users"
      subtitle="Accounts, roles and suspension."
      right={<AdminHeaderActions />}
      onRefresh={() => q.refetch()}
    >
      <ChipRow<Filter>
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: 'All' },
          { value: 'admins', label: 'Operators' },
          { value: 'suspended', label: 'Suspended' },
        ]}
      />
      <SearchBar value={search} onChangeText={setSearch} placeholder="Search name or email…" />
      <QueryView query={q} empty={() => visible.length === 0} emptyTitle="No users" emptyMessage="Nobody matches this filter." emptyIcon={UserRound}>
        {() => (
          <View style={{ gap: 10 }}>
            {visible.map((u) => (
              <Card key={u.id} kind="flat" padding={13} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Avatar name={u.name} size={40} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="body" weight="semibold" numberOfLines={1}>
                    {u.name}
                  </Text>
                  <Text variant="caption" color="ink4" numberOfLines={1}>
                    {u.email}
                    {u.createdAt ? ` · ${formatDate(u.createdAt)}` : ''}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 6, marginTop: 2 }}>
                    {u.isAdmin || u.adminRole ? <StatusBadge status={roleLabel(u.adminRole)} size="sm" /> : null}
                    {u.status ? <StatusBadge status={u.status} size="sm" /> : null}
                  </View>
                </View>
                <Can perm={['user:suspend', 'user:unsuspend']}>
                  <Button
                    title={u.status === 'suspended' ? 'Lift' : 'Hold'}
                    size="sm"
                    variant={u.status === 'suspended' ? 'secondary' : 'danger'}
                    onPress={() => setTarget(u)}
                  />
                </Can>
              </Card>
            ))}
          </View>
        )}
      </QueryView>
      <ConfirmSheet
        visible={!!target}
        onClose={() => setTarget(null)}
        onConfirm={() => suspend(!suspended)}
        loading={busy}
        title={`${suspended ? 'Reinstate' : 'Suspend'} ${target?.name ?? 'user'}?`}
        message={suspended ? 'The account regains full access immediately.' : 'The account is locked out immediately. Written to the audit trail.'}
        confirmLabel={suspended ? 'Reinstate user' : 'Suspend user'}
        variant={suspended ? 'primary' : 'danger'}
      />
      {filter === 'suspended' ? null : (
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
          <ShieldAlert size={13} color="#8A8A8A" />
          <Text variant="caption" color="ink4">
            {humanize(filter)} · {visible.length} shown
          </Text>
        </View>
      )}
    </Screen>
  );
}
