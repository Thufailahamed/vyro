import { cn } from '../lib/cn';
import { Link } from 'react-router-dom';

const sizes = {
  sm: { box: 'h-7', text: 'text-lg', mark: 28 },
  md: { box: 'h-8', text: 'text-xl', mark: 32 },
  lg: { box: 'h-10', text: 'text-3xl', mark: 40 },
};

export interface LogoProps {
  size?: keyof typeof sizes;
  tone?: 'light' | 'dark';
  to?: string;
  className?: string;
  eyebrow?: string;
}

export function Logo({ size = 'md', tone = 'light', to, className, eyebrow }: LogoProps) {
  const s = sizes[size];
  const dark = tone === 'dark';
  const bg = dark ? '#C6DC4A' : '#0C0E0B';
  const stroke = dark ? '#0C0E0B' : '#C6DC4A';
  const mid = dark ? '#0C0E0B' : '#FAF7F0';
  const Mark = (
    <svg viewBox="0 0 32 32" width={s.mark} height={s.mark} className="shrink-0" aria-hidden>
      <rect width="32" height="32" fill={bg} />
      <path d="M5 23C9.5 23 10.5 9 16 9C21.5 9 22 17 27 17" stroke={stroke} strokeWidth="1.4" fill="none" />
      <circle cx="5" cy="23" r="1.6" fill={stroke} />
      <circle cx="16" cy="9" r="1.6" fill={mid} />
      <circle cx="27" cy="17" r="1.6" fill="#B87A4E" />
    </svg>
  );
  const Wordmark = (
    <span className="inline-flex items-baseline gap-2">
      <span className={cn('font-display font-extrabold tracking-tight', s.text, dark ? 'text-paper' : 'text-ink-1')}>VYRO</span>
      {eyebrow && (
        <span className={cn('text-[10px] uppercase tracking-[0.16em] font-semibold', dark ? 'text-volt' : 'text-copper')}>{eyebrow}</span>
      )}
    </span>
  );
  const content = (
    <span className={cn('inline-flex items-center gap-3', s.box, className)}>
      {Mark}
      {Wordmark}
    </span>
  );
  if (to) {
    return (
      <Link to={to} className="inline-flex items-center focus-visible:outline-none">
        {content}
      </Link>
    );
  }
  return content;
}
