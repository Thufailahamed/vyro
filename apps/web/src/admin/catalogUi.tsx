import { useState, type ReactNode } from 'react';
import { resolveCatalogImage } from '@/lib/catalogImages';
import { cn } from '@vyro/ui';
import { Skeleton } from './ui';

/* Shared visual pieces for the catalog registry (products, categories, business types). */

type MetricTone = 'neutral' | 'success' | 'warning' | 'brand';

export interface MetricItem {
  label: string;
  value: number;
  sub?: ReactNode;
  icon?: ReactNode;
  tone?: MetricTone;
  /** 0–1 share shown as a thin bar under the value. */
  ratio?: number | undefined;
}

const TONE: Record<MetricTone, { icon: string; bar: string }> = {
  neutral: { icon: 'bg-ink text-volt', bar: 'bg-ink' },
  success: { icon: 'bg-mint/10 text-mint', bar: 'bg-mint' },
  warning: { icon: 'bg-amber/15 text-amber', bar: 'bg-amber' },
  brand: { icon: 'bg-volt/25 text-volt-deep', bar: 'bg-volt-deep' },
};

/** One surface split into metric cells — calmer than four floating cards. */
export function MetricStrip({ items, loading }: { items: MetricItem[]; loading?: boolean | undefined }) {
  return (
    <div
      className={cn(
        'grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-ink/[0.08] shadow-[0_0_0_1px_rgba(12,14,11,0.08)]',
        items.length >= 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3',
      )}
    >
      {items.map((m) => {
        const tone = TONE[m.tone ?? 'neutral'];
        const zero = m.value === 0;
        return (
          <div key={m.label} className="bg-paper px-5 py-5 sm:px-6">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[12px] font-medium text-ink-3">{m.label}</span>
              {m.icon && (
                <span
                  className={cn(
                    'grid size-8 shrink-0 place-items-center rounded-lg',
                    zero && m.tone !== 'neutral' ? 'bg-ink/[0.05] text-ink-4' : tone.icon,
                  )}
                >
                  {m.icon}
                </span>
              )}
            </div>
            {loading ? (
              <Skeleton className="mt-3 h-8 w-16" />
            ) : (
              <div
                className={cn(
                  'mt-3 text-[30px] font-semibold leading-none tabular-nums tracking-[-0.03em]',
                  zero ? 'text-ink-5' : 'text-ink',
                )}
              >
                {m.value.toLocaleString()}
              </div>
            )}
            {m.ratio !== undefined && (
              <div className="mt-3 h-1 overflow-hidden rounded-full bg-ink/[0.06]">
                <div
                  className={cn('h-full rounded-full transition-all duration-500', tone.bar)}
                  style={{ width: `${Math.round(Math.max(0, Math.min(1, m.ratio)) * 100)}%` }}
                />
              </div>
            )}
            {m.sub && <div className="mt-2 truncate text-[12px] text-ink-4">{m.sub}</div>}
          </div>
        );
      })}
    </div>
  );
}

const MONO_TONES = [
  'bg-volt/25 text-volt-deep',
  'bg-copper/15 text-copper-deep',
  'bg-mint/10 text-mint',
  'bg-amber/15 text-amber',
  'bg-ink text-volt',
  'bg-ink/[0.06] text-ink-2',
];

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Deterministic initials tile for products/categories without imagery. */
export function Monogram({
  name,
  seed,
  size = 'md',
  muted,
}: {
  name: string;
  seed?: string;
  size?: 'md' | 'lg';
  muted?: boolean | undefined;
}) {
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join('') || '?';
  return (
    <span
      aria-hidden
      className={cn(
        'grid shrink-0 place-items-center font-display font-bold tracking-tight',
        size === 'md' ? 'size-10 rounded-xl text-[13px]' : 'size-16 rounded-2xl text-xl',
        muted ? 'bg-ink/[0.05] text-ink-4' : MONO_TONES[hash(seed ?? name) % MONO_TONES.length],
      )}
    >
      {initials}
    </span>
  );
}

/** Accessible on/off switch. */
export function Switch({
  checked,
  onChange,
  disabled,
  label,
  tone = 'mint',
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean | undefined;
  label: string;
  tone?: 'mint' | 'ink';
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-[22px] w-[38px] shrink-0 items-center rounded-full transition-colors duration-200 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50',
        checked ? (tone === 'mint' ? 'bg-mint' : 'bg-ink') : 'bg-ink/15',
      )}
    >
      <span
        className={cn(
          'inline-block size-[18px] rounded-full bg-paper shadow-[0_1px_3px_rgba(12,14,11,0.3)] transition-transform duration-200',
          checked ? 'translate-x-[18px]' : 'translate-x-[2px]',
        )}
      />
    </button>
  );
}

/** Product photo with a monogram fallback when there is no image or it fails to load. */
export function ProductThumb({
  productId,
  imageUrl,
  name,
  seed,
  size = 'md',
  muted,
}: {
  productId: string;
  imageUrl?: string | null | undefined;
  name: string;
  seed?: string;
  size?: 'md' | 'lg';
  muted?: boolean | undefined;
}) {
  const src = resolveCatalogImage(productId, imageUrl);
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return <Monogram name={name} {...(seed ? { seed } : {})} size={size} muted={muted} />;
  }
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className={cn(
        'shrink-0 bg-mist object-cover ring-1 ring-inset ring-ink/[0.08]',
        size === 'md' ? 'size-10 rounded-xl' : 'size-16 rounded-2xl',
        muted && 'opacity-50 grayscale',
      )}
    />
  );
}
