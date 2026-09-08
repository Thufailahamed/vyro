import { betterAuth } from 'better-auth';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { twoFactor } from 'better-auth/plugins';
import { getDb } from '@vyro/db';
import type { AuthEnv } from './types';
import { authSchema } from './schema';

export function createAuth(env: AuthEnv) {
  const db = getDb(env.DB);
  // In production we require a real secret — the dev fallback exists for
  // local `wrangler dev` only and must never be reachable in prod.
  const isProd = env.ENVIRONMENT === 'production';
  if (isProd && (!env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.length < 32)) {
    throw new Error('BETTER_AUTH_SECRET is required and must be >=32 chars in production');
  }
  const secret = env.BETTER_AUTH_SECRET || 'vyro-local-dev-secret-must-be-32-chars-long';
  return betterAuth({
    secret,
    baseURL: env.BETTER_AUTH_URL || 'http://localhost:8787',
    database: drizzleAdapter(db, { provider: 'sqlite', schema: authSchema }),
    emailAndPassword: {
      enabled: true,
      autoSignIn: true,
      sendResetPassword: async ({ user, url }) => {
        const subject = 'Reset your Vyro password';
        const text =
          `Someone (hopefully you) asked to reset your Vyro password.\n\n` +
          `Open this link within 60 minutes to choose a new one:\n${url}\n\n` +
          `If you didn't request this, ignore this email — your password has not been changed.\n`;
        if (env.sendEmail) {
          try {
            const r = await env.sendEmail({ to: user.email, subject, text });
            if (!r.ok) {
              // eslint-disable-next-line no-console
              console.error('[auth] sendResetPassword failed', { to: user.email, error: r.error });
            }
            return;
          } catch (err) {
            // eslint-disable-next-line no-console
            console.error('[auth] sendResetPassword threw', err);
          }
        }
        // Fallback for local dev with no provider configured.
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
export * from './permissions';
export * from './rolePermissions';
export * from './scope';

