import type { MiddlewareHandler } from 'hono';
import { errorEnvelope } from '../lib/errors';

export const errorHandler = (): MiddlewareHandler => async (c, next) => {
  try {
    await next();
  } catch (err) {
    const env = errorEnvelope(err);
    return c.json(env.body, env.status as 400 | 401 | 403 | 404 | 409 | 429 | 500);
  }
};
