import type { Env } from '../../env';
import { recomputeAllSuppliers } from './service';

export async function trustSignalsRebuild(env: Env): Promise<{ rebuilt: number; failed: number }> {
  return recomputeAllSuppliers(env.DB, Date.now());
}
