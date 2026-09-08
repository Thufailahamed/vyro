import type { Env } from '../env';
import type { AuthEnv } from '@vyro/auth';
import { sendEmailOrThrow } from './email';

/**
 * Bridges the Worker `Env` (D1, R2, KV, queues, …) into the smaller `AuthEnv`
 * that better-auth's adapter sees. The only addition is the email sender, which
 * better-auth hooks (password reset, verification) call into.
 */
export function authEnv(env: Env): AuthEnv {
  return {
    DB: env.DB,
    BETTER_AUTH_SECRET: env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: env.BETTER_AUTH_URL,
    ENVIRONMENT: env.ENVIRONMENT,
    sendEmail: async (input) => {
      try {
        await sendEmailOrThrow(env, input);
        return { ok: true };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    },
  };
}
