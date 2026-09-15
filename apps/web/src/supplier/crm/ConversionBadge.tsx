import type { LeadConversionStatus } from '@vyro/validation';

const STYLES: Record<LeadConversionStatus, string> = {
  new: 'bg-gray-100 text-gray-700 border-gray-200',
  contacted: 'bg-purple-100 text-purple-700 border-purple-200',
  quoted: 'bg-blue-100 text-blue-700 border-blue-200',
  won: 'bg-green-100 text-green-700 border-green-200',
  lost: 'bg-red-100 text-red-700 border-red-200',
};

interface Props {
  status: LeadConversionStatus | null;
}

export function ConversionBadge({ status }: Props) {
  if (!status) {
    return (
      <span className="inline-flex items-center rounded-full border border-dashed border-ink-3 px-2 py-0.5 text-xs text-ink-4">
        untracked
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold capitalize ${STYLES[status]}`}>
      {status}
    </span>
  );
}
