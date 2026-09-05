import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { PageHeader, Button } from '@/components/ui';
import { Surface } from '@/components/brand/Surface';
import { useAuth } from '@/lib/auth';
import { useSupplierId } from './useSupplierId';
import { SupplierSettingsForm } from './SupplierSettingsForm';

type Supplier = { id: string; name: string; description: string | null; createdAt: number };

export function SupplierSettingsPage() {
  const { supplierId, role, supplierName } = useSupplierId();
  const { signOut } = useAuth();
  const navigate = useNavigate();

  const detail = useQuery({
    queryKey: ['supplier', supplierId, 'detail'],
    queryFn: () => api.get<{ supplier: Supplier }>(`/suppliers/${supplierId}`),
    retry: false,
  });

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader
        kicker="Account"
        title="Settings"
        sub="Profile, role, and membership."
      />

      <Surface kind="elevated" className="p-6 space-y-3">
        <h2 className="vyro-display text-lg">Supplier</h2>
        {supplierId ? <SupplierSettingsForm supplierId={supplierId} /> : null}
        <dl className="grid sm:grid-cols-3 gap-4 text-sm mt-4">
          <div>
            <dt className="text-[11px] uppercase tracking-[0.14em] text-ink-4">Name</dt>
            <dd className="mt-1 font-medium">{detail.data?.supplier.name ?? supplierName}</dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-[0.14em] text-ink-4">Supplier ID</dt>
            <dd className="mt-1 font-mono text-xs">{supplierId}</dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-[0.14em] text-ink-4">Your role</dt>
            <dd className="mt-1 font-medium capitalize">{role}</dd>
          </div>
          <div className="sm:col-span-3">
            <dt className="text-[11px] uppercase tracking-[0.14em] text-ink-4">Description</dt>
            <dd className="mt-1 text-ink-2">{detail.data?.supplier.description ?? '—'}</dd>
          </div>
          {detail.data?.supplier.createdAt && (
            <div>
              <dt className="text-[11px] uppercase tracking-[0.14em] text-ink-4">Created</dt>
              <dd className="mt-1 text-ink-3 text-xs">
                {new Date(detail.data.supplier.createdAt).toLocaleDateString()}
              </dd>
            </div>
          )}
        </dl>
      </Surface>

      <Surface kind="elevated" className="p-6 space-y-3">
        <h2 className="vyro-display text-lg">Members & invites</h2>
        <p className="text-sm text-ink-4">
          Member management ships in a later release. Until then, contact a platform admin to add or
          change roles for your team.
        </p>
      </Surface>

      <Surface kind="elevated" className="p-6 space-y-3">
        <h2 className="vyro-display text-lg">Session</h2>
        <p className="text-sm text-ink-4">Sign out of your VYRO account on this device.</p>
        <Button variant="danger" onClick={handleSignOut}>Sign out</Button>
      </Surface>
    </div>
  );
}
