import { useState, type ComponentType } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui';
import {
  SearchIcon,
  ArrowRightIcon,
  StoreIcon,
  ShieldCheckIcon,
  TruckIcon,
  PackageIcon,
  FileTextIcon,
  TrendingUpIcon,
  SparklesIcon,
  ShoppingCartIcon,
  Building2Icon,
  CheckCircleIcon,
  FilterIcon,
} from '@/components/icons';

const CATEGORIES: Array<{
  name: string;
  query: string;
  Icon: ComponentType<{ size?: number; className?: string }>;
  count: string;
  tint: string;
}> = [
  { name: 'Rice & Grains', query: 'rice', Icon: PackageIcon, count: '45+ suppliers', tint: 'bg-cyan/15 text-cyan-deep' },
  { name: 'Sugar & Commodities', query: 'sugar', Icon: ShoppingCartIcon, count: '30+ suppliers', tint: 'bg-amber/15 text-amber' },
  { name: 'Cement & Building', query: 'cement', Icon: Building2Icon, count: '60+ suppliers', tint: 'bg-violet/15 text-violet' },
  { name: 'Packaging & Boxes', query: 'packaging', Icon: PackageIcon, count: '40+ suppliers', tint: 'bg-mint/15 text-mint' },
  { name: 'Spices & Agri', query: 'spices', Icon: FilterIcon, count: '55+ suppliers', tint: 'bg-mint/15 text-mint' },
  { name: 'Beverages & Tea', query: 'tea', Icon: SparklesIcon, count: '35+ suppliers', tint: 'bg-amber/15 text-amber' },
];

const METRICS = [
  { label: 'Volume procured', value: '₨ 180M+', change: '+24% MoM', Icon: TrendingUpIcon },
  { label: 'Verified suppliers', value: '620+', change: 'KYC complete', Icon: StoreIcon },
  { label: 'Districts covered', value: '25 / 25', change: 'Island-wide', Icon: TruckIcon },
  { label: 'Avg acceptance', value: '< 3.5 hrs', change: 'Real-time', Icon: CheckCircleIcon },
];

const STEPS = [
  {
    n: '01',
    title: 'Search & compare',
    body: 'Source raw materials and FMCG. Compare unit pricing, MOQs, and lead times across verified suppliers in a single view.',
    Icon: SearchIcon,
  },
  {
    n: '02',
    title: 'Automated PO split',
    body: 'Cart items from multiple suppliers. On checkout, VYRO partitions the cart into individual, legally binding purchase orders.',
    Icon: FileTextIcon,
  },
  {
    n: '03',
    title: 'Track to delivery',
    body: 'Suppliers accept, fulfill, and update status. Every transition is sealed with a cryptographic audit trail.',
    Icon: ShieldCheckIcon,
  },
];

