import React from 'react';
import { Link } from 'react-router-dom';
import { useCampaigns, useInvoices } from '../../hooks/useSponsored';
import { useSupplierId } from '../useSupplierId';

export function SponsoredIndex() {
  const { supplierId } = useSupplierId();
  const campaigns = useCampaigns(supplierId);
  const invoices = useInvoices(supplierId);
  const active = (campaigns.data ?? []).filter((c) => c.status === 'live').length;
  const expiringSoon = (campaigns.data ?? []).filter(
    (c) => c.status === 'live' && c.endsAt - Math.floor(Date.now() / 1000) < 3 * 86400,
  ).length;
  const pendingInvoices = (invoices.data ?? []).filter((i) => i.status === 'pending').length;
  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold">Sponsored listings</h1>
      <div className="mt-4 grid grid-cols-3 gap-4">
        <Kpi label="Active campaigns" value={active} />
        <Kpi label="Expiring soon (3d)" value={expiringSoon} />
        <Kpi label="Pending invoices" value={pendingInvoices} />
      </div>
      <nav className="mt-6 flex gap-3 text-sm">
        <Link to="/supplier/sponsored/plans" className="underline">Plans</Link>
        <Link to="/supplier/sponsored/subscriptions" className="underline">Subscription</Link>
        <Link to="/supplier/sponsored/slots" className="underline">Browse slots</Link>
        <Link to="/supplier/sponsored/campaigns" className="underline">My campaigns</Link>
        <Link to="/supplier/sponsored/invoices" className="underline">Invoices</Link>
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