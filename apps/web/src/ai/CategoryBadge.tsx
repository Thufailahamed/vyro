import { SparklesIcon } from '@/components/icons';

const COLOR: Record<string, string> = {
  food: 'border-mint/40 text-mint bg-mint/5',
  packaging: 'border-copper/40 text-copper bg-copper/5',
  cleaning: 'border-volt/40 text-ink bg-volt/10',
  office: 'border-ink/30 text-ink bg-bone',
  equipment: 'border-ink text-volt bg-ink',
  other: 'border-ink/15 text-ink-3 bg-paper',
};

const LABEL: Record<string, string> = {
  food: 'Food',
  packaging: 'Packaging',
  cleaning: 'Cleaning',
  office: 'Office',
  equipment: 'Equipment',
  other: 'Other',
};

export type CategorySource = 'rule' | 'default' | 'manual' | null;

export function CategoryBadge({ slug, source }: { slug: string | null; source: CategorySource }) {
  const s = slug ?? 'other';
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider border px-2 py-0.5 ${COLOR[s] ?? COLOR.other}`}>
      <SparklesIcon size={10} />
      <span>{LABEL[s] ?? s}</span>
      {source === 'manual' && <span className="text-rose">·edited</span>}
    </span>
  );
}
