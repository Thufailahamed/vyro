import { z } from 'zod';

export const SilenceBodySchema = z.object({
  ruleName: z.string().min(1).max(120),
  durationMinutes: z.number().int().positive().max(43200),
  reason: z.string().min(1).max(500),
});

export const IncidentCreateSchema = z.object({
  title: z.string().min(1).max(200),
  severity: z.enum(['info', 'warning', 'critical']),
  components: z
    .array(
      z.enum(['api', 'payments', 'queues', 'cron', 'web']),
    )
    .min(1),
  message: z.string().min(1).max(2000),
});

export const IncidentUpdateSchema = z.object({
  message: z.string().min(1).max(2000),
});

export const MetricsWebBodySchema = z.object({
  lcp_ms: z.number().nonnegative().optional(),
  inp_ms: z.number().nonnegative().optional(),
  cls: z.number().nonnegative().optional(),
  route: z.string().max(200),
});

export const UptimeWebhookSchema = z.object({
  monitor: z.object({ id: z.number(), name: z.string() }),
  status: z.enum(['up', 'down']),
  timestamp: z.number(),
});