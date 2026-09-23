import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { api, onUnauthorized } from './api';
import { clearCookies, loadCookies } from './cookieJar';

export type OrgRole = 'owner' | 'manager' | 'staff' | 'sales';

export interface Membership {
  businessId: string;
  role: OrgRole;
  businessName: string;
}
export interface SupplierMembership {
  supplierId: string;
  role: OrgRole;
  supplierName: string;
}
export interface SessionUser {
  userId: string;
  email: string;
  name: string;
  image?: string | null;
  phone?: string | null;
  isAdmin: boolean;
  adminRole?: string | null;
  twoFactorEnabled?: boolean;
  memberships: Membership[];
  supplierMemberships: SupplierMembership[];
}

export type Portal = 'buyer' | 'supplier' | 'admin';

interface Prefs {
  portal?: Portal;
  businessId?: string;
  supplierId?: string;
}

interface AuthContextValue {
  user: SessionUser | null;
  loading: boolean;
  refresh: () => Promise<SessionUser | null>;
  signIn: (email: string, password: string) => Promise<SignInResult>;
  signOut: () => Promise<void>;
  /** The business the buyer portal acts for (first membership by default). */
  business: Membership | null;
  /** The supplier org the supplier portal acts for. */
  supplier: SupplierMembership | null;
  setBusinessId: (id: string) => void;
  setSupplierId: (id: string) => void;
  /** Last portal the user was in — restored on next launch. */
  portal: Portal | undefined;
  setPortal: (p: Portal) => void;
  availablePortals: Portal[];
}

export type SignInResult = { ok: true; user: SessionUser | null } | { ok: false; twoFactor: true };

const PREFS_KEY = 'vyro.prefs.v1';

async function readPrefs(): Promise<Prefs> {
  if (Platform.OS === 'web') return {};
  try {
    const raw = await SecureStore.getItemAsync(PREFS_KEY);
    return raw ? (JSON.parse(raw) as Prefs) : {};
  } catch {
    return {};
  }
}
function writePrefs(p: Prefs) {
  if (Platform.OS === 'web') return;
  SecureStore.setItemAsync(PREFS_KEY, JSON.stringify(p)).catch(() => {});
}

const Ctx = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [prefs, setPrefs] = useState<Prefs>({});

  const updatePrefs = useCallback((patch: Partial<Prefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      writePrefs(next);
      return next;
    });
  }, []);

  const refresh = useCallback(async (): Promise<SessionUser | null> => {
    try {
      const data = await api.get<{ user: SessionUser | null }>('/auth/me');
      const u = data?.user ?? null;
      if (u) {
        u.memberships = u.memberships ?? [];
        u.supplierMemberships = u.supplierMemberships ?? [];
      }
      setUser(u);
      return u;
    } catch {
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const signIn = useCallback(
    async (email: string, password: string): Promise<SignInResult> => {
      const res = await api.post<{ twoFactorRedirect?: boolean } | undefined>('/auth/sign-in', { email, password });
      if (res && (res as { twoFactorRedirect?: boolean }).twoFactorRedirect) {
        return { ok: false, twoFactor: true };
      }
      const u = await refresh();
      return { ok: true, user: u };
    },
    [refresh],
  );

  const signOut = useCallback(async () => {
    try {
      await api.post('/auth/sign-out');
    } catch {
      /* session may already be gone */
    }
    await clearCookies();
    qc.clear();
    setUser(null);
  }, [qc]);

  useEffect(() => {
    (async () => {
      await loadCookies();
      setPrefs(await readPrefs());
      await refresh();
    })();
  }, [refresh]);

  useEffect(
    () =>
      onUnauthorized(() => {
        setUser((u) => (u ? null : u));
      }),
    [],
  );

  const business = useMemo(() => {
    const list = user?.memberships ?? [];
    return list.find((m) => m.businessId === prefs.businessId) ?? list[0] ?? null;
  }, [user, prefs.businessId]);

  const supplier = useMemo(() => {
    const list = user?.supplierMemberships ?? [];
    return list.find((m) => m.supplierId === prefs.supplierId) ?? list[0] ?? null;
  }, [user, prefs.supplierId]);

  const availablePortals = useMemo<Portal[]>(() => {
    if (!user) return [];
    const out: Portal[] = ['buyer'];
    if (user.supplierMemberships.length) out.push('supplier');
    if (user.isAdmin) out.push('admin');
    return out;
  }, [user]);

  const value: AuthContextValue = {
    user,
    loading,
    refresh,
    signIn,
    signOut,
    business,
    supplier,
    setBusinessId: (id) => {
      updatePrefs({ businessId: id });
      qc.invalidateQueries();
    },
    setSupplierId: (id) => {
      updatePrefs({ supplierId: id });
      qc.invalidateQueries();
    },
    portal: prefs.portal,
    setPortal: (p) => updatePrefs({ portal: p }),
    availablePortals,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside <AuthProvider>');
  return v;
}

/** Active buyer business id, or undefined when the user has none yet. */
export function useBusinessId(): string | undefined {
  return useAuth().business?.businessId;
}

/** Active supplier id, or undefined when the user has no supplier org. */
export function useSupplierId(): string | undefined {
  return useAuth().supplier?.supplierId;
}

/** Where a freshly authenticated user should land. Mirrors web postLoginPath,
 *  but honours the last portal they used on this device. */
export function homeFor(user: SessionUser | null, last?: Portal): string {
  if (!user) return '/welcome';
  const can = (p: Portal) =>
    p === 'buyer' ? true : p === 'supplier' ? user.supplierMemberships.length > 0 : user.isAdmin;
  if (last && can(last)) return last === 'buyer' ? '/buyer' : `/${last}`;
  if (user.isAdmin) return '/admin';
  if (user.supplierMemberships.length && !user.memberships.length) return '/supplier';
  return '/buyer';
}
