import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui';
import { Surface } from '@/components/brand/Surface';
import { CheckCircleIcon, PackageIcon, SearchIcon } from '@/components/icons';

function Medallion({ tone, children }: { tone: 'amber' | 'mint'; children: ReactNode }) {
  const styles =
    tone === 'amber'
      ? 'border-amber/25 bg-amber/10 text-amber'
      : 'border-mint/25 bg-mint/10 text-mint';
  const glow = tone === 'amber' ? 'bg-amber/15' : 'bg-mint/15';
  return (
    <div className="relative mx-auto size-16">
      <div aria-hidden className={`absolute inset-0 rounded-2xl blur-md ${glow}`} />
      <div className={`relative flex size-16 items-center justify-center rounded-2xl border ${styles}`}>
        {children}
      </div>
    </div>
  );
}

const stepCard = 'space-y-1 rounded-xl border border-ink/10 bg-ink/[0.03] p-3.5';

export function QueueEmpty({
  searchQuery,
  offersCount,
  onClearSearch,
}: {
  searchQuery: string;
  offersCount: number;
  onClearSearch: () => void;
}) {
  return (
    <Surface kind="elevated" className="animate-fade-in overflow-hidden p-8 text-center sm:p-12">
      {searchQuery ? (
        <div className="space-y-2 py-4">
          <SearchIcon size={32} className="mx-auto text-ink-4 opacity-50" />
          <p className="text-sm font-semibold text-ink">No purchase orders matched your search</p>
          <p className="text-xs text-ink-4">Try clearing the search query or changing filter tabs.</p>
          <Button variant="ghost" size="sm" onClick={onClearSearch} className="mt-2 text-xs">
            Clear Search
          </Button>
        </div>
      ) : offersCount === 0 ? (
        /* Scenario A: No products listed yet */
        <div className="mx-auto max-w-lg space-y-5 py-4">
          <Medallion tone="amber">
            <PackageIcon size={26} />
          </Medallion>
          <div className="space-y-1.5">
            <h3 className="font-display text-lg font-bold text-ink">Depot Catalog Is Not Published Yet</h3>
            <p className="text-xs leading-relaxed text-ink-3">
              Commercial retail and restaurant buyers cannot place purchase orders until you publish
              wholesale commodities with prices and minimum order quantities.
            </p>
          </div>
          <div className="flex justify-center gap-3 pt-2">
            <Link to="/supplier/products/new">
              <Button variant="primary" className="gap-1.5 bg-volt font-bold text-ink hover:bg-volt-glow">
                + Publish Your First Product →
              </Button>
            </Link>
          </div>
        </div>
      ) : (
        /* Scenario B: Products listed, depot active, waiting for incoming orders */
        <div className="mx-auto max-w-xl space-y-6 py-2">
          <Medallion tone="mint">
            <CheckCircleIcon size={26} />
          </Medallion>
          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-mint/30 bg-mint/15 px-2.5 py-1 font-mono text-[11px] font-semibold text-ink">
              <span className="size-1.5 animate-pulse rounded-full bg-mint" />
              Depot Active & Listening
            </div>
            <h3 className="font-display text-lg font-bold text-ink">Order Queue Is Currently Clear</h3>
            <p className="text-xs leading-relaxed text-ink-3">
              Your wholesale listings are live. When commercial buyers checkout on the Vyro network,
              purchase orders arrive here automatically with verified line items and escrow funding.
            </p>
          </div>

          {/* 3-Step Lifecycle Infographic */}
          <div className="grid gap-3 pt-2 text-left sm:grid-cols-3">
            <div className={stepCard}>
              <div className="font-mono text-[10px] font-bold uppercase text-copper">Step 1</div>
              <div className="text-xs font-semibold text-ink">Buyer Places PO</div>
              <p className="text-[11px] text-ink-4">Consignment quantities & dock address verified.</p>
            </div>
            <div className={stepCard}>
              <div className="font-mono text-[10px] font-bold uppercase text-copper">Step 2</div>
              <div className="text-xs font-semibold text-ink">Accept & Stage</div>
              <p className="text-[11px] text-ink-4">1-click order acceptance & warehouse prep.</p>
            </div>
            <div className={stepCard}>
              <div className="font-mono text-[10px] font-bold uppercase text-copper">Step 3</div>
              <div className="text-xs font-semibold text-ink">Dispatch & Payout</div>
              <p className="text-[11px] text-ink-4">Assign carrier driver & release funds to bank.</p>
            </div>
          </div>

          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <Link to="/supplier/products">
              <Button variant="secondary" size="sm">
                Manage {offersCount} Published Product{offersCount === 1 ? '' : 's'}
              </Button>
            </Link>
            <Link to="/search">
              <Button variant="ghost" size="sm" className="gap-1 text-xs">
                View Marketplace Storefront →
              </Button>
            </Link>
          </div>
        </div>
      )}
    </Surface>
  );
}
