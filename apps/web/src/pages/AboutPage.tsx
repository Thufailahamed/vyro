import type { ReactNode } from 'react';
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
  ArrowRightIcon,
  Building2Icon,
  CheckIcon,
  EyeIcon,
  FileTextIcon,
  MapPinIcon,
  ShieldCheckIcon,
  StoreIcon,
  TruckIcon,
  WarehouseIcon,
  BanknoteIcon,
  CreditCardIcon,
  PackageIcon,
  XIcon,
} from '@/components/icons';
import { cn } from '@vyro/ui';

/**
 * Demo content flag — when set to "1" via VITE_DEMO_CONTENT, renders the
 * seeded mock statistics, supplier names and stock imagery. Production builds
 * leave this unset, so the page shows only non-numeric, illustrative content.
 * See docs/superpowers/specs/2026-09-06-vyro-production-readiness-design.md.
 */
const DEMO_CONTENT = import.meta.env.VITE_DEMO_CONTENT === '1';

const DEMO_STATS = [
  { val: '25', lbl: 'Districts connected' },
  { val: '100%', lbl: 'Verified tax & depot IDs' },
  { val: 'Rs. 100M+', lbl: 'Monthly B2B volume' },
  { val: '0%', lbl: 'Hidden broker markups' },
];

const NETWORK_ROLES = [
  { icon: <Building2Icon size={16} />, label: 'Commercial buyers' },
  { icon: <WarehouseIcon size={16} />, label: 'Primary mills' },
  { icon: <StoreIcon size={16} />, label: 'Authorized distributors' },
  { icon: <TruckIcon size={16} />, label: 'Logistics depots' },
];

const PRODUCTS = [
  {
    icon: <PackageIcon size={18} />,
    name: 'VYRO Procurement',
    desc: 'Catalog, offer comparison and multi-supplier purchase orders.',
    status: 'Live',
  },
  {
    icon: <TruckIcon size={18} />,
    name: 'VYRO Logistics',
    desc: 'Dispatch, vehicle assignment and goods receipt at the dock.',
    status: 'Live',
  },
  {
    icon: <BanknoteIcon size={18} />,
    name: 'VYRO Pay',
    desc: 'Settlement matched to orders and invoices.',
    status: 'In flow',
  },
  {
    icon: <CreditCardIcon size={18} />,
    name: 'VYRO Credit',
    desc: 'Working-capital terms built on order history.',
    status: 'Next',
  },
];

const PRINCIPLES = [
  {
    icon: <EyeIcon size={18} />,
    tag: 'Transparency',
    title: 'Price visibility',
    desc: 'LKR unit prices posted directly by suppliers, with no broker markups or hidden rebates.',
  },
  {
    icon: <ShieldCheckIcon size={18} />,
    tag: 'Accountability',
    title: 'Physical verification',
    desc: 'Suppliers are checked for business registration, tax compliance and a real storage facility.',
  },
  {
    icon: <FileTextIcon size={18} />,
    tag: 'Legal standing',
    title: 'Binding purchase orders',
    desc: 'A checkout becomes numbered purchase orders with recorded terms, not casual chat messages.',
  },
  {
    icon: <MapPinIcon size={18} />,
    tag: 'National reach',
    title: 'Island-wide access',
    desc: 'Mills in Kurunegala and estates in Kandy reach buyers across the island on equal terms.',
  },
];

const VERIFICATION_STEPS = [
  { title: 'Business registry', desc: 'Registration and ownership confirmed.' },
  { title: 'Tax compliance', desc: 'Active tax identifiers checked.' },
  { title: 'Site check', desc: 'Storage facility and depot address verified.' },
];

const DEMO_HUBS = [
  {
    name: 'Colombo Central Wholesalers',
    role: 'Import commodities & staples',
    location: 'Pettah, Colombo 11',
    coverage: 'Western Province express fleet',
    img: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=800&q=80',
  },
  {
    name: 'Lanka Agro Mills & Processing',
    role: 'Primary rice mill & grain processor',
    location: 'Industrial Zone, Kurunegala',
    coverage: 'Island-wide bulk deliveries',
    img: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=800&q=80',
  },
  {
    name: 'Island Logistics & Cold Chain',
    role: 'Estate beverage & dairy depot',
    location: 'Katugastota Road, Kandy',
    coverage: 'Central Province cold chain',
    img: 'https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?auto=format&fit=crop&w=800&q=80',
  },
];

