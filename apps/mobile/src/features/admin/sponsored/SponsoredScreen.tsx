import { useState } from 'react';
import { View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Award, CheckCircle2, LayoutGrid, Pin, Tag, XCircle } from 'lucide-react-native';
import {
  Button,
  Card,
  ChipRow,
  EmptyState,
  ErrorState,
  Gutter,
  Screen,
  ScreenHeader,
  SkeletonList,
  StatusBadge,
  Text,
  useToast,
} from '@/ui';
import { api, errorMessage } from '@/lib/api';
import { formatLKR, timeAgo } from '@/lib/format';
import { colors, fonts } from '@/theme/tokens';
import { MonoTag, Section, go } from '../../buyer/orders/kit';

type Tab = 'approvals' | 'campaigns' | 'plans' | 'slots';
const TABS: { value: Tab; label: string }[] = [
  { value: 'approvals', label: 'Approvals' },
  { value: 'campaigns', label: 'Campaigns' },
  { value: 'plans', label: 'Plans' },
  { value: 'slots', label: 'Slots' },
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
    <Screen scroll>
      <ScreenHeader back kicker="Paid placement" title="Sponsored" subtitle="Approval queue, live campaigns, subscription plans and slot inventory." />
      <Gutter style={{ gap: 14 }}>
        <ChipRow options={TABS} value={tab} onChange={setTab} />
        {tab === 'approvals' ? <ApprovalsTab /> : null}
        {tab === 'campaigns' ? <CampaignsTab /> : null}
        {tab === 'plans' ? <PlansTab /> : null}
        {tab === 'slots' ? <SlotsTab /> : null}
      </Gutter>
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
        <Card key={c.id} padding={14} style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
            <Text variant="bodySm" weight="semibold" style={{ flex: 1 }} numberOfLines={1}>
              {c.supplierName ?? c.supplierId ?? 'Supplier'}
            </Text>
            <StatusBadge status={c.status} size="sm" />
          </View>
          <Text variant="caption" color="ink4">
            {c.productName ?? 'Campaign'} · {c.surface ?? 'search'} · {formatLKR(c.budgetCents ?? 0)} budget
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button title="Approve" icon={CheckCircle2} size="sm" variant="volt" style={{ flex: 1 }} loading={act.isPending} onPress={() => act.mutate({ id: c.id, action: 'approve' })} />
            <Button title="Reject" icon={XCircle} size="sm" variant="danger" style={{ flex: 1 }} onPress={() => act.mutate({ id: c.id, action: 'reject' })} />
          </View>
        </Card>
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
        <Card key={c.id} padding={14} style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
            <Text variant="bodySm" weight="semibold" numberOfLines={1} style={{ flex: 1 }}>
              {c.supplierName ?? c.supplierId ?? 'Supplier'}
            </Text>
            <StatusBadge status={c.status} size="sm" />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {c.surface ? <MonoTag label={c.surface} tone="copper" /> : null}
            <Text variant="caption" color="ink4">
              {c.productName ?? '—'} · {formatLKR(c.budgetCents ?? 0)}
            </Text>
            {c.createdAt ? (
              <Text variant="caption" color="ink5">
                {timeAgo(c.createdAt)}
              </Text>
            ) : null}
          </View>
          {c.status === 'active' || c.status === 'approved' ? (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button title="Pin" icon={Pin} size="sm" variant="secondary" onPress={() => act.mutate({ id: c.id, action: 'pin' })} />
              <Button title="Revoke" icon={XCircle} size="sm" variant="danger" onPress={() => act.mutate({ id: c.id, action: 'revoke' })} />
            </View>
          ) : null}
        </Card>
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
        <Card key={p.id} padding={14} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
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
              <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text variant="bodySm" weight="medium">
                    #{s.position} {s.label}
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
      <Button title="View buyer disclosure" variant="ghost" size="sm" onPress={() => go('/sponsored-disclosure')} />
    </View>
  );
}
