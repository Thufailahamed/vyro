import { Link } from 'react-router-dom';
import { useAdminCampaigns, useAdminAnalytics } from '../../hooks/useSponsored';
import { AdminPage, AdminPageHeader, StatCard, StatGrid } from '../ui';
import { ArrowRightIcon, CheckCircleIcon, ClockIcon, EyeIcon, LayersIcon, TargetIcon, TrendingUpIcon, BanknoteIcon } from '@/components/icons';

const SECTIONS = [
  { to: '/admin/sponsored/approvals', title: 'Approvals', body: 'Review campaigns waiting for a go-live decision.', icon: <CheckCircleIcon size={18} /> },
  { to: '/admin/sponsored/campaigns', title: 'Campaigns', body: 'Every campaign across suppliers, with pin and revoke controls.', icon: <TargetIcon size={18} /> },
  { to: '/admin/sponsored/plans', title: 'Plans', body: 'Bronze, silver and gold tiers with included slot credits.', icon: <BanknoteIcon size={18} /> },
  { to: '/admin/sponsored/slots', title: 'Slots', body: 'Placements on search, category, homepage and storefront.', icon: <LayersIcon size={18} /> },
  { to: '/admin/sponsored/analytics', title: 'Analytics', body: 'Impressions, clicks and click-through by campaign.', icon: <TrendingUpIcon size={18} /> },
];

export function AdminIndex() {
  const campaigns = useAdminCampaigns();
  const analytics = useAdminAnalytics();
  const live = (campaigns.data ?? []).filter((c) => c.status === 'live').length;
  const pending = (campaigns.data ?? []).filter((c) => c.status === 'pending_approval').length;
  const totals = (analytics.data?.analytics ?? []).reduce(
    (acc, r) => ({ impressions: acc.impressions + r.impressions, clicks: acc.clicks + r.clicks }),
    { impressions: 0, clicks: 0 },
  );
  const loading = campaigns.isLoading || analytics.isLoading;
  return (
    <AdminPage>
      <AdminPageHeader
        kicker="Growth · Sponsored listings"
        title="Sponsored listings"
        description="Paid placements suppliers buy across search, categories, the homepage and storefronts."
      />
      <StatGrid>
        <StatCard label="Live campaigns" value={live} sub="Currently serving" icon={<TargetIcon size={17} />} loading={campaigns.isLoading} to="/admin/sponsored/campaigns" />
        <StatCard
          label="Pending approval"
          value={pending}
          sub="Awaiting review"
          icon={<ClockIcon size={17} />}
          tone={pending > 0 ? 'warning' : 'neutral'}
          loading={campaigns.isLoading}
          to="/admin/sponsored/approvals"
        />
        <StatCard label="Impressions" value={totals.impressions.toLocaleString()} sub="All campaigns" icon={<EyeIcon size={17} />} loading={loading} />
        <StatCard
          label="Clicks"
          value={totals.clicks.toLocaleString()}
          sub={totals.impressions > 0 ? `${((totals.clicks / totals.impressions) * 100).toFixed(2)}% click-through` : 'No impressions yet'}
          icon={<TrendingUpIcon size={17} />}
          loading={loading}
        />
      </StatGrid>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {SECTIONS.map((s) => (
          <Link
            key={s.to}
            to={s.to}
            className="group vyro-surface flex items-start gap-4 p-5 transition-all duration-240 ease-vyro hover:-translate-y-0.5 hover:shadow-[inset_0_0_0_1px_rgba(12,14,11,0.12),0_18px_36px_-20px_rgba(12,14,11,0.35)]"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-[11px] bg-gradient-to-b from-paper to-bone text-ink shadow-[inset_0_0_0_1px_rgba(12,14,11,0.08),0_1px_2px_rgba(12,14,11,0.06)] transition-all duration-240 group-hover:from-ink group-hover:to-charcoal group-hover:text-volt">
              {s.icon}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-sans text-[0.9375rem] font-semibold tracking-[-0.01em] text-ink">{s.title}</h3>
                <ArrowRightIcon size={14} className="shrink-0 text-ink-4 transition-transform group-hover:translate-x-1 group-hover:text-ink" />
              </div>
              <p className="mt-1 text-xs leading-relaxed text-ink-3">{s.body}</p>
            </div>
          </Link>
        ))}
      </div>
    </AdminPage>
  );
}
