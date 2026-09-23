import { ORDER_LIFECYCLE_DEFAULTS, type OrderLifecycleConfig } from '@vyro/shared';
import * as cfgSvc from '../admin/platform/configSectionsService';
import * as cfgRepo from '../admin/platform/configSectionsRepository';

export const ORDER_LIFECYCLE_SECTION = 'order_lifecycle';

export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;

/**
 * Lifecycle windows + toggles. Stored in the `order_lifecycle` config section;
 * anything missing (or the whole section) falls back to shared defaults, so a
 * fresh deploy behaves sensibly without seeding.
 */
export async function getLifecycleConfig(d1: D1Database): Promise<OrderLifecycleConfig> {
  let stored: Record<string, unknown> = {};
  try {
    const section = await cfgSvc.read(d1, ORDER_LIFECYCLE_SECTION);
    stored = (section.value ?? {}) as Record<string, unknown>;
  } catch {
    stored = {};
  }
  const out: OrderLifecycleConfig = { ...ORDER_LIFECYCLE_DEFAULTS };
  for (const key of Object.keys(ORDER_LIFECYCLE_DEFAULTS) as Array<keyof typeof ORDER_LIFECYCLE_DEFAULTS>) {
    const v = stored[key];
    if (typeof v === typeof ORDER_LIFECYCLE_DEFAULTS[key]) (out as Record<string, unknown>)[key] = v;
  }
  if (typeof stored.automationSince === 'number') out.automationSince = stored.automationSince;
  return out;
}

/**
 * Stamp `automationSince` the first time automation runs so the auto-cancel
 * sweep never mass-cancels a backlog of orders placed before the feature
 * existed. Returns the effective timestamp.
 */
export async function ensureAutomationSince(d1: D1Database, now: number): Promise<number> {
  const current = await cfgSvc.read(d1, ORDER_LIFECYCLE_SECTION);
  const value = (current.value ?? {}) as Record<string, unknown>;
  if (typeof value.automationSince === 'number') return value.automationSince;
  const next = { ...value, automationSince: now };
  const res = await cfgRepo.upsertSection(d1, ORDER_LIFECYCLE_SECTION, JSON.stringify(next), current.version, 'system');
  if ('conflict' in res) {
    const again = await getLifecycleConfig(d1);
    return again.automationSince ?? now;
  }
  return now;
}
