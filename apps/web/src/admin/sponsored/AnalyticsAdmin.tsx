import { useAdminAnalytics } from '../../hooks/useSponsored';
import { AdminPage, AdminPageHeader, EmptyBlock, TableCard, TableSkeleton } from '../ui';
import { TrendingUpIcon } from '@/components/icons';

export function AnalyticsAdmin() {
  const analytics = useAdminAnalytics();
  const rows = analytics.data?.analytics ?? [];
  return (
    <AdminPage>
      <AdminPageHeader
        back={{ to: '/admin/sponsored', label: 'Sponsored listings' }}
        kicker="Sponsored · Performance"
        title="Analytics"
        description="Impressions, clicks and click-through rate for every sponsored campaign."
      />
      <TableCard title="Campaign performance" description={`${rows.length} campaign${rows.length === 1 ? '' : 's'}`}>
        {analytics.isLoading ? (
          <TableSkeleton cols={4} />
        ) : rows.length === 0 ? (
          <EmptyBlock icon={<TrendingUpIcon size={20} />} title="No performance data yet" description="Numbers appear once sponsored campaigns start serving impressions." />
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Campaign</th>
                <th className="num">Impressions</th>
                <th className="num">Clicks</th>
                <th className="num">CTR</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const ctr = r.impressions > 0 ? ((r.clicks / r.impressions) * 100).toFixed(2) : '0.00';
                return (
                  <tr key={r.campaignId}>
                    <td className="font-mono text-xs">{r.campaignId.slice(0, 8)}</td>
                    <td className="num">{r.impressions.toLocaleString()}</td>
                    <td className="num">{r.clicks.toLocaleString()}</td>
                    <td className="num">{ctr}%</td>
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