export function HomePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim()) {
      navigate(`/search?q=${encodeURIComponent(query.trim())}`);
    } else {
      navigate('/search');
    }
  }

  return (
    <div className="space-y-20 py-4">
      {/* HERO — Midnight + cyan */}
      <section className="relative overflow-hidden rounded-3xl bg-midnight text-paper shadow-glow-cyan">
        <div className="grid-bg absolute inset-0 opacity-[0.05] pointer-events-none" aria-hidden />
        <div className="pointer-events-none absolute -top-40 left-1/4 h-[480px] w-[480px] rounded-full bg-cyan/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -right-16 h-80 w-80 rounded-full bg-violet/15 blur-3xl" />

        <div className="relative z-10 px-6 sm:px-12 lg:px-20 py-14 sm:py-20 lg:py-24 max-w-5xl">
          <div className="flex items-center gap-2 mb-7">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-cyan/15 text-cyan border border-cyan/30">
              <span className="size-1.5 rounded-full bg-cyan animate-pulse" />
              Sri Lanka · B2B Wholesale
            </span>
            <span className="text-[10px] font-mono text-ink-4 uppercase tracking-wider num-tabular hidden sm:inline">
              v3 · Verified since 2024
            </span>
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tight leading-[1.05] text-paper text-balance max-w-3xl">
            Wholesale procurement,<br />
            <span className="text-cyan">sorted for Sri Lanka.</span>
          </h1>

          <p className="mt-5 text-base sm:text-lg text-ink-3 max-w-2xl leading-relaxed">
            Discover verified manufacturers and direct importers. Compare MOQs, generate multi-supplier purchase orders, and audit every fulfillment — in one cinematic surface.
          </p>

          <form
            onSubmit={handleSearchSubmit}
            className="mt-8 max-w-2xl bg-paper/10 backdrop-blur-md p-2 rounded-2xl border border-paper/20 flex flex-col sm:flex-row gap-2 shadow-soft-lg"
          >
            <div className="relative flex-1 flex items-center">
              <SearchIcon size={18} className="absolute left-3.5 text-ink-4" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search rice, cement, packaging, sugar…"
                className="w-full bg-paper text-slate-950 placeholder:text-slate-400 pl-10 pr-4 py-3 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan/50 border border-transparent"
              />
            </div>
            <Button type="submit" size="lg" className="bg-cyan text-midnight hover:bg-cyan/90 font-semibold">
              Find offers
              <ArrowRightIcon size={16} />
            </Button>
          </form>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              to="/search"
              className="inline-flex items-center gap-1.5 px-3 h-9 rounded-full text-xs font-medium text-ink-2 border border-paper/15 hover:bg-paper/5 hover:text-paper transition-colors"
            >
              Explore full catalog <ArrowRightIcon size={13} />
            </Link>
            {!user && (
              <Link
                to="/onboarding/supplier"
                className="inline-flex items-center gap-1.5 px-3 h-9 rounded-full text-xs font-medium text-cyan hover:text-cyan/80 transition-colors"
              >
                <StoreIcon size={13} /> List your business as supplier
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* METRICS — eyebrow strip */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Platform telemetry
          </h2>
          <span className="text-[11px] text-slate-400 font-mono num-tabular">
            Updated {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {METRICS.map((m) => {
            const Icon = m.Icon;
            return (
              <div
                key={m.label}
                className="bg-paper rounded-xl border border-slate-200 p-4 shadow-soft-sm hover:border-slate-300 transition-colors"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="size-7 rounded-md bg-slate-950 text-cyan inline-flex items-center justify-center">
                    <Icon size={13} />
                  </span>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 num-tabular">
                    {m.change}
                  </span>
                </div>
                <div className="text-2xl font-semibold font-mono text-slate-950 num-tabular leading-tight">
                  {m.value}
                </div>
                <div className="mt-0.5 text-[11px] text-slate-500 font-medium uppercase tracking-wider">
                  {m.label}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* CATEGORIES */}
      <section className="space-y-5">
        <div className="flex items-end justify-between">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-cyan-deep mb-1">
              Sectors
            </div>
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-950 text-balance">
              Browse wholesale sectors
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Direct pricing from Sri Lankan producers and licensed distributors.
            </p>
          </div>
          <Link
            to="/search"
            className="text-sm font-semibold text-cyan-deep hover:underline inline-flex items-center gap-1 shrink-0"
          >
            View all <ArrowRightIcon size={15} />
          </Link>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {CATEGORIES.map((c) => {
            const Icon = c.Icon;
            return (
              <Link
                key={c.name}
                to={`/search?q=${encodeURIComponent(c.query)}`}
                className="group flex flex-col items-start p-4 rounded-xl bg-paper border border-slate-200 hover:border-slate-950 hover:-translate-y-0.5 transition-all duration-200 shadow-soft-sm hover:shadow-soft-md"
              >
                <span className={`size-9 rounded-md inline-flex items-center justify-center mb-3 ${c.tint}`}>
                  <Icon size={16} />
                </span>
                <div className="text-sm font-semibold text-slate-950 leading-tight">{c.name}</div>
                <div className="text-[11px] text-slate-500 mt-0.5 num-tabular">{c.count}</div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="bg-paper rounded-2xl border border-slate-200 shadow-soft-sm overflow-hidden">
        <header className="px-8 pt-10 pb-8 border-b border-slate-100">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-cyan-deep mb-1">
            Three-step process
          </div>
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-950 text-balance">
            How procurement works on VYRO
          </h2>
          <p className="mt-1 text-sm text-slate-500 max-w-2xl">
            Eliminate phone calls, messy receipts, and price ambiguity. Pure software-grade sourcing.
          </p>
        </header>

        <ol className="grid md:grid-cols-3 relative divide-y md:divide-y-0 md:divide-x divide-slate-100">
          {STEPS.map((s, idx) => {
            const Icon = s.Icon;
            return (
              <li key={s.n} className="p-8 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-3xl font-semibold text-cyan-deep/40 num-tabular">
                    {s.n}
                  </span>
                  <span className="size-9 rounded-md bg-slate-950 text-cyan inline-flex items-center justify-center">
                    <Icon size={15} />
                  </span>
                </div>
                <div>
                  <h3 className="font-semibold text-base text-slate-950">{s.title}</h3>
                  <p className="mt-2 text-sm text-slate-600 leading-relaxed">{s.body}</p>
                </div>
                {idx === 0 && (
                  <span className="absolute top-8 right-1/3 hidden md:block text-[10px] uppercase tracking-wider text-slate-300 font-mono">
                    ↓
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </section>

      {/* SUPPLIER CTA — Midnight */}
      <section className="relative overflow-hidden rounded-2xl bg-midnight text-paper p-8 sm:p-12 shadow-glow-violet">
        <div className="pointer-events-none absolute -top-24 right-0 h-72 w-72 rounded-full bg-violet/25 blur-3xl" />
        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-8">
          <div className="space-y-3 max-w-xl">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-violet/15 text-violet border border-violet/30">
              <StoreIcon size={12} /> For manufacturers & wholesalers
            </span>
            <h3 className="text-2xl sm:text-3xl font-semibold tracking-tight text-paper text-balance">
              Grow B2B sales across <span className="text-violet">Sri Lanka.</span>
            </h3>
            <p className="text-sm text-ink-3 leading-relaxed">
              List your catalog directly in front of vetted restaurants, retailers, supermarkets, and builders seeking verified bulk suppliers.
            </p>
          </div>
          <Link
            to="/onboarding/supplier"
            className="inline-flex items-center gap-2 h-11 px-5 bg-violet text-paper rounded-md text-sm font-semibold hover:bg-violet/90 transition-colors shrink-0 shadow-soft-md"
          >
            <PackageIcon size={16} /> List your business
            <ArrowRightIcon size={16} />
          </Link>
        </div>
      </section>
    </div>
  );
}
