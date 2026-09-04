import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Routes, Route, Navigate, NavLink, Outlet, Link, useNavigate } from 'react-router-dom';
import { api, ApiError } from '@/lib/api';
import { SuppliersPage, BusinessesPage } from './pages/Lists';
import { DisputedPage, AuditPage } from './pages/DisputedAndAudit';
import { LoginPage } from './pages/LoginPage';

interface AuthCtx {
  user: { isAdmin: boolean } | null;
  setUser: (u: { isAdmin: boolean } | null) => void;
}

const AuthContext = createContext<AuthCtx>({ user: null, setUser: () => {} });
const useAuth = () => useContext(AuthContext);

function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<{ isAdmin: boolean } | null>(null);
  useEffect(() => {
    api.get<{ user: { isAdmin: boolean } | null }>('/auth/me').then((d) => setUser(d.user)).catch((e) => {
      if (e instanceof ApiError && e.status === 401) setUser(null);
    });
  }, []);
  return <AuthContext.Provider value={{ user, setUser }}>{children}</AuthContext.Provider>;
}

function Shell() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `px-3 py-1.5 rounded text-sm ${isActive ? 'bg-brand-50 text-brand-700' : 'hover:bg-slate-100'}`;
  return (
    <div className="min-h-screen">
      <header className="border-b bg-white">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="font-bold text-brand-700">VYRO Admin</Link>
          {user && (
            <nav className="flex items-center gap-1">
              <NavLink to="/suppliers" className={linkClass}>Suppliers</NavLink>
              <NavLink to="/businesses" className={linkClass}>Businesses</NavLink>
              <NavLink to="/disputed" className={linkClass}>Disputed</NavLink>
              <NavLink to="/audit" className={linkClass}>Audit</NavLink>
              <button onClick={async () => { await api.post('/auth/sign-out'); setUser(null); navigate('/login'); }} className="ml-2 text-sm text-muted">Sign out</button>
            </nav>
          )}
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}

function HomePage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">VYRO admin</h1>
      <p className="text-muted">Pick a tab: Suppliers, Businesses, Disputed, or Audit.</p>
    </div>
  );
}

function RequireAdmin({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!user.isAdmin) return <p className="text-sm text-red-700">Forbidden: not an admin.</p>;
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route element={<Shell />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<RequireAdmin><HomePage /></RequireAdmin>} />
          <Route path="/suppliers" element={<RequireAdmin><SuppliersPage /></RequireAdmin>} />
          <Route path="/businesses" element={<RequireAdmin><BusinessesPage /></RequireAdmin>} />
          <Route path="/disputed" element={<RequireAdmin><DisputedPage /></RequireAdmin>} />
          <Route path="/audit" element={<RequireAdmin><AuditPage /></RequireAdmin>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
