export interface AuthEnv {
  DB: D1Database;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  ENVIRONMENT?: string;
  /**
   * Optional email sender for better-auth hooks (password reset, verification).
   * If absent, we log to stdout so devs can still hand-copy the link from
   * `wrangler tail` during local work.
   */
  sendEmail?: (input: {
    to: string;
    subject: string;
    text: string;
    html?: string;
  }) => Promise<{ ok: boolean; error?: string }>;
}

export interface MembershipSummary {
  id: string;
  role: string;
  name?: string;
  businessId?: string;
  businessName?: string;
  supplierId?: string;
  supplierName?: string;
}

export interface SessionContext {
  userId: string;
  email: string;
  /** @deprecated use adminRole for permission checks; kept for backward-compat boolean checks. */
  isAdmin: boolean;
  adminRole: 'super_admin' | 'ops' | 'finance' | 'support' | null;
  businesses: MembershipSummary[];
  suppliers: MembershipSummary[];
}
