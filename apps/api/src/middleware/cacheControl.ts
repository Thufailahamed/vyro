import type { MiddlewareHandler } from 'hono';

export type CacheControlOpts = {
  maxAge: number;
  public?: boolean;
  immutable?: boolean;
};

export const cacheControl = (opts: CacheControlOpts): MiddlewareHandler => async (c, next) => {
  await next();
  const parts: string[] = [opts.public ? 'public' : 'private', `max-age=${opts.maxAge}`];
  if (opts.immutable) parts.push('immutable');
  c.header('Cache-Control', parts.join(', '));
};
