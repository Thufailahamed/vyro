import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';

export function Layout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `px-3 py-1.5 rounded text-sm ${isActive ? 'bg-brand-50 text-brand-700' : 'text-fg hover:bg-slate-100'}`;

  return (
    <div className="min-h-screen bg-bg text-fg">
      <header className="border-b bg-white">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <Link to="/" className="font-bold text-brand-700 text-lg">VYRO</Link>
          <nav className="flex items-center gap-1">
            <NavLink to="/search" className={linkClass}>Search</NavLink>
            <NavLink to="/cart" className={linkClass}>Cart</NavLink>
            {user && <NavLink to="/orders" className={linkClass}>My orders</NavLink>}
            {user && user.supplierMemberships.length > 0 && (
              <NavLink to="/supplier/orders" className={linkClass}>Supplier inbox</NavLink>
            )}
            {user && <NavLink to="/profile" className={linkClass}>{user.name}</NavLink>}
            {user ? (
              <button onClick={async () => { await signOut(); navigate('/'); }} className="ml-2 text-sm text-muted hover:text-fg">Sign out</button>
            ) : (
              <>
                <NavLink to="/login" className={linkClass}>Sign in</NavLink>
                <NavLink to="/signup" className="ml-2 px-3 py-1.5 rounded bg-brand-600 text-white text-sm">Sign up</NavLink>
              </>
            )}
          </nav>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-8">
        <Outlet />
      </main>
      <footer className="border-t mt-12 py-6 text-center text-sm text-muted">
        VYRO © {new Date().getFullYear()} — B2B procurement for Sri Lanka
      </footer>
    </div>
  );
}
