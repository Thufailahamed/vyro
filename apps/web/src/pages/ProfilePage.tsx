import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button, Badge, PageHeader, Input, Label } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { Surface } from '@/components/brand/Surface';
import { usePageTitle } from '@/lib/usePageTitle';
import {
  Building2Icon,
  StoreIcon,
  UserIcon,
  LogOutIcon,
  ShieldCheckIcon,
  MailIcon,
  PhoneIcon,
  ClockIcon,
  CheckCircleIcon,
  ArrowRightIcon,
  BellIcon,
  CheckIcon,
  PackageIcon,
  Trash2Icon,
} from '@/components/icons';
import { ProfileForm } from './profile/ProfileForm';
import { NotificationsForm } from './profile/NotificationsForm';
import { SecurityForm } from './profile/SecurityForm';

type TabType = 'organizations' | 'profile' | 'notifications' | 'security' | 'data';

function DataPrivacyTab() {
  const [exporting, setExporting] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  async function handleExport() {
    setExporting(true);
    setMessage(null);
    try {
      const res = await fetch('/api/settings/me/export', { credentials: 'include' });
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vyro-data-${new Date().toISOString()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setMessage({ kind: 'ok', text: 'Export downloaded.' });
    } catch (e) {
      setMessage({ kind: 'err', text: e instanceof Error ? e.message : 'Export failed' });
    } finally {
      setExporting(false);
    }
  }

  async function handleDelete() {
    if (confirmText !== 'DELETE') return;
    setDeleting(true);
    setMessage(null);
    try {
      const res = await fetch('/api/settings/me/delete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ confirm: 'DELETE' }),
      });
      if (!res.ok) throw new Error(`Delete failed (${res.status})`);
      setMessage({ kind: 'ok', text: 'Account scheduled for deletion in 30 days.' });
      setConfirmText('');
    } catch (e) {
      setMessage({ kind: 'err', text: e instanceof Error ? e.message : 'Delete failed' });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <Surface kind="elevated" className="p-6 sm:p-8 space-y-4">
        <div className="flex items-center gap-2.5 pb-4 border-b border-ink/10">
          <div className="size-9 bg-ink text-volt flex items-center justify-center">
            <ShieldCheckIcon size={18} />
          </div>
          <div>
            <h3 className="font-display text-xl text-ink font-semibold">Your data</h3>
            <p className="text-xs text-ink-4">Download a JSON export of your profile, businesses, suppliers, orders, payments, and notifications.</p>
          </div>
        </div>
        <Button onClick={handleExport} disabled={exporting}>
          {exporting ? 'Exporting…' : 'Download my data'}
        </Button>
      </Surface>

      <Surface kind="elevated" className="p-6 sm:p-8 space-y-4 border-rose/30">
        <div className="flex items-center gap-2.5 pb-4 border-b border-ink/10">
          <div className="size-9 bg-rose text-paper flex items-center justify-center">
            <Trash2Icon size={18} />
          </div>
          <div>
            <h3 className="font-display text-xl text-ink font-semibold">Delete account</h3>
            <p className="text-xs text-ink-4">Account deletion is scheduled for 30 days from confirmation. After 30 days your records are purged.</p>
          </div>
        </div>
        <div className="space-y-2 max-w-md">
          <Label htmlFor="confirm">Type DELETE to confirm</Label>
          <Input
            id="confirm"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="DELETE"
          />
        </div>
        <Button
          onClick={handleDelete}
          disabled={deleting || confirmText !== 'DELETE'}
          variant="danger"
        >
          {deleting ? 'Scheduling…' : 'Schedule deletion'}
        </Button>
      </Surface>

      {message && (
        <div className={`px-4 py-2 text-sm border ${message.kind === 'ok' ? 'border-mint/40 bg-mint/10 text-mint' : 'border-rose/40 bg-rose/10 text-rose'}`}>
          {message.text}
        </div>
      )}
    </div>
  );
}

export function ProfilePage() {
  usePageTitle('Account');
  const { user, signOut } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = (searchParams.get('tab') as TabType) || 'organizations';

  const setTab = (tab: TabType) => {
    setSearchParams({ tab });
  };

  const { data: settingsData } = useQuery({
    queryKey: ['profile-settings'],
    queryFn: () => api.get<{ settings: { displayName: string | null; avatarUrl: string | null; phone: string | null } }>('/settings/me'),
    enabled: !!user,
  });

  const { data: secData } = useQuery({
    queryKey: ['profile-security'],
    queryFn: () => api.get<{ twoFactorEnabled: boolean }>('/settings/me/security'),
    enabled: !!user,
  });

  if (!user) {
    return (
      <div className="max-w-2xl py-16 space-y-6">
        <div className="vyro-kicker">Operator Access</div>
        <h1 className="vyro-display text-4xl text-ink">Please sign in to access your account.</h1>
        <p className="text-sm text-ink-3">
          Sign into your verified VYRO account to manage commercial purchasing organizations, mill partnerships, and platform security.
        </p>
        <Link to="/login" className="inline-block">
          <Button className="bg-volt text-ink hover:bg-volt-glow font-bold uppercase tracking-wider text-xs">
            Sign In to Workspace →
          </Button>
        </Link>
      </div>
    );
  }

  const settings = settingsData?.settings;
  const is2Fa = secData?.twoFactorEnabled ?? false;
  const initials = (settings?.displayName || user.name || 'OP').slice(0, 2).toUpperCase();
  const displayName = settings?.displayName || user.name || 'Operator';
  const displayPhone = settings?.phone || 'No phone linked';
  const orgCount = user.memberships.length + user.supplierMemberships.length;

  return (
    <div className="space-y-8 max-w-6xl">
      {/* 1. TOP HEADER */}
      <PageHeader
        kicker="Operator Identity & Central Access"
        title="Account Command"
        sub="Manage your verified operator identity, commercial purchasing businesses, wholesale supplier hubs, and security controls."
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => signOut()}
            className="text-rose hover:bg-rose/10 hover:border-rose/30 flex items-center gap-1.5 font-bold uppercase tracking-wider text-xs px-4"
          >
            <LogOutIcon size={14} />
            <span>Sign out</span>
          </Button>
        }
      />

      {/* 2. EXECUTIVE OPERATOR IDENTITY BANNER */}
      <Surface kind="elevated" className="p-6 sm:p-8 bg-paper border border-ink/15 shadow-sm">
        <div className="grid lg:grid-cols-12 gap-6 items-center">
          {/* Avatar & Core Profile Information */}
          <div className="lg:col-span-7 flex flex-col sm:flex-row items-start sm:items-center gap-5">
            <div className="relative shrink-0">
              {settings?.avatarUrl ? (
                <img
                  src={settings.avatarUrl}
                  alt={displayName}
                  loading="lazy"
                  decoding="async"
                  className="size-20 rounded-full object-cover border-2 border-ink shadow-md"
                />
              ) : (
                <div className="size-20 rounded-full bg-ink text-volt text-2xl font-display font-bold flex items-center justify-center border-2 border-volt/50 shadow-md">
                  {initials}
                </div>
              )}
              <span
                className="absolute bottom-0 right-0 size-4 rounded-full bg-mint border-2 border-paper"
                title="Active Account Session"
              />
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="vyro-display text-2xl sm:text-3xl text-ink font-bold leading-tight">
                  {displayName}
                </h2>
                <Badge variant="brand" className="flex items-center gap-1">
                  <ShieldCheckIcon size={12} />
                  <span>Verified Identity</span>
                </Badge>
                {user.isAdmin && (
                  <Badge variant="purple" className="font-bold">
                    Admin Access
                  </Badge>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-y-1.5 gap-x-4 text-xs text-ink-3">
                <span className="flex items-center gap-1.5">
                  <MailIcon size={13} className="text-copper shrink-0" />
                  <span className="font-mono">{user.email}</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <PhoneIcon size={13} className="text-copper shrink-0" />
                  <span className="font-mono">{displayPhone}</span>
                </span>
                <span className="flex items-center gap-1.5 font-mono text-[11px] text-ink-4 bg-mist px-2 py-0.5 border border-line">
                  ID: USR-{user.userId.slice(0, 8).toUpperCase()}
                </span>
              </div>
            </div>
          </div>

          {/* Quick Metric Badges */}
          <div className="lg:col-span-5 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-2 gap-3 pt-4 lg:pt-0 lg:border-l lg:border-ink/10 lg:pl-6">
            <div className="p-3 bg-mist/60 border border-ink/10">
              <span className="text-[10px] font-mono text-ink-4 uppercase tracking-wider block">Buyer Entities</span>
              <span className="vyro-metric text-xl font-bold text-ink block mt-0.5">
                {user.memberships.length} Active
              </span>
            </div>
            <div className="p-3 bg-mist/60 border border-ink/10">
              <span className="text-[10px] font-mono text-ink-4 uppercase tracking-wider block">Supplier Hubs</span>
              <span className="vyro-metric text-xl font-bold text-ink block mt-0.5">
                {user.supplierMemberships.length} Connected
              </span>
            </div>
            <div className="p-3 bg-mist/60 border border-ink/10">
              <span className="text-[10px] font-mono text-ink-4 uppercase tracking-wider block">Two-Factor Auth</span>
              <span className={`vyro-metric text-xs font-bold block mt-1 ${is2Fa ? 'text-mint' : 'text-amber'}`}>
                {is2Fa ? '● Enforced (TOTP)' : '○ Standard Auth'}
              </span>
            </div>
            <div className="p-3 bg-mist/60 border border-ink/10">
              <span className="text-[10px] font-mono text-ink-4 uppercase tracking-wider block">Network Scope</span>
              <span className="vyro-metric text-xs font-bold text-ink block mt-1">
                25 LK Districts
              </span>
            </div>
          </div>
        </div>
      </Surface>

      {/* 3. SEGMENTED TAB NAVIGATION */}
      <div className="border-b border-ink/15">
        <nav className="flex flex-wrap gap-2 -mb-px">
          {[
            {
              id: 'organizations',
              label: 'Organizations & Depots',
              badge: orgCount > 0 ? String(orgCount) : null,
              icon: Building2Icon,
            },
            {
              id: 'profile',
              label: 'Profile Credentials',
              badge: null,
              icon: UserIcon,
            },
            {
              id: 'notifications',
              label: 'Notification Signals',
              badge: null,
              icon: BellIcon,
            },
            {
              id: 'security',
              label: 'Security & Access',
              badge: is2Fa ? '2FA' : null,
              icon: ShieldCheckIcon,
            },
            {
              id: 'data',
              label: 'Data & Privacy',
              badge: null,
              icon: ShieldCheckIcon,
            },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setTab(tab.id as TabType)}
                className={`flex items-center gap-2 py-3 px-4 font-semibold text-xs tracking-wider uppercase border-b-2 transition-all duration-180 cursor-pointer ${
                  isActive
                    ? 'border-ink text-ink bg-paper shadow-sm'
                    : 'border-transparent text-ink-3 hover:text-ink hover:border-ink/20'
                }`}
              >
                <Icon size={14} className={isActive ? 'text-copper' : 'text-ink-4'} />
                <span>{tab.label}</span>
                {tab.badge && (
                  <span
                    className={`px-1.5 py-0.2 text-[9px] font-mono font-bold ${
                      isActive ? 'bg-ink text-volt' : 'bg-mist text-ink-3'
                    }`}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* 4. TAB CONTENTS */}
      {activeTab === 'organizations' && (
        <div className="space-y-8 animate-fade-in">
          {/* Dual Column Organization Cards */}
          <div className="grid lg:grid-cols-2 gap-6">
            {/* Left Card: Buyer Organizations */}
            <Surface kind="elevated" className="p-6 sm:p-8 flex flex-col justify-between space-y-6">
              <div className="space-y-5">
                <div className="flex items-center justify-between pb-4 border-b border-ink/10">
                  <div className="flex items-center gap-2.5">
                    <div className="size-9 bg-ink text-volt flex items-center justify-center">
                      <Building2Icon size={18} />
                    </div>
                    <div>
                      <h3 className="font-display text-xl text-ink font-semibold">Commercial Buyer Accounts</h3>
                      <p className="text-xs text-ink-4">Purchasing businesses, hotels & restaurants</p>
                    </div>
                  </div>
                  <Link to="/onboarding/business">
                    <Button variant="secondary" size="sm" className="text-xs uppercase tracking-wider font-bold">
                      + Register
                    </Button>
                  </Link>
                </div>

                {user.memberships.length === 0 ? (
                  <div className="p-6 bg-paper/70 border border-ink/10 space-y-4">
                    <div className="space-y-1.5">
                      <div className="vyro-kicker text-copper">Unlinked Buyer Profile</div>
                      <h4 className="font-display text-base text-ink font-semibold">
                        No commercial purchasing entity connected.
                      </h4>
                      <p className="text-xs text-ink-3 leading-relaxed">
                        Connect your restaurant, hotel, supermarket, bakery, or catering kitchen to unlock wholesale trade:
                      </p>
                    </div>

                    <ul className="space-y-2 text-xs text-ink-2 pt-1">
                      <li className="flex items-start gap-2">
                        <CheckIcon size={14} className="text-volt-deep shrink-0 mt-0.5" />
                        <span>Direct mill-gate bulk rates with zero middleman or broker markup</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckIcon size={14} className="text-volt-deep shrink-0 mt-0.5" />
                        <span>Automated basket splitting into binding Purchase Orders (POs)</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckIcon size={14} className="text-volt-deep shrink-0 mt-0.5" />
                        <span>Real-time GPS delivery tracking with electronic dockside GRN signing</span>
                      </li>
                    </ul>

                    <div className="pt-2">
                      <Link to="/onboarding/business">
                        <Button className="w-full bg-volt text-ink hover:bg-volt-glow font-bold uppercase tracking-wider text-xs">
                          Register Commercial Business →
                        </Button>
                      </Link>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {user.memberships.map((m) => (
                      <div
                        key={m.businessId}
                        className="p-4 bg-paper border border-ink/15 flex items-center justify-between gap-4 group hover:border-ink transition-colors"
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-display font-semibold text-ink truncate text-base">
                              {m.businessName}
                            </span>
                            <Badge variant="brand">{m.role}</Badge>
                          </div>
                          <span className="text-[11px] font-mono text-ink-4 block">
                            ID: {m.businessId}
                          </span>
                        </div>
                        <Link to="/dashboard" className="shrink-0">
                          <Button size="sm" variant="secondary" className="text-xs">
                            Launch Command →
                          </Button>
                        </Link>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-ink/10 flex items-center justify-between text-xs text-ink-4">
                <span>Supports VAT/SVAT compliant invoicing</span>
                <Link to="/search" className="text-ink hover:underline font-medium">
                  Browse Catalog →
                </Link>
              </div>
            </Surface>

            {/* Right Card: Wholesale Supplier Accounts */}
            <Surface kind="elevated" className="p-6 sm:p-8 flex flex-col justify-between space-y-6">
              <div className="space-y-5">
                <div className="flex items-center justify-between pb-4 border-b border-ink/10">
                  <div className="flex items-center gap-2.5">
                    <div className="size-9 bg-ink text-copper flex items-center justify-center">
                      <StoreIcon size={18} />
                    </div>
                    <div>
                      <h3 className="font-display text-xl text-ink font-semibold">Authorized Supplier Hubs</h3>
                      <p className="text-xs text-ink-4">Producers, rice mills & distribution depots</p>
                    </div>
                  </div>
                  <Link to="/onboarding/supplier">
                    <Button variant="secondary" size="sm" className="text-xs uppercase tracking-wider font-bold">
                      + Connect
                    </Button>
                  </Link>
                </div>

                {user.supplierMemberships.length === 0 ? (
                  <div className="p-6 bg-paper/70 border border-ink/10 space-y-4">
                    <div className="space-y-1.5">
                      <div className="vyro-kicker text-copper">Unconnected Facility</div>
                      <h4 className="font-display text-base text-ink font-semibold">
                        No supplier or milling depot connected.
                      </h4>
                      <p className="text-xs text-ink-3 leading-relaxed">
                        List your agricultural mill, packaging plant, or authorized regional depot to receive wholesale orders:
                      </p>
                    </div>

                    <ul className="space-y-2 text-xs text-ink-2 pt-1">
                      <li className="flex items-start gap-2">
                        <CheckIcon size={14} className="text-copper shrink-0 mt-0.5" />
                        <span>Direct binding purchase orders from hospitality and retail networks</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckIcon size={14} className="text-copper shrink-0 mt-0.5" />
                        <span>Automated warehouse staging & driver dispatch manifests</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckIcon size={14} className="text-copper shrink-0 mt-0.5" />
                        <span>Zero hidden broker deductions and transparent settlement terms</span>
                      </li>
                    </ul>

                    <div className="pt-2">
                      <Link to="/onboarding/supplier">
                        <Button variant="secondary" className="w-full text-ink hover:bg-ink hover:text-paper font-bold uppercase tracking-wider text-xs">
                          Register Supplier Facility →
                        </Button>
                      </Link>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {user.supplierMemberships.map((m) => (
                      <div
                        key={m.supplierId}
                        className="p-4 bg-paper border border-ink/15 flex items-center justify-between gap-4 group hover:border-ink transition-colors"
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-display font-semibold text-ink truncate text-base">
                              {m.supplierName}
                            </span>
                            <Badge variant="success">{m.role}</Badge>
                          </div>
                          <span className="text-[11px] font-mono text-ink-4 block">
                            Facility ID: {m.supplierId}
                          </span>
                        </div>
                        <Link to="/supplier/orders" className="shrink-0">
                          <Button size="sm" variant="secondary" className="text-xs">
                            View POs →
                          </Button>
                        </Link>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-ink/10 flex items-center justify-between text-xs text-ink-4">
                <span>Dispatch coverage across 25 Districts</span>
                <Link to="/how-it-works" className="text-ink hover:underline font-medium">
                  How Fulfillment Works →
                </Link>
              </div>
            </Surface>
          </div>

          {/* Bottom Compliance & Network Footprint Card */}
          <div className="p-6 bg-paper border border-ink/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <span className="text-[10px] font-mono uppercase tracking-wider text-copper font-bold block">
                Platform Verification & Compliance
              </span>
              <p className="text-xs text-ink-3 max-w-2xl leading-relaxed">
                All buyer entities and supplier facilities operating on VYRO undergo tax compliance checks and physical facility audits before large-lot contract fulfillment.
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0 text-xs font-mono text-ink-3">
              <span className="px-2.5 py-1 bg-mist border border-line">SSL Encrypted</span>
              <span className="px-2.5 py-1 bg-mist border border-line">Audit Logged</span>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'profile' && (
        <div className="animate-fade-in">
          <ProfileForm />
        </div>
      )}

      {activeTab === 'notifications' && (
        <div className="animate-fade-in">
          <NotificationsForm />
        </div>
      )}

      {activeTab === 'security' && (
        <div className="animate-fade-in">
          <SecurityForm />
        </div>
      )}

      {activeTab === 'data' && <DataPrivacyTab />}
    </div>
  );
}
