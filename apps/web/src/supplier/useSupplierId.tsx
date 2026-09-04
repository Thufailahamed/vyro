import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useAuth } from '@/lib/auth';

interface SupplierIdCtx {
  supplierId: string;
  role: 'owner' | 'manager' | 'staff';
  supplierName: string;
}

const Ctx = createContext<SupplierIdCtx | null>(null);

export function SupplierIdProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const value = useMemo<SupplierIdCtx | null>(() => {
    const m = user?.supplierMemberships?.[0];
    if (!m) return null;
    return { supplierId: m.supplierId, role: m.role, supplierName: m.supplierName };
  }, [user]);

  if (!value) {
    return <>{children}</>;
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSupplierId(): SupplierIdCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSupplierId must be used inside <SupplierIdProvider> with a membership');
  return v;
}
