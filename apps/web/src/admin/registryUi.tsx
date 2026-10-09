/**
 * Small presentational pieces shared by the supplier / business registry pages:
 * entity monograms, copyable IDs, relative dates and the compliance bar.
 */
import { useState, type ReactNode } from 'react';
import { cn } from '@vyro/ui';
import { CheckIcon, CopyIcon } from '@/components/icons';

type Maybe<T> = T | undefined;

const MONOGRAM_TONES = [
  'from-[#E9EFC9] to-[#D6E28F] text-[#4C5A12]',
  'from-[#F1E2D4] to-[#E2C3A6] text-copper-deep',
  'from-[#DCEBE3] to-[#B7D6C6] text-[#2B6650]',
  'from-[#EFE7D8] to-[#DCCDB1] text-[#6B5634]',
  'from-[#E6E4DE] to-[#CFCBC0] text-ink-3',
] as const;

function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const first = words[0]?.[0] ?? '';
  const second = words.length > 1 ? (words[1]?.[0] ?? '') : (words[0]?.[1] ?? '');
  return (first + second).toUpperCase();
}

function toneFor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return MONOGRAM_TONES[Math.abs(h) % MONOGRAM_TONES.length];
}

/** Deterministic initials tile; `seed` keeps the colour stable per entity. */
export function Monogram({
  name,
  seed,
  size = 'md',
  badge,
  className,
}: {
  name: string;
  seed?: Maybe<string>;
  size?: Maybe<'sm' | 'md' | 'lg'>;
  /** Small status dot / icon pinned to the bottom-right corner. */
  badge?: ReactNode;
  className?: Maybe<string>;
}) {
  const sizeCls = {
    sm: 'size-8 rounded-[9px] text-[11px]',
    md: 'size-10 rounded-[11px] text-[13px]',
    lg: 'size-16 rounded-[18px] text-xl',
  }[size];
  return (
    <span className={cn('relative inline-flex shrink-0', className)}>
      <span
        className={cn(
          'flex items-center justify-center bg-gradient-to-br font-display font-bold tracking-[-0.02em] shadow-[inset_0_0_0_1px_rgba(12,14,11,0.08),inset_0_1px_0_rgba(255,255,255,0.6),0_1px_2px_rgba(12,14,11,0.08)]',
          sizeCls,
          toneFor(seed ?? name),
        )}
        aria-hidden
      >
        {initials(name)}
      </span>
      {badge ? <span className="absolute -bottom-1 -right-1">{badge}</span> : null}
    </span>
  );
}

/** Truncated monospace ID with a copy-to-clipboard affordance. */
export function CopyId({ id, label = 'ID', className }: { id: string; label?: Maybe<string>; className?: Maybe<string> }) {
  const [copied, setCopied] = useState(false);
  const copy = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    void navigator.clipboard?.writeText(id).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    });
  };
  return (
    <button
      type="button"
      onClick={copy}
      title={copied ? 'Copied' : `Copy ${id}`}
      aria-label={`Copy ${label} ${id}`}
      className={cn(
        'group/copy inline-flex max-w-full items-center gap-1.5 rounded-md py-0.5 font-mono text-[11px] text-ink-4 transition-colors hover:text-ink',
        className,
      )}
    >
      <span className="shrink-0 text-ink-5">{label}</span>
      <span className="truncate">{id.length > 13 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id}</span>
      <span className={cn('shrink-0 transition-opacity', copied ? 'text-mint opacity-100' : 'opacity-0 group-hover/copy:opacity-100')}>
        {copied ? <CheckIcon size={11} /> : <CopyIcon size={11} />}
      </span>
    </button>
  );
}

const RTF = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

/** "3 days ago" style label for an epoch-ms timestamp. */
export function relativeTime(ts: number, now = Date.now()) {
  const diff = (ts - now) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return 'just now';
  if (abs < 3600) return RTF.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return RTF.format(Math.round(diff / 3600), 'hour');
  if (abs < 86400 * 30) return RTF.format(Math.round(diff / 86400), 'day');
  if (abs < 86400 * 365) return RTF.format(Math.round(diff / (86400 * 30)), 'month');
  return RTF.format(Math.round(diff / (86400 * 365)), 'year');
}

export function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Horizontal stacked bar; segments with 0 are skipped. */
export function SegmentBar({
  segments,
  className,
}: {
  segments: Array<{ key: string; value: number; className: string; label: string }>;
  className?: Maybe<string>;
}) {
  const total = segments.reduce((n, s) => n + s.value, 0);
  return (
    <div
      className={cn('flex h-2.5 w-full gap-[3px] overflow-hidden rounded-full bg-ink/[0.06]', className)}
      role="img"
      aria-label={segments.map((s) => `${s.label}: ${s.value}`).join(', ')}
    >
      {total > 0
        ? segments
            .filter((s) => s.value > 0)
            .map((s) => (
              <span
                key={s.key}
                className={cn('h-full rounded-full transition-[width] duration-500 ease-vyro', s.className)}
                style={{ width: `${(s.value / total) * 100}%` }}
              />
            ))
        : null}
    </div>
  );
}
