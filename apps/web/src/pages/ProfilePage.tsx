import { Link } from 'react-router-dom';
import { Button, Badge, PageHeader } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { Surface } from '@/components/brand/Surface';
import { ProfileForm } from './profile/ProfileForm';
import { NotificationsForm } from './profile/NotificationsForm';
import { SecurityForm } from './profile/SecurityForm';

export function ProfilePage() {
  const { user, signOut } = useAuth();

  if (!user) {
    return (
      <div className="py-12">
        <h2 className="vyro-display text-3xl">Please sign in</h2>
        <Link to="/login" className="mt-4 inline-block">
          <Button>Sign in</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-3xl">
      <PageHeader kicker="Account" title={user.name ?? 'Profile'} sub={user.email} actions={<Button variant="ghost" onClick={() => signOut()} className="text-rose">Sign out</Button>} />

      <Surface kind="split" className="grid sm:grid-cols-[auto_1fr] items-center gap-6 p-6">
        <span className="size-16 bg-ink text-volt text-xl font-display font-semibold inline-flex items-center justify-center">
          {(user.name || 'U').slice(0, 2).toUpperCase()}
        </span>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl">{user.name}</h2>
            <p className="text-xs text-ink-4 vyro-metric mt-0.5">{user.email}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => signOut()} className="text-rose">
            Sign out
          </Button>
        </div>
      </Surface>

      <Surface className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-xl">Businesses</h3>
          <Link to="/onboarding/business">
            <Button variant="secondary" size="sm">
              Add
            </Button>
          </Link>
        </div>
        {user.memberships.length === 0 ? (
          <p className="text-sm text-ink-4">No buyer profiles linked.</p>
        ) : (
          <ul className="divide-y divide-ink/10">
            {user.memberships.map((m) => (
              <li key={m.businessId} className="py-3 flex justify-between">
                <span className="font-medium">{m.businessName}</span>
                <Badge variant="brand">{m.role}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Surface>

      <Surface className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-xl">Supplier accounts</h3>
          <Link to="/onboarding/supplier">
            <Button variant="secondary" size="sm">
              Register
            </Button>
          </Link>
        </div>
        {user.supplierMemberships.length === 0 ? (
          <p className="text-sm text-ink-4">No suppliers connected.</p>
        ) : (
          <ul className="divide-y divide-ink/10">
            {user.supplierMemberships.map((m) => (
              <li key={m.supplierId} className="py-3 flex justify-between">
                <span className="font-medium">{m.supplierName}</span>
                <Badge variant="success">{m.role}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Surface>

      <ProfileForm />
      <NotificationsForm />
      <SecurityForm />
    </div>
  );
}
