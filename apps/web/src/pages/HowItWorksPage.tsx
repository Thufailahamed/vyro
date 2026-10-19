import { useEffect, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { BrandMark } from '@/components/brand/BrandMark';
import {
  Console,
  DarkBackdrop,
  GhostCta,
  MarketingCta,
  PrimaryCta,
  usePrefersReducedMotion,
} from '@/components/marketing/MarketingKit';
import {
  SearchIcon,
  CheckIcon,
  XIcon,
  TruckIcon,
  StoreIcon,
  ShieldCheckIcon,
  FileTextIcon,
  ArrowRightIcon,
  PackageIcon,
  MapPinIcon,
} from '@/components/icons';
import { cn } from '@vyro/ui';

/**
 * The how-it-works page. Stage visuals are illustrative UI (shapes and labels,
 * no prices, supplier names or PO numbers), so the page reads the same in
 * production and demo builds without fabricated metrics.
 */

const AUTOPLAY_MS = 7000;

type Stage = {
  num: string;
  label: string;
  tag: string;
  route: string;
  title: string;
  subtitle: string;
  description: string;
  points: string[];
  action: { label: string; to: string };
};

const STAGES: Stage[] = [
  {
    num: '01',
    label: 'Discover',
    tag: 'Catalog',
    route: 'catalog',
    title: 'Search verified suppliers',
    subtitle: 'Open wholesale search, straight to the source.',
    description:
      'Procurement starts with visibility. Browse wholesale lines from verified mills, importers and depots, and compare unit prices, pack sizes, minimum order quantities and delivery availability before you place an order.',
    points: [
      'Public catalog: browse wholesale prices before you sign up',
      'Pack sizes, MOQs and depot locations listed upfront',
      'Filter by category, district and stock availability',
    ],
    action: { label: 'Search the catalog', to: '/search' },
  },
  {
    num: '02',
    label: 'Decide',
    tag: 'Compare',
    route: 'compare',
    title: 'Compare offers side by side',
    subtitle: 'Every offer ranked, so the right call is obvious.',
    description:
      'On every product, VYRO scores competing offers on unit price, dispatch lead time and overall value. No spreadsheets, no chasing quotes over the phone.',
    points: [
      'Sort by best price, fastest dispatch or best value',
      'Supplier verification and ratings shown on every offer',
      'Stock flags separate in-stock lines from made-to-order',
    ],
    action: { label: 'Compare offers', to: '/search' },
  },
  {
    num: '03',
    label: 'Issue',
    tag: 'Orders',
    route: 'checkout',
    title: 'Issue purchase orders',
    subtitle: 'One checkout. A purchase order per supplier.',
    description:
      'Buy rice from a miller, tea from an estate distributor and cartons from a packaging house in a single cart. At checkout VYRO splits the basket into separate purchase orders, each with its own number, terms and supplier.',
    points: [
      'No mixed billing: each supplier receives only their order',
      'Suppliers are notified the moment an order lands',
      'Prices and terms recorded on every purchase order',
    ],
    action: { label: 'Start procurement', to: '/onboarding/business' },
  },
  {
    num: '04',
    label: 'Move',
    tag: 'Delivery',
    route: 'orders/track',
    title: 'Track every delivery',
    subtitle: 'Every handoff, on the record.',
    description:
      'Follow each order from acceptance through staging, dispatch and receipt. Buyer and supplier see the same timeline, with vehicle details on dispatch and a goods receipt note at the dock.',
    points: [
      'Every status change logged with user and timestamp',
      'Vehicle and driver details attached on dispatch',
      'Receipt confirmed at the dock before settlement',
    ],
    action: { label: 'Track an order', to: '/orders' },
  },
];

const COMPARISON = [
  {
    stage: 'Price discovery',
    old: 'Phone calls, WhatsApp voice notes and quotes that expire overnight.',
    vyro: 'Live LKR rates on every product, straight from verified suppliers.',
  },
  {
    stage: 'Supplier comparison',
    old: 'Notes on paper, hidden broker commissions and uncertain stock.',
    vyro: 'Offers ranked by best price, shortest lead time and best value on one screen.',
  },
  {
    stage: 'Purchase orders',
    old: 'Chat messages with no binding terms or clear specifications.',
    vyro: 'Automatic multi-supplier cart split into numbered purchase orders.',
  },
  {
    stage: 'Delivery tracking',
    old: '“Driver is on the way” texts and unverified dock handoffs.',
    vyro: 'One shared timeline with vehicle details and a signed goods receipt.',
  },
  {
    stage: 'Billing & invoices',
    old: 'Handwritten carbon-copy invoices and payment discrepancies.',
    vyro: 'Invoices matched to orders with a full itemized history.',
  },
];

const CORRIDORS = [
  {
    corridor: 'Western Freight Hub',
    districts: 'Colombo · Gampaha · Kalutara',
    notes: 'Importer distribution, Pettah wholesale lines and packaging hubs.',
    img: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=800&q=80',
  },
  {
    corridor: 'Central Estate Corridor',
    districts: 'Kandy · Matale · Nuwara Eliya',
    notes: 'Ceylon tea estates, highland vegetables and cold storage.',
    img: 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?auto=format&fit=crop&w=800&q=80',
  },
  {
    corridor: 'Agricultural Grain Belt',
    districts: 'Kurunegala · Anuradhapura · Polonnaruwa',
    notes: 'Primary rice millers, grain processing, spices and bulk produce.',
    img: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=800&q=80',
  },
  {
    corridor: 'Southern Coastal Line',
    districts: 'Galle · Matara · Hambantota',
    notes: 'Hotel and resort supply, seafood and bulk oils.',
    img: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80',
  },
];

/** Staggered entrance for children of a stage visual. */
function enter(i: number): CSSProperties {
  return { animationDelay: `${80 + i * 70}ms` };
}

/* ------------------------------------------------------------------ */
/* Stage visuals — dark, illustrative product UI                       */
/* ------------------------------------------------------------------ */

function Bar({ className }: { className?: string | undefined }) {
  return <span className={cn('block h-2 rounded-full bg-paper/15', className)} />;
}

function DiscoverVisual() {
  return (
    <div className="flex h-full flex-col gap-3">
      <div
        style={enter(0)}
        className="animate-fade-in flex h-12 items-center gap-3 rounded-xl border border-paper/10 bg-paper/[0.04] px-4"
      >
        <SearchIcon size={16} className="text-volt shrink-0" />
        <span className="text-sm text-paper/90 truncate">Samba rice 25kg</span>
        <span className="h-4 w-px bg-volt animate-pulse-soft" />
        <span className="ml-auto rounded-md border border-paper/10 px-1.5 py-0.5 font-mono text-[10px] text-paper/40">
          Enter
        </span>
      </div>
      <div style={enter(1)} className="animate-fade-in flex flex-wrap gap-1.5">
        {[
          ['Staples & grains', true],
          ['Verified only', true],
          ['In stock', false],
          ['Western Province', false],
        ].map(([label, on], i) => (
          <span
            key={label as string}
            className={cn(
              'rounded-full px-2.5 py-1 text-[10px] font-medium',
              i === 3 && 'hidden sm:inline',
              on ? 'bg-volt/15 text-volt ring-1 ring-inset ring-volt/30' : 'bg-paper/[0.04] text-paper/50 ring-1 ring-inset ring-paper/10',
            )}
          >
            {label}
          </span>
        ))}
      </div>
      <div className="flex flex-1 flex-col gap-2">
        {[
          { a: 'w-[58%]', b: 'w-16', c: 'w-14' },
          { a: 'w-[46%]', b: 'w-20', c: 'w-12' },
          { a: 'w-[52%]', b: 'w-12', c: 'w-16' },
        ].map(({ a, b, c }, i) => (
          <div
            key={a}
            style={enter(i + 2)}
            className={cn(
              'animate-fade-in flex items-center gap-3 rounded-xl border p-3',
              i === 0 ? 'border-volt/25 bg-volt/[0.05]' : 'border-paper/[0.07] bg-paper/[0.025]',
            )}
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-paper/15 to-paper/[0.03] text-paper/70">
              <StoreIcon size={16} />
            </span>
            <div className="min-w-0 flex-1 space-y-2">
              <Bar className={cn(a, 'bg-paper/25')} />
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-volt">
                  <ShieldCheckIcon size={11} /> Verified
                </span>
                <Bar className={b} />
              </div>
            </div>
            <div className="flex flex-col items-end gap-1.5">
              <Bar className={cn(c, 'h-2.5 bg-paper/30')} />
              <Bar className="w-8 bg-paper/10" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DecideVisual() {
  const offers = [
    { scores: ['92%', '78%', '88%'], top: true },
    { scores: ['80%', '94%', '74%'], top: false },
    { scores: ['70%', '62%', '81%'], top: false },
  ];
  return (
    <div className="flex h-full flex-col gap-3">
      <div style={enter(0)} className="animate-fade-in flex items-center justify-between gap-3">
        <div className="inline-flex rounded-full bg-paper/[0.05] p-1 ring-1 ring-inset ring-paper/10">
          {['Best price', 'Fastest', 'Best value'].map((t, i) => (
            <span
              key={t}
              className={cn(
                'rounded-full px-3 py-1 text-[10px] font-semibold',
                i === 2 ? 'bg-volt text-ink' : 'text-paper/50',
              )}
            >
              {t}
            </span>
          ))}
        </div>
        <span className="hidden sm:inline font-mono text-[10px] text-paper/40">3 offers</span>
      </div>
      <div className="grid grid-cols-[1fr_repeat(3,3.25rem)] gap-x-3 px-3 font-mono text-[9px] uppercase tracking-wider text-paper/35">
        <span>Supplier</span>
        <span>Price</span>
        <span>Speed</span>
        <span>Rating</span>
      </div>
      <div className="flex flex-1 flex-col gap-2">
        {offers.map((o, i) => (
          <div
            key={i}
            style={enter(i + 1)}
            className={cn(
              'animate-fade-in relative grid grid-cols-[1fr_repeat(3,3.25rem)] items-center gap-x-3 rounded-xl border p-3',
              o.top ? 'border-volt/35 bg-volt/[0.06]' : 'border-paper/[0.07] bg-paper/[0.025]',
            )}
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <span
                className={cn(
                  'grid size-6 shrink-0 place-items-center rounded-md font-mono text-[10px] font-bold',
                  o.top ? 'bg-volt text-ink' : 'bg-paper/10 text-paper/60',
                )}
              >
                {i + 1}
              </span>
              <div className="min-w-0 flex-1 space-y-1.5">
                <Bar className={cn(i === 0 ? 'w-[80%]' : i === 1 ? 'w-[65%]' : 'w-[72%]', 'bg-paper/25')} />
                {o.top ? (
                  <span className="block text-[9px] font-semibold uppercase tracking-wider text-volt">Top pick</span>
                ) : (
                  <Bar className="w-10 bg-paper/10" />
                )}
              </div>
            </div>
            {o.scores.map((w, j) => (
              <span key={j} className="h-1.5 overflow-hidden rounded-full bg-paper/10">
                <span
                  className={cn('block h-full rounded-full', o.top ? 'bg-volt' : 'bg-paper/40')}
                  style={{ width: w }}
                />
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function IssueVisual() {
  return (
    <div className="grid h-full grid-cols-[1fr_2.5rem_1fr] items-center sm:grid-cols-[1fr_4rem_1fr]">
      <div style={enter(0)} className="animate-fade-in rounded-2xl border border-paper/10 bg-paper/[0.04] p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[11px] font-semibold text-paper">Cart</span>
          <span className="rounded-full bg-paper/10 px-2 py-0.5 font-mono text-[9px] text-paper/60">3 lines</span>
        </div>
        <div className="space-y-2.5">
          {[
            ['bg-volt', 'w-[70%]'],
            ['bg-volt', 'w-[55%]'],
            ['bg-copper', 'w-[62%]'],
          ].map(([dot, w], i) => (
            <div key={i} className="flex items-center gap-2">
              <span className={cn('size-1.5 shrink-0 rounded-full', dot)} />
              <Bar className={cn(w, 'bg-paper/20')} />
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-lg bg-volt py-1.5 text-center text-[10px] font-bold uppercase tracking-wider text-ink">
          Checkout
        </div>
      </div>

      <svg viewBox="0 0 64 200" preserveAspectRatio="none" className="h-48 w-full" aria-hidden>
        <path d="M0 100 C 32 100, 32 46, 64 46" fill="none" stroke="rgba(198,220,74,0.55)" strokeWidth="1.5" strokeDasharray="4 5" className="animate-flow-dash" vectorEffect="non-scaling-stroke" />
        <path d="M0 100 C 32 100, 32 154, 64 154" fill="none" stroke="rgba(184,122,78,0.6)" strokeWidth="1.5" strokeDasharray="4 5" className="animate-flow-dash" vectorEffect="non-scaling-stroke" />
      </svg>

      <div className="space-y-3">
        {[
          { label: 'Supplier A', lines: 2, accent: 'volt' },
          { label: 'Supplier B', lines: 1, accent: 'copper' },
        ].map((po, i) => (
          <div
            key={po.label}
            style={enter(i + 2)}
            className={cn(
              'animate-fade-in rounded-2xl border bg-paper/[0.04] p-3.5',
              po.accent === 'volt' ? 'border-volt/30' : 'border-copper/35',
            )}
          >
            <div className="flex items-center gap-2">
              <FileTextIcon size={13} className={po.accent === 'volt' ? 'text-volt' : 'text-copper'} />
              <span className="text-[10px] font-semibold text-paper">Purchase order</span>
            </div>
            <div className="mt-1 font-mono text-[9px] uppercase tracking-wider text-paper/45">{po.label}</div>
            <div className="mt-2.5 space-y-1.5">
              {Array.from({ length: po.lines }).map((_, j) => (
                <Bar key={j} className={j === 0 ? 'w-[80%]' : 'w-[60%]'} />
              ))}
            </div>
            <span className="mt-2.5 inline-flex items-center gap-1 rounded-full bg-paper/[0.06] px-2 py-0.5 text-[9px] font-medium text-paper/70">
              <CheckIcon size={10} className="text-volt" /> Sent
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MoveVisual({ animate }: { animate: boolean }) {
  const steps = ['Accepted', 'Staged', 'Dispatched', 'Received'];
  const current = 2;
  const route = 'M24 112 C 90 112, 96 40, 170 48 S 262 104, 336 34';
  return (
    <div className="flex h-full flex-col gap-3">
      <div
        style={enter(0)}
        className="animate-fade-in relative flex-1 overflow-hidden rounded-2xl border border-paper/10 bg-[radial-gradient(circle_at_70%_30%,rgba(198,220,74,0.08),transparent_60%)]"
      >
        <svg
          className="absolute inset-0 h-full w-full text-paper/[0.06]"
          aria-hidden
        >
          <defs>
            <pattern id="hiw-grid" width="22" height="22" patternUnits="userSpaceOnUse">
              <path d="M22 0H0V22" fill="none" stroke="currentColor" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#hiw-grid)" />
        </svg>
        <svg viewBox="0 0 360 140" className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid meet" aria-hidden>
          <path d={route} fill="none" stroke="rgba(250,247,240,0.14)" strokeWidth="6" strokeLinecap="round" />
          <path d={route} fill="none" stroke="#C6DC4A" strokeWidth="2" strokeDasharray="5 6" strokeLinecap="round" className={animate ? 'animate-flow-dash' : undefined} />
          <circle cx="24" cy="112" r="5" fill="#B87A4E" />
          <circle cx="336" cy="34" r="9" fill="rgba(198,220,74,0.18)" />
          <circle cx="336" cy="34" r="4.5" fill="#C6DC4A" />
          <g transform={animate ? undefined : 'translate(170 48)'}>
            <circle r="7" fill="#C6DC4A" opacity="0.25" />
            <circle r="3.5" fill="#FAF7F0" />
            {animate && (
              <animateMotion dur="6s" repeatCount="indefinite" path={route} keyPoints="0;0.62;0.62" keyTimes="0;0.85;1" calcMode="linear" />
            )}
          </g>
        </svg>
        <span className="absolute left-3 bottom-3 inline-flex items-center gap-1.5 rounded-full bg-void/80 px-2.5 py-1 text-[10px] text-paper/70 ring-1 ring-inset ring-paper/10 backdrop-blur">
          <PackageIcon size={11} className="text-copper" /> Depot
        </span>
        <span className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-void/80 px-2.5 py-1 text-[10px] text-paper/70 ring-1 ring-inset ring-paper/10 backdrop-blur">
          <MapPinIcon size={11} className="text-volt" /> Receiving dock
        </span>
      </div>

      <ol style={enter(1)} className="animate-fade-in grid grid-cols-4 gap-2">
        {steps.map((s, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <li key={s} className="space-y-2">
              <span className={cn('block h-1 rounded-full', done ? 'bg-volt' : active ? 'bg-gradient-to-r from-volt to-paper/15' : 'bg-paper/10')} />
              <span className="flex items-center gap-1.5">
                <span
                  className={cn(
                    'size-1.5 shrink-0 rounded-full',
                    done ? 'bg-volt' : active ? 'bg-volt animate-mark-pulse' : 'bg-paper/25',
                  )}
                />
                <span className={cn('truncate text-[10px] font-medium', done || active ? 'text-paper' : 'text-paper/40')}>{s}</span>
              </span>
            </li>
          );
        })}
      </ol>

      <div style={enter(2)} className="animate-fade-in grid grid-cols-2 gap-2">
        {[
          { icon: <TruckIcon size={13} />, label: 'Vehicle assigned' },
          { icon: <FileTextIcon size={13} />, label: 'GRN on receipt' },
        ].map((c) => (
          <div key={c.label} className="flex items-center gap-2 rounded-xl border border-paper/[0.07] bg-paper/[0.025] px-3 py-2.5">
            <span className="text-volt">{c.icon}</span>
            <span className="truncate text-[10px] font-medium text-paper/75">{c.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StageVisual({ index, animate }: { index: number; animate: boolean }) {
  switch (index) {
    case 0:
      return <DiscoverVisual />;
    case 1:
      return <DecideVisual />;
    case 2:
      return <IssueVisual />;
    default:
      return <MoveVisual animate={animate} />;
  }
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export function HowItWorksPage() {
  const reduced = usePrefersReducedMotion();
  const [active, setActive] = useState(0);
  const [autoplay, setAutoplay] = useState(true);
  const [hovering, setHovering] = useState(false);
  const playing = autoplay && !hovering && !reduced;
  const stage = STAGES[active]!;

  useEffect(() => {
    if (!playing) return;
    const t = window.setTimeout(() => setActive((a) => (a + 1) % STAGES.length), AUTOPLAY_MS);
    return () => window.clearTimeout(t);
  }, [active, playing]);

  const select = (i: number) => {
    setActive(i);
    setAutoplay(false);
  };

  return (
    <div className="bg-bone">
      {/* 1. HERO */}
      <section className="relative overflow-hidden bg-void text-paper grain">
        <DarkBackdrop />

        <div className="relative mx-auto max-w-stage px-5 pb-20 pt-14 sm:px-8 sm:pt-20 lg:pb-28 lg:pt-24">
          <div className="grid items-center gap-14 lg:grid-cols-12 lg:gap-12">
            <div className="lg:col-span-6">
              <div className="inline-flex items-center gap-2.5 rounded-full border border-paper/10 bg-paper/[0.04] py-1.5 pl-2 pr-4 backdrop-blur">
                <span className="rounded-full bg-volt px-2 py-0.5 font-mono text-[10px] font-bold text-ink">4 steps</span>
                <span className="text-xs font-medium text-paper/70">The VYRO operating model</span>
              </div>

              <h1 className="vyro-display mt-7 text-[2.75rem] leading-[0.95] text-paper sm:text-6xl lg:text-[4.25rem] xl:text-[4.75rem] text-balance">
                How work moves through{' '}
                <span className="relative whitespace-nowrap text-volt">
                  VYRO.
                  <svg viewBox="0 0 200 12" className="absolute -bottom-2 left-0 h-3 w-full" preserveAspectRatio="none" aria-hidden>
                    <path d="M2 9 C 50 2, 150 2, 198 7" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="animate-flow-draw" strokeDasharray="420" />
                  </svg>
                </span>
              </h1>

              <p className="mt-7 max-w-xl text-base leading-relaxed text-paper/65 sm:text-lg">
                From open wholesale search across Sri Lanka’s 25 districts to ranked supplier offers, multi-supplier
                purchase orders and tracked delivery — one flow, start to finish.
              </p>

              <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
                <PrimaryCta to="/search">Search the wholesale catalog</PrimaryCta>
                <GhostCta to="/onboarding/business">Register your business</GhostCta>
              </div>

              <ul className="mt-10 grid max-w-xl grid-cols-1 gap-4 border-t border-paper/10 pt-6 sm:grid-cols-3">
                {[
                  { icon: <ShieldCheckIcon size={16} />, label: 'Verified suppliers' },
                  { icon: <FileTextIcon size={16} />, label: 'A PO per supplier' },
                  { icon: <TruckIcon size={16} />, label: 'Tracked delivery' },
                ].map((t) => (
                  <li key={t.label} className="flex items-center gap-2.5 text-sm text-paper/70">
                    <span className="grid size-8 place-items-center rounded-full bg-paper/[0.06] text-volt ring-1 ring-inset ring-paper/10">
                      {t.icon}
                    </span>
                    {t.label}
                  </li>
                ))}
              </ul>
            </div>

            {/* Interactive stage console */}
            <div
              className="relative lg:col-span-6"
              onMouseEnter={() => setHovering(true)}
              onMouseLeave={() => setHovering(false)}
            >
              <div className="pointer-events-none absolute -inset-8 rounded-[40px] bg-volt/[0.07] blur-3xl" />
              <Console
                route={stage.route}
                className="relative"
                header={
                  <div role="tablist" aria-label="How VYRO works" className="grid grid-cols-4 gap-1 border-b border-paper/[0.07] p-2">
                    {STAGES.map((s, i) => {
                      const on = i === active;
                      return (
                        <button
                          key={s.num}
                          type="button"
                          role="tab"
                          aria-selected={on}
                          aria-controls="hiw-stage-panel"
                          onClick={() => select(i)}
                          className={cn(
                            'relative overflow-hidden rounded-xl px-2.5 py-2.5 text-left transition-colors sm:px-3',
                            on ? 'bg-paper/[0.07]' : 'hover:bg-paper/[0.04]',
                          )}
                        >
                          <span className={cn('block font-mono text-[10px]', on ? 'text-volt' : 'text-paper/35')}>{s.num}</span>
                          <span className={cn('mt-0.5 block text-xs font-semibold sm:text-[13px]', on ? 'text-paper' : 'text-paper/55')}>
                            {s.label}
                          </span>
                          <span className="absolute inset-x-2.5 bottom-1 h-0.5 overflow-hidden rounded-full bg-paper/[0.06] sm:inset-x-3">
                            {on && (
                              <span
                                key={`${active}-${playing}`}
                                className="block h-full origin-left rounded-full bg-volt"
                                style={
                                  playing
                                    ? { animation: `hiw-progress ${AUTOPLAY_MS}ms linear forwards` }
                                    : undefined
                                }
                              />
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                }
                footer={
                  <div className="flex flex-col gap-3 border-t border-paper/[0.07] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div key={active} className="animate-fade-in min-w-0">
                      <div className="font-display text-base font-semibold text-paper">{stage.title}</div>
                      <p className="mt-0.5 text-[13px] leading-snug text-paper/55">{stage.subtitle}</p>
                    </div>
                    <Link
                      to={stage.action.to}
                      className="group inline-flex shrink-0 items-center gap-1.5 self-start rounded-full bg-paper/[0.06] px-3.5 py-2 text-xs font-semibold text-volt ring-1 ring-inset ring-paper/10 transition hover:bg-paper/10 sm:self-auto"
                    >
                      {stage.action.label}
                      <ArrowRightIcon size={13} className="transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  </div>
                }
              >
                <div id="hiw-stage-panel" role="tabpanel" key={active} className="h-[320px] overflow-hidden p-4 sm:p-5">
                  <StageVisual index={active} animate={!reduced} />
                </div>
              </Console>
            </div>
          </div>
        </div>
        <style>{'@keyframes hiw-progress{from{transform:scaleX(0)}to{transform:scaleX(1)}}'}</style>
      </section>

      {/* 2. THE FOUR STEPS */}
      <section className="relative">
        <div className="mx-auto max-w-stage px-5 pt-20 sm:px-8 sm:pt-28">
          <div className="grid gap-6 lg:grid-cols-12 lg:items-end">
            <div className="lg:col-span-7">
              <div className="vyro-kicker text-copper">The operating model</div>
              <h2 className="vyro-display mt-3 text-[2.25rem] text-ink sm:text-5xl lg:text-6xl text-balance">
                Four movements. One operating layer.
              </h2>
            </div>
            <p className="text-base leading-relaxed text-ink-3 lg:col-span-5">
              Each stage hands off cleanly to the next, so buyers and suppliers work from the same record instead of
              scattered calls and chats.
            </p>
          </div>

          <nav aria-label="Stages" className="mt-10 hidden gap-2 sm:flex">
            {STAGES.map((s) => (
              <a
                key={s.num}
                href={`#stage-${s.num}`}
                className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-paper px-4 py-2 text-sm font-medium text-ink-3 transition hover:border-ink/30 hover:text-ink"
              >
                <span className="font-mono text-xs text-copper">{s.num}</span>
                {s.label}
              </a>
            ))}
          </nav>
        </div>

        <div className="mx-auto max-w-stage px-5 pb-20 sm:px-8 sm:pb-28">
          {STAGES.map((s, idx) => {
            const flip = idx % 2 === 1;
            return (
              <article
                key={s.num}
                id={`stage-${s.num}`}
                className="grid scroll-mt-24 items-center gap-10 border-b border-ink/10 py-16 last:border-b-0 lg:grid-cols-12 lg:gap-16 lg:py-24"
              >
                <div className={cn('lg:col-span-5', flip && 'lg:order-2 lg:col-start-8')}>
                  <div className="flex items-center gap-4">
                    <span className="vyro-metric text-6xl font-bold leading-none text-transparent [-webkit-text-stroke:1.5px_theme(colors.copper.DEFAULT)] sm:text-7xl">
                      {s.num}
                    </span>
                    <span className="h-px flex-1 bg-gradient-to-r from-copper/40 to-transparent" />
                  </div>
                  <div className="vyro-kicker mt-6 text-copper">
                    {s.label} · {s.tag}
                  </div>
                  <h3 className="vyro-display mt-3 text-3xl text-ink sm:text-4xl text-balance">{s.subtitle}</h3>
                  <p className="mt-5 text-base leading-relaxed text-ink-3">{s.description}</p>

                  <ul className="mt-7 space-y-3">
                    {s.points.map((point) => (
                      <li key={point} className="flex items-start gap-3 text-sm text-ink-2">
                        <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-ink text-volt">
                          <CheckIcon size={11} />
                        </span>
                        <span className="leading-relaxed">{point}</span>
                      </li>
                    ))}
                  </ul>

                  <Link
                    to={s.action.to}
                    className="group mt-8 inline-flex items-center gap-2 text-sm font-semibold text-ink underline decoration-copper/40 decoration-2 underline-offset-[6px] transition hover:decoration-copper"
                  >
                    {s.action.label}
                    <ArrowRightIcon size={15} className="transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </div>

                <div className={cn('lg:col-span-7', flip && 'lg:order-1 lg:col-span-6 lg:col-start-1')}>
                  <div className="relative">
                    <div className="pointer-events-none absolute -inset-4 rounded-[36px] bg-gradient-to-br from-volt/20 via-transparent to-copper/20 blur-2xl" />
                    <Console route={s.route} className="relative">
                      <div className="h-[320px] overflow-hidden p-4 sm:h-[340px] sm:p-6">
                        <StageVisual index={idx} animate={!reduced} />
                      </div>
                    </Console>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* 3. COMPARISON */}
      <section className="border-t border-ink/10 bg-paper py-20 sm:py-28">
        <div className="mx-auto max-w-stage px-5 sm:px-8">
          <div className="max-w-2xl">
            <div className="vyro-kicker text-copper">Before & after</div>
            <h2 className="vyro-display mt-3 text-4xl text-ink sm:text-5xl text-balance">Why the old stack fails operators.</h2>
            <p className="mt-4 text-base leading-relaxed text-ink-3">
              Informal trading means friction, shifting prices and late deliveries. Here is how VYRO standardizes every
              step of the buy.
            </p>
          </div>

          <div className="mt-12 overflow-hidden rounded-[28px] border border-ink/10 bg-bone">
            <div className="hidden grid-cols-12 border-b border-ink/10 text-sm md:grid">
              <div className="col-span-3 px-6 py-4 font-mono text-[11px] uppercase tracking-wider text-ink-4">Stage</div>
              <div className="col-span-4 px-6 py-4 font-mono text-[11px] uppercase tracking-wider text-ink-4">
                Informal stack · calls & chats
              </div>
              <div className="col-span-5 flex items-center gap-2 bg-ink px-6 py-4 font-mono text-[11px] uppercase tracking-wider text-volt">
                <BrandMark size={16} tone="volt" /> With VYRO
              </div>
            </div>
            {COMPARISON.map((row, i) => (
              <div key={row.stage} className={cn('grid md:grid-cols-12', i > 0 && 'border-t border-ink/10')}>
                <div className="flex items-center gap-3 px-6 pb-2 pt-6 md:col-span-3 md:py-6">
                  <span className="font-mono text-xs text-copper">0{i + 1}</span>
                  <span className="font-display text-base font-semibold text-ink">{row.stage}</span>
                </div>
                <div className="flex items-start gap-3 px-6 py-3 md:col-span-4 md:py-6">
                  <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-ink/[0.06] text-ink-4">
                    <XIcon size={11} />
                  </span>
                  <p className="text-sm leading-relaxed text-ink-4">{row.old}</p>
                </div>
                <div className="flex items-start gap-3 bg-ink px-6 py-4 md:col-span-5 md:py-6">
                  <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-volt text-ink">
                    <CheckIcon size={11} />
                  </span>
                  <p className="text-sm leading-relaxed text-paper/85">{row.vyro}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 4. COVERAGE */}
      <section className="border-t border-ink/10 bg-bone py-20 sm:py-28">
        <div className="mx-auto max-w-stage px-5 sm:px-8">
          <div className="grid items-end gap-6 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <div className="vyro-kicker text-copper">National footprint</div>
              <h2 className="vyro-display mt-3 text-4xl text-ink sm:text-5xl text-balance">
                Built for all 25 districts of Sri Lanka.
              </h2>
            </div>
            <p className="text-base leading-relaxed text-ink-3 lg:col-span-5">
              A beachfront resort in Galle, a bakery in Kandy or a packaging plant in Gampaha: VYRO connects you with
              suppliers and regional transport along the island’s main trade corridors.
            </p>
          </div>

          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {CORRIDORS.map((c) => (
              <div key={c.corridor} className="group relative h-80 overflow-hidden rounded-[24px] bg-ink">
                <img
                  src={c.img}
                  alt={c.corridor}
                  loading="lazy"
                  className="absolute inset-0 h-full w-full object-cover opacity-80 transition duration-700 ease-cinematic group-hover:scale-105 group-hover:opacity-90"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-void via-void/50 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-5">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-void/60 px-2.5 py-1 font-mono text-[10px] text-volt ring-1 ring-inset ring-paper/10 backdrop-blur">
                    <MapPinIcon size={11} /> {c.districts}
                  </span>
                  <h3 className="mt-3 font-display text-lg font-semibold text-paper">{c.corridor}</h3>
                  <p className="mt-1 text-[13px] leading-snug text-paper/65">{c.notes}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 5. CTA */}
      <MarketingCta
        buyer={{
          title: 'Move your buying to VYRO.',
          body: 'Register your business in minutes. Search wholesale prices, compare verified suppliers and issue purchase orders with full delivery tracking.',
        }}
        supplier={{
          title: 'Put your catalog in the flow.',
          body: 'Receive purchase orders from hotels, restaurants and retailers across the island, without chasing informal phone bids.',
        }}
      />
    </div>
  );
}
