import { Link } from 'react-router-dom';
import { Card, GhostButton } from '@/components/ui';
import { useAuth } from '@/lib/auth';

export function ProfilePage() {
  const { user, signOut } = useAuth();
  if (!user) return <p className="text-muted">Sign in to view your profile.</p>;
  return (
    <div className="space-y-4 max-w-xl">
      <h1 className="text-2xl font-bold">{user.name}</h1>
      <p className="text-muted">{user.email}</p>
      <Card>
        <h3 className="font-semibold mb-2">Businesses</h3>
        {user.memberships.length === 0 ? (
          <p>No business yet. <Link to="/onboarding/business" className="text-brand-600">Set up your business</Link>.</p>
        ) : (
          <ul className="list-disc pl-5 text-sm">
            {user.memberships.map((m) => <li key={m.businessId}>{m.businessName} <span className="text-muted">({m.role})</span></li>)}
          </ul>
        )}
      </Card>
      <Card>
        <h3 className="font-semibold mb-2">Supplier accounts</h3>
        {user.supplierMemberships.length === 0 ? (
          <p>No supplier account yet. <Link to="/onboarding/supplier" className="text-brand-600">List your business</Link>.</p>
        ) : (
          <ul className="list-disc pl-5 text-sm">
            {user.supplierMemberships.map((m) => <li key={m.supplierId}>{m.supplierName} <span className="text-muted">({m.role})</span></li>)}
          </ul>
        )}
      </Card>
      <GhostButton onClick={() => signOut()}>Sign out</GhostButton>
    </div>
  );
}
