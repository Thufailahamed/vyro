/** Shapes + seed data for /admin/feature-flags, /admin/email-templates, /admin/webhooks. */

export interface ConfigSection {
  section: string;
  value: Record<string, unknown>;
  version: number;
}

export interface WebhookRow {
  id: string;
  name: string;
  url: string;
  eventTypesJson: string;
  secret: string;
  active: 0 | 1;
  createdBy: string;
  createdAt: number;
}

export interface WebhookDeliveryRow {
  id: string;
  webhookId: string;
  eventType: string;
  payloadJson: string;
  status: 'pending' | 'success' | 'failed';
  responseStatus: number | null;
  responseBody: string | null;
  attemptCount: number;
  nextRetryAt: number | null;
  createdAt: number;
}

export interface FeatureFlagItem {
  key: string;
  enabled: boolean;
  rollout: number;
  notes: string;
}

export interface EmailTemplateItem {
  key: string;
  subject: string;
  body: string;
  locale: string;
}

export const DEFAULT_FEATURE_FLAGS: Record<string, { enabled: boolean; rollout: number; notes: string }> = {
  maintenance_mode: {
    enabled: false,
    rollout: 0,
    notes: 'Emergency platform-wide read-only maintenance window for database upgrades.',
  },
  promotions_v2: {
    enabled: true,
    rollout: 100,
    notes: 'Dynamic multi-tier discount and automatic basket voucher calculation engine.',
  },
  express_checkout: {
    enabled: true,
    rollout: 100,
    notes: 'One-tap checkout with saved shipping addresses and default payment methods.',
  },
  ai_recommendations: {
    enabled: true,
    rollout: 50,
    notes: 'Vector similarity ML product suggestions on Product Detail Pages and cart drawers.',
  },
  strict_kyc_enforcement: {
    enabled: false,
    rollout: 0,
    notes: 'Blocks high-value order creation for accounts without verified identity.',
  },
  instant_supplier_payouts: {
    enabled: true,
    rollout: 100,
    notes: 'Direct automated settlement via payment rail upon order delivery confirmation.',
  },
};

export const DEFAULT_EMAIL_TEMPLATES: Record<string, { subject: string; body: string; locale: string }> = {
  order_confirmation: {
    subject: 'Your VYRO Order #{{orderId}} is Confirmed',
    body: 'Hi {{customerName}},\n\nThank you for choosing VYRO. Your order #{{orderId}} containing {{itemCount}} item(s) has been confirmed and forwarded to the supplier for preparation.\n\nTotal: LKR {{totalAmount}}\nDelivery Address: {{deliveryAddress}}\n\nTrack your order: {{trackingUrl}}\n\nWarm regards,\nVYRO Team',
    locale: 'en',
  },
  order_shipped: {
    subject: 'Your VYRO Order #{{orderId}} is On Its Way!',
    body: 'Hi {{customerName}},\n\nGreat news! Your package is now in transit with our delivery partner.\n\nCarrier: {{carrierName}}\nTracking Code: {{trackingCode}}\nEstimated Delivery: {{estimatedDelivery}}\n\nTrack live: {{trackingUrl}}\n\nWarm regards,\nVYRO Team',
    locale: 'en',
  },
  kyc_approved: {
    subject: 'Your VYRO Merchant Verification is Approved',
    body: 'Hi {{merchantName}},\n\nCongratulations! Your business identity documents have been reviewed and approved by our compliance department. You can now publish catalog items and receive payouts.\n\nMerchant Dashboard: {{dashboardUrl}}\n\nBest,\nVYRO Trust & Safety',
    locale: 'en',
  },
  kyc_rejected: {
    subject: 'Action Required: Your VYRO KYC Submission',
    body: 'Hi {{merchantName}},\n\nOur compliance team reviewed your submission but could not complete verification. Reason: {{rejectionReason}}.\n\nPlease upload revised documents at: {{resubmitUrl}}\n\nBest,\nVYRO Trust & Safety',
    locale: 'en',
  },
  admin_invitation: {
    subject: 'Invitation to VYRO Admin Control',
    body: 'Hello,\n\nYou have been invited to join the VYRO administrative control plane with the {{role}} tier.\n\nAccept your invitation and configure your credentials:\n{{inviteUrl}}\n\nNote: This security link expires in 7 days.',
    locale: 'en',
  },
};

export const WEBHOOK_EVENT_CATALOG = [
  'order.created',
  'order.status_updated',
  'order.delivered',
  'order.cancelled',
  'payment.completed',
  'payment.failed',
  'user.suspended',
  'kyc.approved',
  'abuse_report.created',
];

export const TEMPLATE_LOCALES = [
  { value: 'en', label: 'English (en)' },
  { value: 'si', label: 'Sinhala (si)' },
  { value: 'ta', label: 'Tamil (ta)' },
];

/** Same normalisation as the web: booleans and objects both become flag items. */
export function parseFlags(raw: Record<string, unknown> | undefined): FeatureFlagItem[] {
  return Object.entries(raw ?? {}).map(([key, val]) => {
    if (typeof val === 'boolean') return { key, enabled: val, rollout: 100, notes: '' };
    if (typeof val === 'object' && val !== null) {
      const o = val as { enabled?: boolean; rollout?: number; notes?: string };
      return { key, enabled: Boolean(o.enabled), rollout: typeof o.rollout === 'number' ? o.rollout : 100, notes: o.notes ?? '' };
    }
    return { key, enabled: Boolean(val), rollout: 100, notes: '' };
  });
}

export function serializeFlags(items: FeatureFlagItem[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  items.forEach((i) => {
    out[i.key] = { enabled: i.enabled, rollout: i.rollout ?? 100, notes: i.notes ?? '' };
  });
  return out;
}

export function parseTemplates(raw: Record<string, unknown> | undefined): EmailTemplateItem[] {
  return Object.entries(raw ?? {}).map(([key, val]) => {
    const o = (typeof val === 'object' && val !== null ? val : {}) as { subject?: string; body?: string; locale?: string };
    return { key, subject: o.subject ?? '', body: o.body ?? '', locale: o.locale ?? 'en' };
  });
}

export function serializeTemplates(items: EmailTemplateItem[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  items.forEach((t) => {
    out[t.key] = { subject: t.subject, body: t.body, locale: t.locale };
  });
  return out;
}

/** `Delivery Delayed!` → `delivery_delayed_` — the web's key normaliser. */
export function normalizeKey(input: string): string {
  return input.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
}

export function parseEvents(json: string): string[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

export function prettyJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

/** Sample values the web preview substitutes into template placeholders. */
export function previewBody(body: string): string {
  return body
    .replace(/\{\{customerName\}\}/g, 'Thufail Ahamed')
    .replace(/\{\{orderId\}\}/g, 'VY-8921')
    .replace(/\{\{itemCount\}\}/g, '3')
    .replace(/\{\{totalAmount\}\}/g, '14,500.00')
    .replace(/\{\{trackingUrl\}\}/g, 'https://vyro.lk/orders/track/VY-8921')
    .replace(/\{\{carrierName\}\}/g, 'VYRO Express Logistics')
    .replace(/\{\{trackingCode\}\}/g, 'LK-902198')
    .replace(/\{\{estimatedDelivery\}\}/g, 'Tomorrow by 5:00 PM');
}

export function generateSecret(): string {
  const chars = 'abcdef0123456789';
  let s = 'whsec_';
  for (let i = 0; i < 32; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}
