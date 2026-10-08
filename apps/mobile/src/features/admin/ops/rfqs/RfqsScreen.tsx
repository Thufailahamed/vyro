import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardList, FileText, Timer } from 'lucide-react-native';
import { api, errorMessage } from '@/lib/api';
import { formatDate, formatLKR, humanize, timeAgo } from '@/lib/format';
import {
  Button,
  ChipRow,
  ConfirmSheet,
  EmptyState,
  ErrorState,
  InkHero,
  Screen,
  SearchBar,
  SkeletonList,
  StatusBadge,
  useToast,
} from '@/ui';
import { Appear } from '@/features/admin/platform/kit';
import { colors } from '@/theme/tokens';
import { useDebounced } from '@/features/admin/ops/kit/hooks';
import { HeroFigure, HeroPipeline, HeroTopline, Pill, RecordCard } from '@/features/admin/ops/kit';

interface AdminRfqRow {
  id: string;
  businessId: string;
  rfqNumber: string;
  title: string;
  description: string | null;
  status: string;
  deadline: number | null;
  createdAt: number;
  awardedQuoteId: string | null;
  deliveryCity: string | null;
  deliveryDistrict: string | null;
  businessName: string | null;
}

type Group = 'all' | 'open' | 'review' | 'awarded' | 'closed';

const GROUP_MATCH: Record<Group, (s: string) => boolean> = {
  all: () => true,
  open: (s) => ['open', 'quoting'].includes(s),
  review: (s) => ['quotes_received', 'under_review'].includes(s),
  awarded: (s) => ['awarded', 'converted_to_order'].includes(s),
  closed: (s) => ['expired', 'cancelled', 'closed', 'draft'].includes(s),
};

/** Mirrors web AdminRfqsPage (GET /rfqs, /rfqs/thresholds, POST /rfqs/admin/expire). */
export function RfqsScreen() {
  const [group, setGroup] = useState<Group>('all');
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search.trim().toLowerCase(), 300);
  const toast = useToast();
  const qc = useQueryClient();
  const [sweepOpen, setSweepOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const list = useQuery({ queryKey: ['admin-rfqs'], queryFn: () => api.get<{ rfqs: AdminRfqRow[] }>('/rfqs'), refetchInterval: 60_000 });
  const thresholds = useQuery({ queryKey: ['rfq-thresholds'], queryFn: () => api.get<{ valueThresholdCents: number; quantityThreshold: number }>('/rfqs/thresholds') });

  const all = useMemo(() => list.data?.rfqs ?? [], [list.data]);
  const rows = useMemo(
    () =>
      all.filter((r) => {
        if (!GROUP_MATCH[group](String(r.status).toLowerCase())) return false;
        if (debounced && !`${r.title} ${r.rfqNumber} ${r.businessName ?? ''}`.toLowerCase().includes(debounced)) return false;
        return true;
      }),
    [all, group, debounced],
  );
  const counts = useMemo(() => {
    const c: Record<Group, number> = { all: all.length, open: 0, review: 0, awarded: 0, closed: 0 };
    for (const r of all) {
      const s = String(r.status).toLowerCase();
      if (GROUP_MATCH.open(s)) c.open++;
      else if (GROUP_MATCH.review(s)) c.review++;
      else if (GROUP_MATCH.awarded(s)) c.awarded++;
      else if (GROUP_MATCH.closed(s)) c.closed++;
    }
    return c;
  }, [all]);

  const sweep = async () => {
    setBusy(true);
    try {
      const r = await api.post<{ rfqsExpired: number; quotesExpired: number; reminders: number }>('/rfqs/admin/expire', {});
      toast.success('Expiry sweep complete', `${r.rfqsExpired} RFQs · ${r.quotesExpired} quotes · ${r.reminders} reminders.`);
      setSweepOpen(false);
      qc.invalidateQueries({ queryKey: ['admin-rfqs'] });
    } catch (e) {
      toast.error('Sweep failed', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      back
      kicker="Operations"
      title="RFQs"
      subtitle="Quote requests awaiting supplier bids."
      right={<Button title="Expiry sweep" icon={Timer} size="sm" variant="paper" onPress={() => setSweepOpen(true)} />}
      onRefresh={() => Promise.all([list.refetch(), thresholds.refetch()])}
    >
      <Appear>
        <InkHero seed="admin-rfqs" style={{ padding: 18 }}>
          <HeroTopline icon={ClipboardList} label="Open pipeline" status={`Bulk ≥ ${thresholds.data ? formatLKR(thresholds.data.valueThresholdCents) : '…'}`} />
          <HeroFigure value={counts.open} caption="RFQs awaiting supplier quotes" />
          <HeroPipeline
            segments={[
              { label: 'Open', value: counts.open, color: colors.volt },
              { label: 'Review', value: counts.review, color: colors.copper },
              { label: 'Awarded', value: counts.awarded, color: colors.mint },
              { label: 'Closed', value: counts.closed, color: colors.ink4 },
            ]}
          />
        </InkHero>
      </Appear>

      <SearchBar value={search} onChangeText={setSearch} placeholder="Title, RFQ#, business…" />
      <ChipRow<Group>
        value={group}
        onChange={setGroup}
        options={(Object.keys(counts) as Group[]).map((g) => ({ value: g, label: humanize(g), count: counts[g] }))}
      />

      {list.isLoading ? (
        <SkeletonList rows={5} height={110} />
      ) : list.isError ? (
        <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState icon={FileText} title="No RFQs" message="Nothing in this bucket right now." />
      ) : (
        <View style={{ gap: 10 }}>
          {rows.map((r, i) => (
            <Appear key={r.id} i={i % 10}>
              <RecordCard
                icon={FileText}
                tone={GROUP_MATCH.awarded(String(r.status).toLowerCase()) ? 'volt' : GROUP_MATCH.closed(String(r.status).toLowerCase()) ? 'paper' : 'ink'}
                title={r.title}
                subtitle={`${r.businessName ?? 'Unknown buyer'}${r.deliveryCity ? ` · ${r.deliveryCity}` : ''}`}
                meta={`${timeAgo(r.createdAt)}${r.deadline ? ` · closes ${formatDate(r.deadline)}` : ''}`}
                status={<StatusBadge status={r.status} size="sm" />}
                chips={<Pill label={r.rfqNumber} />}
              />
            </Appear>
          ))}
        </View>
      )}

      <ConfirmSheet
        visible={sweepOpen}
        onClose={() => setSweepOpen(false)}
        onConfirm={sweep}
        loading={busy}
        title="Run expiry sweep?"
        message="Expires past-deadline RFQs and quotes, and dispatches reminders."
        confirmLabel="Run sweep"
      />
    </Screen>
  );
}
