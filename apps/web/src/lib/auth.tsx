import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, ApiError } from './api';

export interface Membership {
  businessId: string;
  role: 'owner' | 'manager' | 'staff';
  businessName: string;
}
export interface SupplierMembership {
  supplierId: string;
  role: 'owner' | 'manager' | 'staff';
  supplierName: string;
}
export interface SessionUser {
  userId: string;
  email: string;
  name: string;
  isAdmin: boolean;
  memberships: Membership[];
  supplierMemberships: SupplierMembership[];
}

interface AuthContextValue {
  user: SessionUser | null;
  loading: boolean;
  /** Re-reads `/auth/me` and returns the resolved user so callers can branch on
   *  memberships immediately after sign-in without waiting for a re-render. */
  refresh: () => Promise<SessionUser | null>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthContextValue>({
  user: null,
  loading: true,
  refresh: async () => null,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh(): Promise<SessionUser | null> {
    try {
      const data = await api.get<{ user: SessionUser | null }>('/auth/me');
      setUser(data.user);
      return data.user;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setUser(null);
      } else {
        setUser(null);
      }
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function signOut() {
    await api.post('/auth/sign-out');
    setUser(null);
  }

  useEffect(() => {
    void refresh();
  }, []);

  return <Ctx.Provider value={{ user, loading, refresh, signOut }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
