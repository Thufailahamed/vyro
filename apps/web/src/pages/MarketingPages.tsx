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

/**
 * Demo content flag — when set to "1" via VITE_DEMO_CONTENT, renders the
 * seeded mock statistics, supplier names, PO numbers, and stock imagery
 * that ship in the public marketing surface. Production builds leave this
 * unset, so marketing pages show empty placeholders instead of fabricated
 * metrics. See docs/superpowers/specs/2026-09-06-vyro-production-readiness-design.md.
 */
const DEMO_CONTENT = import.meta.env.VITE_DEMO_CONTENT === '1';

const PLACEHOLDER = '—';
const PLACEHOLDER_STAT = { val: PLACEHOLDER, lbl: PLACEHOLDER };
const PLACEHOLDER_STATS = [PLACEHOLDER_STAT, PLACEHOLDER_STAT, PLACEHOLDER_STAT, PLACEHOLDER_STAT];

const HERO_TOP_STATS = DEMO_CONTENT
  ? [
      { val: '25', lbl: 'Districts Connected' },
      { val: '100%', lbl: 'Verified Tax & Depot IDs' },
      { val: 'Rs. 100M+', lbl: 'Monthly B2B Volume' },
      { val: '0%', lbl: 'Hidden Broker Markups' },
    ]
  : PLACEHOLDER_STATS;

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
                {HERO_TOP_STATS.map((s) => (
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
          {(DEMO_CONTENT
            ? [
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
          ]
            : []
          ).map((hub) => (
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
          {!DEMO_CONTENT && (
            <div className="col-span-3 text-center text-ink-3 py-12 text-sm">
              Partner depots are listed after admin verification — check back soon.
            </div>
          )}
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
