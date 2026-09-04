import { useState, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '@vyro/ui';

type SurfaceKind = 'flat' | 'elevated' | 'floating' | 'split' | 'flow' | 'ink';

export function Surface({
  kind = 'flat',
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & { kind?: SurfaceKind; children?: ReactNode }) {
  return (
    <div
      className={cn(
        'relative overflow-hidden',
        kind === 'flat' && 'vyro-surface',
        kind === 'elevated' && 'vyro-elevated',
        kind === 'floating' && 'vyro-floating',
        kind === 'split' && 'vyro-split',
        kind === 'flow' && 'vyro-surface',
        kind === 'ink' && 'bg-ink text-paper',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function MetricNumber({
  children,
  className,
  size = 'lg',
}: {
  children: ReactNode;
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  const scale = {
    sm: 'text-xl',
    md: 'text-3xl',
    lg: 'text-metric',
    xl: 'text-5xl sm:text-6xl',
  }[size];
  return <div className={cn('vyro-metric leading-none', scale, className)}>{children}</div>;
}

export function ProductPlaceholder({
  seed,
  className,
}: {
  seed: string;
  className?: string | undefined;
}) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const offset = (h % 80) - 40;
  return (
    <div className={cn('relative overflow-hidden bg-ink', className)} aria-hidden>
      <svg viewBox="0 0 320 240" className="absolute inset-0 h-full w-full">
        <rect width="320" height="240" fill="#0C0E0B" />
        <path
          d={`M-20 ${140 + offset} C 80 ${40 + offset}, 140 ${200 - offset}, 220 ${90 + offset} S 340 ${160 - offset}, 360 120`}
          fill="none"
          stroke="#C6DC4A"
          strokeOpacity="0.7"
          strokeWidth="1.2"
        />
        <path
          d={`M-10 ${60 - offset} C 100 ${180 + offset}, 180 40, 320 ${140 - offset}`}
          fill="none"
          stroke="#B87A4E"
          strokeOpacity="0.55"
          strokeWidth="1"
        />
        <circle cx={80 + (h % 40)} cy={90} r="3" fill="#C6DC4A" />
        <circle cx={210} cy={150 - (h % 30)} r="3" fill="#FAF7F0" />
      </svg>
    </div>
  );
}

export function ProductImage({
  src,
  alt,
  seed,
  className,
  priority = false,
}: {
  src?: string | null | undefined;
  alt?: string | undefined;
  seed: string;
  className?: string | undefined;
  priority?: boolean;
}) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  if (!src || errored) {
    return <ProductPlaceholder seed={seed} className={className} />;
  }

  return (
    <div className={cn('relative overflow-hidden bg-bone flex items-center justify-center', className)}>
      {!loaded && <ProductPlaceholder seed={seed} className="absolute inset-0 h-full w-full" />}
      <img
        src={src}
        alt={alt || 'Product image'}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : 'auto'}
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => setErrored(true)}
        className={cn(
          'w-full h-full object-cover transition-opacity duration-300',
          loaded ? 'opacity-100' : 'opacity-0',
        )}
      />
    </div>
  );
}
