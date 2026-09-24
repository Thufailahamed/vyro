import { useState } from 'react';
import { View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Award, BarChart3, CheckCircle2, Crown, LayoutGrid, Megaphone, Pin, Tag, XCircle } from 'lucide-react-native';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  IconTile,
  Screen,
  Segmented,
  SkeletonList,
  StatusBadge,
  Text,
  useToast,
} from '@/ui';
import { api, errorMessage } from '@/lib/api';
import { formatLKR, timeAgo } from '@/lib/format';
import { colors, fonts } from '@/theme/tokens';
import { MonoTag, Section, go } from '../../buyer/orders/kit';
import { RecordCard } from '@/features/admin/ops/kit';

type Tab = 'approvals' | 'campaigns' | 'plans' | 'slots' | 'analytics';
const TABS: { value: Tab; label: string }[] = [
  { value: 'approvals', label: 'Approvals' },
  { value: 'campaigns', label: 'Campaigns' },
  { value: 'plans', label: 'Plans' },
  { value: 'slots', label: 'Slots' },
  { value: 'analytics', label: 'Analytics' },
];

type Campaign = {
  id: string;
  supplierName?: string | null;
  supplierId?: string;
  productName?: string | null;
  status: string;
  surface?: string;
  budgetCents?: number;
  createdAt?: number;
};
type Plan = { id: string; tier: string; name: string; monthlyRateCents: number; includedSlotCredits: number; active: boolean };
type Slot = { id: string; surface: string; position: number; categoryId: string | null; label: string; dailyRateCents: number; active: boolean };

/** /admin/sponsored — approvals queue, campaigns, plans and slot inventory. */
export function AdminSponsoredScreen() {
  const [tab, setTab] = useState<Tab>('approvals');
  return (
    <Screen scroll back kicker="Paid placement" title="Sponsored" subtitle="Approval queue, live campaigns, subscription plans and slot inventory." gap={14}>
      <View style={{ gap: 14 }}>
        <Segmented options={TABS} value={tab} onChange={setTab} />
        {tab === 'approvals' ? <ApprovalsTab /> : null}
        {tab === 'campaigns' ? <CampaignsTab /> : null}
        {tab === 'plans' ? <PlansTab /> : null}
        {tab === 'slots' ? <SlotsTab /> : null}
        {tab === 'analytics' ? <AnalyticsTab /> : null}
      </View>
    </Screen>
  );
}

function useCampaigns(status?: string) {
  return useQuery({
    queryKey: ['admin-sponsored-campaigns', status ?? 'all'],
    queryFn: () => api.get<Campaign[] | { campaigns: Campaign[] }>(`/admin/sponsored/campaigns${status ? `?status=${status}` : ''}`),
    select: (d) => (Array.isArray(d) ? d : d.campaigns ?? []),
  });
}

function ApprovalsTab() {
  const toast = useToast();
  const qc = useQueryClient();
  const q = useCampaigns('pending');
  const act = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'approve' | 'reject' }) =>
      action === 'approve' ? api.post(`/admin/sponsored/campaigns/${id}/approve`, {}) : api.post(`/admin/sponsored/campaigns/${id}/reject`, { reason: 'Rejected from console' }),
    onSuccess: () => {
      toast.success('Campaign updated');
      qc.invalidateQueries({ queryKey: ['admin-sponsored-campaigns'] });
    },
    onError: (e) => toast.error('Action failed', errorMessage(e)),
  });
  const rows = q.data ?? [];
  if (q.isLoading) return <SkeletonList rows={3} height={90} />;
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  if (!rows.length) return <EmptyState icon={CheckCircle2} title="Queue clear" message="No campaigns waiting for review." />;
  return (
    <View style={{ gap: 10 }}>
      {rows.map((c) => (
        <RecordCard
          key={c.id}
          icon={Megaphone}
          tone="copper"
          title={c.supplierName ?? c.supplierId ?? 'Supplier'}
          subtitle={`${c.productName ?? 'Campaign'} · ${c.surface ?? 'search'}`}
          amount={formatLKR(c.budgetCents ?? 0)}
          status={<StatusBadge status={c.status} size="sm" />}
          actions={
            <View style={{ flexDirection: 'row', gap: 8, flex: 1 }}>
              <Button title="Approve" icon={CheckCircle2} size="sm" variant="volt" style={{ flex: 1 }} loading={act.isPending} onPress={() => act.mutate({ id: c.id, action: 'approve' })} />
              <Button title="Reject" icon={XCircle} size="sm" variant="danger" style={{ flex: 1 }} onPress={() => act.mutate({ id: c.id, action: 'reject' })} />
            </View>
          }
        />
      ))}
    </View>
  );
}

