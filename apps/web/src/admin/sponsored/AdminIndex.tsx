import React from 'react';
import { Link } from 'react-router-dom';
import { useAdminCampaigns, useAdminAnalytics } from '../../hooks/useSponsored';

export function AdminIndex() {
  const campaigns = useAdminCampaigns();
  const analytics = useAdminAnalytics();
  const live = (campaigns.data ?? []).filter((c) => c.status === 'live').length;
  const pending = (campaigns.data ?? []).filter((c) => c.status === 'pending_approval').length;
  const totals = (analytics.data?.analytics ?? []).reduce(
    (acc, r) => ({ impressions: acc.impressions + r.impressions, clicks: acc.clicks + r.clicks }),
    { impressions: 0, clicks: 0 },
  );
  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold">Sponsored listings (admin)</h1>
      <div className="mt-4 grid grid-cols-4 gap-4">
        <Kpi label="Live campaigns" value={live} />
        <Kpi label="Pending approval" value={pending} />
        <Kpi label="Total impressions" value={totals.impressions} />
        <Kpi label="Total clicks" value={totals.clicks} />
      </div>
      <nav className="mt-6 flex gap-3 text-sm">
        <Link to="/admin/sponsored/plans" className="underline">Plans</Link>
        <Link to="/admin/sponsored/slots" className="underline">Slots</Link>
        <Link to="/admin/sponsored/approvals" className="underline">Approvals</Link>
        <Link to="/admin/sponsored/campaigns" className="underline">Campaigns</Link>
        <Link to="/admin/sponsored/analytics" className="underline">Analytics</Link>
      </nav>
    </div>
  );
}
function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border p-4">
      <div className="text-sm text-gray-500">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  );
}