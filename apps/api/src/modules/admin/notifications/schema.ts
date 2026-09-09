import { z } from 'zod';
import { ADMIN_ALERT_SEVERITY } from '@vyro/shared';
import { ADMIN_ROLES } from '@vyro/auth';

export const adminNotificationQuery = z.object({
  severity: z.string().optional(),
  category: z.string().optional(),
  unreadOnly: z.enum(['true', 'false']).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  sort: z.enum(['createdAt-desc', 'createdAt-asc']).optional(),
});

export const adminNotificationBroadcast = z.object({
  role: z.enum(ADMIN_ROLES),
  severity: z.enum(ADMIN_ALERT_SEVERITY),
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(2000),
  link: z.string().url().optional(),
  sourceRef: z.string().max(200).optional(),
});
