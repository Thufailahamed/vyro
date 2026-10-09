import { useMemo, useState } from 'react';
import { useAdminAnalytics, useAdminCampaigns } from '../../hooks/useSponsored';
import { AdminPage, AdminPageHeader, CellStack, EmptyBlock, Segmented, StatCard, StatGrid, StatusPill, TableCard, TableSkeleton } from '../ui';
import { EyeIcon, TargetIcon, TrendingUpIcon } from '@/components/icons';
import { CtrMeter, DAY, SponsoredNav, ctrOf, fmtCount, fmtCtr, nowSec, shortId } from './sponsoredUi';

type RangeKey = '7' | '30' | '90' | 'all';

const RANGES: ReadonlyArray<{ key: RangeKey; label: string }> = [
  { key: '7', label: '7 days' },
  { key: '30', label: '30 days' },
  { key: '90', label: '90 days' },
  { key: 'all', label: 'All time' },
];

/** The range start is captured when the range is picked, so the query key stays stable between renders. */
const rangeFrom = (key: RangeKey) => (key === 'all' ? undefined : nowSec() - Number(key) * DAY);

export function AnalyticsAdmin() {
  const [range, setRange] = useState<{ key: RangeKey; from: number | undefined }>(() => ({ key: '30', from: rangeFrom('30') }));
  const analytics = useAdminAnalytics(range.from);
  const campaigns = useAdminCampaigns();

  const rows = analytics.data?.analytics ?? [];
  const bySupplier = useMemo(() => new Map((campaigns.data ?? []).map((c) => [c.id, c])), [campaigns.data]);
  const sorted = useMemo(() => [...rows].sort((a, b) => b.impressions - a.impressions), [rows]);
  const totals = rows.reduce((acc, r) => ({ impressions: acc.impressions + r.impressions, clicks: acc.clicks + r.clicks }), { impressions: 0, clicks: 0 });
  const maxCtr = Math.max(0, ...rows.map((r) => ctrOf(r.impressions, r.clicks)));
  const rangeLabel = RANGES.find((r) => r.key === range.key)?.label.toLowerCase() ?? '';

  return (
    <AdminPage>
      <AdminPageHeader
        kicker="Sponsored · Performance"
        title="Analytics"
        description="Impressions, clicks and click-through rate for every sponsored campaign."
        actions={
          <Segmented
            ariaLabel="Date range"
            items={RANGES}
            value={range.key}
            onChange={(key) => setRange({ key, from: rangeFrom(key) })}
          />
        }
      />
      <SponsoredNav />

      <StatGrid cols={3}>
        <StatCard label="Impressions" value={fmtCount(totals.impressions)} sub={`Across ${rangeLabel === 'all time' ? 'all time' : `the last ${rangeLabel}`}`} icon={<EyeIcon size={17} />} loading={analytics.isLoading} />
        <StatCard label="Clicks" value={fmtCount(totals.clicks)} sub="Taps through to the listing" icon={<TargetIcon size={17} />} loading={analytics.isLoading} />
        <StatCard
          label="Click-through"
          value={fmtCtr(totals.impressions, totals.clicks)}
          sub={rows.length > 0 ? `${fmtCount(rows.length)} campaign${rows.length === 1 ? '' : 's'} reporting` : 'No campaigns reporting'}
          icon={<TrendingUpIcon size={17} />}
          loading={analytics.isLoading}
        />
      </StatGrid>

      <TableCard
        title="Campaign performance"
        description={`Ranked by impressions · ${rangeLabel}`}
      >
        {analytics.isLoading ? (
          <TableSkeleton cols={5} />
        ) : sorted.length === 0 ? (
          <EmptyBlock
            icon={<TrendingUpIcon size={20} />}
            title="No performance data yet"
            description="Numbers appear once sponsored campaigns start serving impressions in this range."
          />
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Campaign</th>
                <th>Status</th>
                <th className="num">Impressions</th>
                <th className="num">Clicks</th>
                <th>Click-through</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => {
                const campaign = bySupplier.get(r.campaignId);
                return (
                  <tr key={r.campaignId}>
                    <td>
                      <CellStack
                        mono
                        primary={shortId(r.campaignId)}
                        secondary={campaign ? `Supplier ${shortId(campaign.supplierId)}` : 'Not in current list'}
                      />
                    </td>
                    <td>{campaign ? <StatusPill status={campaign.status} /> : <span className="text-xs text-ink-5">—</span>}</td>
                    <td className="num">{fmtCount(r.impressions)}</td>
                    <td className="num">{fmtCount(r.clicks)}</td>
                    <td>
                      <CtrMeter ctr={ctrOf(r.impressions, r.clicks)} max={maxCtr} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </TableCard>
    </AdminPage>
  );
}
