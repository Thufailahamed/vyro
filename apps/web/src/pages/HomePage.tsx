import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui';
import { SearchIcon } from '@/components/icons';
import { FlowCanvas, FlowLine } from '@/components/brand/FlowLine';
import { BrandMark } from '@/components/brand/BrandMark';
import { MetricNumber, ProductPlaceholder, Surface } from '@/components/brand/Surface';

const POPULAR = ['Rice', 'Sugar', 'Cement', 'Tea', 'Packaging', 'Flour', 'Spices', 'Oil'];

const CATEGORIES: Array<{
  name: string;
  query: string;
  detail: string;
  volume: string;
}> = [
  { name: 'Rice & grains', query: 'rice', detail: 'Mill-direct staples, bagged and bulk.', volume: 'Highest volume' },
  { name: 'Sugar & commodities', query: 'sugar', detail: 'Refined, brown, and industrial grades.', volume: 'Daily quotes' },
  { name: 'Cement & building', query: 'cement', detail: 'Bags, bulk, and site delivery windows.', volume: 'Island-wide' },
  { name: 'Packaging', query: 'packaging', detail: 'Cartons, film, food-safe wraps.', volume: 'Fast lead times' },
  { name: 'Spices & agri', query: 'spices', detail: 'Estate and wholesale agri lots.', volume: 'Seasonal' },
  { name: 'Tea & beverages', query: 'tea', detail: 'Estate lots and HORECA packs.', volume: 'Export-grade' },
];

const BUSINESSES = [
  { name: 'Restaurant', note: 'Kitchen staples, oil, packaging' },
  { name: 'Hotel', note: 'Housekeeping + F&B at scale' },
  { name: 'Retail', note: 'Shelf restock from verified mills' },
  { name: 'Bakery', note: 'Flour, sugar, dairy inputs' },
  { name: 'Office', note: 'Pantry and facilities supply' },
  { name: 'Salon', note: 'Consumables on a schedule' },
];

const JOURNEY = [
  {
    n: '01',
    t: 'Discover',
    b: 'Search the wholesale catalog by product, brand, or category — then open every live offer on a product.',
  },
  {
    n: '02',
    t: 'Compare',
    b: 'VYRO ranks suppliers by best price, best value, and fastest delivery. MOQ, lead time, and availability sit beside the number.',
  },
  {
    n: '03',
    t: 'Issue',
    b: 'One cart, many suppliers. Checkout splits the order into independent, binding purchase orders — each with its own journey.',
  },
  {
    n: '04',
    t: 'Move',
    b: 'Track Order → Supplier → Preparation → Delivery → Business. Every status change is written to the audit trail.',
  },
];

const LAYERS = [
  { name: 'VYRO Procurement', status: 'Live', body: 'Source, compare, and issue purchase orders across verified Sri Lankan suppliers.' },
  { name: 'VYRO Pay', status: 'In flow', body: 'Settlement sits next to the order — not in a separate stack of invoices and calls.' },
  { name: 'VYRO Logistics', status: 'In flow', body: 'Delivery is a stage in the same journey, not a WhatsApp thread after the fact.' },
  { name: 'VYRO Credit', status: 'Next', body: 'Working capital against real procurement history, when the network is ready.' },
];

const REPLACES = [
  { from: 'WhatsApp quotes', to: 'Live unit prices in LKR, on the product.' },
  { from: 'PDF catalogs', to: 'Offers with MOQ, lead time, and availability.' },
  { from: 'Phone POs', to: 'A cart that splits into binding purchase orders.' },
  { from: 'Status by chat', to: 'Order → Supplier → Preparation → Delivery → Business.' },
];

const ON_A_PRODUCT = [
  { k: 'Unit price', v: 'LKR, live from the supplier' },
  { k: 'MOQ', v: 'Minimum quantity on that offer' },
  { k: 'Lead time', v: 'Days until the goods can move' },
  { k: 'Availability', v: 'Whether the offer can be issued now' },
];

