import { z } from 'zod';

export const sellerKycSubmitBody = z
  .object({
    supplierId: z.string().min(1),
    registrationNo: z.string().max(100).optional(),
    taxId: z.string().max(100).optional(),
    bankName: z.string().max(120).optional(),
    bankAccountNo: z.string().max(60).optional(),
    bankBranch: z.string().max(120).optional(),
    bankAccountHolder: z.string().max(160).optional(),
    documentsJson: z.string().max(8000).optional(),
  })
  .strict();

export type SellerKycSubmitInput = z.infer<typeof sellerKycSubmitBody>;
