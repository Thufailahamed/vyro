import React from 'react';
import { useAdminAnalytics } from '../../hooks/useSponsored';

export function AnalyticsAdmin() {
  const analytics = useAdminAnalytics();
  const rows = analytics.data?.analytics ?? [];
  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold">Analytics</h1>
      {analytics.isLoading ? <div className="mt-4">Loading…</div> : null}
      <table className="mt-4 w-full text-sm">
        <thead className="text-left text-gray-500">
          <tr><th>Campaign</th><th>Impressions</th><th>Clicks</th><th>CTR</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const ctr = r.impressions > 0 ? ((r.clicks / r.impressions) * 100).toFixed(2) : '0.00';
            return (
              <tr key={r.campaignId} className="border-t">
                <td className="py-2 font-mono text-xs">{r.campaignId.slice(0, 8)}</td>
                <td>{r.impressions}</td>
                <td>{r.clicks}</td>
                <td>{ctr}%</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}