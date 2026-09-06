import { Link } from 'react-router-dom';
import { Surface } from '@/components/brand/Surface';
import { Button } from '@/components/ui';
import { BrandMark, BrandWordmark } from '@/components/brand/BrandMark';
import { FlowCanvas } from '@/components/brand/FlowLine';
import {
  PackageIcon,
  StoreIcon,
  ShieldCheckIcon,
  ArrowRightIcon,
  SparklesIcon,
} from '@/components/icons';

export function NoSupplierMembership() {
  return (
    <div className="min-h-dvh bg-bone flex flex-col justify-between">
      {/* Top Navbar */}
      <header className="h-16 px-6 sm:px-10 border-b border-ink/10 bg-paper flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5">
          <BrandMark size={24} tone="volt" />
          <BrandWordmark tone="ink" size="sm" eyebrow="Supplier Operations" />
        </Link>
        <Link to="/" className="text-xs text-ink-4 hover:text-ink font-semibold">
          ← Back to Marketplace
        </Link>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-6 py-12 flex flex-col justify-center space-y-10 animate-fade-in">
        {/* Hero Card */}
        <div className="bg-ink text-paper p-8 sm:p-10 relative overflow-hidden grain border border-paper/15 shadow-xl">
          <div className="absolute inset-0 opacity-20 pointer-events-none">
            <FlowCanvas tone="paper" density="hero" />
          </div>
          <div className="relative z-10 space-y-4 max-w-2xl">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-volt/20 text-volt text-[10px] font-mono font-bold uppercase tracking-wider border border-volt/30">
              <span className="size-1.5 rounded-full bg-volt animate-pulse" />
              Direct Commercial Supply Network
            </div>
            <h1 className="vyro-display text-3xl sm:text-4xl text-paper leading-tight">
              Join Sri Lanka's Verified Wholesale Mill & Depot Hub
            </h1>
            <p className="text-xs sm:text-sm text-paper/70 leading-relaxed">
              Your logged-in account does not currently have an active supplier organization membership. Connect your mill, processing facility, or regional wholesale depot to distribute direct to verified commercial kitchens, supermarket chains, and grocers nationwide.
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Link to="/onboarding/supplier">
                <Button className="bg-volt text-ink hover:bg-volt-glow font-bold uppercase tracking-wider text-xs py-3 px-6 shadow-[0_0_24px_-4px_rgba(198,220,74,0.55)]">
                  Onboard Your Supplier Facility →
                </Button>
              </Link>
              <Link to="/login">
                <Button variant="secondary" className="border-paper/30 text-paper hover:text-paper hover:bg-paper/10 text-xs">
                  Switch or Log In With Supplier Account
                </Button>
              </Link>
            </div>
          </div>
        </div>

        {/* Feature Highlights Grid */}
        <div className="grid sm:grid-cols-3 gap-5">
          <Surface kind="elevated" className="p-6 space-y-3 border-t-2 border-t-volt">
            <div className="size-10 bg-volt/20 text-ink flex items-center justify-center font-bold">
              <PackageIcon size={20} className="text-ink" />
            </div>
            <h2 className="font-display text-base font-semibold text-ink">Mill-Gate Pricing</h2>
            <p className="text-xs text-ink-3 leading-relaxed">
              Set direct bulk prices with automated tier discounts. Receive digital purchase orders without intermediary sales markups.
            </p>
          </Surface>

          <Surface kind="elevated" className="p-6 space-y-3 border-t-2 border-t-copper">
            <div className="size-10 bg-copper/20 text-ink flex items-center justify-center font-bold">
              <StoreIcon size={20} className="text-ink" />
            </div>
            <h2 className="font-display text-base font-semibold text-ink">Commercial Demand</h2>
            <p className="text-xs text-ink-3 leading-relaxed">
              Access high-volume procurement orders from Colombo hotels, regional caterers, bakeries, and retail chains.
            </p>
          </Surface>

          <Surface kind="elevated" className="p-6 space-y-3 border-t-2 border-t-volt">
            <div className="size-10 bg-volt/20 text-ink flex items-center justify-center font-bold">
              <ShieldCheckIcon size={20} className="text-ink" />
            </div>
            <h2 className="font-display text-base font-semibold text-ink">Protected Settlements</h2>
            <p className="text-xs text-ink-3 leading-relaxed">
              Automated electronic GRN confirmations and prompt commercial bank payouts with certified SVAT compliance.
            </p>
          </Surface>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-6 px-6 text-center text-xs text-ink-4 border-t border-ink/10">
        VYRO Industrial Operating Layer for Commerce · Sri Lanka Direct Wholesale Logistics
      </footer>
    </div>
  );
}
