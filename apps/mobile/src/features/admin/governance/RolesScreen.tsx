import { useState } from 'react';
import { View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { Mail, MailPlus, UserMinus } from 'lucide-react-native';
import { api, errorMessage } from '@/lib/api';
import { formatDate, humanize } from '@/lib/format';
import {
  Avatar,
  Button,
  ConfirmSheet,
  Field,
  IconTile,
  Input,
  ListCard,
  ListRow,
  QueryView,
  Screen,
  SectionHeader,
  Select,
  Sheet,
  StatusBadge,
  useToast,
} from '@/ui';
import { useAdminGet } from '@/features/admin/common/api';
import {
  ADMIN_ROLES,
  INVITABLE_ROLES,
  ROLE_META,
  hasPermission,
  useAdminRole,
  type AdminRole,
} from '@/features/admin/common/permissions';
import { Appear, go } from '@/features/admin/platform/kit';

interface AdminUser {
  id: string;
  name: string;
  email: string;
  adminRole?: string | null;
  createdAt?: number | null;
}

interface Invite {
  id: string;
  email: string;
  role: string;
  createdAt?: number | null;
  expiresAt?: number | null;
}

/** Mirrors web RolesPage (GET /admin/users?isAdmin=true, /admin/invites). */
export function RolesScreen() {
  const role = useAdminRole();
  const invitable = role ? INVITABLE_ROLES[role] : [];
  const qc = useQueryClient();
  const toast = useToast();
  const admins = useAdminGet<{ items: AdminUser[] }>(
    ['admin-users', 'admins'],
    '/admin/users?isAdmin=true',
  );
  const invites = useAdminGet<{ invites: Invite[] }>(
    ['admin-invites'],
    '/admin/invites',
    hasPermission(role, 'admin:invite') || hasPermission(role, 'admin:read'),
  );
  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<AdminRole>('support');
  const [busy, setBusy] = useState(false);
  const [revoke, setRevoke] = useState<Invite | null>(null);
  const [demote, setDemote] = useState<AdminUser | null>(null);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['admin-users'] });
    qc.invalidateQueries({ queryKey: ['admin-invites'] });
  };

  const sendInvite = async () => {
    setBusy(true);
    try {
      await api.post('/admin/invites', { email: email.trim(), role: inviteRole });
      toast.success('Invite sent', `${email.trim()} can now accept a ${inviteRole} seat.`);
      setInviteOpen(false);
      setEmail('');
      refresh();
    } catch (e) {
      toast.error('Invite failed', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      back
      kicker="Governance"
      title="Roles & invites"
      subtitle="Who can operate the platform."
      onRefresh={refresh}
      footer={
        invitable.length ? (
          <Button
            title="Invite operator"
            icon={MailPlus}
            full
            size="lg"
            onPress={() => setInviteOpen(true)}
          />
        ) : undefined
      }
    >
      <Appear>
        <View>
          <SectionHeader
            kicker={`Operators · ${(admins.data?.items ?? []).length}`}
            title="Seats"
          />
          <QueryView
            query={admins}
            empty={(d) => (d.items ?? []).length === 0}
            emptyTitle="No operators"
            emptyMessage="Invite the first operator below."
          >
            {(d) => (
              <ListCard>
                {(d.items ?? []).map((u, i, arr) => (
                  <View key={u.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View style={{ flex: 1 }}>
                      <ListRow
                        title={u.name}
                        subtitle={u.email}
                        leading={<Avatar name={u.name} size={42} tone="ink" />}
                        trailing={
                          u.adminRole ? (
                            <StatusBadge
                              status={
                                ROLE_META[u.adminRole as AdminRole]?.label ?? humanize(u.adminRole)
                              }
                              size="sm"
                            />
                          ) : undefined
                        }
                        last={i === arr.length - 1}
                      />
                    </View>
                    {hasPermission(role, 'admin:role_change') ? (
                      <Button
                        title="Demote"
                        size="sm"
                        variant="paper"
                        onPress={() => setDemote(u)}
                      />
                    ) : null}
                  </View>
                ))}
              </ListCard>
            )}
          </QueryView>
        </View>
      </Appear>

      <Appear i={1}>
        <View>
          <SectionHeader
            kicker={`Invites · ${(invites.data?.invites ?? []).length}`}
            title="Pending"
          />
          <QueryView
            query={invites}
            empty={(d) => (d.invites ?? []).length === 0}
            emptyTitle="No pending invites"
            emptyMessage="Outstanding invites appear here until accepted."
          >
            {(d) => (
              <ListCard>
                {(d.invites ?? []).map((inv, i, arr) => (
                  <ListRow
                    key={inv.id}
                    title={inv.email}
                    subtitle={`${humanize(inv.role)}${inv.expiresAt ? ` · expires ${formatDate(inv.expiresAt)}` : ''}`}
                    leading={<IconTile icon={Mail} tone="copper" size={42} />}
                    trailing={
                      hasPermission(role, 'admin:invite') ? (
                        <Button
                          title="Revoke"
                          size="sm"
                          variant="danger"
                          icon={UserMinus}
                          onPress={() => setRevoke(inv)}
                        />
                      ) : undefined
                    }
                    last={i === arr.length - 1}
                  />
                ))}
              </ListCard>
            )}
          </QueryView>
        </View>
      </Appear>

      <Sheet
        visible={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Invite operator"
        subtitle="They accept from the admin login screen."
        footer={
          <Button
            title="Send invite"
            full
            size="lg"
            loading={busy}
            disabled={!email.includes('@') || !invitable.length}
            onPress={sendInvite}
          />
        }
      >
        <View style={{ gap: 14 }}>
          <Field label="Work email" required>
            <Input
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              placeholder="ops@vyro.lk"
            />
          </Field>
          <Field label="Role" required>
            <Select<AdminRole>
              value={inviteRole}
              onChange={setInviteRole}
              title="Operator role"
              options={(invitable.length ? [...invitable] : [...ADMIN_ROLES]).map((r) => ({
                value: r,
                label: ROLE_META[r].label,
              }))}
            />
          </Field>
          <Button
            title="View all users"
            variant="paper"
            onPress={() => go('/admin/users')}
            style={{ alignSelf: 'center' }}
          />
        </View>
      </Sheet>

      <ConfirmSheet
        visible={!!revoke}
        onClose={() => setRevoke(null)}
        onConfirm={() => {
          if (!revoke) return;
          setBusy(true);
          api
            .del(`/admin/invites/${revoke.id}`)
            .then(() => {
              toast.success('Invite revoked');
              setRevoke(null);
              refresh();
            })
            .catch((e: unknown) => toast.error('Revoke failed', errorMessage(e)))
            .finally(() => setBusy(false));
        }}
        loading={busy}
        title={`Revoke invite to ${revoke?.email}?`}
        confirmLabel="Revoke invite"
        variant="danger"
      />
      <ConfirmSheet
        visible={!!demote}
        onClose={() => setDemote(null)}
        onConfirm={() => {
          if (!demote) return;
          setBusy(true);
          api
            .del(`/admin/users/${demote.id}/role`)
            .then(() => {
              toast.success('Operator removed', 'Their admin seat is revoked.');
              setDemote(null);
              refresh();
            })
            .catch((e: unknown) => toast.error('Action failed', errorMessage(e)))
            .finally(() => setBusy(false));
        }}
        loading={busy}
        title={`Remove ${demote?.name}'s admin seat?`}
        message="They keep their buyer/supplier access but lose the operator portal."
        confirmLabel="Remove seat"
        variant="danger"
      />
    </Screen>
  );
}
