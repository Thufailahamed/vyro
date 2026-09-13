import { z } from 'zod';

export const STATUS_COMPONENTS = [
  'api',
  'payments',
  'queues',
  'cron',
  'web',
] as const;

export const ComponentStatusSchema = z.enum([
  'operational',
  'degraded',
  'down',
  'unknown',
]);

export const StatusEntrySchema = z.object({
  status: ComponentStatusSchema,
  updatedAt: z.number(),
  detail: z.string().optional(),
});

export const IncidentUpdateSchema = z.object({
  at: z.number(),
  message: z.string().min(1),
});

export const IncidentSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  severity: z.enum(['info', 'warning', 'critical']),
  startedAt: z.number(),
  resolvedAt: z.number().optional(),
  components: z.array(z.enum(STATUS_COMPONENTS)),
  updates: z.array(IncidentUpdateSchema),
});

export const StatusPayloadSchema = z.object({
  components: z.object({
    api: StatusEntrySchema,
    payments: StatusEntrySchema,
    queues: StatusEntrySchema,
    cron: StatusEntrySchema,
    web: StatusEntrySchema,
  }),
  incidents: z.array(IncidentSchema),
  updatedAt: z.number(),
  version: z.string(),
});

export type ComponentName = (typeof STATUS_COMPONENTS)[number];
export type ComponentStatus = z.infer<typeof ComponentStatusSchema>;
export type StatusEntry = z.infer<typeof StatusEntrySchema>;
export type Incident = z.infer<typeof IncidentSchema>;
export type StatusPayload = z.infer<typeof StatusPayloadSchema>;