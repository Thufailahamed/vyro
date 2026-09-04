import { eq } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { userSettings } from '@vyro/db/schema';
import { nowMs } from '@vyro/shared';
import { defaultUserSettings, type UserSettingsShape } from './defaults';

function toShape(row: typeof userSettings.$inferSelect): UserSettingsShape {
  return {
    userId: row.userId,
    displayName: row.displayName,
    avatarUrl: row.avatarUrl,
    phone: row.phone,
    preferredCurrency: 'LKR',
    notifyOrderUpdates: row.notifyOrderUpdates === 1 ? 1 : 0,
    notifyMessages: row.notifyMessages === 1 ? 1 : 0,
    notifyMarketing: row.notifyMarketing === 1 ? 1 : 0,
    twoFactorEnabled: row.twoFactorEnabled === 1 ? 1 : 0,
    sessionTimeoutMin: row.sessionTimeoutMin,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function getOrCreateUserSettings(
  d1: D1Database,
  userId: string,
): Promise<UserSettingsShape> {
  const db = getDb(d1);
  const existing = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .get();
  if (existing) return toShape(existing);
  const defaults = defaultUserSettings(userId);
  await db.insert(userSettings).values(defaults);
  return defaults;
}

export type UserSettingsPatch = Partial<{
  displayName: string | null;
  avatarUrl: string | null;
  phone: string | null;
  preferredCurrency: 'LKR';
  notifyOrderUpdates: boolean;
  notifyMessages: boolean;
  notifyMarketing: boolean;
  twoFactorEnabled: boolean;
  sessionTimeoutMin: number;
}>;

export async function patchUserSettings(
  d1: D1Database,
  userId: string,
  patch: UserSettingsPatch,
): Promise<UserSettingsShape> {
  const current = await getOrCreateUserSettings(d1, userId);
  const next: UserSettingsShape = {
    ...current,
    ...(patch.displayName !== undefined ? { displayName: patch.displayName } : {}),
    ...(patch.avatarUrl !== undefined ? { avatarUrl: patch.avatarUrl } : {}),
    ...(patch.phone !== undefined ? { phone: patch.phone } : {}),
    ...(patch.preferredCurrency !== undefined ? { preferredCurrency: patch.preferredCurrency } : {}),
    ...(patch.notifyOrderUpdates !== undefined
      ? { notifyOrderUpdates: patch.notifyOrderUpdates ? 1 : 0 }
      : {}),
    ...(patch.notifyMessages !== undefined ? { notifyMessages: patch.notifyMessages ? 1 : 0 } : {}),
    ...(patch.notifyMarketing !== undefined
      ? { notifyMarketing: patch.notifyMarketing ? 1 : 0 }
      : {}),
    ...(patch.twoFactorEnabled !== undefined
      ? { twoFactorEnabled: patch.twoFactorEnabled ? 1 : 0 }
      : {}),
    ...(patch.sessionTimeoutMin !== undefined ? { sessionTimeoutMin: patch.sessionTimeoutMin } : {}),
    updatedAt: nowMs(),
  };
  const db = getDb(d1);
  await db.insert(userSettings).values(next).onConflictDoUpdate({
    target: userSettings.userId,
    set: next,
  });
  return next;
}