function CampaignsTab() {
  const toast = useToast();
  const qc = useQueryClient();
  const q = useCampaigns();
  const act = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'pin' | 'revoke' }) =>
      action === 'pin' ? api.post(`/admin/sponsored/campaigns/${id}/pin`, {}) : api.post(`/admin/sponsored/campaigns/${id}/revoke`, { reason: 'Revoked from console' }),
    onSuccess: () => {
      toast.success('Updated');
      qc.invalidateQueries({ queryKey: ['admin-sponsored-campaigns'] });
    },
    onError: (e) => toast.error('Action failed', errorMessage(e)),
  });
  const rows = q.data ?? [];
  if (q.isLoading) return <SkeletonList rows={4} height={80} />;
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  if (!rows.length) return <EmptyState icon={Award} title="No campaigns" />;
  return (
    <View style={{ gap: 10 }}>
      {rows.map((c) => (
        <RecordCard
          key={c.id}
          icon={Award}
          tone={c.status === 'active' || c.status === 'approved' ? 'volt' : 'paper'}
          title={c.supplierName ?? c.supplierId ?? 'Supplier'}
          subtitle={c.productName ?? '—'}
          meta={c.createdAt ? timeAgo(c.createdAt) : null}
          amount={formatLKR(c.budgetCents ?? 0)}
          status={<StatusBadge status={c.status} size="sm" />}
          chips={c.surface ? <MonoTag label={c.surface} tone="copper" /> : undefined}
          actions={
            c.status === 'active' || c.status === 'approved' ? (
              <>
                <Button title="Pin" icon={Pin} size="sm" variant="paper" onPress={() => act.mutate({ id: c.id, action: 'pin' })} />
                <Button title="Revoke" icon={XCircle} size="sm" variant="danger" onPress={() => act.mutate({ id: c.id, action: 'revoke' })} />
              </>
            ) : undefined
          }
        />
      ))}
    </View>
  );
}

function PlansTab() {
  const q = useQuery({ queryKey: ['admin-sponsored-plans'], queryFn: () => api.get<Plan[]>('/admin/sponsored/plans') });
  const rows = q.data ?? [];
  if (q.isLoading) return <SkeletonList rows={3} height={80} />;
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  if (!rows.length) return <EmptyState icon={Tag} title="No plans" />;
  return (
    <View style={{ gap: 10 }}>
      {rows.map((p) => (
        <Card key={p.id} padding={16} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <IconTile icon={Crown} tone={p.tier === 'gold' ? 'volt' : p.tier === 'silver' ? 'ink' : 'copper'} size={44} />
          <View style={{ flex: 1, gap: 3 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text variant="bodySm" weight="semibold">
                {p.name}
              </Text>
              <MonoTag label={p.tier} tone={p.tier === 'gold' ? 'copper' : p.tier === 'silver' ? 'ink' : 'amber'} />
            </View>
            <Text variant="caption" color="ink4">
              {p.includedSlotCredits} slot credit{p.includedSlotCredits === 1 ? '' : 's'} / month
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 3 }}>
            <Text style={{ fontFamily: fonts.monoMedium, fontSize: 15, color: colors.ink }}>{formatLKR(p.monthlyRateCents)}</Text>
            <StatusBadge status={p.active ? 'active' : 'inactive'} size="sm" label={p.active ? 'Active' : 'Inactive'} />
          </View>
        </Card>
      ))}
    </View>
  );
}

