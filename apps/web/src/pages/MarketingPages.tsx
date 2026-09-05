import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FlowCanvas, FlowLine } from '@/components/brand/FlowLine';
import { Button } from '@/components/ui';
import {
  SearchIcon,
  CheckCircleIcon,
  TruckIcon,
  PackageIcon,
  ClockIcon,
  StoreIcon,
  Building2Icon,
  ShieldCheckIcon,
  TrendingUpIcon,
  FileTextIcon,
  ArrowRightIcon,
} from '@/components/icons';
import { BrandMark } from '@/components/brand/BrandMark';
import { cn } from '@vyro/ui';

const HERO_STAGES = [
  {
    num: '01',
    label: 'Discover',
    tag: 'Catalog Layer',
    title: 'Open Search in Mill Gates',
    desc: 'Browse active wholesale lots across 25 districts without account signups. Compare live unit rates in LKR directly from primary producers.',
    badge: 'Live Mill Quotes',
    image: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=1200&q=80',
    stat1: { label: 'Benchmark Item', val: 'Samba Rice 25kg' },
    stat2: { label: 'Best Factory Rate', val: 'Rs. 4,200/bag' },
    actionLabel: 'Search Live Grains →',
    actionRoute: '/search?q=rice',
  },
  {
    num: '02',
    label: 'Decide',
    tag: 'Comparison Engine',
    title: 'Transparent Multi-Supplier Scoring',
    desc: 'Ranked by Lowest Price, Shortest Lead Time, and Best Value. Every supplier verified with physical depot and tax audits.',
    badge: 'Algorithmic Ranking',
    image: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=1200&q=80',
    stat1: { label: 'Price Leader', val: 'Lanka Agro Mills' },
    stat2: { label: 'Speed Leader', val: '24h Express Dispatch' },
    actionLabel: 'Compare Live Bids →',
    actionRoute: '/products/p-samba-rice-25kg',
  },
  {
    num: '03',
    label: 'Issue',
    tag: 'Order Generation',
    title: 'Automated Multi-Supplier Cart Split',
    desc: 'One single checkout automatically divides into legally binding purchase orders for each independent vendor with digital PO hashes.',
    badge: 'Binding Digital PO',
    image: 'https://images.unsplash.com/photo-1530587191325-3db32d826c18?auto=format&fit=crop&w=1200&q=80',
    stat1: { label: 'Order #1 (Grains)', val: 'PO-2026-0841' },
    stat2: { label: 'Order #2 (Tea)', val: 'PO-2026-0842' },
    actionLabel: 'Start Procurement →',
    actionRoute: '/onboarding/business',
  },
  {
    num: '04',
    label: 'Move',
    tag: 'Fulfillment & Logistics',
    title: 'Real-Time Freight Audit Trail',
    desc: 'Track vehicle registration, assigned driver contact, and receiving dock signature with immutable digital timestamps.',
    badge: 'GPS Freight Route',
    image: 'https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?auto=format&fit=crop&w=1200&q=80',
    stat1: { label: 'Fleet Vehicle', val: 'WP-NB-4421' },
    stat2: { label: 'Receiving Status', val: 'GRN Confirmed' },
    actionLabel: 'Track Delivery →',
    actionRoute: '/search',
  },
];

