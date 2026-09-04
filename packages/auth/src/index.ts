import { betterAuth } from 'better-auth';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { getDb } from '@vyro/db';
import type { AuthEnv } from './types';

export function createAuth(env: AuthEnv) {
  const db = getDb(env.DB);
  return betterAuth({
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    database: drizzleAdapter(db, { provider: 'sqlite' }),
    emailAndPassword: { enabled: true, autoSignIn: true },
    session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
    user: {
      additionalFields: {
        phone: { type: 'string', required: false },
        isPlatformAdmin: { type: 'boolean', defaultValue: false },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
export * from './types';
export * from './context';
