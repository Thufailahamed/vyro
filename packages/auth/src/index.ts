import { betterAuth } from 'better-auth';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { twoFactor } from 'better-auth/plugins';
import { getDb } from '@vyro/db';
import type { AuthEnv } from './types';
import { authSchema } from './schema';

export function createAuth(env: AuthEnv) {
  const db = getDb(env.DB);
  return betterAuth({
    secret: env.BETTER_AUTH_SECRET || 'vyro-local-dev-secret-must-be-32-chars-long',
    baseURL: env.BETTER_AUTH_URL || 'http://localhost:8787',
    database: drizzleAdapter(db, { provider: 'sqlite', schema: authSchema }),
    emailAndPassword: {
      enabled: true,
      autoSignIn: true,
      sendResetPassword: async ({ user, url }) => {
        // In production, replace with a real email send (SES, Resend, etc.).
        // In dev, log the link so it can be hand-copied from wrangler tail.
        // eslint-disable-next-line no-console
        console.log(`[auth] password reset for ${user.email}: ${url}`);
      },
    },
    session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
    advanced: {
      useSecureCookies: env.ENVIRONMENT === 'production',
    },
    user: {
      additionalFields: {
        phone: { type: 'string', required: false },
        isPlatformAdmin: { type: 'boolean', defaultValue: false },
      },
    },
    plugins: [twoFactor({ issuer: 'VYRO' })],
  });
}

export type Auth = ReturnType<typeof createAuth>;
export * from './types';
export * from './context';
export * from './schema';