/* ------------------------------------------------------------------ */
/* Visuals                                                             */
/* ------------------------------------------------------------------ */

function NetworkNode({ icon, label, align }: { icon: ReactNode; label: string; align: 'left' | 'right' }) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-xl border border-paper/10 bg-paper/[0.04] px-2.5 py-2 backdrop-blur sm:px-3',
        align === 'right' && 'flex-row-reverse text-right',
      )}
    >
      <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-paper/[0.07] text-paper/80">{icon}</span>
      <span className="truncate text-[11px] font-medium text-paper/85">{label}</span>
    </div>
  );
}

/** Hub-and-spoke diagram: buyers on the left, suppliers on the right, VYRO in the middle. */
function NetworkVisual({ animate }: { animate: boolean }) {
  const ys = [16.7, 50, 83.3];
  const dash = animate ? 'animate-flow-dash' : undefined;
  return (
    <div className="relative h-full">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
        {ys.map((y) => (
          <g key={y}>
            <path
              d={`M34 ${y} C 42 ${y}, 40 50, 46 50`}
              fill="none"
              stroke="rgba(198,220,74,0.55)"
              strokeWidth="1.25"
              strokeDasharray="3 5"
              vectorEffect="non-scaling-stroke"
              className={dash}
            />
            <path
              d={`M54 50 C 60 50, 58 ${y}, 66 ${y}`}
              fill="none"
              stroke="rgba(184,122,78,0.6)"
              strokeWidth="1.25"
              strokeDasharray="3 5"
              vectorEffect="non-scaling-stroke"
              className={dash}
            />
          </g>
        ))}
      </svg>

      <div className="relative grid h-full grid-cols-[34%_32%_34%]">
        <div className="grid grid-rows-3 items-center">
          <NetworkNode icon={<Building2Icon size={14} />} label="Hotels" align="left" />
          <NetworkNode icon={<StoreIcon size={14} />} label="Restaurants" align="left" />
          <NetworkNode icon={<PackageIcon size={14} />} label="Retail" align="left" />
        </div>

        <div className="grid place-items-center">
          <div className="relative grid place-items-center">
            <span className="absolute size-28 rounded-full border border-volt/15 sm:size-32" />
            <span className="absolute size-20 rounded-full border border-volt/25 sm:size-24" />
            <span className="absolute size-16 rounded-full bg-volt/20 blur-xl" />
            <span className="relative grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-ink-2 to-void ring-1 ring-volt/40 shadow-[0_0_40px_-6px_rgba(198,220,74,0.6)]">
              <BrandMark size={30} tone="volt" />
            </span>
          </div>
        </div>

        <div className="grid grid-rows-3 items-center">
          <NetworkNode icon={<WarehouseIcon size={14} />} label="Mills" align="right" />
          <NetworkNode icon={<StoreIcon size={14} />} label="Distributors" align="right" />
          <NetworkNode icon={<TruckIcon size={14} />} label="Depots" align="right" />
        </div>
      </div>

      <span className="absolute left-0 top-0 -translate-y-1 font-mono text-[9px] uppercase tracking-wider text-paper/35">Buyers</span>
      <span className="absolute right-0 top-0 -translate-y-1 font-mono text-[9px] uppercase tracking-wider text-paper/35">Suppliers</span>
    </div>
  );
}

function Bubble({ side, children, time }: { side: 'in' | 'out'; children: ReactNode; time: string }) {
  return (
    <div className={cn('flex', side === 'out' && 'justify-end')}>
      <div
        className={cn(
          'max-w-[80%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-snug',
          side === 'in' ? 'rounded-tl-md bg-paper text-ink' : 'rounded-tr-md bg-ink-3 text-paper',
        )}
      >
        {children}
        <span className={cn('mt-1 block text-right font-mono text-[9px]', side === 'in' ? 'text-ink-5' : 'text-paper/40')}>
          {time}
        </span>
      </div>
    </div>
  );
}

