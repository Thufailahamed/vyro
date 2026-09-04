import { Link } from 'react-router-dom';
import { Card, Button, Badge } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import {
  UserIcon,
  Building2Icon,
  StoreIcon,
  LogOutIcon,
  PlusIcon,
  ShieldCheckIcon,
} from '@/components/icons';

export function ProfilePage() {
  const { user, signOut } = useAuth();

  if (!user) {
    return (
      <div className="max-w-md mx-auto py-12 text-center">
        <Card className="p-8 space-y-4">
          <UserIcon size={32} className="mx-auto text-slate-400" />
          <h2 className="text-xl font-bold text-slate-800">Please Sign In</h2>
          <p className="text-xs text-slate-500">Sign in to manage your user credentials and company accounts.</p>
          <Link to="/login">
            <Button>Sign In</Button>
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
          Account & Organizations
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-1">
          Manage your personal credentials, linked business entities, and supplier licenses.
        </p>
      </div>

      {/* User Header Card */}
      <Card className="p-6 border-slate-200/90 shadow-soft-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 rounded-2xl bg-gradient-to-tr from-brand-700 to-sky-400 text-white flex items-center justify-center font-black text-xl shadow-soft-sm">
            {user.name ? user.name.slice(0, 2).toUpperCase() : 'U'}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-slate-900">{user.name}</h2>
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                <ShieldCheckIcon size={12} /> Verified Member
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">{user.email}</p>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => signOut()}
          className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 border-rose-200 self-start sm:self-auto"
        >
          <LogOutIcon size={15} /> Sign Out
        </Button>
      </Card>

      {/* Linked Businesses (Buyer Side) */}
      <Card className="p-6 border-slate-200/90 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Building2Icon size={18} className="text-brand-600" />
            <h3 className="font-bold text-base text-slate-900">Buyer Organizations</h3>
          </div>
          <Link to="/onboarding/business">
            <Button variant="outline" size="sm" className="text-xs">
              <PlusIcon size={14} /> Add Business
            </Button>
          </Link>
        </div>

        {user.memberships.length === 0 ? (
          <div className="text-center py-6 bg-slate-50 rounded-xl border border-slate-100">
            <p className="text-xs text-slate-500">No buyer business profiles linked yet.</p>
            <Link to="/onboarding/business" className="mt-2 inline-block">
              <Button size="sm">Register Business Profile</Button>
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {user.memberships.map((m) => (
              <div key={m.businessId} className="py-3 flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-sm text-slate-900">{m.businessName}</h4>
                  <span className="text-[11px] text-slate-600 font-mono">ID: {m.businessId.slice(0, 10)}...</span>
                </div>
                <Badge variant="brand" className="capitalize">
                  {m.role}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Linked Supplier Accounts (Seller Side) */}
      <Card className="p-6 border-slate-200/90 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <StoreIcon size={18} className="text-emerald-600" />
            <h3 className="font-bold text-base text-slate-900">Supplier & Merchant Accounts</h3>
          </div>
          <Link to="/onboarding/supplier">
            <Button variant="outline" size="sm" className="text-xs">
              <PlusIcon size={14} /> Register Supplier
            </Button>
          </Link>
        </div>

        {user.supplierMemberships.length === 0 ? (
          <div className="text-center py-6 bg-slate-50 rounded-xl border border-slate-100">
            <p className="text-xs text-slate-500">No supplier or distributor accounts linked.</p>
            <Link to="/onboarding/supplier" className="mt-2 inline-block">
              <Button variant="secondary" size="sm">List as a Supplier</Button>
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {user.supplierMemberships.map((m) => (
              <div key={m.supplierId} className="py-3 flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-sm text-slate-900">{m.supplierName}</h4>
                  <span className="text-[11px] text-slate-600 font-mono">ID: {m.supplierId.slice(0, 10)}...</span>
                </div>
                <Badge variant="success" className="capitalize">
                  {m.role}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
