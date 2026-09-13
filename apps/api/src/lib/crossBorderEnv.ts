import { httpError } from './errors';
import type { Env } from '../env';

export function isCrossBorderEnabled(env: Env): boolean {
  return env.CROSS_BORDER_ENABLED === 'true';
}

export function assertCrossBorderEnabled(env: Env): void {
  if (!isCrossBorderEnabled(env)) {
    throw httpError(503, 'CROSS_BORDER_DISABLED', 'Cross-border trading is not enabled');
  }
}