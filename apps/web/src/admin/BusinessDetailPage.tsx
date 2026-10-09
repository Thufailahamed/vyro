import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@vyro/ui';
import { api } from '@/lib/api';
import { formatLKR } from '@/lib/format';
import { usePageTitle } from '@/lib/usePageTitle';
import { BusinessSuspendButton } from './BusinessSuspendButton';
import { CopyId, Monogram, SegmentBar, formatDate, relativeTime } from './registryUi';
import {
  AdminPage,
  AdminPageHeader,
  Callout,
  CardHeader,
  EmptyBlock,
  Pill,
  Skeleton,
  StatCard,
  StatGrid,
  StatusPill,
  TableCard,
  TableSkeleton,
  statusTone,
  type PillTone,
} from './ui';
import {
  AlertCircleIcon,
  ArrowRightIcon,
  BanknoteIcon,
  Building2Icon,
  CalendarIcon,
  FileTextIcon,
  MailIcon,
  MapPinIcon,
  PhoneIcon,
  ShieldCheckIcon,
  ShoppingCartIcon,
  UserIcon,
  UsersIcon,
} from '@/components/icons';

type Detail = {
  id: string;
  name: string;
  status: string;
  createdAt: number;
  profile?: {
    contactPerson: string;
    email: string;
    phone: string;
    address: string;
    city: string;
    district: string;
    countryCode: string;
    description: string | null;
    taxId: string | null;
    kycLevel: string;
    kycVerifiedAt: number | null;
  };
  members: Array<{ userId: string; role: string; email: string | null }>;
  orderCount: number;
  lifetimeSpendCents?: number;
  recentOrders: Array<{ id: string; status: string; totalCents: number; createdAt: number }>;
};

const KYC: Record<string, { label: string; tone: PillTone; note: string }> = {
  none: { label: 'Not verified', tone: 'warning', note: 'No KYC documents reviewed yet.' },
  basic: { label: 'Basic KYC', tone: 'info', note: 'Identity and registration checked.' },
  enhanced: { label: 'Enhanced KYC', tone: 'success', note: 'Full due diligence completed.' },
};

const ORDER_MIX: Array<{ key: PillTone; label: string; className: string }> = [
  { key: 'success', label: 'Completed', className: 'bg-mint' },
  { key: 'info', label: 'In transit', className: 'bg-copper' },
  { key: 'warning', label: 'In progress', className: 'bg-amber' },
  { key: 'danger', label: 'Cancelled / disputed', className: 'bg-rose' },
  { key: 'neutral', label: 'Other', className: 'bg-ink/25' },
];

