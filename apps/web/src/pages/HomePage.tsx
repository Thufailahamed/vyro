import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { Button, Card } from '@/components/ui';
import {
  SearchIcon,
  ArrowRightIcon,
  StoreIcon,
  Building2Icon,
  ShieldCheckIcon,
  TruckIcon,
  PackageIcon,
  FileTextIcon,
  TrendingUpIcon,
  SparklesIcon,
} from '@/components/icons';

const POPULAR_CATEGORIES = [
  { name: 'Rice & Grains', query: 'rice', icon: '🌾', count: '45+ suppliers' },
  { name: 'Sugar & Commodities', query: 'sugar', icon: '🍬', count: '30+ suppliers' },
  { name: 'Cement & Building Materials', query: 'cement', icon: '🏗️', count: '60+ suppliers' },
  { name: 'Packaging & Boxes', query: 'packaging', icon: '📦', count: '40+ suppliers' },
  { name: 'Spices & Agri Produce', query: 'spices', icon: '🌿', count: '55+ suppliers' },
  { name: 'Beverages & Wholesale', query: 'tea', icon: '☕', count: '35+ suppliers' },
];

const METRICS = [
  { label: 'Total Volume Procured', value: '₨ 180M+', change: '+24% this month' },
  { label: 'Active Wholesale Suppliers', value: '620+', change: 'Verified in SL' },
  { label: 'Districts Covered', value: '25 / 25', change: 'Island-wide delivery' },
  { label: 'Avg PO Acceptance', value: '< 3.5 hrs', change: 'Real-time response' },
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
    <div className="space-y-16 py-4">
      {/* Hero Section */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-b from-brand-900 via-slate-900 to-slate-950 text-white p-8 sm:p-12 lg:p-16 shadow-soft-lg">
        {/* Ambient Glows */}
        <div className="pointer-events-none absolute -top-24 -left-24 h-96 w-96 rounded-full bg-brand-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -right-24 h-96 w-96 rounded-full bg-sky-400/15 blur-3xl" />

        <div className="relative z-10 max-w-3xl mx-auto text-center space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/15 text-xs font-semibold text-brand-200">
            <SparklesIcon size={14} className="text-sky-300" />
            <span>Sri Lanka's Next-Generation B2B Wholesale Network</span>
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-[1.15]">
            Wholesale Procurement, <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-400 via-brand-300 to-blue-200">
              Sorted for Sri Lanka.
            </span>
          </h1>

          <p className="text-base sm:text-lg text-slate-300 max-w-2xl mx-auto leading-relaxed">
            Search verified manufacturers and direct importers, compare minimum order quantities, and generate multi-supplier purchase orders in seconds.
          </p>

          {/* Quick Search Form */}
          <form onSubmit={handleSearchSubmit} className="max-w-xl mx-auto mt-8 flex flex-col sm:flex-row gap-2 bg-white/10 p-2 rounded-2xl backdrop-blur-md border border-white/20 shadow-2xl">
            <div className="relative flex-1 flex items-center">
              <SearchIcon size={20} className="absolute left-3.5 text-slate-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search rice, cement, packaging, sugar..."
                className="w-full bg-white text-slate-900 placeholder:text-slate-400 pl-10 pr-4 py-3 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 shadow-soft-sm"
              />
            </div>
            <Button type="submit" size="lg" className="bg-brand-500 hover:bg-brand-400 text-white font-semibold">
              Find Offers
            </Button>
          </form>

          {/* Quick CTAs */}
          <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
            <Link to="/search">
              <Button variant="outline" className="bg-white/10 hover:bg-white/20 text-white border-white/20 text-sm">
                Explore Full Catalog <ArrowRightIcon size={16} />
              </Button>
            </Link>
            {!user && (
              <Link to="/onboarding/supplier">
                <Button variant="ghost" className="text-slate-300 hover:text-white hover:bg-white/10 text-sm">
                  <StoreIcon size={16} /> List Your Business as a Supplier
                </Button>
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* Live Metrics Grid */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {METRICS.map((m) => (
          <Card key={m.label} className="text-center p-6 border-slate-200/70">
            <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              {m.value}
            </div>
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mt-1">
              {m.label}
            </div>
            <div className="mt-2 text-xs font-medium text-brand-600 inline-flex items-center gap-1">
              <TrendingUpIcon size={13} /> {m.change}
            </div>
          </Card>
        ))}
      </section>

      {/* Popular Categories */}
      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
              Browse Wholesale Sectors
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Direct pricing from Sri Lankan producers and licensed distributors
            </p>
          </div>
          <Link to="/search" className="text-sm font-semibold text-brand-600 hover:text-brand-700 flex items-center gap-1">
            View all <ArrowRightIcon size={16} />
          </Link>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
          {POPULAR_CATEGORIES.map((cat) => (
            <Link
              key={cat.name}
              to={`/search?q=${encodeURIComponent(cat.query)}`}
              className="group flex flex-col p-4 rounded-2xl bg-white border border-slate-200/80 hover:border-brand-300 hover:shadow-soft-md transition-all text-center"
            >
              <div className="text-3xl mb-2 group-hover:scale-110 transition-transform">
                {cat.icon}
              </div>
              <div className="text-xs font-bold text-slate-800 group-hover:text-brand-600 transition-colors">
                {cat.name}
              </div>
              <div className="text-[11px] text-slate-600 mt-1 font-medium">
                {cat.count}
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* How It Works: 3 Steps */}
      <section className="bg-white rounded-3xl border border-slate-200/80 p-8 sm:p-12 space-y-8 shadow-soft-sm">
        <div className="text-center max-w-xl mx-auto space-y-2">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            How Procurement Works on VYRO
          </h2>
          <p className="text-sm text-slate-500">
            Eliminate phone calls, messy WhatsApp receipts, and price ambiguity.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 relative">
          <div className="flex flex-col items-start p-6 rounded-2xl bg-slate-50 border border-slate-200/70">
            <div className="h-10 w-10 rounded-xl bg-brand-600 text-white flex items-center justify-center font-bold text-sm mb-4 shadow-soft-sm">
              1
            </div>
            <h3 className="font-bold text-base text-slate-900 mb-1">
              Search & Compare Offers
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Find raw materials, FMCG, and industrial goods. Compare unit pricing, Minimum Order Quantities (MOQs), and delivery lead times side-by-side.
            </p>
          </div>

          <div className="flex flex-col items-start p-6 rounded-2xl bg-slate-50 border border-slate-200/70">
            <div className="h-10 w-10 rounded-xl bg-brand-600 text-white flex items-center justify-center font-bold text-sm mb-4 shadow-soft-sm">
              2
            </div>
            <h3 className="font-bold text-base text-slate-900 mb-1">
              Automated PO Generation
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Mix items from different suppliers in one cart. On checkout, VYRO automatically partitions your cart into individual, legally binding Purchase Orders.
            </p>
          </div>

          <div className="flex flex-col items-start p-6 rounded-2xl bg-slate-50 border border-slate-200/70">
            <div className="h-10 w-10 rounded-xl bg-brand-600 text-white flex items-center justify-center font-bold text-sm mb-4 shadow-soft-sm">
              3
            </div>
            <h3 className="font-bold text-base text-slate-900 mb-1">
              Track to Delivery & Audit
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Suppliers accept or reject orders directly in their dashboard. Track status changes from accepted to delivered with a complete cryptographic audit trail.
            </p>
          </div>
        </div>
      </section>

      {/* Supplier Recruitment Banner */}
      <section className="rounded-3xl bg-gradient-to-r from-slate-900 via-slate-800 to-brand-950 text-white p-8 sm:p-12 flex flex-col md:flex-row items-center justify-between gap-8">
        <div className="space-y-3 max-w-xl">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-500/20 text-brand-300 text-xs font-semibold">
            <StoreIcon size={14} /> For Manufacturers & Wholesalers
          </div>
          <h3 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Grow your B2B sales across Sri Lanka
          </h3>
          <p className="text-sm text-slate-300 leading-relaxed">
            Get your catalog listed directly in front of vetted restaurants, retailers, supermarkets, and builders looking for verified bulk suppliers.
          </p>
        </div>
        <div className="shrink-0 flex flex-col sm:flex-row gap-3">
          <Link to="/onboarding/supplier">
            <Button size="lg" className="bg-brand-500 hover:bg-brand-400 text-white font-semibold">
              List Your Business <ArrowRightIcon size={18} />
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
