import { PageHeader } from '@/components/ui';

export function SupplierInventoryPage() {
  return (
    <div className="space-y-6">
      <PageHeader kicker="Stock" title="Inventory" sub="On-hand counts across SKUs." />
    </div>
  );
}
