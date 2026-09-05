import type { Env } from '../env';
import { logger } from './logger';

export type Tags = Record<string, string>;

export function metric(env: Env | undefined, name: string, value = 1, tags?: Tags): void {
  if (!env?.METRICS) return;
  try {
    env.METRICS.writeDataPoint({
      blobs: [name, ...(tags ? Object.values(tags) : [])],
      doubles: [value],
      indexes: [name],
    });
  } catch (err) {
    logger.warn('metrics.write_failed', { name, err: String(err) });
  }
}
