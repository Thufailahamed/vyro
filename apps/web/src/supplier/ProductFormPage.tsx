import { useParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui';

export function SupplierProductFormPage({ mode }: { mode: 'create' | 'edit' }) {
  const { id } = useParams();
  return (
    <div className="space-y-6">
      <PageHeader
        kicker={mode === 'create' ? 'New product' : 'Edit product'}
        title={mode === 'create' ? 'Add a product' : `Edit ${id}`}
        sub="Catalog details, pricing, and inventory."
      />
    </div>
  );
}
