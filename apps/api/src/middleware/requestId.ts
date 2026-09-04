import type { MiddlewareHandler } from 'hono';
import { newId } from '@vyro/shared';

export const requestId = (): MiddlewareHandler => async (c, next) => {
  const id = c.req.header('x-request-id') ?? newId();
  c.set('requestId', id);
  c.header('x-request-id', id);
  await next();
};
