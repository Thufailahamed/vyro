import { useEffect, useState, type JSX } from 'react';
import { Link } from 'react-router-dom';
import { CopyIcon, CheckCheckIcon, ExternalLinkIcon, ShieldCheckIcon, PackageIcon } from '@/components/icons';

export interface StorefrontSettingsSectionProps {
  currentSlug: string | null;
  supplierName?: string | null | undefined;
  supplierId?: string | null | undefined;
}

export function StorefrontSettingsSection({
  currentSlug,
  supplierName,
  supplierId,
}: StorefrontSettingsSectionProps): JSX.Element {
  const [copied, setCopied] = useState(false);
  const [autoSlug, setAutoSlug] = useState<string | null>(null);

  // If no slug is set in the database, automatically generate and assign one silently
  useEffect(() => {
    if (!currentSlug && !autoSlug) {
      const baseName = supplierName || 'facility';
      const cleanSlug =
        baseName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/-+/g, '-')
          .replace(/^-|-$/g, '')
          .slice(0, 50) || (supplierId ? `supplier-${supplierId.slice(0, 8)}` : 'storefront');

      void fetch('/api/suppliers/me/slug', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ slug: cleanSlug }),
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data: unknown) => {
          const res = data as { slug?: string } | null;
          if (res?.slug) {
            setAutoSlug(res.slug);
          }
        })
        .catch(() => {});
    }
  }, [currentSlug, autoSlug, supplierName, supplierId]);

  const effectiveSlug = currentSlug || autoSlug || 'test';
  const storefrontPath = `/suppliers/${effectiveSlug}`;
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://vyro.lk';
  const fullUrl = `${origin}${storefrontPath}`;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      /* fallback */
    }
  }

  return (
    <div className="border border-ink/10 bg-paper rounded-xl p-5 sm:p-6 space-y-4 shadow-xs">
      {/* Header with status pill */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-ink/10">
        <div>
          <div className="vyro-kicker text-copper mb-1">Public Commercial Storefront</div>
          <h3 className="text-base sm:text-lg font-semibold text-ink">
            Wholesale Catalog & Digital Storefront
          </h3>
        </div>
        <div className="inline-flex items-center gap-2 self-start sm:self-center px-2.5 py-1 rounded-full bg-volt/10 border border-volt/20 text-volt text-xs font-semibold tracking-wide">
          <span className="size-2 rounded-full bg-volt inline-block animate-pulse" />
          <span>ACTIVE · PUBLICLY ACCESSIBLE</span>
        </div>
      </div>

      <p className="text-sm text-ink-3">
        Your unique digital storefront is automatically assigned and live. Institutional buyers and commercial procurement officers can explore your verified facility credentials, live SKU pricing, and issue direct RFQs or Purchase Orders.
      </p>

      {/* URL bar + Action buttons */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3 p-3 bg-sand/30 border border-ink/10 rounded-lg">
        <div className="flex-1 min-w-0 flex items-center gap-2 px-3 py-2 bg-paper border border-ink/15 rounded-md font-mono text-xs sm:text-sm text-ink">
          <span className="text-ink-4 select-none shrink-0">URL:</span>
          <span className="truncate font-medium text-ink-1">
            {fullUrl}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleCopy}
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-ink bg-paper border border-ink/20 rounded-md hover:bg-sand/40 hover:border-ink/40 transition shadow-2xs"
            title="Copy public storefront link"
          >
            {copied ? (
              <>
                <CheckCheckIcon size={14} className="text-volt" />
                <span className="text-volt font-semibold">Link Copied!</span>
              </>
            ) : (
              <>
                <CopyIcon size={14} className="text-ink-3" />
                <span>Copy Link</span>
              </>
            )}
          </button>

          <Link
            to={storefrontPath}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2 text-xs sm:text-sm font-semibold text-paper bg-ink rounded-md hover:bg-ink/90 active:scale-[0.99] transition shadow-xs"
          >
            <span>View Storefront</span>
            <ExternalLinkIcon size={14} className="opacity-90" />
          </Link>
        </div>
      </div>

      {/* Feature Highlights Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
        <div className="flex items-start gap-2.5 p-3 rounded-lg bg-paper border border-ink/5">
          <ShieldCheckIcon size={16} className="text-copper shrink-0 mt-0.5" />
          <div className="text-xs">
            <div className="font-medium text-ink">Verified Credentials</div>
            <div className="text-ink-4 mt-0.5">Displays facility KYB status, city, and trust seal.</div>
          </div>
        </div>

        <div className="flex items-start gap-2.5 p-3 rounded-lg bg-paper border border-ink/5">
          <PackageIcon size={16} className="text-volt shrink-0 mt-0.5" />
          <div className="text-xs">
            <div className="font-medium text-ink">Live Product Catalog</div>
            <div className="text-ink-4 mt-0.5">All published SKUs with volume pricing tiers.</div>
          </div>
        </div>

        <div className="flex items-start gap-2.5 p-3 rounded-lg bg-paper border border-ink/5">
          <ExternalLinkIcon size={16} className="text-ink-3 shrink-0 mt-0.5" />
          <div className="text-xs">
            <div className="font-medium text-ink">Direct RFQ Intake</div>
            <div className="text-ink-4 mt-0.5">Buyers submit quotes directly to your dashboard.</div>
          </div>
        </div>
      </div>
    </div>
  );
}
