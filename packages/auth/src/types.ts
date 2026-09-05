export interface AuthEnv {
  DB: D1Database;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  ENVIRONMENT?: string;
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
  isAdmin: boolean;
  businesses: MembershipSummary[];
  suppliers: MembershipSummary[];
}