type AnalyticsRow = { campaignId: string; impressions: number; clicks: number };

function AnalyticsTab() {
  const q = useQuery({
    queryKey: ['admin-sponsored-analytics'],
    queryFn: () => api.get<{ analytics: AnalyticsRow[] }>('/admin/sponsored/analytics'),
  });
  const rows = q.data?.analytics ?? [];
  const totals = rows.reduce((acc, r) => ({ impressions: acc.impressions + r.impressions, clicks: acc.clicks + r.clicks }), { impressions: 0, clicks: 0 });
  if (q.isLoading) return <SkeletonList rows={4} height={64} />;
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  if (!rows.length) return <EmptyState icon={BarChart3} title="No events yet" message="Impressions and clicks appear once campaigns start serving." />;
  const ctr = totals.impressions > 0 ? ((totals.clicks / totals.impressions) * 100).toFixed(2) : '0.00';
  return (
    <View style={{ gap: 12 }}>
      <Section kicker="Totals" title="All campaigns" icon={BarChart3}>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Stat label="Impressions" value={String(totals.impressions)} />
          <Stat label="Clicks" value={String(totals.clicks)} />
          <Stat label="CTR" value={`${ctr}%`} />
        </View>
      </Section>
      <View style={{ gap: 10 }}>
        {rows.map((r) => {
          const rCtr = r.impressions > 0 ? ((r.clicks / r.impressions) * 100).toFixed(2) : '0.00';
          return (
            <RecordCard
              key={r.campaignId}
              icon={BarChart3}
              tone="ink"
              title={`Campaign ${r.campaignId.slice(0, 8)}`}
              titleMono
              subtitle={`${r.impressions} impressions · ${r.clicks} clicks`}
              amount={`${rCtr}%`}
            />
          );
        })}
      </View>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Text variant="overline" color="ink5">
        {label}
      </Text>
      <Text style={{ fontFamily: fonts.monoMedium, fontSize: 17, color: colors.ink }}>{value}</Text>
    </View>
  );
}

function SlotsTab() {
  const q = useQuery({ queryKey: ['admin-sponsored-slots'], queryFn: () => api.get<Slot[]>('/admin/sponsored/slots') });
  const rows = q.data ?? [];
  if (q.isLoading) return <SkeletonList rows={4} height={64} />;
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  if (!rows.length) return <EmptyState icon={LayoutGrid} title="No slots" />;
  const bySurface = rows.reduce<Record<string, Slot[]>>((acc, s) => {
    (acc[s.surface] ??= []).push(s);
    return acc;
  }, {});
  return (
    <View style={{ gap: 14 }}>
      {Object.entries(bySurface).map(([surface, slots]) => (
        <Section key={surface} kicker={surface} title={`${surface} slots`} icon={LayoutGrid}>
          {slots
            .sort((a, b) => a.position - b.position)
            .map((s) => (
              <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <View style={{ minWidth: 34, height: 34, borderRadius: 11, borderCurve: 'continuous', backgroundColor: colors.bone, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontFamily: fonts.monoMedium, fontSize: 12.5, color: colors.ink }}>#{s.position}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="bodySm" weight="medium">
                    {s.label}
                  </Text>
                  <Text variant="caption" color="ink4">
                    {formatLKR(s.dailyRateCents)}/day{s.categoryId ? ` · category ${s.categoryId.slice(0, 8)}` : ''}
                  </Text>
                </View>
                <StatusBadge status={s.active ? 'active' : 'inactive'} size="sm" label={s.active ? 'Live' : 'Off'} />
              </View>
            ))}
        </Section>
      ))}
      <Button title="View buyer disclosure" variant="paper" size="sm" onPress={() => go('/sponsored-disclosure')} style={{ alignSelf: 'center' }} />
    </View>
  );
}