const FAQ = [
  {
    q: 'Can I search without an account?',
    a: 'Yes. The wholesale catalog is open. You register a business when you are ready to add to cart and issue purchase orders.',
  },
  {
    q: 'What happens if I buy from two suppliers?',
    a: 'Checkout splits the cart. Each supplier receives an independent purchase order, with its own journey and status trail.',
  },
  {
    q: 'What does “verified” mean?',
    a: 'Suppliers enter with business identity. VYRO Control reviews that identity before they can sit in the live catalog.',
  },
  {
    q: 'Are payments and logistics live today?',
    a: 'Procurement is live: search, compare, cart, purchase orders, and the delivery journey. Pay, logistics, and credit are the next movements on the same layer — not separate apps.',
  },
];

export function HomePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');

  function goSearch(term?: string) {
    const q = (term ?? query).trim();
    navigate(q ? `/search?q=${encodeURIComponent(q)}` : '/search');
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    goSearch();
  }

  return (
    <div>
      <section className="relative overflow-hidden bg-ink text-paper grain">
        <div className="absolute inset-0 opacity-70">
          <FlowCanvas tone="paper" density="hero" className="h-full min-h-[640px]" />
        </div>
        <div className="relative max-w-stage mx-auto px-5 sm:px-8 pt-14 sm:pt-20 pb-16 lg:pb-0">
          <div className="grid lg:grid-cols-12 gap-12 lg:gap-8 items-end">
            <div className="lg:col-span-7 pb-4 lg:pb-20">
              <div className="flex items-center gap-3">
                <span className="vyro-kicker text-volt">VYRO · Sri Lanka</span>
                <span className="text-[11px] tracking-[0.14em] uppercase text-paper/35">B2B operating layer</span>
              </div>
              <h1 className="mt-5 vyro-display text-5xl sm:text-6xl lg:text-[4.6rem] text-paper max-w-3xl text-balance">
                Everything a business needs, connected.
              </h1>
              <p className="mt-6 max-w-lg text-base sm:text-lg text-paper/65 leading-relaxed">
                VYRO is the operating layer between businesses and suppliers — procurement, orders, payments and delivery as one continuous movement.
              </p>

              <form onSubmit={handleSearchSubmit} className="mt-10 max-w-xl">
                <label htmlFor="home-search" className="sr-only">
                  Search the wholesale catalog
                </label>
                <div className="flex flex-col sm:flex-row bg-paper">
                  <div className="relative flex-1">
                    <SearchIcon size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-4" />
                    <input
                      id="home-search"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search rice, cement, packaging, tea…"
                      className="w-full h-14 bg-transparent pl-12 pr-4 text-ink placeholder:text-ink-4 focus:outline-none"
                    />
                  </div>
                  <Button type="submit" size="lg" className="m-1.5 sm:min-w-44">
                    Source now
                  </Button>
                </div>
              </form>

              <div className="mt-4 flex flex-wrap gap-2">
                {POPULAR.map((term) => (
                  <button
                    key={term}
                    type="button"
                    onClick={() => goSearch(term)}
                    className="h-11 px-3.5 text-[12px] tracking-wide text-paper/70 cursor-pointer shadow-[inset_0_0_0_1px_rgba(250,247,240,0.18)] hover:text-volt hover:shadow-[inset_0_0_0_1px_#C6DC4A] transition-colors"
                  >
                    {term}
                  </button>
                ))}
              </div>
            </div>

            <div className="lg:col-span-5 lg:translate-y-8">
              <Surface kind="ink" className="bg-charcoal p-6 sm:p-7 shadow-[inset_0_0_0_1px_rgba(198,220,74,0.18)]">
                <div className="flex items-center justify-between gap-3">
                  <span className="vyro-kicker text-volt">In the network</span>
                  <span className="text-[10px] uppercase tracking-[0.14em] text-paper/40">Island network</span>
                </div>
                <div className="mt-6">
                  <div className="text-[11px] uppercase tracking-[0.14em] text-paper/40">Wholesale volume</div>
                  <MetricNumber size="lg" className="mt-1 text-paper">
                    Rs. 180M+
                  </MetricNumber>
                </div>
                <div className="mt-8">
                  <FlowLine
                    tone="paper"
                    nodes={[
                      { label: 'Business', state: 'done' },
                      { label: 'Supplier', state: 'active' },
                      { label: 'Order', state: 'idle' },
                      { label: 'Pay', state: 'idle' },
                      { label: 'Deliver', state: 'idle' },
                    ]}
                  />
                </div>
                <dl className="mt-8 grid grid-cols-3 gap-3 border-t border-paper/10 pt-5">
                  {[
                    { k: 'Suppliers', v: '620' },
                    { k: 'Districts', v: '25/25' },
                    { k: 'Accept', v: '3.5h' },
                  ].map((m) => (
                    <div key={m.k}>
                      <dt className="text-[10px] uppercase tracking-[0.12em] text-paper/40">{m.k}</dt>
                      <dd className="vyro-metric text-xl text-paper mt-1">{m.v}</dd>
                    </div>
                  ))}
                </dl>
              </Surface>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-bone border-b border-ink/10">
        <div className="max-w-stage mx-auto px-5 sm:px-8 py-10 grid sm:grid-cols-3 gap-8">
          {[
            {
              t: 'Verified, not listed',
              b: 'Suppliers enter with business identity. Quotes are live unit prices in LKR — not brochure PDFs.',
            },
            {
              t: 'Compared, not guessed',
              b: 'Best price, best value, and fastest delivery are scored on the same product, in the same view.',
            },
            {
              t: 'Issued, not messaged',
              b: 'A cart becomes purchase orders. Status is a journey, with a record of every handoff.',
            },
          ].map((item) => (
            <div key={item.t}>
              <h2 className="font-display text-xl">{item.t}</h2>
              <p className="mt-2 text-sm text-ink-3 leading-relaxed">{item.b}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-stage mx-auto px-5 sm:px-8 py-20">
        <div className="grid lg:grid-cols-12 gap-12 items-end">
          <div className="lg:col-span-5">
            <div className="vyro-kicker">Replaces the informal stack</div>
            <h2 className="mt-2 vyro-display text-4xl sm:text-5xl text-balance">Procurement should not live in a chat thread.</h2>
            <p className="mt-4 text-ink-3 leading-relaxed max-w-md">
              Most Sri Lankan wholesale still moves as screenshots, stale PDFs, and a PO typed into WhatsApp. VYRO puts that same work on one layer — searchable, comparable, issued, and tracked.
            </p>
          </div>
          <ol className="lg:col-span-7 divide-y divide-ink/10 border-y border-ink/10">
            {REPLACES.map((row, i) => (
              <li key={row.from} className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-4 py-5 items-start">
                <span className="vyro-metric text-sm text-copper pt-0.5">{String(i + 1).padStart(2, '0')}</span>
                <div>
                  <div className="text-sm text-ink-4 line-through decoration-ink/25">{row.from}</div>
                  <div className="mt-1 text-sm text-ink leading-snug">{row.to}</div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="max-w-stage mx-auto px-5 sm:px-8 py-20">
        <div className="grid lg:grid-cols-[0.85fr_1.15fr] gap-12 items-end mb-10">
          <div>
            <div className="vyro-kicker">Who it’s for</div>
            <h2 className="mt-2 vyro-display text-4xl sm:text-5xl text-balance">Built for operators who buy every week.</h2>
          </div>
          <p className="text-ink-3 max-w-xl">
            Hotels, kitchens, retailers, bakeries, offices and sites — anyone who needs wholesale inputs without a stack of calls, screenshots, and informal quotes.
          </p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-px bg-ink/10">
          {BUSINESSES.map((b, i) => (
            <Link
              key={b.name}
              to="/onboarding/business"
              className="group bg-paper p-5 min-h-[148px] flex flex-col justify-between hover:bg-ink hover:text-paper transition-colors duration-240 cursor-pointer"
            >
              <span className="vyro-metric text-sm text-copper group-hover:text-volt">{String(i + 1).padStart(2, '0')}</span>
              <div>
                <div className="font-display text-lg tracking-tight">{b.name}</div>
                <div className="mt-1 text-[11px] text-ink-4 group-hover:text-paper/55 leading-snug">{b.note}</div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="bg-paper">
        <div className="max-w-stage mx-auto px-5 sm:px-8 py-20">
          <div className="flex items-end justify-between gap-6 mb-10">
            <div>
              <div className="vyro-kicker">Catalog</div>
              <h2 className="mt-2 vyro-display text-4xl">What moves through VYRO</h2>
              <p className="mt-3 text-sm text-ink-4 max-w-md">
                Direct pricing from mills, manufacturers, and licensed distributors. Open a sector, compare offers, add to cart.
              </p>
            </div>
            <Link to="/search" className="hidden sm:inline-flex text-sm text-copper hover:text-ink shrink-0">
              Full catalog →
            </Link>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {CATEGORIES.map((c) => (
              <Link
                key={c.name}
                to={`/search?q=${encodeURIComponent(c.query)}`}
                className="group grid grid-cols-[112px_1fr] bg-bone hover:bg-ink hover:text-paper transition-colors duration-240 min-h-[132px] cursor-pointer"
              >
                <ProductPlaceholder seed={c.query} className="h-full min-h-[132px]" />
                <div className="p-5 flex flex-col justify-between">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.14em] text-copper group-hover:text-volt">{c.volume}</div>
                    <h3 className="mt-1 font-display text-xl leading-tight">{c.name}</h3>
                    <p className="mt-1.5 text-xs text-ink-4 group-hover:text-paper/55">{c.detail}</p>
                  </div>
                  <span className="text-[11px] font-semibold tracking-wide mt-3">Open sector →</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="max-w-stage mx-auto px-5 sm:px-8 py-20">
        <div className="vyro-kicker">Signature</div>
        <h2 className="mt-2 vyro-display text-4xl sm:text-5xl max-w-3xl text-balance">The decision is visible. Immediately.</h2>
        <p className="mt-4 text-ink-3 max-w-xl">
          Supplier comparison is not a spreadsheet. On every product, VYRO marks the offer that should win — then lets you override with eyes open.
        </p>
        <dl className="mt-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-px bg-ink/10">
          {ON_A_PRODUCT.map((row) => (
            <div key={row.k} className="bg-bone p-5">
              <dt className="text-[10px] uppercase tracking-[0.14em] text-copper">{row.k}</dt>
              <dd className="mt-2 text-sm text-ink-3 leading-snug">{row.v}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-12 grid lg:grid-cols-3 gap-px bg-ink/10">
          {[
            {
              tag: 'Best price',
              title: 'Lowest unit cost',
              body: 'Ranked first by live LKR per unit. The number is the number — no hidden commission in the quote.',
            },
            {
              tag: 'Best value',
              title: 'Price against time',
              body: 'A cheaper quote that takes two weeks is not always cheaper. Value weights price with lead time.',
            },
            {
              tag: 'Fastest delivery',
              title: 'Shortest lead',
              body: 'When the kitchen or site cannot wait, the fastest verified offer is labelled — not buried.',
            },
          ].map((item, i) => (
            <div key={item.tag} className={`p-8 ${i === 0 ? 'bg-ink text-paper' : 'bg-paper'}`}>
              <span className={`text-[10px] font-bold uppercase tracking-[0.16em] ${i === 0 ? 'text-volt' : 'text-copper'}`}>
                {item.tag}
              </span>
              <h3 className="mt-4 font-display text-2xl">{item.title}</h3>
              <p className={`mt-3 text-sm leading-relaxed ${i === 0 ? 'text-paper/60' : 'text-ink-3'}`}>{item.body}</p>
            </div>
          ))}
        </div>
        <Link to="/search" className="mt-8 inline-block">
          <Button>Compare live offers</Button>
        </Link>
      </section>

      <section className="bg-paper border-y border-ink/10">
        <div className="max-w-stage mx-auto px-5 sm:px-8 py-20">
          <div className="grid lg:grid-cols-[0.9fr_1.1fr] gap-14">
            <div>
              <div className="vyro-kicker">How it works</div>
              <h2 className="mt-3 vyro-display text-4xl text-balance">Four movements. One flow.</h2>
              <p className="mt-4 text-ink-3 max-w-md leading-relaxed">
                No phone quotes. No informal POs. Work moves from search to delivery inside a single operating layer.
              </p>
              <div className="mt-8 max-w-md">
                <FlowLine
                  nodes={[
                    { label: 'Discover', state: 'done' },
                    { label: 'Compare', state: 'active' },
                    { label: 'Issue', state: 'idle' },
                    { label: 'Move', state: 'idle' },
                  ]}
                />
              </div>
              <Link to="/how-it-works" className="mt-10 inline-block">
                <Button variant="secondary">See the full journey</Button>
              </Link>
            </div>
            <ol>
              {JOURNEY.map((s) => (
                <li key={s.n} className="grid grid-cols-[4.5rem_1fr] gap-5 py-6 border-b border-ink/10 first:pt-0">
                  <span className="vyro-metric text-2xl text-copper">{s.n}</span>
                  <div>
                    <h3 className="font-display text-2xl">{s.t}</h3>
                    <p className="mt-2 text-sm text-ink-3 leading-relaxed">{s.b}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section className="max-w-stage mx-auto px-5 sm:px-8 py-20">
        <div className="vyro-kicker">The layer</div>
        <h2 className="mt-2 vyro-display text-4xl max-w-2xl text-balance">One identity. Several movements.</h2>
        <div className="mt-12 divide-y divide-ink/10 border-y border-ink/10">
          {LAYERS.map((layer) => (
            <div key={layer.name} className="grid sm:grid-cols-[minmax(0,1fr)_7rem_1.2fr] gap-4 sm:gap-8 py-7 items-baseline">
              <h3 className="font-display text-2xl">{layer.name}</h3>
              <span className="text-[10px] uppercase tracking-[0.16em] text-copper">{layer.status}</span>
              <p className="text-sm text-ink-3">{layer.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-paper border-y border-ink/10">
        <div className="max-w-stage mx-auto px-5 sm:px-8 py-20">
          <div className="vyro-kicker">Questions</div>
          <h2 className="mt-2 vyro-display text-4xl max-w-2xl text-balance">Straight answers before you register.</h2>
          <dl className="mt-12 divide-y divide-ink/10 border-y border-ink/10">
            {FAQ.map((item) => (
              <div key={item.q} className="grid lg:grid-cols-[minmax(0,0.9fr)_1.1fr] gap-3 lg:gap-12 py-7">
                <dt className="font-display text-xl leading-snug">{item.q}</dt>
                <dd className="text-sm text-ink-3 leading-relaxed">{item.a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="bg-ink text-paper grain relative overflow-hidden">
        <div className="absolute inset-0 opacity-40">
          <FlowCanvas tone="paper" density="hero" />
        </div>
        <div className="relative max-w-stage mx-auto px-5 sm:px-8 py-20 grid lg:grid-cols-2 gap-px">
          <div className="lg:pr-16 pb-12 lg:pb-0 lg:border-r lg:border-paper/10">
            <div className="flex items-center gap-3">
              <BrandMark size={28} tone="volt" />
              <span className="vyro-kicker text-volt">Businesses</span>
            </div>
            <h2 className="mt-5 vyro-display text-4xl text-balance">Start procuring this week.</h2>
            <p className="mt-4 text-paper/60 max-w-md">
              Register the business, search the catalog, compare suppliers, and issue the first purchase order from one workspace.
            </p>
            <ul className="mt-6 space-y-2 text-sm text-paper/70">
              <li>LKR unit prices, live</li>
              <li>Multi-supplier carts, split on checkout</li>
              <li>Order journey you can actually follow</li>
            </ul>
            <Link to={user ? '/search' : '/onboarding/business'} className="mt-8 inline-block">
              <Button className="bg-volt text-ink hover:bg-volt-glow">{user ? 'Open catalog' : 'Register a business'}</Button>
            </Link>
          </div>
          <div className="lg:pl-16">
            <div className="vyro-kicker text-copper">Suppliers</div>
            <h2 className="mt-5 vyro-display text-4xl text-balance">Put your catalog in the flow.</h2>
            <p className="mt-4 text-paper/60 max-w-md">
              Receive purchase orders from restaurants, hotels, retailers and builders — without chasing informal quotes.
            </p>
            <ul className="mt-6 space-y-2 text-sm text-paper/70">
              <li>Incoming purchase orders awaiting acceptance</li>
              <li>One identity across pricing, inventory, and delivery</li>
              <li>Island-wide demand, one inbox</li>
            </ul>
            <Link to="/onboarding/supplier" className="mt-8 inline-block">
              <Button variant="secondary" className="text-paper shadow-[inset_0_0_0_1px_rgba(250,247,240,0.28)] hover:bg-paper hover:text-ink">
                List as a supplier
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
