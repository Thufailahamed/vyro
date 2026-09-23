import { useState } from 'react';
import { View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileWarning, ShieldCheck } from 'lucide-react-native';
import { api, errorMessage, qs } from '@/lib/api';
import { formatDateTime, humanize } from '@/lib/format';
import {
  Button,
  Card,
  ChipRow,
  ConfirmSheet,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Screen,
  Select,
  Sheet,
  SkeletonList,
  StatusBadge,
  Text,
  useToast,
} from '@/ui';
import { Appear, Can } from '@/features/admin/platform/kit';

interface AbuseReport {
  id: string;
  targetType: string;
  targetId: string;
  reason: string;
  details: string | null;
  status: string;
  assignedTo: string | null;
  createdAt: number;
}

interface KycReview {
  id: string;
  userId: string;
  status: string;
  notes: string | null;
  createdAt: number;
}

type Tab = 'reports' | 'kyc';
type Resolution = 'resolved' | 'dismissed';
type Decision = 'approved' | 'rejected' | 'needs_more_info';

/** Mirrors web TrustSafetyPage (GET /admin/abuse-reports, /admin/kyc). */
export function TrustSafetyScreen() {
  const [tab, setTab] = useState<Tab>('reports');
  const [reportStatus, setReportStatus] = useState('open');
  const toast = useToast();
  const qc = useQueryClient();

  const reports = useQuery({
    queryKey: ['admin-abuse-reports', reportStatus],
    queryFn: () => api.get<{ items: AbuseReport[] }>('/admin/abuse-reports' + qs({ status: reportStatus === 'all' ? undefined : reportStatus })),
    enabled: tab === 'reports',
  });
  const kyc = useQuery({
    queryKey: ['admin-kyc', 'pending'],
    queryFn: () => api.get<{ items: KycReview[] }>('/admin/kyc' + qs({ status: 'pending' })),
    enabled: tab === 'kyc',
  });

  const [resolveTarget, setResolveTarget] = useState<{ report: AbuseReport; resolution: Resolution } | null>(null);
  const [note, setNote] = useState('');
  const [takedown, setTakedown] = useState<AbuseReport | null>(null);
  const [kycTarget, setKycTarget] = useState<{ row: KycReview; decision: Decision } | null>(null);
  const [busy, setBusy] = useState(false);
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['admin-abuse-reports'] });
    qc.invalidateQueries({ queryKey: ['admin-kyc'] });
  };

  const claim = useMutation({
    mutationFn: (id: string) => api.post(`/admin/abuse-reports/${id}/claim`, {}),
    onSuccess: () => invalidate(),
    onError: (e) => toast.error('Claim failed', errorMessage(e)),
  });

  const resolve = async () => {
    if (!resolveTarget) return;
    setBusy(true);
    try {
      await api.post(`/admin/abuse-reports/${resolveTarget.report.id}/resolve`, {
        resolution: resolveTarget.resolution,
        ...(note.trim() ? { notes: note.trim() } : {}),
      });
      toast.success('Report closed', humanize(resolveTarget.resolution));
      setResolveTarget(null);
      setNote('');
      invalidate();
    } catch (e) {
      toast.error('Resolve failed', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const decideKyc = async () => {
    if (!kycTarget) return;
    setBusy(true);
    try {
      await api.post(`/admin/kyc/${kycTarget.row.id}/decision`, {
        decision: kycTarget.decision,
        ...(note.trim() ? { notes: note.trim() } : {}),
      });
      toast.success('KYC decided', humanize(kycTarget.decision));
      setKycTarget(null);
      setNote('');
      invalidate();
    } catch (e) {
      toast.error('Decision failed', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      back
      kicker="Governance"
      title="Trust & safety"
      subtitle="Abuse reports, KYC reviews and takedowns."
      onRefresh={() => (tab === 'reports' ? reports.refetch() : kyc.refetch())}
    >
      <ChipRow<Tab> value={tab} onChange={setTab} options={[{ value: 'reports', label: 'Abuse reports' }, { value: 'kyc', label: 'KYC queue' }]} />

      {tab === 'reports' ? (
        <>
          <ChipRow
            value={reportStatus}
            onChange={setReportStatus}
            options={['open', 'investigating', 'resolved', 'dismissed', 'all'].map((s) => ({ value: s, label: humanize(s) }))}
          />
          {reports.isLoading ? (
            <SkeletonList rows={5} height={120} />
          ) : reports.isError ? (
            <ErrorState message={errorMessage(reports.error)} onRetry={() => reports.refetch()} />
          ) : (reports.data?.items ?? []).length === 0 ? (
            <EmptyState icon={FileWarning} title="Queue clear" message="No abuse reports in this state." />
          ) : (
            <View style={{ gap: 10 }}>
              {(reports.data?.items ?? []).map((r, i) => (
                <Appear key={r.id} i={i % 10}>
                  <Card kind="flat" padding={14} style={{ gap: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text variant="body" weight="semibold" style={{ flex: 1 }} numberOfLines={1}>
                        {humanize(r.reason)} · {humanize(r.targetType)}
                      </Text>
                      <StatusBadge status={r.status} size="sm" />
                    </View>
                    {r.details ? (
                      <Text variant="bodySm" color="ink3" numberOfLines={3}>
                        {r.details}
                      </Text>
                    ) : null}
                    <Text variant="caption" color="ink4">
                      Target {r.targetId.slice(0, 10)} · {formatDateTime(r.createdAt)}
                      {r.assignedTo ? ` · claimed` : ''}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                      <Can perm="abuse_report:resolve">
                        {!r.assignedTo ? (
                          <Button title="Claim" size="sm" variant="secondary" loading={claim.isPending} onPress={() => claim.mutate(r.id)} />
                        ) : null}
                        {r.status !== 'resolved' ? (
                          <Button title="Resolve" size="sm" onPress={() => { setResolveTarget({ report: r, resolution: 'resolved' }); setNote(''); }} />
                        ) : null}
                        {r.status !== 'dismissed' && r.status !== 'resolved' ? (
                          <Button title="Dismiss" size="sm" variant="ghost" onPress={() => { setResolveTarget({ report: r, resolution: 'dismissed' }); setNote(''); }} />
                        ) : null}
                      </Can>
                      <Can perm="takedown:write">
                        <Button title="Takedown" size="sm" variant="danger" onPress={() => setTakedown(r)} />
                      </Can>
                    </View>
                  </Card>
                </Appear>
              ))}
            </View>
          )}
        </>
      ) : (
        <>
          {kyc.isLoading ? (
            <SkeletonList rows={5} height={100} />
          ) : kyc.isError ? (
            <ErrorState message={errorMessage(kyc.error)} onRetry={() => kyc.refetch()} />
          ) : (kyc.data?.items ?? []).length === 0 ? (
            <EmptyState icon={ShieldCheck} title="KYC queue clear" message="No pending identity reviews." />
          ) : (
            <View style={{ gap: 10 }}>
              {(kyc.data?.items ?? []).map((k, i) => (
                <Appear key={k.id} i={i % 10}>
                  <Card kind="flat" padding={14} style={{ gap: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text variant="mono" style={{ flex: 1 }} numberOfLines={1}>
                        {k.userId.slice(0, 12)}
                      </Text>
                      <StatusBadge status={k.status} size="sm" />
                    </View>
                    <Text variant="caption" color="ink4">
                      Opened {formatDateTime(k.createdAt)}
                    </Text>
                    <Can perm="kyc:review">
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <Button title="Approve" size="sm" onPress={() => { setKycTarget({ row: k, decision: 'approved' }); setNote(''); }} />
                        <Button title="Reject" size="sm" variant="danger" onPress={() => { setKycTarget({ row: k, decision: 'rejected' }); setNote(''); }} />
                        <Button title="More info" size="sm" variant="ghost" onPress={() => { setKycTarget({ row: k, decision: 'needs_more_info' }); setNote(''); }} />
                      </View>
                    </Can>
                  </Card>
                </Appear>
              ))}
            </View>
          )}
        </>
      )}

      <Sheet
        visible={!!resolveTarget}
        onClose={() => setResolveTarget(null)}
        title={resolveTarget ? `${humanize(resolveTarget.resolution)} report?` : 'Resolve report'}
        scroll
        footer={
          <>
            <Button title="Confirm" full size="lg" loading={busy} onPress={resolve} />
            <Button title="Cancel" variant="ghost" full onPress={() => setResolveTarget(null)} />
          </>
        }
      >
        <Field label="Resolution notes" hint="Stored with the report">
          <Input value={note} onChangeText={setNote} multiline placeholder="Evidence reviewed, action taken…" />
        </Field>
      </Sheet>

      <ConfirmSheet
        visible={!!takedown}
        onClose={() => setTakedown(null)}
        onConfirm={() => {
          if (!takedown) return;
          setBusy(true);
          api
            .post(`/admin/abuse-reports/${takedown.id}/takedown`, {})
            .then(() => {
              toast.success('Takedown issued');
              setTakedown(null);
              invalidate();
            })
            .catch((e: unknown) => toast.error('Takedown failed', errorMessage(e)))
            .finally(() => setBusy(false));
        }}
        loading={busy}
        title="Issue takedown?"
        message="Removes the reported content immediately. This is destructive."
        confirmLabel="Issue takedown"
        variant="danger"
      />

      <Sheet
        visible={!!kycTarget}
        onClose={() => setKycTarget(null)}
        title={kycTarget ? `KYC · ${humanize(kycTarget.decision)}` : 'KYC decision'}
        scroll
        footer={
          <>
            <Button title="Record decision" full size="lg" loading={busy} onPress={decideKyc} />
            <Button title="Cancel" variant="ghost" full onPress={() => setKycTarget(null)} />
          </>
        }
      >
        <View style={{ gap: 14 }}>
          <Field label="Decision">
            <Select<Decision>
              value={kycTarget?.decision ?? 'approved'}
              onChange={(v) => kycTarget && setKycTarget({ row: kycTarget.row, decision: v })}
              title="KYC decision"
              options={[{ value: 'approved', label: 'Approved' }, { value: 'rejected', label: 'Rejected' }, { value: 'needs_more_info', label: 'Needs more info' }]}
            />
          </Field>
          <Field label="Reviewer notes">
            <Input value={note} onChangeText={setNote} multiline placeholder="Documents verified…" />
          </Field>
        </View>
      </Sheet>
    </Screen>
  );
}
