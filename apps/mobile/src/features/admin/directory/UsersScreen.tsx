import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ListChecks, ShieldAlert, UserRound, UserX, UserCheck } from 'lucide-react-native';
import { api, errorMessage } from '@/lib/api';
import { formatDate, humanize } from '@/lib/format';
import { colors } from '@/theme/tokens';
import { useOnChange } from '@/lib/useOnChange';
import { ADMIN_ROLES, ROLE_META, roleLabel, usePermission, type AdminRole } from '@/features/admin/common/permissions';
import {
  Avatar,
  Button,
  Card,
  ConfirmSheet,
  QueryView,
  Screen,
  SearchBar,
  Segmented,
  StatusBadge,
  Text,
  useToast,
} from '@/ui';
import { useAdminGet } from '@/features/admin/common/api';
import { Can } from '@/features/admin/platform/kit';
import {
  ActionMenu,
  AdminHeaderActions,
  BulkConfirmSheet,
  BulkResultSheet,
  SelectionBar,
  SelectDot,
  useBulk,
  useSelection,
  type BulkResult,
} from '@/features/admin/ops/kit';

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
  const [menuFor, setMenuFor] = useState<PlatformUser | null>(null);
  const [busy, setBusy] = useState(false);

  const rows = q.data?.users ?? q.data?.items ?? [];
  const needle = search.trim().toLowerCase();
  const visible = needle
    ? rows.filter((u) => `${u.name} ${u.email}`.toLowerCase().includes(needle))
    : filter === 'suspended'
      ? rows.filter((u) => u.status === 'suspended')
      : rows;

  // Bulk selection — cleared whenever the filter changes (mirrors the web).
  const sel = useSelection();
  useOnChange(filter, () => sel.stop());
  const canSuspend = usePermission('user:suspend');
  const canRole = usePermission('admin:role_change');
  const [confirmKind, setConfirmKind] = useState<'suspend' | 'unsuspend' | 'role' | null>(null);
  const [roleChoice, setRoleChoice] = useState<AdminRole>('ops');
  const [result, setResult] = useState<BulkResult | null>(null);
  const bulkSuspend = useBulk<{ ids: string[] }>('users/suspend', [['admin-users']]);
  const bulkUnsuspend = useBulk<{ ids: string[] }>('users/unsuspend', [['admin-users']]);
  const bulkRole = useBulk<{ ids: string[]; role: AdminRole }>('users/role', [['admin-users']]);
  const bulkBusy = bulkSuspend.isPending || bulkUnsuspend.isPending || bulkRole.isPending;

  const bulkActions = [
    ...(canSuspend
      ? [
          { label: 'Suspend', run: () => setConfirmKind('suspend' as const), destructive: true, disabled: bulkSuspend.isPending },
          { label: 'Reinstate', run: () => setConfirmKind('unsuspend' as const), disabled: bulkUnsuspend.isPending },
        ]
      : []),
    ...(canRole ? [{ label: 'Set role', run: () => setConfirmKind('role' as const), disabled: bulkRole.isPending }] : []),
  ];

  const onBulkError = (e: unknown) => toast.error('Bulk action failed', errorMessage(e));
  const runBulk = () => {
    const ids = sel.ids;
    const onDone = (r: BulkResult) => {
      setResult(r);
      sel.stop();
      setConfirmKind(null);
    };
    if (confirmKind === 'suspend') bulkSuspend.mutate({ ids }, { onSuccess: onDone, onError: onBulkError });
    else if (confirmKind === 'unsuspend') bulkUnsuspend.mutate({ ids }, { onSuccess: onDone, onError: onBulkError });
    else if (confirmKind === 'role') bulkRole.mutate({ ids, role: roleChoice }, { onSuccess: onDone, onError: onBulkError });
  };

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
    <View style={{ flex: 1 }}>
      <Screen
        back
        kicker="Registry"
        title="Users"
        subtitle="Accounts, roles and suspension."
        right={
          <>
            {canSuspend || canRole ? (
              <Button
                title={sel.mode ? 'Done' : 'Select'}
                size="sm"
                variant="ghost"
                onPress={() => (sel.mode ? sel.stop() : sel.start())}
              />
            ) : null}
            <AdminHeaderActions />
          </>
        }
        onRefresh={() => q.refetch()}
      >
      <Segmented<Filter>
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
            {visible.map((u) => {
              const card = (
                <Card kind="flat" padding={16} style={{ gap: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    {sel.mode ? <SelectDot on={sel.has(u.id)} /> : null}
                    <Avatar name={u.name} size={46} tone={u.isAdmin || u.adminRole ? 'volt' : 'ink'} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text variant="h3" numberOfLines={1}>
                        {u.name}
                      </Text>
                      <Text variant="bodySm" color="ink4" numberOfLines={1}>
                        {u.email}
                      </Text>
                    </View>
                    {sel.mode ? null : (
                      <Can perm={['user:suspend', 'user:unsuspend']}>
                        <Button
                          title={u.status === 'suspended' ? 'Lift' : 'Hold'}
                          size="sm"
                          variant={u.status === 'suspended' ? 'paper' : 'danger'}
                          onPress={() => setTarget(u)}
                        />
                      </Can>
                    )}
                  </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: colors.lineSoft }}>
                  {u.isAdmin || u.adminRole ? <StatusBadge status={roleLabel(u.adminRole)} size="sm" /> : null}
                  {u.status ? <StatusBadge status={u.status} size="sm" /> : null}
                  <View style={{ flex: 1 }} />
                  {u.createdAt ? (
                    <Text variant="caption" color="ink5">
                      Joined {formatDate(u.createdAt)}
                    </Text>
                  ) : null}
                </View>
                </Card>
              );
              return sel.mode ? (
                <Pressable key={u.id} onPress={() => sel.toggle(u.id)}>
                  {card}
                </Pressable>
              ) : (
                <Pressable key={u.id} onLongPress={() => setMenuFor(u)} delayLongPress={350}>
                  {card}
                </Pressable>
              );
            })}
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
          <ShieldAlert size={13} color={colors.ink5} />
          <Text variant="caption" color="ink4">
            {humanize(filter)} · {visible.length} shown
          </Text>
        </View>
      )}
      </Screen>
      {sel.mode ? (
        <SelectionBar
          count={sel.count}
          actions={bulkActions}
          onClear={sel.stop}
          onSelectAll={() => sel.setAll(visible.map((u) => u.id))}
        />
      ) : null}
      <BulkConfirmSheet
        visible={!!confirmKind}
        count={sel.count}
        action={confirmKind === 'suspend' ? 'Suspend' : confirmKind === 'unsuspend' ? 'Reinstate' : 'Set role'}
        destructive={confirmKind === 'suspend'}
        loading={bulkBusy}
        onClose={() => setConfirmKind(null)}
        onConfirm={runBulk}
      >
        {confirmKind === 'role' ? (
          <View style={{ gap: 10 }}>
            <Text variant="overline" color="ink4">
              New admin role
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {ADMIN_ROLES.map((r) => (
                <Button
                  key={r}
                  title={ROLE_META[r].label}
                  size="sm"
                  variant={roleChoice === r ? 'primary' : 'secondary'}
                  onPress={() => setRoleChoice(r)}
                />
              ))}
            </View>
          </View>
        ) : null}
      </BulkConfirmSheet>
      <BulkResultSheet
        result={result}
        onClose={() => setResult(null)}
        onRetryFailed={(ids) => {
          setResult(null);
          sel.start();
          sel.setAll(ids);
        }}
      />
      <ActionMenu
        visible={!!menuFor}
        onClose={() => setMenuFor(null)}
        title={menuFor?.name}
        subtitle={menuFor?.email}
        actions={[
          ...(canSuspend
            ? [
                {
                  label: menuFor?.status === 'suspended' ? 'Reinstate user' : 'Suspend user',
                  icon: menuFor?.status === 'suspended' ? UserCheck : UserX,
                  destructive: menuFor?.status !== 'suspended',
                  onPress: () => setTarget(menuFor),
                },
              ]
            : []),
          {
            label: 'Select multiple',
            icon: ListChecks,
            onPress: () => {
              sel.start();
              if (menuFor) sel.toggle(menuFor.id);
            },
          },
        ]}
      />
    </View>
  );
}
