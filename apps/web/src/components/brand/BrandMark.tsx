import { cn } from '@vyro/ui';

export function BrandMark({
  size = 32,
  tone = 'ink',
  className,
}: {
  size?: number;
  tone?: 'ink' | 'volt' | 'paper';
  className?: string;
}) {
  const bg = tone === 'volt' ? '#C6DC4A' : tone === 'paper' ? '#FAF7F0' : '#0C0E0B';
  const stroke = tone === 'ink' ? '#C6DC4A' : '#0C0E0B';
  const mid = tone === 'ink' ? '#FAF7F0' : '#0C0E0B';
  const end = '#B87A4E';
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      className={cn('shrink-0', className)}
      aria-hidden
    >
      <rect width="32" height="32" fill={bg} />
      <path
        d="M5 23C9.5 23 10.5 9 16 9C21.5 9 22 17 27 17"
        stroke={stroke}
        strokeWidth="1.4"
        fill="none"
      />
      <circle cx="5" cy="23" r="1.6" fill={stroke} />
      <circle cx="16" cy="9" r="1.6" fill={mid} />
      <circle cx="27" cy="17" r="1.6" fill={end} />
    </svg>
  );
}

export function BrandWordmark({
  tone = 'ink',
  size = 'md',
  eyebrow,
  className,
}: {
  tone?: 'ink' | 'paper';
  size?: 'sm' | 'md' | 'lg';
  eyebrow?: string;
  className?: string;
}) {
  const text = {
    sm: 'text-lg',
    md: 'text-xl',
    lg: 'text-3xl',
  }[size];
  return (
    <span className={cn('inline-flex items-baseline gap-2.5', className)}>
      <span
        className={cn(
          'vyro-display tracking-tight',
          text,
          tone === 'paper' ? 'text-paper' : 'text-ink',
        )}
      >
        VYRO
      </span>
      {eyebrow && (
        <span className={cn('vyro-kicker', tone === 'paper' ? 'text-volt' : 'text-copper')}>
          {eyebrow}
        </span>
      )}
    </span>
  );
}