export function AboutPage() {
  return (
    <div className="bg-bone">
      {/* 1. HERO SECTION (2-COLUMN PHOTOGRAPHIC HERO) */}
      <section className="relative overflow-hidden bg-void text-paper grain py-16 sm:py-20 lg:py-24">
        <div className="absolute inset-0 opacity-40">
          <FlowCanvas tone="paper" density="hero" />
        </div>
        <div className="absolute -left-20 top-1/4 size-96 rounded-full bg-volt/10 blur-[120px] pointer-events-none" />
        <div className="absolute right-0 bottom-0 size-80 rounded-full bg-copper/10 blur-[120px] pointer-events-none" />

        <div className="relative max-w-stage mx-auto px-5 sm:px-8">
          <div className="grid lg:grid-cols-12 gap-12 lg:gap-10 items-center">
            {/* Left Column: Heading, mission, stats, CTAs */}
            <div className="lg:col-span-7 space-y-6">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-paper/10 border border-paper/15 text-xs text-volt">
                <span className="size-2 rounded-full bg-volt animate-pulse" />
                <span className="vyro-kicker text-volt">B2B Commercial Operating Layer</span>
              </div>

              <h1 className="vyro-display text-4xl sm:text-6xl lg:text-[4.25rem] text-paper leading-[1.06] text-balance">
                Built as infrastructure, <span className="text-volt block">not a storefront.</span>
              </h1>

              <p className="max-w-xl text-paper/75 text-base sm:text-lg leading-relaxed">
                VYRO is the operating layer connecting Sri Lankan commercial buyers, primary agricultural mills, authorized distributors, and logistics depots into one continuous, accountable commerce network.
              </p>

              {/* Vital Network Statistics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                {[
                  { val: '25', lbl: 'Districts Connected' },
                  { val: '100%', lbl: 'Verified Tax & Depot IDs' },
                  { val: 'Rs. 100M+', lbl: 'Monthly B2B Volume' },
                  { val: '0%', lbl: 'Hidden Broker Markups' },
                ].map((s) => (
                  <div key={s.lbl} className="bg-paper/5 border border-paper/10 p-3">
                    <span className="vyro-metric text-xl sm:text-2xl text-paper font-bold block">{s.val}</span>
                    <span className="text-[10px] text-paper/50 block mt-0.5 leading-tight">{s.lbl}</span>
                  </div>
                ))}
              </div>

              {/* Action buttons */}
              <div className="flex flex-wrap gap-4 pt-2">
                <Link to="/search">
                  <Button size="lg" className="bg-volt text-ink hover:bg-volt-glow font-bold uppercase tracking-wider text-xs">
                    Explore Wholesale Catalog →
                  </Button>
                </Link>
                <Link to="/onboarding/business">
                  <Button variant="secondary" size="lg" className="text-paper border-paper/30 hover:bg-paper hover:text-ink font-bold uppercase tracking-wider text-xs">
                    Register Your Business
                  </Button>
                </Link>
              </div>
            </div>

            {/* Right Column: High-Res Depot Composition */}
            <div className="lg:col-span-5 space-y-3">
              <div className="relative overflow-hidden border border-paper/20 group h-80 sm:h-96 shadow-2xl">
                <img
                  src="https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=1200&q=80"
                  alt="High-density wholesale distribution depot"
                  className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-void via-void/40 to-transparent" />

                {/* Floating Top Badge */}
                <div className="absolute top-4 left-4 right-4 flex items-center justify-between">
                  <span className="px-3 py-1 bg-ink/90 backdrop-blur-md border border-volt/40 text-volt text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 shadow-md">
                    <ShieldCheckIcon size={12} />
                    Verified Supply Hub
                  </span>
                  <span className="text-[10px] font-mono bg-void/80 px-2 py-0.5 text-paper/70 border border-paper/15">
                    Western Freight Depot
                  </span>
                </div>

                {/* Floating Bottom Card */}
                <div className="absolute inset-x-3 bottom-3 p-4 bg-void/90 backdrop-blur-md border border-paper/15 space-y-1.5">
                  <span className="text-[10px] font-mono text-volt uppercase tracking-wider block">Physical Infrastructure</span>
                  <h3 className="font-display text-lg text-paper leading-tight">Audited Stock & Automated Dispatch</h3>
                  <p className="text-xs text-paper/70 line-clamp-2">
                    Direct rail and expressway freight routes connecting primary grain mills in Kurunegala to Colombo commercial kitchens.
                  </p>
                </div>
              </div>

              {/* Dual Mini Supporting Tiles */}
              <div className="grid grid-cols-2 gap-3">
                <div className="relative h-24 overflow-hidden border border-paper/15 group">
                  <img
                    src="https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=600&q=80"
                    alt="Primary agricultural grain granary"
                    className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-void/90 via-void/40 to-transparent" />
                  <div className="absolute bottom-2 left-2.5 right-2.5">
                    <span className="text-[9px] font-mono text-volt uppercase block">Primary Miller</span>
                    <span className="text-xs font-display text-paper truncate block">Kurunegala Mill Gate</span>
                  </div>
                </div>

                <div className="relative h-24 overflow-hidden border border-paper/15 group">
                  <img
                    src="https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?auto=format&fit=crop&w=600&q=80"
                    alt="Estate Beverage and Cold Storage Depot"
                    className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-void/90 via-void/40 to-transparent" />
                  <div className="absolute bottom-2 left-2.5 right-2.5">
                    <span className="text-[9px] font-mono text-copper uppercase block">Cold Chain Hub</span>
                    <span className="text-xs font-display text-paper truncate block">Central Province Depot</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. THE PROBLEM WE SOLVE: BEYOND THE WHATSAPP TRAP */}
      <section className="max-w-stage mx-auto px-5 sm:px-8 py-20 space-y-16">
        <div className="grid lg:grid-cols-12 gap-12 items-center">
          <div className="lg:col-span-6 space-y-6">
            <div className="vyro-kicker text-copper">The Market Reality</div>
            <h2 className="vyro-display text-3xl sm:text-5xl text-ink leading-tight">
              Sri Lankan wholesale was trapped in screenshots & voice notes.
            </h2>
            <p className="text-sm sm:text-base text-ink-3 leading-relaxed">
              Before VYRO, procurement for commercial kitchens, hotels, and retailers was an informal labyrinth: chasing fluctuating daily quotes across WhatsApp voice notes, deciphering unverified PDF brochures, and dealing with commission-charging middlemen.
            </p>
            <p className="text-sm sm:text-base text-ink-3 leading-relaxed">
              A restaurant buying rice had no way of knowing if they were receiving the true mill gate rate. A hotel ordering tea had no formal tracking until the truck pulled up at the delivery bay.
            </p>
            <div className="pt-2">
              <div className="p-4 bg-paper border-l-4 border-copper shadow-sm">
                <span className="font-display text-sm font-semibold text-ink block">The Middleman Tax</span>
                <p className="text-xs text-ink-3 mt-1">
                  Informal broker networks routinely add 8% to 15% hidden markups between the factory gate and the business kitchen dock.
                </p>
              </div>
            </div>
          </div>

          <div className="lg:col-span-6">
            <div className="relative overflow-hidden border border-ink/15 group shadow-md">
              <img
                src="https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=1000&q=80"
                alt="Executive chef managing restaurant kitchen procurement"
                className="w-full h-80 sm:h-96 object-cover group-hover:scale-105 transition-transform duration-700"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-void/85 via-void/30 to-transparent" />
              <div className="absolute bottom-4 left-4 right-4 text-paper">
                <span className="vyro-kicker text-volt">Commercial Operators</span>
                <h3 className="font-display text-lg text-paper mt-0.5">Reliable Inputs Every Week</h3>
                <p className="text-xs text-paper/75 mt-1">From commercial kitchens to coastal luxury resorts, operators need guaranteed price locks.</p>
              </div>
            </div>
          </div>
        </div>

        {/* 3. THE 4 MOVEMENTS OF THE VYRO LAYER */}
        <div className="grid lg:grid-cols-12 gap-12 items-center pt-8 border-t border-ink/10">
          <div className="lg:col-span-6 order-2 lg:order-1">
            <div className="relative overflow-hidden border border-ink/15 group shadow-md">
              <img
                src="https://images.unsplash.com/photo-1530587191325-3db32d826c18?auto=format&fit=crop&w=1000&q=80"
                alt="Organized shipping pallets with barcode dispatch tags"
                className="w-full h-80 sm:h-96 object-cover group-hover:scale-105 transition-transform duration-700"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-void/85 via-void/30 to-transparent" />
              <div className="absolute bottom-4 left-4 right-4 text-paper">
                <span className="vyro-kicker text-volt">Digital Logistics Layer</span>
                <h3 className="font-display text-lg text-paper mt-0.5">Split Carts, Binding POs, Live GPS</h3>
                <p className="text-xs text-paper/75 mt-1">Automated PO numbering and verified goods receipt notes on arrival.</p>
              </div>
            </div>
          </div>

          <div className="lg:col-span-6 order-1 lg:order-2 space-y-6">
            <div className="vyro-kicker text-copper">The Operating Architecture</div>
            <h2 className="vyro-display text-3xl sm:text-5xl text-ink leading-tight">
              One unified layer for commercial commerce.
            </h2>
            <p className="text-sm sm:text-base text-ink-3 leading-relaxed">
              VYRO connects identity, pricing, inventory, and delivery into a synchronized system. A single cart splits automatically into independent supplier purchase orders, and every status change is recorded on an immutable audit trail.
            </p>

            <div className="p-5 bg-paper border border-ink/15 space-y-3">
              <span className="text-[10px] font-mono text-copper uppercase tracking-wider block">Integrated Movement</span>
              <FlowLine
                nodes={[
                  { label: 'VYRO Procurement', state: 'done', hint: 'Live' },
                  { label: 'VYRO Logistics', state: 'active', hint: 'Live' },
                  { label: 'VYRO Pay', state: 'idle', hint: 'In Flow' },
                  { label: 'VYRO Credit', state: 'idle', hint: 'Next' },
                ]}
              />
            </div>
          </div>
        </div>
      </section>

      {/* 4. CORE OPERATING PRINCIPLES */}
      <section className="bg-paper border-y border-ink/10 py-20">
        <div className="max-w-stage mx-auto px-5 sm:px-8">
          <div className="max-w-2xl mb-12">
            <div className="vyro-kicker text-copper">Our Standards</div>
            <h2 className="mt-2 vyro-display text-3xl sm:text-5xl text-ink">Built on four immutable principles.</h2>
            <p className="mt-3 text-sm text-ink-3">
              Everything in the VYRO codebase and operational model serves these core commitments to Sri Lankan operators.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              {
                num: '01',
                title: 'Absolute Price Visibility',
                desc: 'Real-time LKR unit prices posted directly by primary producers. Zero broker markups or hidden rebates.',
                tag: 'Transparency',
              },
              {
                num: '02',
                title: 'Rigorous Physical Verification',
                desc: 'Every supplier is audited for physical warehouse storage, business registry, and active tax compliance.',
                tag: 'Accountability',
              },
              {
                num: '03',
                title: 'Binding Commercial POs',
                desc: 'A checkout splits into legally binding purchase orders with digital hashes, not casual chat messages.',
                tag: 'Legal Standing',
              },
              {
                num: '04',
                title: 'Island-Wide Freight Equity',
                desc: 'Connecting grain millers in Kurunegala and tea estates in Kandy with buyers across all 25 districts on equal terms.',
                tag: 'National Reach',
              },
            ].map((p) => (
              <div key={p.num} className="bg-bone border border-ink/15 p-6 space-y-3 flex flex-col justify-between hover:border-ink transition-colors">
                <div>
                  <div className="flex items-baseline justify-between">
                    <span className="vyro-metric text-3xl text-copper font-bold">{p.num}</span>
                    <span className="text-[10px] font-mono text-ink-4 uppercase">{p.tag}</span>
                  </div>
                  <h3 className="font-display text-xl text-ink mt-3 font-semibold">{p.title}</h3>
                  <p className="text-xs text-ink-3 leading-relaxed mt-2">{p.desc}</p>
                </div>
                <div className="pt-3 border-t border-ink/10 flex items-center gap-1.5 text-[11px] font-semibold text-volt-dark">
                  <CheckCircleIcon size={12} />
                  <span>Standard Enforced</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 5. VERIFIED PARTNER HUBS SPOTLIGHT WITH PHOTOS */}
      <section className="max-w-stage mx-auto px-5 sm:px-8 py-20">
        <div className="max-w-2xl mb-12">
          <div className="vyro-kicker text-copper">Network Depots</div>
          <h2 className="mt-2 vyro-display text-3xl sm:text-5xl text-ink">The physical supply base.</h2>
          <p className="mt-3 text-sm text-ink-3">
            Real facilities, real warehouses, real delivery fleets operating daily on the VYRO network.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {[
            {
              name: 'Colombo Central Wholesalers',
              role: 'Import Commodities & Staple Provisions',
              location: '42 Old Moor Street, Pettah, Colombo 11',
              coverage: '24-hour Western Province Express Fleet',
              img: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=800&q=80',
            },
            {
              name: 'Lanka Agro Mills & Processing',
              role: 'Primary Rice Mill & Grain Processor',
              location: '15 Industrial Zone, Kurunegala',
              coverage: 'Island-wide bulk deliveries',
              img: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=800&q=80',
            },
            {
              name: 'Island Logistics & Cold Chain',
              role: 'Authorized Estate Beverage & Dairy Depot',
              location: '88 Katugastota Road, Kandy',
              coverage: 'Central Province & Hill Country cold chain',
              img: 'https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?auto=format&fit=crop&w=800&q=80',
            },
          ].map((hub) => (
            <div key={hub.name} className="bg-paper border border-ink/15 overflow-hidden group hover:border-ink hover:shadow-lg transition-all duration-300">
              <div className="relative h-48 overflow-hidden bg-bone">
                <img
                  src={hub.img}
                  alt={hub.name}
                  loading="lazy"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
                <div className="absolute top-3 right-3 px-2.5 py-1 bg-ink text-volt text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 shadow-md">
                  <ShieldCheckIcon size={12} />
                  Audited Facility
                </div>
              </div>
              <div className="p-5 space-y-2">
                <span className="text-[10px] font-mono text-copper uppercase tracking-wider block">{hub.role}</span>
                <h3 className="font-display text-xl text-ink font-semibold">{hub.name}</h3>
                <div className="text-xs text-ink-3 space-y-1 pt-2 border-t border-ink/10">
                  <div><strong>Location:</strong> {hub.location}</div>
                  <div><strong>Dispatch:</strong> {hub.coverage}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 6. BOTTOM CONVERSION CTA */}
      <section className="bg-ink text-paper grain relative overflow-hidden">
        <div className="absolute inset-0 opacity-25">
          <FlowCanvas tone="paper" density="hero" />
        </div>

        <div className="relative max-w-stage mx-auto px-5 sm:px-8 py-20 grid lg:grid-cols-2 gap-8">
          <div className="relative overflow-hidden border border-paper/15 p-8 sm:p-10 flex flex-col justify-between group">
            <img
              src="https://images.unsplash.com/photo-1577219491135-ce391730fb2c?auto=format&fit=crop&w=800&q=80"
              alt="Procurement manager in kitchen"
              className="absolute inset-0 w-full h-full object-cover opacity-20 group-hover:opacity-30 group-hover:scale-105 transition-all duration-700"
            />
            <div className="relative z-10 space-y-4">
              <div className="flex items-center gap-2">
                <BrandMark size={24} tone="volt" />
                <span className="vyro-kicker text-volt">Commercial Procurement</span>
              </div>
              <h2 className="vyro-display text-3xl sm:text-4xl text-paper">Operate with full visibility.</h2>
              <p className="text-sm text-paper/75 max-w-md leading-relaxed">
                Register your business in under 2 minutes. Search open wholesale prices, compare verified mills, and issue purchase orders with full delivery tracking.
              </p>
            </div>
            <div className="relative z-10 pt-8">
              <Link to="/onboarding/business">
                <Button className="bg-volt text-ink hover:bg-volt-glow font-bold uppercase tracking-wider text-xs px-6 py-3">
                  Register Your Business →
                </Button>
              </Link>
            </div>
          </div>

          <div className="relative overflow-hidden border border-paper/15 p-8 sm:p-10 flex flex-col justify-between group">
            <img
              src="https://images.unsplash.com/photo-1553413077-190dd305871c?auto=format&fit=crop&w=800&q=80"
              alt="Supplier warehouse logistics"
              className="absolute inset-0 w-full h-full object-cover opacity-20 group-hover:opacity-30 group-hover:scale-105 transition-all duration-700"
            />
            <div className="relative z-10 space-y-4">
              <div className="flex items-center gap-2">
                <BrandMark size={24} tone="paper" />
                <span className="vyro-kicker text-copper">Authorized Distribution</span>
              </div>
              <h2 className="vyro-display text-3xl sm:text-4xl text-paper">Put your mill in the network flow.</h2>
              <p className="text-sm text-paper/75 max-w-md leading-relaxed">
                Receive binding purchase orders from hotels, restaurants, and retail stores across the island without chasing informal phone bids.
              </p>
            </div>
            <div className="relative z-10 pt-8">
              <Link to="/onboarding/supplier">
                <Button variant="secondary" className="text-paper border-paper/30 hover:bg-paper hover:text-ink font-bold uppercase tracking-wider text-xs px-6 py-3">
                  List as Authorized Supplier →
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export function HowItWorksPage() {
  const [activeStage, setActiveStage] = useState(0);
  const currentStage = HERO_STAGES[activeStage]!;

  const steps = [
    {
      num: '01',
      title: 'Discover',
      kicker: 'Catalog Layer',
      subtitle: 'Open wholesale search directly into primary mills, importers, and depots.',
      description:
        'Procurement starts with direct visibility. Browse active wholesale lines across 25 Sri Lankan districts without account gatekeeping. Compare real-time LKR unit prices, pack sizes, Minimum Order Quantities (MOQs), and delivery availability before issuing an order.',
      image: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=1000&q=80',
      caption: 'Audited wholesale depot with live inventory status',
      mock: {
        badge: 'Open Wholesale Search',
        query: 'Araliya Samba Rice 25kg',
        hits: '4 verified mill offers live',
        pills: ['Staples & Grains', 'Mill Direct', 'Island-Wide'],
        stats: [
          { label: 'Best Rate', value: 'Rs. 4,200/bag' },
          { label: 'Min. Order', value: '5 bags' },
          { label: 'Dispatch', value: '24–48 hours' },
        ],
      },
      points: [
        'Open public catalog — inspect live wholesale prices without early account registration',
        'Direct factory and mill gate prices with zero middleman or broker markup',
        'Clear MOQs, commercial pack sizes (5kg to 50kg bags), and depot locations listed upfront',
      ],
    },
    {
      num: '02',
      title: 'Decide',
      kicker: 'Comparison Engine',
      subtitle: 'Algorithmic supplier scoring — so the optimal decision is immediate.',
      description:
        'Supplier comparison shouldn’t be a complex spreadsheet. On every product, VYRO transparently scores competing offers across three vital operational parameters: Best Unit Price, Fastest Dispatch Lead Time, and Best Price-Time Value.',
      image: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=1000&q=80',
      caption: 'Executive chef & procurement manager assessing wholesale culinary inputs',
      mock: {
        badge: 'Multi-Supplier Ranking',
        query: 'Ranked Offers on Samba Rice 25kg',
        hits: 'Scored by price, time & fulfillment',
        pills: ['Best Price', 'Best Value', 'Fastest'],
        stats: [
          { label: 'Rank #1', value: 'Lanka Agro (Rs. 4,200)' },
          { label: 'Rank #2', value: 'Colombo Wholesalers (Rs. 4,450)' },
          { label: 'Speed Winner', value: '24h Express Dispatch' },
        ],
      },
      points: [
        'Audited supplier verification: tax compliance, depot physical address, and historical ratings',
        'Real-time inventory availability tags (`in_stock` vs `on_demand`) to eliminate phantom supply',
        'Price-against-time weighting so operators can choose between lowest cost and critical speed',
      ],
    },
    {
      num: '03',
      title: 'Issue',
      kicker: 'Order Generation',
      subtitle: 'One single checkout. Multi-supplier automated purchase order split.',
      description:
        'Source Samba rice from a Kurunegala miller, pure Ceylon tea from a Kandy estate distributor, and shipping cartons from Colombo in one cart. At checkout, VYRO automatically splits the basket into independent, legally binding Purchase Orders (POs) with dedicated numbers and terms for each supplier.',
      image: 'https://images.unsplash.com/photo-1530587191325-3db32d826c18?auto=format&fit=crop&w=1000&q=80',
      caption: 'Staged shipping cartons with barcode dispatch manifests',
      mock: {
        badge: 'Automated Cart Split',
        query: 'Checkout: 3 Items across 2 Suppliers',
        hits: '2 Independent Purchase Orders Generated',
        pills: ['PO #2026-0841', 'PO #2026-0842'],
        stats: [
          { label: 'PO #1 (Lanka Agro)', value: 'Rs. 21,000 · 5 Bags' },
          { label: 'PO #2 (Island Logistics)', value: 'Rs. 47,500 · 5 Packs' },
          { label: 'Tax Document', value: 'Digital PO Issued' },
        ],
      },
      points: [
        'Zero mixed billing or combined supplier liability — each vendor receives their dedicated manifest',
        'Instant notification to supplier sales desks via email and realtime dashboard alerts',
        'Binding contract terms with price-lock guarantees until delivery completion',
      ],
    },
    {
      num: '04',
      title: 'Move',
      kicker: 'Fulfillment & Logistics',
      subtitle: 'A physical freight journey with an immutable digital audit log.',
      description:
        'Track every handoff in the fulfillment cycle in real-time: Order Acceptance → Warehouse Staging → Fleet Dispatch → Receiving Dock Signature. Both buyer and supplier view the exact same progress with vehicle details and digital Goods Receipt Notes (GRN).',
      image: 'https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?auto=format&fit=crop&w=1000&q=80',
      caption: 'Commercial freight logistics fleet on express transit across Sri Lanka',
      mock: {
        badge: 'Live Freight Dispatch Tracker',
        query: 'PO #2026-0841 · Western Province Route',
        hits: 'Stage: Out for Delivery · Arriving Today',
        pills: ['Accepted 09:30 AM', 'Staged 11:15 AM', 'En Route 02:00 PM'],
        stats: [
          { label: 'Vehicle Plate', value: 'WP-NB-4421' },
          { label: 'Assigned Driver', value: 'S. Kumara (+94 77...)' },
          { label: 'Delivery Dock', value: 'Receiving Confirmed' },
        ],
      },
      points: [
        'Every status transition is cryptographically logged with user, timestamp, and metadata',
        'Assigned vehicle registration numbers and direct contact for dispatch drivers',
        'Built-in dispute mitigation and dockside verification before final settlement',
      ],
    },
  ];

  return (
    <div className="bg-bone">
      {/* 1. HERO HEADER */}
      <section className="relative overflow-hidden bg-void text-paper grain py-16 sm:py-20 lg:py-24">
        <div className="absolute inset-0 opacity-40">
          <FlowCanvas tone="paper" density="hero" />
        </div>
        <div className="absolute -left-20 top-1/4 size-96 rounded-full bg-volt/10 blur-[120px] pointer-events-none" />
        <div className="absolute right-0 bottom-0 size-80 rounded-full bg-copper/10 blur-[120px] pointer-events-none" />

        <div className="relative max-w-stage mx-auto px-5 sm:px-8">
          <div className="grid lg:grid-cols-12 gap-12 lg:gap-10 items-center">
            {/* Left Column: Heading, interactive step selector, CTAs */}
            <div className="lg:col-span-7 space-y-6">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-paper/10 border border-paper/15 text-xs text-volt">
                <span className="size-2 rounded-full bg-volt animate-pulse" />
                <span className="vyro-kicker text-volt">The 4-Step Operating Model</span>
              </div>

              <h1 className="vyro-display text-4xl sm:text-6xl lg:text-[4.25rem] text-paper leading-[1.06] text-balance">
                How work moves <span className="text-volt block">through VYRO.</span>
              </h1>

              <p className="max-w-xl text-paper/75 text-base sm:text-lg leading-relaxed">
                From open wholesale catalog search across 25 Sri Lankan districts to algorithmic supplier ranking, multi-vendor cart splitting, and end-to-end GPS delivery tracking.
              </p>

              {/* Interactive Stage Switcher Pills */}
              <div className="space-y-3 pt-2">
                <span className="text-[10px] uppercase tracking-wider text-paper/50 block font-mono">
                  Interactive Journey Stages (Click to Explore):
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {HERO_STAGES.map((st, i) => {
                    const active = activeStage === i;
                    return (
                      <button
                        key={st.num}
                        type="button"
                        onClick={() => setActiveStage(i)}
                        className={cn(
                          'p-3 text-left border transition-all cursor-pointer group flex flex-col justify-between',
                          active
                            ? 'bg-volt text-ink border-volt shadow-[0_0_20px_rgba(198,220,74,0.35)] scale-[1.02]'
                            : 'bg-paper/5 text-paper/75 border-paper/15 hover:border-volt/50 hover:bg-paper/10',
                        )}
                      >
                        <span className={cn('vyro-metric text-xs font-bold', active ? 'text-ink' : 'text-copper')}>
                          {st.num}
                        </span>
                        <div className="mt-1">
                          <span className={cn('text-xs font-display font-semibold block', active ? 'text-ink' : 'text-paper')}>
                            {st.label}
                          </span>
                          <span className={cn('text-[9px] uppercase tracking-wider block', active ? 'text-ink/80' : 'text-paper/40')}>
                            {st.tag}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Dynamic Stage Narrative Callout */}
              <div className="p-4 bg-paper/5 border border-paper/15 backdrop-blur-md space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-volt font-mono font-semibold">Stage {currentStage.num} · {currentStage.title}</span>
                  <span className="text-[10px] text-paper/40 uppercase">Interactive Preview</span>
                </div>
                <p className="text-xs sm:text-sm text-paper/75 leading-relaxed">
                  {currentStage.desc}
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap gap-4 pt-2">
                <Link to="/search">
                  <Button size="lg" className="bg-volt text-ink hover:bg-volt-glow font-bold uppercase tracking-wider text-xs">
                    Search Wholesale Catalog →
                  </Button>
                </Link>
                <Link to="/onboarding/business">
                  <Button variant="secondary" size="lg" className="text-paper border-paper/30 hover:bg-paper hover:text-ink font-bold uppercase tracking-wider text-xs">
                    Register Your Business
                  </Button>
                </Link>
              </div>

              {/* Value Bullet Points */}
              <ul className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-paper/60 pt-2">
                {['Direct Mill Gate Pricing', 'Zero Hidden Broker Markups', '25 Districts Covered', 'Audited Tax Identifiers'].map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <span className="size-1.5 rotate-45 bg-volt shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Right Column: Visual Stage Showcase with Live Photo & Metrics */}
            <div className="lg:col-span-5 space-y-3">
              {/* Primary Interactive Photo Showcase Card */}
              <div className="relative overflow-hidden border border-paper/20 group h-80 sm:h-96 shadow-2xl">
                <img
                  src={currentStage.image}
                  alt={currentStage.title}
                  key={currentStage.image}
                  className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-void via-void/40 to-transparent" />

                {/* Floating Top Badge */}
                <div className="absolute top-4 left-4 right-4 flex items-center justify-between">
                  <span className="px-3 py-1 bg-ink/90 backdrop-blur-md border border-volt/40 text-volt text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 shadow-md">
                    <span className="size-1.5 rounded-full bg-volt animate-ping" />
                    {currentStage.badge}
                  </span>
                  <span className="text-[10px] font-mono bg-void/80 px-2 py-0.5 text-paper/70 border border-paper/15">
                    Movement {currentStage.num} of 04
                  </span>
                </div>

                {/* Floating Bottom Card */}
                <div className="absolute inset-x-3 bottom-3 p-4 bg-void/90 backdrop-blur-md border border-paper/15 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono text-volt uppercase tracking-wider">{currentStage.tag}</span>
                    <Link to={currentStage.actionRoute} className="text-xs font-semibold text-volt hover:underline flex items-center gap-1">
                      <span>{currentStage.actionLabel}</span>
                    </Link>
                  </div>
                  <h3 className="font-display text-lg text-paper leading-tight">{currentStage.title}</h3>

                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-paper/15 text-xs">
                    <div className="bg-paper/5 p-2 border border-paper/10">
                      <span className="text-[9px] uppercase tracking-wider text-paper/50 block">{currentStage.stat1.label}</span>
                      <span className="font-bold text-paper mt-0.5 block truncate">{currentStage.stat1.val}</span>
                    </div>
                    <div className="bg-paper/5 p-2 border border-paper/10">
                      <span className="text-[9px] uppercase tracking-wider text-paper/50 block">{currentStage.stat2.label}</span>
                      <span className="font-bold text-volt mt-0.5 block truncate">{currentStage.stat2.val}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Dual Secondary Mini Tiles */}
              <div className="grid grid-cols-2 gap-3">
                <div className="relative h-24 overflow-hidden border border-paper/15 group">
                  <img
                    src="https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=600&q=80"
                    alt="Primary rice mill warehousing"
                    className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-void/90 via-void/40 to-transparent" />
                  <div className="absolute bottom-2 left-2.5 right-2.5">
                    <span className="text-[9px] font-mono text-volt uppercase block">Primary Mill Gate</span>
                    <span className="text-xs font-display text-paper truncate block">Direct Quality Audit</span>
                  </div>
                </div>

                <div className="relative h-24 overflow-hidden border border-paper/15 group">
                  <img
                    src="https://images.unsplash.com/photo-1616432043562-3671ea2e5242?auto=format&fit=crop&w=600&q=80"
                    alt="Express Freight Transport Fleet"
                    className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-void/90 via-void/40 to-transparent" />
                  <div className="absolute bottom-2 left-2.5 right-2.5">
                    <span className="text-[9px] font-mono text-copper uppercase block">Express Freight Fleet</span>
                    <span className="text-xs font-display text-paper truncate block">25 District Network</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. THE 4 STEPS DETAILED BREAKDOWN WITH IMAGES & MOCKS */}
      <section className="divide-y divide-ink/10 border-b border-ink/10">
        {steps.map((s, idx) => {
          const isEven = idx % 2 === 1;
          return (
            <div key={s.num} className="max-w-stage mx-auto px-5 sm:px-8 py-20 lg:py-24">
              <div className="grid lg:grid-cols-12 gap-12 lg:gap-16 items-center">
                {/* Text & Explanations */}
                <div className={cn('lg:col-span-6 space-y-6', isEven && 'lg:order-2')}>
                  <div className="flex items-baseline gap-4">
                    <span className="vyro-metric text-5xl sm:text-6xl text-copper font-bold">{s.num}</span>
                    <div>
                      <span className="vyro-kicker text-copper block">{s.kicker}</span>
                      <h2 className="vyro-display text-3xl sm:text-4xl text-ink leading-tight">{s.title}</h2>
                    </div>
                  </div>

                  <p className="font-display text-lg text-ink font-semibold leading-snug">{s.subtitle}</p>
                  <p className="text-sm sm:text-base text-ink-3 leading-relaxed">{s.description}</p>

                  <ul className="space-y-3 pt-2">
                    {s.points.map((point) => (
                      <li key={point} className="flex items-start gap-3 text-xs sm:text-sm text-ink-2">
                        <CheckCircleIcon size={16} className="text-volt-dark shrink-0 mt-0.5" />
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="pt-4">
                    <Link
                      to="/search"
                      className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-copper hover:text-ink transition-colors"
                    >
                      <span>Explore this in the catalog</span>
                      <span>→</span>
                    </Link>
                  </div>
                </div>

                {/* Visual Imagery & Interactive Simulation Card */}
                <div className={cn('lg:col-span-6 space-y-4', isEven && 'lg:order-1')}>
                  {/* High-Resolution Photo */}
                  <div className="relative overflow-hidden border border-ink/15 group shadow-sm">
                    <img
                      src={s.image}
                      alt={s.caption}
                      loading="lazy"
                      className="w-full h-64 sm:h-80 object-cover group-hover:scale-105 transition-transform duration-700"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-void/85 via-void/30 to-transparent" />
                    <div className="absolute top-3 left-3 px-2.5 py-1 bg-ink text-volt text-[10px] font-bold uppercase tracking-wider border border-volt/30 flex items-center gap-1.5 shadow-md">
                      <ShieldCheckIcon size={12} />
                      Verified Process
                    </div>
                    <div className="absolute bottom-3 left-4 right-4 text-paper text-xs flex items-center justify-between">
                      <span className="font-mono text-paper/80 truncate">{s.caption}</span>
                      <span className="text-[10px] font-mono text-volt uppercase shrink-0">Stage {s.num}</span>
                    </div>
                  </div>

                  {/* Interactive UI Card Simulation */}
                  <div className="bg-paper border border-ink/15 p-5 shadow-md space-y-3">
                    <div className="flex items-center justify-between border-b border-ink/10 pb-2.5">
                      <span className="vyro-kicker text-copper">{s.mock.badge}</span>
                      <span className="text-[11px] font-mono text-ink-4">{s.mock.hits}</span>
                    </div>
                    <div className="font-display text-base text-ink font-semibold truncate">{s.mock.query}</div>

                    <div className="flex flex-wrap gap-1.5">
                      {s.mock.pills.map((pill) => (
                        <span key={pill} className="px-2 py-0.5 text-[10px] font-mono bg-bone border border-ink/10 text-ink-3">
                          {pill}
                        </span>
                      ))}
                    </div>

                    <div className="grid grid-cols-3 gap-2 pt-2 border-t border-ink/10 text-xs">
                      {s.mock.stats.map((st) => (
                        <div key={st.label} className="bg-bone p-2 border border-ink/10">
                          <span className="text-[9px] uppercase tracking-wider text-ink-4 block">{st.label}</span>
                          <span className="font-bold text-ink block mt-0.5 truncate">{st.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </section>

      {/* 3. COMPARISON TABLE: WHATSAPP VS VYRO */}
      <section className="bg-paper py-20">
        <div className="max-w-stage mx-auto px-5 sm:px-8">
          <div className="max-w-2xl mb-12">
            <div className="vyro-kicker text-copper">Comparison</div>
            <h2 className="mt-2 vyro-display text-3xl sm:text-5xl text-ink">Why the old stack fails operators.</h2>
            <p className="mt-3 text-sm text-ink-3 leading-relaxed">
              Informal trading creates communication friction, unaccountable price changes, and delivery delays. Here is how VYRO standardizes the entire procurement movement.
            </p>
          </div>

          <div className="overflow-x-auto border border-ink/15">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="bg-ink text-paper border-b border-ink">
                  <th className="p-4 font-display text-base font-semibold w-1/4">Procurement Stage</th>
                  <th className="p-4 font-display text-base font-semibold w-3/8 text-paper/70">
                    The Informal Stack (WhatsApp / Calls)
                  </th>
                  <th className="p-4 font-display text-base font-semibold w-3/8 text-volt">
                    The VYRO Operating Layer
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/10 bg-paper text-ink">
                <tr>
                  <td className="p-4 font-semibold text-ink">1. Price Discovery</td>
                  <td className="p-4 text-ink-4">Multiple phone calls, unverified WhatsApp voice notes, expiring quotes.</td>
                  <td className="p-4 font-medium text-ink bg-volt/5">
                    Live LKR rates on every product from verified primary mills with price-lock guarantees.
                  </td>
                </tr>
                <tr>
                  <td className="p-4 font-semibold text-ink">2. Supplier Comparison</td>
                  <td className="p-4 text-ink-4">Manual scribbling on paper chits, hidden broker commissions, uncertain stock.</td>
                  <td className="p-4 font-medium text-ink bg-volt/5">
                    Algorithmic ranking by Best Price, Shortest Lead Time, and Best Value on a single screen.
                  </td>
                </tr>
                <tr>
                  <td className="p-4 font-semibold text-ink">3. Purchase Orders</td>
                  <td className="p-4 text-ink-4">Informal chat texts without binding signatures, legal protection, or clear specs.</td>
                  <td className="p-4 font-medium text-ink bg-volt/5">
                    Automated multi-supplier cart split with cryptographically hashed, tax-compliant PO numbers.
                  </td>
                </tr>
                <tr>
                  <td className="p-4 font-semibold text-ink">4. Delivery Tracking</td>
                  <td className="p-4 text-ink-4">"Driver is on the way" texts, lost trucks, unverified dock handoffs.</td>
                  <td className="p-4 font-medium text-ink bg-volt/5">
                    Live journey tracking with vehicle registration, driver mobile, and digital receipt signature.
                  </td>
                </tr>
                <tr>
                  <td className="p-4 font-semibold text-ink">5. Billing & Invoices</td>
                  <td className="p-4 text-ink-4">Crumpled handwritten carbon paper invoices, payment discrepancies.</td>
                  <td className="p-4 font-medium text-ink bg-volt/5">
                    Digital invoice matching, complete itemized audit history, and direct vendor reconciliation.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* 4. ISLAND-WIDE COVERAGE */}
      <section className="bg-bone border-t border-ink/10 py-20">
        <div className="max-w-stage mx-auto px-5 sm:px-8">
          <div className="grid lg:grid-cols-12 gap-12 items-center">
            <div className="lg:col-span-5 space-y-6">
              <div className="vyro-kicker text-copper">National Footprint</div>
              <h2 className="vyro-display text-3xl sm:text-5xl text-ink">Covering all 25 districts of Sri Lanka.</h2>
              <p className="text-sm sm:text-base text-ink-3 leading-relaxed">
                Whether you operate a beachfront resort in Galle, a commercial bakery in Kandy, or an industrial packaging plant in Gampaha, VYRO routes freight through verified regional transport lines.
              </p>
              <div className="grid grid-cols-2 gap-4 pt-2">
                <div className="p-4 bg-paper border border-ink/15">
                  <span className="vyro-metric text-3xl font-bold text-ink">24h</span>
                  <span className="text-xs text-ink-3 block mt-1">Western Province Express Dispatch</span>
                </div>
                <div className="p-4 bg-paper border border-ink/15">
                  <span className="vyro-metric text-3xl font-bold text-ink">48h</span>
                  <span className="text-xs text-ink-3 block mt-1">Island-Wide Bulk Mill Deliveries</span>
                </div>
              </div>
            </div>

            <div className="lg:col-span-7">
              <div className="grid sm:grid-cols-2 gap-4">
                {[
                  {
                    corridor: 'Western Freight Hub',
                    districts: 'Colombo · Gampaha · Kalutara',
                    notes: 'Direct importer distribution, Pettah wholesale lines, packaging hubs.',
                    img: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=600&q=80',
                  },
                  {
                    corridor: 'Central Estate Corridor',
                    districts: 'Kandy · Matale · Nuwara Eliya',
                    notes: 'Pure Ceylon BOPF tea estates, highland vegetables, cold storage lots.',
                    img: 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?auto=format&fit=crop&w=600&q=80',
                  },
                  {
                    corridor: 'Agricultural Grain Belt',
                    districts: 'Kurunegala · Anuradhapura · Polonnaruwa',
                    notes: 'Primary rice millers, grain processing, spices and agricultural bulk.',
                    img: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=600&q=80',
                  },
                  {
                    corridor: 'Southern Coastal Line',
                    districts: 'Galle · Matara · Hambantota',
                    notes: 'Hotels and resort hospitality supply, commercial seafood, bulk oils.',
                    img: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=600&q=80',
                  },
                ].map((c) => (
                  <div key={c.corridor} className="bg-paper border border-ink/15 overflow-hidden group">
                    <div className="relative h-32 overflow-hidden bg-bone">
                      <img
                        src={c.img}
                        alt={c.corridor}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-void/80 to-transparent" />
                      <span className="absolute bottom-2 left-3 font-display text-paper text-sm font-semibold">
                        {c.corridor}
                      </span>
                    </div>
                    <div className="p-4 space-y-1">
                      <span className="text-[10px] font-mono uppercase text-copper block">{c.districts}</span>
                      <p className="text-xs text-ink-3 leading-snug">{c.notes}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 5. BOTTOM CONVERSION CTA */}
      <section className="bg-ink text-paper grain relative overflow-hidden">
        <div className="absolute inset-0 opacity-25">
          <FlowCanvas tone="paper" density="hero" />
        </div>

        <div className="relative max-w-stage mx-auto px-5 sm:px-8 py-20 grid lg:grid-cols-2 gap-8">
          {/* Buyer CTA */}
          <div className="relative overflow-hidden border border-paper/15 p-8 sm:p-10 flex flex-col justify-between group">
            <img
              src="https://images.unsplash.com/photo-1577219491135-ce391730fb2c?auto=format&fit=crop&w=800&q=80"
              alt="Procurement manager in kitchen"
              className="absolute inset-0 w-full h-full object-cover opacity-20 group-hover:opacity-30 group-hover:scale-105 transition-all duration-700"
            />
            <div className="relative z-10 space-y-4">
              <div className="flex items-center gap-2">
                <BrandMark size={24} tone="volt" />
                <span className="vyro-kicker text-volt">Commercial Procurement</span>
              </div>
              <h2 className="vyro-display text-3xl sm:text-4xl text-paper">Move your buying to VYRO today.</h2>
              <p className="text-sm text-paper/75 max-w-md leading-relaxed">
                Register your business in under 2 minutes. Search open wholesale prices, compare verified mills, and issue purchase orders with full delivery tracking.
              </p>
            </div>
            <div className="relative z-10 pt-8">
              <Link to="/onboarding/business">
                <Button className="bg-volt text-ink hover:bg-volt-glow font-bold uppercase tracking-wider text-xs px-6 py-3">
                  Register Your Business →
                </Button>
              </Link>
            </div>
          </div>

          {/* Supplier CTA */}
          <div className="relative overflow-hidden border border-paper/15 p-8 sm:p-10 flex flex-col justify-between group">
            <img
              src="https://images.unsplash.com/photo-1553413077-190dd305871c?auto=format&fit=crop&w=800&q=80"
              alt="Supplier warehouse logistics"
              className="absolute inset-0 w-full h-full object-cover opacity-20 group-hover:opacity-30 group-hover:scale-105 transition-all duration-700"
            />
            <div className="relative z-10 space-y-4">
              <div className="flex items-center gap-2">
                <BrandMark size={24} tone="paper" />
                <span className="vyro-kicker text-copper">Authorized Distribution</span>
              </div>
              <h2 className="vyro-display text-3xl sm:text-4xl text-paper">Put your mill or catalog in the flow.</h2>
              <p className="text-sm text-paper/75 max-w-md leading-relaxed">
                Receive binding purchase orders from hotels, restaurants, and retail stores across the island without chasing informal phone bids.
              </p>
            </div>
            <div className="relative z-10 pt-8">
              <Link to="/onboarding/supplier">
                <Button variant="secondary" className="text-paper border-paper/30 hover:bg-paper hover:text-ink font-bold uppercase tracking-wider text-xs px-6 py-3">
                  List as Authorized Supplier →
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

