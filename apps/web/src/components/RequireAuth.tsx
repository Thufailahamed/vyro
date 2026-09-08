import { type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth, type SessionUser } from '@/lib/auth';

/**
 * Landing path for a freshly authenticated user.
 *
 * Platform admins go to the admin console. Users who only belong to a supplier
 * org (no buyer business) go straight to the supplier portal — sending them to
 * the buyer dashboard would show an empty workspace. Everyone else lands on the
 * buyer dashboard, which itself prompts for business onboarding when needed.
 */
export function postLoginPath(user: SessionUser | null): string {
  if (!user) return '/login';
  if (user.isAdmin) return '/admin';
  const hasBusiness = user.memberships.length > 0;
  const hasSupplier = user.supplierMemberships.length > 0;
  if (hasSupplier && !hasBusiness) return '/supplier';
  return '/dashboard';
}

/**
 * Resolves the post-login destination, preferring an explicit `?next=` hop.
 * Only same-origin relative paths are honoured so a crafted `next` cannot be
 * used as an open redirect.
 */
export function resolveNextPath(search: string, user: SessionUser | null): string {
  const next = new URLSearchParams(search).get('next');
  if (next && next.startsWith('/') && !next.startsWith('//')) return next;
  return postLoginPath(user);
}

function AuthFallback() {
  return (
    <div className="flex items-center justify-center py-32">
      <div className="text-ink-4 text-sm">Checking your session…</div>
    </div>
  );
}

/**
 * Gate for buyer-portal routes. Anonymous visitors are bounced to `/login`
 * with a `next` hop so they resume where they were headed after signing in.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <AuthFallback />;
  if (!user) {
    const next = encodeURIComponent(`${location.pathname}${location.search}`);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  return <>{children}</>;
}

/**
 * Gate for routes that require an active buyer business (cart, checkout,
 * orders). Authenticated users with no business membership are routed into
 * onboarding instead of seeing an empty cart they can never fill.
 */
export function RequireBusiness({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <AuthFallback />;
  if (!user) {
    const next = encodeURIComponent(`${location.pathname}${location.search}`);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  if (user.memberships.length === 0) {
    const next = encodeURIComponent(`${location.pathname}${location.search}`);
    return <Navigate to={`/onboarding/business?next=${next}`} replace />;
  }
  return <>{children}</>;
}

/**
 * Inverse gate for `/login` and `/signup`: an already-authenticated visitor is
 * forwarded to their portal rather than shown a second sign-in form.
 */
export function RedirectIfAuthed({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <AuthFallback />;
  if (user) return <Navigate to={resolveNextPath(location.search, user)} replace />;
  return <>{children}</>;
}
