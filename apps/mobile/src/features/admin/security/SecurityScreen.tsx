import { useState } from 'react';
import { View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Database, Eye, ShieldCheck, Smartphone } from 'lucide-react-native';
import {
  Banner,
  Button,
  Card,
  ConfirmSheet,
  EmptyState,
  ErrorState,
  Field,
  Gutter,
  Input,
  Screen,
  ScreenHeader,
  SkeletonList,
  StatusBadge,
  Text,
  useToast,
} from '@/ui';
import { api, errorMessage } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { Section } from '../../buyer/orders/kit';
import { openDocument } from '@/lib/files';

type AdminSession = {
  id: string;
  userId: string;
  expiresAt: number;
  ip: string | null;
  userAgent: string | null;
  createdAt: number;
  revokedAt: number | null;
  userEmail: string | null;
  userRole: string | null;
};
type Impersonation = { id: string; adminUserId: string; targetUserId: string; reason: string; startedAt: number; endedAt: number | null };
type DataExport = { id: string; userId: string; requestedBy: string; status: 'pending' | 'ready' | 'failed' | 'expired'; downloadUrl: string | null; expiresAt: number | null; createdAt: number };

/** /admin/security — sessions, impersonation, GDPR data export. */
export function AdminSecurityScreen() {
  const toast = useToast();
  const qc = useQueryClient();
  const [revokeTarget, setRevokeTarget] = useState<AdminSession | null>(null);
  const [impUser, setImpUser] = useState('');
  const [impReason, setImpReason] = useState('');
  const [exportUser, setExportUser] = useState('');
  const [exportId, setExportId] = useState<string | null>(null);

  const sessions = useQuery({ queryKey: ['admin-sessions'], queryFn: () => api.get<AdminSession[]>('/admin/sessions') });
  const impersonation = useQuery({ queryKey: ['admin-impersonate'], queryFn: () => api.get<{ active: Impersonation | null }>('/admin/impersonate') });
  const exportStatus = useQuery({
    queryKey: ['admin-data-export', exportId],
    queryFn: () => api.get<DataExport>(`/admin/data-export/${exportId}`),
    enabled: !!exportId,
    refetchInterval: (q) => ((q.state.data as DataExport | undefined)?.status === 'pending' ? 3000 : false),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => api.post(`/admin/sessions/${id}/revoke`, {}),
    onSuccess: () => {
      toast.success('Session revoked');
      qc.invalidateQueries({ queryKey: ['admin-sessions'] });
    },
    onError: (e) => toast.error('Revoke failed', errorMessage(e)),
  });
  const startImp = useMutation({
    mutationFn: () => api.post('/admin/impersonate', { targetUserId: impUser.trim(), reason: impReason.trim() }),
    onSuccess: () => {
      toast.success('Impersonation started');
      setImpUser('');
      setImpReason('');
      qc.invalidateQueries({ queryKey: ['admin-impersonate'] });
    },
    onError: (e) => toast.error('Could not impersonate', errorMessage(e)),
  });
  const endImp = useMutation({
    mutationFn: () => api.post('/admin/impersonate/end', {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-impersonate'] }),
  });
  const requestExport = useMutation({
    mutationFn: () => api.post<DataExport>('/admin/data-export', { userId: exportUser.trim() }),
    onSuccess: (r) => {
      setExportId(r.id);
      toast.success('Export requested');
    },
    onError: (e) => toast.error('Export failed', errorMessage(e)),
  });

  const active = impersonation.data?.active;
  const exp = exportStatus.data;
  const rows = (sessions.data ?? []).slice(0, 50);

  return (
    <Screen>
      <ScreenHeader back kicker="Access control" title="Security" subtitle="Live sessions, support impersonation and GDPR export." />
      <Gutter style={{ gap: 14 }}>
        {active ? (
          <Banner
            tone="warning"
            title={`Impersonating ${active.targetUserId}`}
            message={`Since ${timeAgo(active.startedAt)} · ${active.reason}`}
            action={{ label: 'End impersonation', onPress: () => endImp.mutate() }}
          />
        ) : null}

        <Section kicker="Support access" title="Impersonation" icon={Eye}>
          <Field label="Target user ID">
            <Input value={impUser} onChangeText={setImpUser} placeholder="usr_…" autoCapitalize="none" />
          </Field>
          <Field label="Reason" hint="Recorded in the audit log.">
            <Input value={impReason} onChangeText={setImpReason} placeholder="Ticket #…" />
          </Field>
          <Button title="Start impersonation" variant="secondary" size="sm" loading={startImp.isPending} disabled={!impUser.trim() || !impReason.trim() || !!active} onPress={() => startImp.mutate()} />
        </Section>

        <Section kicker="Privacy" title="Data export" icon={Database}>
          <Field label="User ID">
            <Input value={exportUser} onChangeText={setExportUser} placeholder="usr_…" autoCapitalize="none" />
          </Field>
          <Button title="Request export" variant="secondary" size="sm" loading={requestExport.isPending} disabled={!exportUser.trim()} onPress={() => requestExport.mutate()} />
          {exp ? (
            <Card kind="bone" padding={12} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View>
                <Text variant="caption" color="ink4">
                  Export {exp.id.slice(0, 10)}…
                </Text>
                <StatusBadge status={exp.status} size="sm" />
              </View>
              {exp.status === 'ready' && exp.downloadUrl ? <Button title="Download" size="sm" variant="secondary" onPress={() => void openDocument(exp.downloadUrl!)} /> : null}
            </Card>
          ) : null}
        </Section>

        <Section kicker="Live" title={`Active sessions (${rows.filter((s) => !s.revokedAt).length})`} icon={Smartphone}>
          {sessions.isLoading ? <SkeletonList rows={4} height={64} /> : null}
          {sessions.isError ? <ErrorState message={errorMessage(sessions.error)} onRetry={() => sessions.refetch()} /> : null}
          {sessions.data && rows.length === 0 ? <EmptyState icon={ShieldCheck} title="No sessions" /> : null}
          {rows.map((s) => (
            <Card key={s.id} kind={s.revokedAt ? 'flat' : 'bone'} padding={12} style={{ gap: 4, opacity: s.revokedAt ? 0.55 : 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <Text variant="bodySm" weight="semibold" numberOfLines={1} style={{ flex: 1 }}>
                  {s.userEmail ?? s.userId}
                </Text>
                {s.userRole ? <StatusBadge status={s.userRole} size="sm" /> : null}
              </View>
              <Text variant="caption" color="ink4" numberOfLines={1}>
                {s.userAgent ?? 'Unknown device'}
                {s.ip ? ` · ${s.ip}` : ''}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text variant="caption" color="ink5">
                  {timeAgo(s.createdAt)}
                  {s.revokedAt ? ' · revoked' : ` · expires ${timeAgo(s.expiresAt)}`}
                </Text>
                {!s.revokedAt ? <Button title="Revoke" variant="ghost" size="sm" onPress={() => setRevokeTarget(s)} /> : null}
              </View>
            </Card>
          ))}
        </Section>
      </Gutter>

      <ConfirmSheet
        visible={!!revokeTarget}
        onClose={() => setRevokeTarget(null)}
        onConfirm={() => revokeTarget && revoke.mutate(revokeTarget.id)}
        title="Revoke session?"
        message={`${revokeTarget?.userEmail ?? revokeTarget?.userId} will be signed out on their next request.`}
        confirmLabel="Revoke"
        variant="danger"
        loading={revoke.isPending}
      />
    </Screen>
  );
}
