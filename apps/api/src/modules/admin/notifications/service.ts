import { getDb } from '@vyro/db';
import {
  listInbox as repoList,
  unreadCount as repoCount,
  markRead as repoRead,
  markAllRead as repoAllRead,
  type InboxFilters,
  type AdminNotificationRow,
} from './repository';
import { notifyAdmins, type AdminAlertInput } from '../../notifications/dispatcher';
import type { Env } from '../../../env';
import type { AdminAlertSeverity } from '@vyro/shared';
import type { AdminRole } from '@vyro/auth';

const ALL_SEVERITIES = ['info', 'warning', 'critical'] as const;

function parseCsv<T extends string>(raw: unknown, allowed: readonly T[]): T[] | undefined {
  if (!raw) return undefined;
  const parts = String(raw).split(',').map(s => s.trim()).filter(Boolean);
  return parts.filter((p): p is T => (allowed as readonly string[]).includes(p));
}

export type AdminContext = { role: AdminRole; userId: string };

function ctxFromEnv(env: Env): AdminContext | null {
  // Falls back to env for callers outside an HTTP request (cron, queue).
  // For HTTP, routes pass ctx explicitly.
  return null;
}

export async function listNotifications(
  env: Env,
  admin: AdminContext,
  raw: Record<string, unknown>,
): Promise<{ notifications: AdminNotificationRow[]; nextCursor: string | null; unreadCount: number }> {
  const f: InboxFilters = {};
  const sev = parseCsv(raw.severity, ALL_SEVERITIES);
  if (sev) f.severity = sev;
  if (typeof raw.category === 'string') f.category = raw.category;
  if (raw.unreadOnly === 'true' || raw.unreadOnly === true) f.unreadOnly = true;
  if (raw.sort === 'createdAt-asc' || raw.sort === 'createdAt-desc') f.sort = raw.sort;
  const cursor = typeof raw.cursor === 'string' ? raw.cursor : undefined;
  const limit = typeof raw.limit === 'number' ? raw.limit : 50;
  const db = getDb(env.DB);
  const [page, count] = await Promise.all([
    repoList(db, admin.role, admin.userId, f, cursor, limit),
    repoCount(db, admin.role, admin.userId),
  ]);
  return { notifications: page.rows, nextCursor: page.nextCursor, unreadCount: count };
}

export async function getUnreadCount(env: Env, admin: AdminContext): Promise<number> {
  return repoCount(getDb(env.DB), admin.role, admin.userId);
}

export async function dismissOne(env: Env, admin: AdminContext, id: string): Promise<boolean> {
  return repoRead(getDb(env.DB), id, admin.role, admin.userId);
}

export async function dismissAll(env: Env, admin: AdminContext): Promise<{ updated: number }> {
  const updated = await repoAllRead(getDb(env.DB), admin.role, admin.userId);
  return { updated };
}

export async function broadcast(env: Env, input: AdminAlertInput): Promise<{ recipients: number }> {
  return notifyAdmins(env, input);
}

export { ctxFromEnv };