/** "The old way": a wholesale order negotiated over chat. */
function ChatVisual() {
  return (
    <div className="relative">
      <div className="pointer-events-none absolute -inset-4 rounded-[36px] bg-gradient-to-br from-copper/25 via-transparent to-rose/20 blur-2xl" />
      <div className="relative overflow-hidden rounded-[28px] border border-ink/10 bg-ink-2 shadow-[0_50px_100px_-40px_rgba(12,14,11,0.6)]">
        <div className="flex items-center gap-3 border-b border-paper/[0.07] px-5 py-4">
          <span className="grid size-9 place-items-center rounded-full bg-paper/10 font-display text-sm font-bold text-paper/80">
            B
          </span>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-paper">Rice broker</div>
            <div className="text-[11px] text-paper/45">last seen yesterday</div>
          </div>
          <span className="ml-auto rounded-full bg-rose/15 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-rose ring-1 ring-inset ring-rose/30">
            The old way
          </span>
        </div>

        <div className="space-y-2.5 bg-[radial-gradient(circle_at_20%_0%,rgba(250,247,240,0.04),transparent_60%)] p-5">
          <Bubble side="out" time="08:02">Rate for samba 25kg today?</Bubble>
          <Bubble side="in" time="09:47">
            <span className="flex items-center gap-2.5">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-ink text-paper">
                <svg viewBox="0 0 10 10" className="size-2.5" aria-hidden>
                  <path d="M2 1 L9 5 L2 9 Z" fill="currentColor" />
                </svg>
              </span>
              <span className="flex h-5 items-center gap-[3px]" aria-hidden>
                {[6, 12, 8, 16, 10, 18, 7, 13, 9, 15, 6, 11, 8, 14].map((h, i) => (
                  <span key={i} className="w-[2px] rounded-full bg-ink/40" style={{ height: h }} />
                ))}
              </span>
              <span className="font-mono text-[10px] text-ink-4">0:42</span>
            </span>
          </Bubble>
          <Bubble side="in" time="09:48">
            <span className="mb-1.5 flex h-16 w-40 items-center justify-center rounded-lg bg-mist font-mono text-[10px] text-ink-4">
              price_list_v3_FINAL.jpg
            </span>
            Price went up again, sorry
          </Bubble>
          <Bubble side="out" time="11:15">When will the truck come?</Bubble>
          <Bubble side="in" time="16:30">Tomorrow maybe</Bubble>
        </div>

        <div className="grid grid-cols-3 border-t border-paper/[0.07] text-[11px]">
          {['No PO', 'No tracking', 'No audit trail'].map((t, i) => (
            <span key={t} className={cn('flex items-center justify-center gap-1.5 px-2 py-3 text-paper/55', i > 0 && 'border-l border-paper/[0.07]')}>
              <XIcon size={11} className="shrink-0 text-rose" />
              <span className="truncate">{t}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export function AboutPage() {
  const reduced = usePrefersReducedMotion();

  return (
    <div className="bg-bone">
      {/* 1. HERO */}
      <section className="relative overflow-hidden bg-void text-paper grain">
        <DarkBackdrop />

        <div className="relative mx-auto max-w-stage px-5 pb-20 pt-14 sm:px-8 sm:pt-20 lg:pb-28 lg:pt-24">
          <div className="grid items-center gap-14 lg:grid-cols-12 lg:gap-12">
            <div className="lg:col-span-7">
              <div className="inline-flex items-center gap-2.5 rounded-full border border-paper/10 bg-paper/[0.04] py-1.5 pl-2 pr-4 backdrop-blur">
                <span className="rounded-full bg-volt px-2 py-0.5 font-mono text-[10px] font-bold text-ink">About</span>
                <span className="text-xs font-medium text-paper/70">The B2B commerce operating layer</span>
              </div>

              <h1 className="vyro-display mt-7 text-[clamp(1.9rem,8.4vw,3.5rem)] leading-[0.95] text-paper lg:text-[3.1rem] xl:text-[4rem]">
                Built as infrastructure, <span className="text-volt">not a storefront.</span>
              </h1>

              <p className="mt-7 max-w-xl text-base leading-relaxed text-paper/65 sm:text-lg">
                VYRO connects Sri Lankan commercial buyers, primary mills, authorized distributors and logistics depots
                into one continuous, accountable commerce network.
              </p>

              <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
                <PrimaryCta to="/search">Explore the wholesale catalog</PrimaryCta>
                <GhostCta to="/how-it-works">See how it works</GhostCta>
              </div>

              {DEMO_CONTENT ? (
                <dl className="mt-10 grid max-w-xl grid-cols-2 gap-x-6 gap-y-5 border-t border-paper/10 pt-6 sm:grid-cols-4">
                  {DEMO_STATS.map((s) => (
                    <div key={s.lbl}>
                      <dd className="vyro-metric text-2xl font-bold text-paper">{s.val}</dd>
                      <dt className="mt-1 text-[11px] leading-tight text-paper/50">{s.lbl}</dt>
                    </div>
                  ))}
                </dl>
              ) : (
                <div className="mt-10 max-w-xl border-t border-paper/10 pt-6">
                  <div className="font-mono text-[10px] uppercase tracking-wider text-paper/40">On the network</div>
                  <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
                    {NETWORK_ROLES.map((r) => (
                      <li key={r.label} className="flex items-center gap-2.5 text-sm text-paper/70">
                        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-paper/[0.06] text-volt ring-1 ring-inset ring-paper/10">
                          {r.icon}
                        </span>
                        {r.label}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="relative lg:col-span-5">
              <div className="pointer-events-none absolute -inset-8 rounded-[40px] bg-volt/[0.07] blur-3xl" />
              <Console
                route="network"
                className="relative"
                footer={
                  <div className="border-t border-paper/[0.07] px-5 py-4">
                    <div className="font-mono text-[10px] uppercase tracking-wider text-paper/40">One synchronized record</div>
                    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {['Identity', 'Pricing', 'Inventory', 'Delivery'].map((l) => (
                        <span
                          key={l}
                          className="inline-flex items-center gap-1.5 rounded-full bg-paper/[0.05] px-3 py-1.5 text-[11px] font-medium text-paper/80 ring-1 ring-inset ring-paper/10"
                        >
                          <CheckIcon size={11} className="text-volt" />
                          {l}
                        </span>
                      ))}
                    </div>
                  </div>
                }
              >
                <div className="h-[300px] px-4 pb-5 pt-7 sm:h-[340px] sm:px-6">
                  <NetworkVisual animate={!reduced} />
                </div>
              </Console>
            </div>
          </div>
        </div>
      </section>

      {/* 2. MARKET REALITY */}
      <section className="mx-auto max-w-stage px-5 py-20 sm:px-8 sm:py-28">
        <div className="grid items-center gap-14 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-6">
            <div className="vyro-kicker text-copper">The market reality</div>
            <h2 className="vyro-display mt-3 text-[2.25rem] text-ink sm:text-5xl text-balance">
              Wholesale was trapped in screenshots & voice notes.
            </h2>
            <p className="mt-6 text-base leading-relaxed text-ink-3">
              Procurement for kitchens, hotels and retailers meant chasing daily quotes over WhatsApp, decoding
              unverified price lists and paying commission-charging middlemen.
            </p>
            <p className="mt-4 text-base leading-relaxed text-ink-3">
              A restaurant buying rice couldn’t tell whether it was getting the real mill gate rate. A hotel ordering
              tea had no tracking until the truck pulled up at the bay.
            </p>

            <figure className="mt-8 rounded-2xl border border-ink/10 bg-paper p-6">
              <div className="flex items-center gap-2">
                <span className="h-4 w-1 rounded-full bg-copper" />
                <span className="font-display text-sm font-semibold text-ink">The middleman tax</span>
              </div>
              <blockquote className="mt-2 text-sm leading-relaxed text-ink-3">
                Informal broker chains add hidden markups between the factory gate and the kitchen dock, and nobody on
                either side can see them.
              </blockquote>
            </figure>
          </div>

          <div className="lg:col-span-6">
            <ChatVisual />
          </div>
        </div>
      </section>

      {/* 3. ARCHITECTURE */}
      <section className="relative overflow-hidden border-y border-ink/10 bg-paper py-20 sm:py-28">
        <div className="mx-auto max-w-stage px-5 sm:px-8">
          <div className="grid items-center gap-14 lg:grid-cols-12 lg:gap-16">
            <div className="lg:col-span-5">
              <div className="vyro-kicker text-copper">The operating architecture</div>
              <h2 className="vyro-display mt-3 text-[2.25rem] text-ink sm:text-5xl text-balance">
                One unified layer for commercial trade.
              </h2>
              <p className="mt-6 text-base leading-relaxed text-ink-3">
                VYRO keeps identity, pricing, inventory and delivery in sync. A single cart splits into separate
                supplier purchase orders, and every status change lands on the same audit trail.
              </p>
              <Link
                to="/how-it-works"
                className="group mt-8 inline-flex items-center gap-2 text-sm font-semibold text-ink underline decoration-copper/40 decoration-2 underline-offset-[6px] transition hover:decoration-copper"
              >
                Walk through the four steps
                <ArrowRightIcon size={15} className="transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>

            <div className="lg:col-span-7">
              <ol className="relative space-y-3">
                <span className="absolute bottom-8 left-[2.15rem] top-8 hidden w-px sm:block bg-gradient-to-b from-volt-deep/60 via-ink/15 to-transparent" aria-hidden />
                {PRODUCTS.map((p, i) => {
                  const live = p.status === 'Live';
                  return (
                    <li
                      key={p.name}
                      className={cn(
                        'relative flex items-center gap-4 rounded-2xl border p-4 transition sm:gap-5 sm:p-5',
                        live ? 'border-ink/10 bg-bone' : 'border-dashed border-ink/15 bg-transparent',
                        ['', 'sm:ml-3', 'sm:ml-6', 'sm:ml-9'][i],
                      )}
                    >
                      <span
                        className={cn(
                          'relative grid size-11 shrink-0 place-items-center rounded-xl',
                          live ? 'bg-ink text-volt' : 'bg-ink/[0.05] text-ink-4',
                        )}
                      >
                        {p.icon}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="font-display text-base font-semibold text-ink">{p.name}</div>
                        <p className="mt-0.5 text-sm leading-snug text-ink-3">{p.desc}</p>
                      </div>
                      <span
                        className={cn(
                          'shrink-0 rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider',
                          live && 'bg-volt/25 text-volt-deep ring-1 ring-inset ring-volt-deep/25',
                          p.status === 'In flow' && 'bg-copper/15 text-copper-deep ring-1 ring-inset ring-copper/30',
                          p.status === 'Next' && 'bg-ink/[0.05] text-ink-4 ring-1 ring-inset ring-ink/10',
                        )}
                      >
                        {p.status}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </div>
          </div>
        </div>
      </section>

      {/* 4. PRINCIPLES */}
      <section className="py-20 sm:py-28">
        <div className="mx-auto max-w-stage px-5 sm:px-8">
          <div className="grid items-end gap-6 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <div className="vyro-kicker text-copper">Our standards</div>
              <h2 className="vyro-display mt-3 text-[2.25rem] text-ink sm:text-5xl text-balance">
                Four principles we don’t bend.
              </h2>
            </div>
            <p className="text-base leading-relaxed text-ink-3 lg:col-span-5">
              Every part of the product and the way we operate serves these commitments to Sri Lankan operators.
            </p>
          </div>

          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PRINCIPLES.map((p, i) => (
              <div
                key={p.title}
                className={cn(
                  'group relative flex flex-col overflow-hidden rounded-[24px] p-6 transition duration-500 ease-cinematic hover:-translate-y-1 sm:p-7',
                  i === 0
                    ? 'bg-void text-paper shadow-[0_30px_80px_-40px_rgba(12,14,11,0.7)]'
                    : 'border border-ink/10 bg-paper hover:shadow-[0_30px_80px_-50px_rgba(12,14,11,0.5)]',
                )}
              >
                {i === 0 && <span className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full bg-volt/15 blur-3xl" />}
                <div className="relative flex items-center justify-between">
                  <span
                    className={cn(
                      'grid size-11 place-items-center rounded-xl',
                      i === 0 ? 'bg-volt text-ink' : 'bg-ink text-volt',
                    )}
                  >
                    {p.icon}
                  </span>
                  <span className={cn('font-mono text-xs', i === 0 ? 'text-paper/40' : 'text-ink-5')}>0{i + 1}</span>
                </div>
                <div className={cn('relative mt-10 font-mono text-[10px] uppercase tracking-wider', i === 0 ? 'text-volt' : 'text-copper')}>
                  {p.tag}
                </div>
                <h3 className={cn('relative mt-2 font-display text-xl font-semibold', i === 0 ? 'text-paper' : 'text-ink')}>
                  {p.title}
                </h3>
                <p className={cn('relative mt-2 text-sm leading-relaxed', i === 0 ? 'text-paper/65' : 'text-ink-3')}>{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 5. SUPPLY BASE */}
      <section className="border-t border-ink/10 bg-paper py-20 sm:py-28">
        <div className="mx-auto max-w-stage px-5 sm:px-8">
          <div className="grid items-end gap-6 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <div className="vyro-kicker text-copper">Network depots</div>
              <h2 className="vyro-display mt-3 text-[2.25rem] text-ink sm:text-5xl text-balance">The physical supply base.</h2>
            </div>
            <p className="text-base leading-relaxed text-ink-3 lg:col-span-5">
              Real facilities, warehouses and delivery fleets. Every depot is verified before it appears on the network.
            </p>
          </div>

          <div className="mt-12 overflow-hidden rounded-[28px] bg-void text-paper">
            <div className="grid lg:grid-cols-12">
              <div className="relative p-8 sm:p-10 lg:col-span-5">
                <span className="pointer-events-none absolute -left-20 -top-20 size-64 rounded-full bg-volt/10 blur-3xl" />
                <span className="relative grid size-12 place-items-center rounded-2xl bg-volt text-ink">
                  <ShieldCheckIcon size={22} />
                </span>
                <h3 className="vyro-display relative mt-6 text-2xl sm:text-3xl">How a facility gets verified</h3>
                <p className="relative mt-3 text-sm leading-relaxed text-paper/60">
                  {DEMO_CONTENT
                    ? 'Each partner below passed the same three checks before taking its first order.'
                    : 'Partner depots are listed here once they pass admin verification.'}
                </p>
                <Link
                  to="/onboarding/supplier"
                  className="group relative mt-8 inline-flex items-center gap-2 text-sm font-semibold text-volt"
                >
                  List your facility
                  <ArrowRightIcon size={15} className="transition-transform group-hover:translate-x-0.5" />
                </Link>
              </div>
              <ol className="grid border-t border-paper/[0.07] sm:grid-cols-3 lg:col-span-7 lg:border-l lg:border-t-0">
                {VERIFICATION_STEPS.map((v, i) => (
                  <li
                    key={v.title}
                    className={cn(
                      'flex flex-col justify-between gap-10 p-8',
                      i > 0 && 'border-t border-paper/[0.07] sm:border-l sm:border-t-0',
                    )}
                  >
                    <span className="font-mono text-xs text-paper/35">Step 0{i + 1}</span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="grid size-5 place-items-center rounded-full bg-volt/20 text-volt">
                          <CheckIcon size={11} />
                        </span>
                        <span className="font-display text-base font-semibold">{v.title}</span>
                      </div>
                      <p className="mt-2 text-sm text-paper/55">{v.desc}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>

          {DEMO_CONTENT && (
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              {DEMO_HUBS.map((hub) => (
                <div key={hub.name} className="group overflow-hidden rounded-[24px] border border-ink/10 bg-bone">
                  <div className="relative h-52 overflow-hidden">
                    <img
                      src={hub.img}
                      alt={hub.name}
                      loading="lazy"
                      className="h-full w-full object-cover transition duration-700 ease-cinematic group-hover:scale-105"
                    />
                    <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-void/80 px-2.5 py-1 text-[10px] font-semibold text-volt ring-1 ring-inset ring-paper/10 backdrop-blur">
                      <ShieldCheckIcon size={11} /> Audited facility
                    </span>
                  </div>
                  <div className="p-6">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-copper">{hub.role}</span>
                    <h3 className="mt-1.5 font-display text-lg font-semibold text-ink">{hub.name}</h3>
                    <div className="mt-4 space-y-1.5 border-t border-ink/10 pt-4 text-sm text-ink-3">
                      <div className="flex items-center gap-2">
                        <MapPinIcon size={13} className="text-ink-4" /> {hub.location}
                      </div>
                      <div className="flex items-center gap-2">
                        <TruckIcon size={13} className="text-ink-4" /> {hub.coverage}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* 6. CTA */}
      <MarketingCta
        buyer={{
          title: 'Operate with full visibility.',
          body: 'Register your business in minutes. Search wholesale prices, compare verified suppliers and issue purchase orders with delivery tracking.',
        }}
        supplier={{
          title: 'Put your mill in the network.',
          body: 'Receive purchase orders from hotels, restaurants and retailers across the island, without chasing informal phone bids.',
        }}
      />
    </div>
  );
}
