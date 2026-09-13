import { z } from 'zod';

export const supplierSlugSchema = z
  .string()
  .min(1)
  .max(60)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase kebab-case');

export const updateSupplierSlugSchema = z
  .object({ slug: supplierSlugSchema })
  .strict();
