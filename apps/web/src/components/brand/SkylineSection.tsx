import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRightIcon } from '@/components/icons';
import { HairlineBlock, toneOfLot } from './HairlineBlock';

/** One business type per tower colour; index is the tone in block.js. */
const TRADES = [
  { name: 'Hotels', buys: 'linen, amenities, F&B' },
  { name: 'Bakeries', buys: 'flour, packaging, ovens' },
  { name: 'Mills', buys: 'grain, sacks, spares' },
  { name: 'Warehouses', buys: 'pallets, racking, wrap' },
];

/** Home page: the city block. Hover lights the skyline and names the trade under the pointer. */
export function SkylineSection() {
  const [lot, setLot] = useState<number | null>(null);
  const [touched, setTouched] = useState(false);
  const tone = lot === null ? null : toneOfLot(lot);
  const lit = tone !== null;

  const onLot = (l: number | null) => {
    setLot(l);
    if (l !== null) setTouched(true);
  };

  return (
    <section className="relative isolate overflow-hidden bg-void text-paper py-16 sm:py-24 grain">
      <div className="mx-auto grid max-w-stage items-center gap-12 px-5 sm:px-8 lg:grid-cols-12 lg:gap-12">
        <div className="lg:col-span-5">
          <div className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-paper/50">
            <span className="size-1.5 rounded-full bg-volt" aria-hidden />
            One market, every business
          </div>
          <h2 className="mt-4 vyro-display text-[2.1rem] sm:text-5xl tracking-[-0.045em] leading-[1] text-paper text-balance">
            Every tower on the block, one order away.
          </h2>
          <p className="mt-5 max-w-md text-base leading-relaxed text-paper/60">
            Hotels, bakeries, mills and warehouses all source on Vyro, from verified suppliers, on one set of terms.
          </p>

          <ul className="mt-8 grid max-w-md grid-cols-2 gap-2">
            {TRADES.map((t, i) => {
              const active = tone === i;
              return (
                <li
                  key={t.name}
                  className={`rounded-xl border px-3.5 py-3 transition-colors duration-300 ${
                    active ? 'border-paper/25 bg-paper/[0.06]' : 'border-paper/10'
                  }`}
                >
                  <div className="flex items-center gap-2 text-sm font-medium text-paper">
                    <span
                      className="size-2 rounded-[3px] transition-opacity duration-300"
                      style={{ background: `var(--block-tone-${i})`, opacity: lit ? 1 : 0.45 }}
                      aria-hidden
                    />
                    {t.name}
                  </div>
                  <div className="mt-1 text-xs text-paper/45">{t.buys}</div>
                </li>
              );
            })}
          </ul>

          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
            <Link
              to="/search"
              className="inline-flex h-12 items-center gap-2 rounded-xl bg-volt px-6 text-sm font-semibold text-ink transition-colors duration-180 hover:bg-paper"
            >
              Browse the catalog
              <ArrowRightIcon size={15} />
            </Link>
            <Link
              to="/onboarding/supplier"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-paper/70 transition-colors hover:text-volt"
            >
              Sell to the block
              <ArrowRightIcon size={14} />
            </Link>
          </div>
        </div>

        <div className="relative lg:col-span-7">
          {/* a soft glow that comes up with the lights */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-[8%] -z-10 rounded-full blur-3xl transition-opacity duration-700"
            style={{
              opacity: lit ? 0.55 : 0.18,
              background: 'radial-gradient(closest-side, color-mix(in srgb, var(--vyro-volt) 35%, transparent), transparent)',
            }}
          />
          <HairlineBlock theme="dark" onLot={onLot} className="mx-auto w-full max-w-2xl cursor-pointer" />

          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center" aria-live="polite">
            <span
              className={`inline-flex items-center gap-2 rounded-full border border-paper/10 bg-ink/70 px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] backdrop-blur transition-colors duration-300 ${
                lit ? 'text-paper' : 'text-paper/50'
              }`}
            >
              <span
                className={`size-1.5 rounded-full ${lit || touched ? '' : 'animate-pulse'}`}
                style={{ background: lit ? `var(--block-tone-${tone})` : 'var(--vyro-volt)' }}
                aria-hidden
              />
              {lit ? `${TRADES[tone]?.name} · ordering on Vyro` : 'Hover or tap the block'}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
