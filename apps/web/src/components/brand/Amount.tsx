import { cn } from '@vyro/ui';
import { formatLKR } from '@/lib/format';

/** LKR amount with a de-emphasised currency prefix and decimals; never wraps. */
export function Amount({
  cents,
  tone = 'light',
  decimals = true,
}: {
  cents: number;
  tone?: 'light' | 'dark';
  decimals?: boolean;
}) {
  const [whole, dec] = formatLKR(cents).replace(/^Rs\.\s*/, '').split('.');
  return (
    <span className="inline-flex items-baseline whitespace-nowrap tabular-nums">
      <span
        className={cn(
          'mr-[0.25em] text-[0.5em] font-medium tracking-normal self-start translate-y-[0.35em]',
          tone === 'dark' ? 'text-paper/45' : 'text-ink-4',
        )}
      >
        Rs
      </span>
      <span>{whole}</span>
      {decimals && dec !== undefined && (
        <span className={cn('text-[0.62em]', tone === 'dark' ? 'text-paper/40' : 'opacity-45')}>.{dec}</span>
      )}
    </span>
  );
}
