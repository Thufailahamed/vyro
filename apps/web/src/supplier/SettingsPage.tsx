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
    <div className="space-y-8 max-w-3xl">
      <PageHeader
        kicker="Account"
        title="Settings"
        sub="Facility profile, depot, payouts, and alerts."
      />

      <Surface kind="ink" className="p-5 sm:p-6 grain relative overflow-hidden">
        <div className="relative grid sm:grid-cols-3 gap-4 text-sm">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-[0.16em] text-volt">
              Facility
            </div>
            <div className="mt-1 font-display text-lg text-paper truncate">
              {detail.data?.supplier.name ?? supplierName}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-mono uppercase tracking-[0.16em] text-paper/40">
              Your role
            </div>
            <div className="mt-1 capitalize text-paper/80">{role}</div>
          </div>
          <div>
            <div className="text-[10px] font-mono uppercase tracking-[0.16em] text-paper/40">
              Facility ID
            </div>
            <div className="mt-1 font-mono text-[11px] text-paper/50 truncate" title={supplierId}>
              {supplierId}
            </div>
          </div>
          {detail.data?.supplier.description && (
            <p className="sm:col-span-3 text-xs text-paper/55 leading-relaxed">
              {detail.data.supplier.description}
            </p>
          )}
        </div>
      </Surface>

      {supplierId ? <SupplierSettingsForm supplierId={supplierId} /> : null}

      <Surface kind="elevated" className="p-6 space-y-3">
        <h2 className="vyro-display text-lg">Members & invites</h2>
        <p className="text-sm text-ink-4">
          Member management ships in a later release. Until then, contact a platform admin to add or
          change roles for your team.
        </p>
      </Surface>

      <Surface kind="elevated" className="p-6 space-y-3 border-l-2 border-l-rose/40">
        <h2 className="vyro-display text-lg">Session</h2>
        <p className="text-sm text-ink-4">Sign out of your VYRO account on this device.</p>
        <Button variant="danger" onClick={handleSignOut}>
          Sign out
        </Button>
      </Surface>
    </div>
  );
}
