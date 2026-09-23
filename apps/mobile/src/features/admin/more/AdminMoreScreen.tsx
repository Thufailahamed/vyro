import {
  ArrowLeftRight,
  Banknote,
  Bell,
  BookOpen,
  Building2,
  FileSearch,
  FileText,
  Flag,
  Gauge,
  Landmark,
  Megaphone,
  Package,
  Radar,
  Scale,
  Search,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
  Star,
  Store,
  Truck,
  Users,
  type LucideIcon,
} from 'lucide-react-native';
import { ListRow, ListSection, MenuGrid, MenuTile, Screen } from '@/ui';
import { hasPermission, useAdminRole } from '@/features/admin/common/permissions';
import { AdminHeaderActions } from '@/features/admin/ops/kit';
import { Appear, go } from '@/features/admin/platform/kit';
import { PortalSwitcher } from '@/features/common/PortalSwitcher';

interface HubItem {
  label: string;
  hint: string;
  href: string;
  icon: LucideIcon;
  perm?: string | string[];
}

interface HubSection {
  kicker: string;
  title: string;
  tone: 'ink' | 'volt' | 'copper' | 'paper';
  items: HubItem[];
}

const PINNED: HubItem[] = [
  { label: 'Orders', hint: 'Cross-tenant registry', href: '/admin/orders', icon: Package },
  { label: 'Global search', hint: 'Everything at once', href: '/admin/search', icon: Search },
  { label: 'Money desk', hint: 'Refunds · payouts · ledger', href: '/admin/money', icon: Banknote, perm: ['payment:read', 'payout:read', 'ledger:read'] },
  { label: 'Trust & safety', hint: 'KYC · documents · abuse', href: '/admin/trust-safety', icon: ShieldCheck, perm: ['kyc:read', 'abuse_report:read'] },
];

const SECTIONS: HubSection[] = [
  {
    kicker: 'Fulfilment',
    title: 'Operations',
    tone: 'ink',
    items: [
      { label: 'Orders', hint: 'Cross-tenant registry', href: '/admin/orders', icon: Package },
      { label: 'Deliveries', hint: 'Dispatch & tracking', href: '/admin/deliveries', icon: Truck },
      { label: 'Disputes', hint: 'GRN variances', href: '/admin/disputes', icon: Scale, perm: 'dispute:read' },
      { label: 'RFQs', hint: 'Quote oversight', href: '/admin/rfqs', icon: FileText },
      { label: 'Reviews', hint: 'Flag moderation', href: '/admin/reviews', icon: Star },
      { label: 'Global search', hint: 'Everything at once', href: '/admin/search', icon: Search },
    ],
  },
  {
    kicker: 'Treasury',
    title: 'Money',
    tone: 'volt',
    items: [
      { label: 'Money desk', hint: 'Refunds · payouts · ledger', href: '/admin/money', icon: Banknote, perm: ['payment:read', 'payout:read', 'ledger:read'] },
      { label: 'Payments', hint: 'Cross-tenant search', href: '/admin/payments', icon: ArrowLeftRight, perm: 'payment:read' },
      { label: 'Finance ops', hint: 'Recon & settlements', href: '/admin/finance', icon: Landmark, perm: ['payment:read', 'payout:read', 'financial_report:read'] },
      { label: 'Accounts', hint: 'Statements & chains', href: '/admin/accounts', icon: FileSearch, perm: ['financial_report:read', 'payment:read'] },
    ],
  },
  {
    kicker: 'Registry',
    title: 'Catalog & directory',
    tone: 'copper',
    items: [
      { label: 'Catalog', hint: 'Products & categories', href: '/admin/catalog', icon: ShoppingBag, perm: 'product:read' },
      { label: 'Users', hint: 'Accounts & suspension', href: '/admin/users', icon: Users, perm: 'user:read' },
      { label: 'Trust & safety', hint: 'KYC · documents · abuse', href: '/admin/trust-safety', icon: ShieldCheck, perm: ['kyc:read', 'abuse_report:read'] },
    ],
  },
  {
    kicker: 'Governance',
    title: 'Platform',
    tone: 'ink',
    items: [
      { label: 'Platform config', hint: 'Flags · templates · webhooks', href: '/admin/platform', icon: SlidersHorizontal, perm: ['settings:read', 'feature_flag:read'] },
      { label: 'Security', hint: 'Sessions · 2FA · exports', href: '/admin/security', icon: ShieldCheck, perm: ['audit:read', 'admin:read'] },
      { label: 'Roles & invites', hint: 'Operator access', href: '/admin/roles', icon: Users, perm: 'admin:read' },
      { label: 'Activity', hint: 'Audit trail', href: '/admin/activity', icon: Gauge, perm: 'audit:read' },
      { label: 'Observability', hint: 'Health · cron · queues', href: '/admin/observability', icon: Radar, perm: 'observability:read' },
      { label: 'AI usage', hint: 'Calls · tokens · cost', href: '/admin/ai-usage', icon: Flag, perm: 'observability:read' },
      { label: 'Notifications', hint: 'Broadcasts & inbox', href: '/admin/notifications', icon: Bell, perm: 'notification:read' },
    ],
  },
  {
    kicker: 'Growth',
    title: 'Learn & earn',
    tone: 'paper',
    items: [
      { label: 'Training centre', hint: 'Lessons & quizzes', href: '/admin/learning', icon: BookOpen },
      { label: 'Sponsored', hint: 'Plans · slots · campaigns', href: '/admin/sponsored', icon: Megaphone },
      { label: 'Suppliers', hint: 'Merchant registry', href: '/admin/directory', icon: Store, perm: 'supplier:read' },
      { label: 'Businesses', hint: 'Buyer registry', href: '/admin/directory', icon: Building2, perm: 'business:read' },
    ],
  },
];

/** Admin hub — links every admin screen, hiding what the role can't do. */
export function AdminMoreScreen() {
  const role = useAdminRole();
  const can = (perm?: string | string[]) => {
    if (!perm) return true;
    const list = Array.isArray(perm) ? perm : [perm];
    return list.some((p) => !role || hasPermission(role, p));
  };

  return (
    <Screen
      tabBar
      kicker="Index"
      title="More"
      subtitle="Every operator tool, in one place."
      right={
        <>
          <AdminHeaderActions />
          <PortalSwitcher current="admin" />
        </>
      }
    >
      <Appear>
        <MenuGrid>
          {PINNED.filter((i) => can(i.perm)).map((item, i) => (
            <MenuTile key={item.label} icon={item.icon} label={item.label} hint={item.hint} tone={i === 0 ? 'ink' : 'paper'} onPress={() => go(item.href)} />
          ))}
        </MenuGrid>
      </Appear>
      {SECTIONS.map((s, si) => {
        const items = s.items.filter((i) => can(i.perm));
        if (!items.length) return null;
        return (
          <Appear key={s.title} i={si + 1}>
            <ListSection label={`${s.title} · ${s.kicker}`} style={{ marginTop: 6 }}>
              {items.map((item, i) => (
                <ListRow
                  key={item.label + item.href}
                  title={item.label}
                  subtitle={item.hint}
                  icon={item.icon}
                  iconTone={s.tone}
                  last={i === items.length - 1}
                  onPress={() => go(item.href)}
                />
              ))}
            </ListSection>
          </Appear>
        );
      })}
    </Screen>
  );
}
