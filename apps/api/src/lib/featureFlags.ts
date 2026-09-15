import * as cfgSvc from '../modules/admin/platform/configSectionsService';

/**
 * Feature flag helper. Reads from the `feature_flags` config section in D1.
 * Returns false unless the section explicitly enables the named flag.
 */
export async function isFeatureEnabled(d1: D1Database, flag: string): Promise<boolean> {
  const section = await cfgSvc.read(d1, 'feature_flags');
  const value = (section.value ?? {}) as Record<string, unknown>;
  return value[flag] === true;
}