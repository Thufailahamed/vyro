import { eq } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { platformSettings, auditLogs } from '@vyro/db/schema';
import { nowMs, newId } from '@vyro/shared';
import { defaultPlatformSettings, type PlatformSettingsShape } from './defaults';
import type { PlatformSetting } from '@vyro/db/schema';

function toShape(row: PlatformSetting): PlatformSettingsShape {
  return {
    id: 1,
    brandName: row.brandName,
    supportEmail: row.supportEmail,
    supportPhone: row.supportPhone,
    defaultCurrency: 'LKR',
    platformFeeBps: row.platformFeeBps,
    rfqValueThresholdCents: row.rfqValueThresholdCents,
    rfqQuantityThreshold: row.rfqQuantityThreshold,
    enableBusinessSignup: row.enableBusinessSignup === 1 ? 1 : 0,
    enableSupplierSignup: row.enableSupplierSignup === 1 ? 1 : 0,
    updatedAt: row.updatedAt,
    updatedByUserId: row.updatedByUserId,
  };
}

export async function getPlatformSettings(d1: D1Database): Promise<PlatformSettingsShape> {
  const db = getDb(d1);
  const row = await db.select().from(platformSettings).where(eq(platformSettings.id, 1)).get();
  if (row) return toShape(row);
  // Migration seeds row id=1, but be defensive if a fresh DB skipped the seed.
  const defaults = defaultPlatformSettings();
  await db.insert(platformSettings).values(defaults);
  return defaults;
}

export type PlatformSettingsPatch = {
  brandName?: string | undefined;
  supportEmail?: string | undefined;
  supportPhone?: string | undefined;
  platformFeeBps?: number | undefined;
  rfqValueThresholdCents?: number | undefined;
  rfqQuantityThreshold?: number | undefined;
  enableBusinessSignup?: boolean | undefined;
  enableSupplierSignup?: boolean | undefined;
};

export async function patchPlatformSettings(
  d1: D1Database,
  actorUserId: string,
  patch: PlatformSettingsPatch,
): Promise<PlatformSettingsShape> {
  const current = await getPlatformSettings(d1);
  const updatedAt = nowMs();
  const next: PlatformSetting = {
    id: 1,
    brandName: patch.brandName ?? current.brandName,
    supportEmail: patch.supportEmail ?? current.supportEmail,
    supportPhone: patch.supportPhone ?? current.supportPhone,
    defaultCurrency: 'LKR',
    platformFeeBps: patch.platformFeeBps ?? current.platformFeeBps,
    rfqValueThresholdCents: patch.rfqValueThresholdCents ?? current.rfqValueThresholdCents,
    rfqQuantityThreshold: patch.rfqQuantityThreshold ?? current.rfqQuantityThreshold,
    enableBusinessSignup:
      patch.enableBusinessSignup !== undefined
        ? patch.enableBusinessSignup
          ? 1
          : 0
        : current.enableBusinessSignup,
    enableSupplierSignup:
      patch.enableSupplierSignup !== undefined
        ? patch.enableSupplierSignup
          ? 1
          : 0
        : current.enableSupplierSignup,
    updatedAt,
    updatedByUserId: actorUserId,
  };
  const db = getDb(d1);
  await db
    .insert(platformSettings)
    .values(next)
    .onConflictDoUpdate({ target: platformSettings.id, set: next });
  await db.insert(auditLogs).values({
    id: newId(),
    actorUserId,
    action: 'platform_settings.update',
    resourceType: 'platform_settings',
    resourceId: '1',
    metadata: JSON.stringify(patch),
    ip: null,
    userAgent: null,
    createdAt: updatedAt,
  }).run();
  return toShape(next);
}
