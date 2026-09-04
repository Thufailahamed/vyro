import { z } from 'zod';

export const signUpSchema = z
  .object({
    email: z.string().email().max(255),
    password: z.string().min(8).max(128),
    name: z.string().min(1).max(120),
    phone: z.string().min(7).max(20).optional(),
  })
  .strict();

export const signInSchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(1),
  })
  .strict();

export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