function roleLabel(role: string) {
  return role.replace(/[_-]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

export function BusinessDetailPage() {
  const { id = '' } = useParams();
  const detail = useQuery({
    queryKey: ['admin-business', id],
    queryFn: () => api.get<{ business: Detail }>(`/admin/businesses/${id}`),
    retry: false,
  });

  const b = detail.data?.business;
  usePageTitle(b ? `${b.name} · Business` : 'Business');

  const backLink = { to: '/admin/businesses', label: 'Registered businesses' };

  if (detail.isError) {
    return (
      <AdminPage>
        <AdminPageHeader back={backLink} title="Business account not found" />
        <EmptyBlock
          icon={<AlertCircleIcon size={22} />}
          title="We couldn't find this account"
          description={
            <>
              No commercial purchasing account matches <span className="font-mono text-ink">{id}</span>.
            </>
          }
          action={
            <Link to="/admin/businesses" className="text-sm font-semibold text-ink underline underline-offset-4 hover:text-copper">
              Return to the registry
            </Link>
          }
        />
      </AdminPage>
    );
  }

  if (!b) {
    return (
      <AdminPage>
        <div className="flex items-center gap-4 border-b border-ink/[0.07] pb-6">
          <Skeleton className="size-16 rounded-[18px]" />
          <div className="flex-1 space-y-3">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-9 w-80" />
            <Skeleton className="h-4 w-full max-w-md" />
          </div>
        </div>
        <StatGrid cols={4}>
          {[0, 1, 2, 3].map((i) => (
            <StatCard key={i} label="" value="" loading />
          ))}
        </StatGrid>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <TableCard title="Recent purchase orders">
            <TableSkeleton rows={4} cols={4} />
          </TableCard>
          <Skeleton className="h-96 rounded-[18px]" />
        </div>
      </AdminPage>
    );
  }

  const isSuspended = b.status === 'suspended';
  const p = b.profile;
  const kyc = KYC[p?.kycLevel ?? 'none'] ?? KYC.none!;
  const spend = b.lifetimeSpendCents ?? 0;
  const avgOrder = b.orderCount > 0 ? Math.round(spend / b.orderCount) : 0;
  const lastOrder = b.recentOrders[0];
  const location = p ? [p.city, p.district !== p.city ? p.district : null].filter(Boolean).join(', ') : null;

  const mix = ORDER_MIX.map((m) => ({
    ...m,
    value: b.recentOrders.filter((o) => statusTone(o.status) === m.key).length,
  }));

  return (
    <AdminPage>
      <AdminPageHeader
        back={backLink}
        kicker={
          <>
            <span>Registry</span>
            <span className="text-ink-5">/</span>
            <span>Commercial buyer</span>
          </>
        }
        title={
          <span className="flex min-w-0 items-center gap-4">
            <Monogram name={b.name} seed={b.id} size="lg" className="hidden sm:inline-flex" />
            <span className="min-w-0 break-words">{b.name}</span>
          </span>
        }
        description={
          p?.description ||
          'Commercial wholesale buyer authorised to issue purchase orders and negotiate supplier pricing terms.'
        }
        meta={
          <>
            <StatusPill status={b.status} label={isSuspended ? 'Suspended' : 'Active'} />
            <Pill tone={kyc.tone} icon={<ShieldCheckIcon size={11} />}>
              {kyc.label}
            </Pill>
            {location && (
              <Pill icon={<MapPinIcon size={11} />}>
                <span className="capitalize">{location}</span>
              </Pill>
            )}
            <CopyId id={b.id} label="Entity" />
          </>
        }
        actions={<BusinessSuspendButton businessId={b.id} businessName={b.name} status={b.status} />}
      />

      {isSuspended && (
        <Callout tone="danger" title="Purchasing is paused">
          This account can’t place purchase orders or receive invoices until access is restored.
        </Callout>
      )}

      <StatGrid cols={4}>
        <StatCard
          label="Lifetime spend"
          value={formatLKR(spend)}
          icon={<BanknoteIcon size={16} />}
          sub="Across non-cancelled purchase orders"
        />
        <StatCard
          label="Purchase orders"
          value={b.orderCount}
          icon={<ShoppingCartIcon size={16} />}
          sub={lastOrder ? `Last order ${relativeTime(lastOrder.createdAt)}` : 'No orders yet'}
        />
        <StatCard
          label="Average order"
          value={b.orderCount > 0 ? formatLKR(avgOrder) : '—'}
          icon={<FileTextIcon size={16} />}
          sub="Spend per purchase order"
        />
        <StatCard
          label="Procurement team"
          value={b.members.length}
          icon={<UsersIcon size={16} />}
          sub={`${b.members.filter((m) => m.role === 'owner').length} owner${b.members.filter((m) => m.role === 'owner').length === 1 ? '' : 's'} on the account`}
        />
      </StatGrid>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <TableCard
            title="Recent purchase orders"
            description={
              b.recentOrders.length
                ? `Latest ${b.recentOrders.length} ${b.recentOrders.length === 1 ? 'order' : 'orders'} placed by this buyer`
                : undefined
            }
            toolbar={
              b.recentOrders.length > 0 ? (
                <div className="space-y-2.5">
                  <SegmentBar segments={mix.map((m) => ({ key: m.key, value: m.value, className: m.className, label: m.label }))} />
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {mix
                      .filter((m) => m.value > 0)
                      .map((m) => (
                        <span key={m.key} className="inline-flex items-center gap-1.5 text-xs text-ink-4">
                          <span className={cn('size-2 rounded-full', m.className)} aria-hidden />
                          {m.label}
                          <span className="font-semibold text-ink num-tabular">{m.value}</span>
                        </span>
                      ))}
                  </div>
                </div>
              ) : undefined
            }
            footer={
              b.recentOrders.length > 0 ? (
                <>
                  <span>Showing the most recent {b.recentOrders.length}</span>
                  <Link
                    to="/admin/orders"
                    className="inline-flex items-center gap-1.5 font-semibold text-ink transition-colors hover:text-copper"
                  >
                    View all orders
                    <ArrowRightIcon size={12} />
                  </Link>
                </>
              ) : undefined
            }
          >
            {b.recentOrders.length === 0 ? (
              <div className="border-t border-ink/[0.07]">
                <EmptyBlock
                  icon={<ShoppingCartIcon size={22} />}
                  title="No purchase orders yet"
                  description="Orders this buyer places will appear here."
                />
              </div>
            ) : (
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Purchase order</th>
                    <th>Status</th>
                    <th className="text-right">Gross total</th>
                    <th className="text-right">Placed</th>
                  </tr>
                </thead>
                <tbody>
                  {b.recentOrders.map((o) => (
                    <tr key={o.id} className="group">
                      <td>
                        <Link
                          to={`/admin/orders/${o.id}`}
                          className="inline-flex items-center gap-2 font-mono text-xs font-semibold text-ink transition-colors hover:text-copper"
                        >
                          {o.id.slice(0, 8)}…{o.id.slice(-4)}
                          <ArrowRightIcon size={11} className="-translate-x-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
                        </Link>
                      </td>
                      <td>
                        <StatusPill status={o.status} />
                      </td>
                      <td className="text-right font-mono text-xs font-semibold text-ink num-tabular">{formatLKR(o.totalCents)}</td>
                      <td className="text-right">
                        <div className="text-xs text-ink-3 num-tabular">{formatDate(o.createdAt)}</div>
                        <div className="text-[11px] text-ink-5">{relativeTime(o.createdAt)}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </TableCard>

          <TableCard
            title="Procurement personnel"
            description={`${b.members.length} ${b.members.length === 1 ? 'person' : 'people'} with access to this account`}
          >
            {b.members.length === 0 ? (
              <div className="border-t border-ink/[0.07]">
                <EmptyBlock
                  icon={<UserIcon size={22} />}
                  title="No members on file"
                  description="No authorised personnel are linked to this business account yet."
                />
              </div>
            ) : (
              <ul className="divide-y divide-ink/[0.06] border-t border-ink/[0.07]">
                {b.members.map((m) => (
                  <li key={m.userId} className="flex items-center gap-3 px-5 py-3.5 sm:px-6">
                    <Monogram name={m.email ?? '?'} seed={m.userId} size="sm" />
                    <div className="min-w-0 flex-1">
                      {m.email ? (
                        <a href={`mailto:${m.email}`} className="block truncate text-sm font-medium text-ink hover:text-copper">
                          {m.email}
                        </a>
                      ) : (
                        <span className="block text-sm text-ink-5">No email on file</span>
                      )}
                      <CopyId id={m.userId} label="User" />
                    </div>
                    <Pill tone={m.role === 'owner' ? 'brand' : 'neutral'}>{roleLabel(m.role)}</Pill>
                  </li>
                ))}
              </ul>
            )}
          </TableCard>
        </div>

        <aside className="space-y-6 lg:sticky lg:top-6">
          {p && (
            <section className="vyro-surface overflow-hidden">
              <div className="px-5 pt-5 pb-4">
                <CardHeader title="Primary contact" icon={<UserIcon size={16} />} />
              </div>
              <div className="border-t border-ink/[0.07] px-5 py-4">
                <div className="flex items-center gap-3">
                  <Monogram name={p.contactPerson} seed={p.email} size="md" />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-ink">{p.contactPerson}</div>
                    <div className="text-xs text-ink-4">Account contact</div>
                  </div>
                </div>
                <div className="mt-4 grid gap-1.5">
                  <ContactLink href={`mailto:${p.email}`} icon={<MailIcon size={14} />}>
                    {p.email}
                  </ContactLink>
                  <ContactLink href={`tel:${p.phone.replace(/\s+/g, '')}`} icon={<PhoneIcon size={14} />}>
                    <span className="num-tabular">{p.phone}</span>
                  </ContactLink>
                </div>
              </div>
              <div className="border-t border-ink/[0.07] px-5 py-4">
                <SideLabel>Registered address</SideLabel>
                <div className="mt-2 flex gap-2.5 text-sm leading-relaxed text-ink-2">
                  <MapPinIcon size={14} className="mt-1 shrink-0 text-ink-4" />
                  <address className="not-italic">
                    {p.address}
                    <br />
                    <span className="capitalize">{location}</span>
                    {p.countryCode && <span className="text-ink-4"> · {p.countryCode}</span>}
                  </address>
                </div>
              </div>
            </section>
          )}

          <section className="vyro-surface overflow-hidden">
            <div className="px-5 pt-5 pb-4">
              <CardHeader title="Compliance" icon={<ShieldCheckIcon size={16} />} />
            </div>
            <dl className="divide-y divide-ink/[0.06] border-t border-ink/[0.07]">
              <SideRow label="KYC level">
                <Pill tone={kyc.tone} dot>
                  {kyc.label}
                </Pill>
              </SideRow>
              {p?.kycVerifiedAt ? <SideRow label="Verified">{formatDate(p.kycVerifiedAt)}</SideRow> : null}
              <SideRow label="Tax ID">
                {p?.taxId ? <CopyId id={p.taxId} label="" className="text-xs text-ink" /> : <span className="text-ink-5">Not provided</span>}
              </SideRow>
              <SideRow label="Account status">
                <StatusPill status={b.status} label={isSuspended ? 'Suspended' : 'Active'} />
              </SideRow>
            </dl>
            <p className="border-t border-ink/[0.07] bg-bone/40 px-5 py-3 text-xs text-ink-4">{kyc.note}</p>
          </section>

          <section className="vyro-surface p-5">
            <SideLabel>Timeline</SideLabel>
            <ol className="mt-3 space-y-3">
              {lastOrder && (
                <TimelineItem icon={<ShoppingCartIcon size={12} />} title="Last purchase order" when={lastOrder.createdAt} />
              )}
              {p?.kycVerifiedAt ? (
                <TimelineItem icon={<ShieldCheckIcon size={12} />} title="KYC verified" when={p.kycVerifiedAt} />
              ) : null}
              <TimelineItem icon={<Building2Icon size={12} />} title="Account registered" when={b.createdAt} />
            </ol>
          </section>
        </aside>
      </div>
    </AdminPage>
  );
}

function SideLabel({ children }: { children: ReactNode }) {
  return <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-5">{children}</div>;
}

function SideRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-3">
      <dt className="text-xs text-ink-4">{label}</dt>
      <dd className="min-w-0 text-right text-sm text-ink">{children}</dd>
    </div>
  );
}

function ContactLink({ href, icon, children }: { href: string; icon: ReactNode; children: ReactNode }) {
  return (
    <a
      href={href}
      className="group flex min-w-0 items-center gap-2.5 rounded-lg px-2 py-1.5 -mx-2 text-[13px] text-ink-2 transition-colors hover:bg-bone/60 hover:text-ink"
    >
      <span className="shrink-0 text-ink-4 group-hover:text-ink">{icon}</span>
      <span className="truncate">{children}</span>
    </a>
  );
}

function TimelineItem({ icon, title, when }: { icon: ReactNode; title: string; when: number }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-bone text-ink-3 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.08)]">
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-[13px] font-medium text-ink">{title}</div>
        <div className="flex items-center gap-1.5 text-xs text-ink-4">
          <CalendarIcon size={11} />
          {formatDate(when)} · {relativeTime(when)}
        </div>
      </div>
    </li>
  );
}
