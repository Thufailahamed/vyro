export const BusinessRole = {
  OWNER: 'owner',
  MANAGER: 'manager',
  PURCHASING: 'purchasing',
  ACCOUNTANT: 'accountant',
} as const;
export type BusinessRole = (typeof BusinessRole)[keyof typeof BusinessRole];

export const SupplierRole = {
  OWNER: 'owner',
  SALES: 'sales',
  OPERATIONS: 'operations',
} as const;
export type SupplierRole = (typeof SupplierRole)[keyof typeof SupplierRole];

export const BusinessMemberStatus = {
  ACTIVE: 'active',
  INVITED: 'invited',
  SUSPENDED: 'suspended',
} as const;
export type BusinessMemberStatus = (typeof BusinessMemberStatus)[keyof typeof BusinessMemberStatus];
