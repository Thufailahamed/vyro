export interface AuthEnv {
  DB: D1Database;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
}

export interface MembershipSummary {
  id: string;
  role: string;
}

export interface SessionContext {
  userId: string;
  email: string;
  isAdmin: boolean;
  businesses: MembershipSummary[];
  suppliers: MembershipSummary[];
}
