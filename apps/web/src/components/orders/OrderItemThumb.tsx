import { useState } from 'react';
import { cn } from '@vyro/ui';
import { PackageIcon } from '@/components/icons';
import { resolveCatalogImage } from '@/lib/catalogImages';

/** Product image for an order line, falling back to a package glyph when none loads. */
export function OrderItemThumb({
  productId,
  imageUrl,
  name,
  className,
}: {
  productId?: string | null | undefined;
  imageUrl?: string | null | undefined;
  name: string;
  className?: string;
}) {
  const src = resolveCatalogImage(productId, imageUrl) ?? imageUrl ?? undefined;
  const [failed, setFailed] = useState(false);
  return (
    <div
      className={cn(
        'flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-bone to-mist text-ink-3 ring-1 ring-ink/[0.06]',
        className,
      )}
    >
      {src && !failed ? (
        <img src={src} alt={name} loading="lazy" className="size-full object-cover" onError={() => setFailed(true)} />
      ) : (
        <PackageIcon size={17} />
      )}
    </div>
  );
}
