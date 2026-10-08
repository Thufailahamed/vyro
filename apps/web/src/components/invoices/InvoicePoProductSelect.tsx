export type InvoiceProductCandidate = {
  productId: string;
  productName: string;
  unit: string | null;
};

export function InvoicePoProductSelect({
  value,
  candidates,
  onChange,
}: {
  value: string | null;
  candidates: InvoiceProductCandidate[];
  onChange: (productId: string | null) => void;
}) {
  if (candidates.length === 0) return null;
  return (
    <select
      aria-label="PO product match"
      value={value ?? ''}
      onChange={(event) => onChange(event.target.value || null)}
      className="w-full bg-paper border border-ink/20 text-ink px-1 py-1 outline-none"
    >
      <option value="">Unmapped</option>
      {candidates.map((candidate) => (
        <option key={candidate.productId} value={candidate.productId}>
          {candidate.productName}{candidate.unit ? ` · ${candidate.unit}` : ''}
        </option>
      ))}
    </select>
  );
}
