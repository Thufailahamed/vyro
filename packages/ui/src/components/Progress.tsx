import { cn } from '../lib/cn';

export interface ProgressProps {
  value: number; // 0-100
  className?: string;
  tone?: 'cyan' | 'mint' | 'amber' | 'rose';
}
const tones = {
  cyan: 'bg-cyan-deep',
  mint: 'bg-mint',
  amber: 'bg-amber',
  rose: 'bg-rose',
};
export function Progress({ value, className, tone = 'cyan' }: ProgressProps) {
  const safe = Math.max(0, Math.min(100, value));
  return (
    <div
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-ink-7', className)}
      role="progressbar"
      aria-valuenow={safe}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className={cn('h-full rounded-full transition-all duration-320', tones[tone])} style={{ width: `${safe}%` }} />
    </div>
  );
}
