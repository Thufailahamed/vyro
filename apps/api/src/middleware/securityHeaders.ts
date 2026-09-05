import type { MiddlewareHandler } from 'hono';
import type { Env } from '../env';
import { generateNonce } from '../lib/nonce';

export const securityHeaders = (): MiddlewareHandler => async (c, next) => {
  const env = c.env as Env;
  const nonce = generateNonce();
  c.set('cspNonce', nonce);
  const isProd = env.ENVIRONMENT === 'production';
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' https://challenges.cloudflare.com`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https://*.r2.cloudflarestorage.com https://*.r2.dev",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    'report-uri /api/csp-report',
  ].join('; ');
  c.header('Content-Security-Policy', csp);
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  if (isProd) {
    c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
  await next();
};