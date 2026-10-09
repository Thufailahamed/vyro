import { Link } from 'react-router-dom';
import { useAdminAnalytics, useAdminCampaigns, useAdminPlans, useAdminSlots } from '../../hooks/useSponsored';
import { AdminPage, AdminPageHeader, Panel, StatCard, StatGrid, buttonClass } from '../ui';
import { ArrowRightIcon, BanknoteIcon, CheckCircleIcon, ClockIcon, EyeIcon, LayersIcon, TargetIcon, TrendingUpIcon } from '@/components/icons';
import { PipelineBar, fmtCount, fmtCtr } from './sponsoredUi';

export function AdminIndex() {
  const campaigns = useAdminCampaigns();
  const analytics = useAdminAnalytics();
  const plans = useAdminPlans();
  const slots = useAdminSlots();

  const all = campaigns.data ?? [];
  const live = all.filter((c) => c.status === 'live').length;
  const pending = all.filter((c) => c.status === 'pending_approval').length;
  const totals = (analytics.data?.analytics ?? []).reduce(
    (acc, r) => ({ impressions: acc.impressions + r.impressions, clicks: acc.clicks + r.clicks }),
    { impressions: 0, clicks: 0 },
  );
  const planList = plans.data ?? [];
  const slotList = slots.data ?? [];
  const activeSlots = slotList.filter((s) => s.active).length;
  const loading = campaigns.isLoading || analytics.isLoading;

  const sections = [
    {
      to: '/admin/sponsored/approvals',
      title: 'Approvals',
      body: 'Review campaigns waiting for a go-live decision.',
      icon: <CheckCircleIcon size={18} />,
      metric: fmtCount(pending),
      metricLabel: 'waiting for review',
      attention: pending > 0,
    },
    {
      to: '/admin/sponsored/campaigns',
      title: 'Campaigns',
      body: 'Every campaign across suppliers, with pin and revoke controls.',
      icon: <TargetIcon size={18} />,
      metric: fmtCount(all.length),
      metricLabel: all.length === 1 ? 'campaign' : 'campaigns',
      attention: false,
    },
    {
      to: '/admin/sponsored/plans',
      title: 'Plans',
      body: 'Bronze, silver and gold tiers with included slot credits.',
      icon: <BanknoteIcon size={18} />,
      metric: `${planList.filter((p) => p.active).length}/${planList.length}`,
      metricLabel: 'active',
      attention: false,
    },
    {
      to: '/admin/sponsored/slots',
      title: 'Slots',
      body: 'Placements on search, category, homepage and storefront.',
      icon: <LayersIcon size={18} />,
      metric: fmtCount(activeSlots),
      metricLabel: 'active placements',
      attention: false,
    },
    {
      to: '/admin/sponsored/analytics',
      title: 'Analytics',
      body: 'Impressions, clicks and click-through by campaign.',
      icon: <TrendingUpIcon size={18} />,
      metric: fmtCtr(totals.impressions, totals.clicks),
      metricLabel: 'click-through',
      attention: false,
    },
  ];

  return (
    <AdminPage>
      <AdminPageHeader
        kicker="Growth · Sponsored listings"
        title="Sponsored listings"
        description="Paid placements suppliers buy across search, categories, the homepage and storefronts."
      />

      <section className="relative overflow-hidden rounded-[22px] bg-ink p-6 text-paper shadow-[0_24px_60px_-28px_rgba(12,14,11,0.7),inset_0_0_0_1px_rgba(250,247,240,0.06)] sm:p-8">
        <div className="pointer-events-none absolute -right-20 -top-24 size-80 rounded-full bg-volt/25 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-28 left-1/3 size-64 rounded-full bg-copper/20 blur-3xl" aria-hidden />
        <div className="relative flex flex-col gap-7 md:flex-row md:items-end md:justify-between">
          <div className="max-w-xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-paper/50">Right now</p>
            <p className="mt-3 font-display text-2xl font-bold leading-[1.15] tracking-[-0.03em] sm:text-[1.75rem]">
              {campaigns.isLoading ? 'Loading placements…' : `${live} sponsored ${live === 1 ? 'placement is' : 'placements are'} live.`}
            </p>
            <p className="mt-2.5 text-sm leading-relaxed text-paper/60">
              {pending > 0
                ? `${pending} ${pending === 1 ? 'campaign is' : 'campaigns are'} waiting for a go-live decision.`
                : 'Nothing is waiting for review. New supplier submissions will appear in the approval queue.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/admin/sponsored/approvals" className={buttonClass('volt', 'md')}>
              <ClockIcon size={14} />
              Review queue{pending > 0 ? ` (${pending})` : ''}
            </Link>
            <Link to="/admin/sponsored/campaigns" className={buttonClass('secondary', 'md', 'border-paper/10 bg-paper/[0.06] text-paper hover:bg-paper/[0.12]')}>
              All campaigns
              <ArrowRightIcon size={14} />
            </Link>
          </div>
        </div>
      </section>

      <StatGrid>
        <StatCard
          label="Live campaigns"
          value={fmtCount(live)}
          sub="Currently serving"
          icon={<TargetIcon size={17} />}
          loading={campaigns.isLoading}
          to="/admin/sponsored/campaigns"
        />
        <StatCard
          label="Pending approval"
          value={fmtCount(pending)}
          sub="Awaiting review"
          icon={<ClockIcon size={17} />}
          tone={pending > 0 ? 'warning' : 'neutral'}
          loading={campaigns.isLoading}
          to="/admin/sponsored/approvals"
        />
        <StatCard label="Impressions" value={fmtCount(totals.impressions)} sub="All campaigns" icon={<EyeIcon size={17} />} loading={loading} />
        <StatCard
          label="Clicks"
          value={fmtCount(totals.clicks)}
          sub={totals.impressions > 0 ? `${fmtCtr(totals.impressions, totals.clicks)} click-through` : 'No impressions yet'}
          icon={<TrendingUpIcon size={17} />}
          loading={loading}
          to="/admin/sponsored/analytics"
        />
      </StatGrid>

      <Panel title="Campaign pipeline" description="Every campaign by where it sits in the approval and payment flow." icon={<TargetIcon size={16} />}>
        {campaigns.isLoading ? <div className="h-16 animate-pulse rounded-xl bg-ink/[0.04]" /> : <PipelineBar statuses={all.map((c) => c.status)} />}
      </Panel>

      <div>
        <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-4">Manage</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sections.map((s) => (
            <Link
              key={s.to}
              to={s.to}
              className="group vyro-surface flex flex-col justify-between gap-6 p-5 transition-all duration-240 ease-vyro hover:-translate-y-0.5 hover:shadow-[inset_0_0_0_1px_rgba(12,14,11,0.12),0_18px_36px_-20px_rgba(12,14,11,0.35)]"
            >
              <div className="flex items-start justify-between gap-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-[11px] bg-gradient-to-b from-paper to-bone text-ink shadow-[inset_0_0_0_1px_rgba(12,14,11,0.08),0_1px_2px_rgba(12,14,11,0.06)] transition-all duration-240 group-hover:from-ink group-hover:to-charcoal group-hover:text-volt">
                  {s.icon}
                </span>
                <ArrowRightIcon size={14} className="mt-1 shrink-0 text-ink-4 transition-transform group-hover:translate-x-1 group-hover:text-ink" />
              </div>
              <div>
                <h3 className="font-sans text-[0.9375rem] font-semibold tracking-[-0.01em] text-ink">{s.title}</h3>
                <p className="mt-1 text-xs leading-relaxed text-ink-4">{s.body}</p>
              </div>
              <div className="flex items-baseline justify-between gap-3 border-t border-ink/[0.07] pt-4">
                {campaigns.isLoading || plans.isLoading || slots.isLoading ? (
                  <div className="h-6 w-20 animate-pulse rounded-md bg-ink/[0.06]" />
                ) : (
                  <span className={`vyro-metric text-xl leading-none ${s.attention ? 'text-amber' : 'text-ink'}`}>{s.metric}</span>
                )}
                <span className="truncate text-xs text-ink-4">{s.metricLabel}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </AdminPage>
  );
}
