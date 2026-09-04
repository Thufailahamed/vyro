import { Link } from 'react-router-dom';
import { FlowCanvas, FlowLine } from '@/components/brand/FlowLine';
import { Button } from '@/components/ui';

export function AboutPage() {
  return (
    <div>
      <section className="relative overflow-hidden bg-ink text-paper grain">
        <div className="absolute inset-0 opacity-50">
          <FlowCanvas tone="paper" density="hero" />
        </div>
        <div className="relative max-w-stage mx-auto px-5 sm:px-8 py-24">
          <div className="vyro-kicker text-volt">About</div>
          <h1 className="mt-4 vyro-display text-5xl sm:text-6xl max-w-3xl text-balance">
            Built as infrastructure, not a storefront.
          </h1>
          <p className="mt-6 max-w-xl text-paper/65 text-lg">
            VYRO is the operating layer connecting Sri Lankan businesses to everything they need to buy, sell, pay and receive.
          </p>
        </div>
      </section>
      <section className="max-w-stage mx-auto px-5 sm:px-8 py-20 grid lg:grid-cols-2 gap-16">
        <div>
          <h2 className="vyro-display text-3xl">A commercial network, not a catalog.</h2>
          <p className="mt-4 text-ink-3 leading-relaxed">
            Products move between businesses, suppliers, orders, payments and delivery. VYRO makes that movement visible, comparable and accountable.
          </p>
        </div>
        <FlowLine
          nodes={[
            { label: 'VYRO Procurement', state: 'active' },
            { label: 'VYRO Pay', state: 'idle' },
            { label: 'VYRO Logistics', state: 'idle' },
            { label: 'VYRO Credit', state: 'idle' },
          ]}
        />
      </section>
      <section className="px-5 sm:px-8 pb-20 max-w-stage mx-auto">
        <Link to="/signup">
          <Button size="lg">Enter VYRO</Button>
        </Link>
      </section>
    </div>
  );
}

export function HowItWorksPage() {
  const steps = [
    {
      t: 'Discover',
      b: 'Search the wholesale catalog. Compare unit price, MOQ, availability and delivery across suppliers.',
    },
    {
      t: 'Decide',
      b: 'VYRO highlights best price, best value and fastest delivery — so the choice is immediate.',
    },
    {
      t: 'Issue',
      b: 'Checkout splits a multi-supplier cart into independent, binding purchase orders.',
    },
    {
      t: 'Move',
      b: 'Track Order → Supplier → Preparation → Delivery → Business as a physical journey.',
    },
  ];
  return (
    <div>
      <section className="max-w-stage mx-auto px-5 sm:px-8 py-20">
        <div className="vyro-kicker">Process</div>
        <h1 className="mt-3 vyro-display text-5xl max-w-3xl text-balance">How work moves through VYRO.</h1>
        <div className="mt-10 max-w-2xl">
          <FlowLine
            nodes={[
              { label: 'Discover', state: 'done' },
              { label: 'Decide', state: 'active' },
              { label: 'Issue', state: 'idle' },
              { label: 'Move', state: 'idle' },
            ]}
          />
        </div>
      </section>
      <section className="border-t border-ink/10">
        {steps.map((s, i) => (
          <div
            key={s.t}
            className="max-w-stage mx-auto px-5 sm:px-8 py-12 grid md:grid-cols-[140px_1fr] gap-6 border-b border-ink/10"
          >
            <div className="vyro-metric text-3xl text-copper">{String(i + 1).padStart(2, '0')}</div>
            <div>
              <h2 className="vyro-display text-3xl">{s.t}</h2>
              <p className="mt-3 text-ink-3 max-w-xl">{s.b}</p>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
