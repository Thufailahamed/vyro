import { cn } from '../lib/cn';
import { Link } from 'react-router-dom';

const sizes = {
  sm: { box: 'h-7', text: 'text-body-lg', mark: 'size-7' },
  md: { box: 'h-8', text: 'text-h2', mark: 'size-8' },
  lg: { box: 'h-10', text: 'text-h1', mark: 'size-10' },
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
  const Mark = (
    <span className="relative inline-flex items-center justify-center">
      <svg viewBox="0 0 32 32" className={cn(s.mark, 'shrink-0')} aria-hidden>
        <rect width="32" height="32" rx="7" fill={dark ? '#5EE2FF' : '#0A0B10'} />
        <path d="M9 8h4l5 12 5-12h4l-7 16h-4L9 8z" fill={dark ? '#0A0B10' : '#5EE2FF'} />
      </svg>
    </span>
  );
  const Wordmark = (
    <span className="inline-flex items-baseline gap-2">
      <span className={cn('font-semibold tracking-tight', s.text, dark ? 'text-paper' : 'text-ink-1')}>VYRO</span>
      {eyebrow && (
        <span className={cn('text-caption uppercase tracking-[0.18em]', dark ? 'text-cyan' : 'text-ink-3')}>{eyebrow}</span>
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
    return <Link to={to} className="inline-flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan rounded-sm">{content}</Link>;
  }
  return content;
}
