import type { Env } from '../../env';

/** Where buyers send bank transfers. VYRO holds the funds; suppliers are paid via settlements. */
export interface CollectionAccount {
  accountName: string;
  bankName: string;
  branch: string | null;
  accountNumber: string;
  /** True when no real account is configured and a non-production placeholder is shown. */
  sandbox: boolean;
}

type CollectionEnv = Pick<
  Env,
  | 'ENVIRONMENT'
  | 'VYRO_LKR_ACCOUNT_NAME'
  | 'VYRO_LKR_BANK_NAME'
  | 'VYRO_LKR_BRANCH'
  | 'VYRO_LKR_ACCOUNT_NUMBER'
  | 'VYRO_BANK_BENEFICIARY_NAME'
  | 'VYRO_BANK_NAME'
  | 'VYRO_BANK_ACCOUNT_NUMBER'
>;

export function vyroCollectionAccount(env: CollectionEnv): CollectionAccount | null {
  const accountName = env.VYRO_LKR_ACCOUNT_NAME ?? env.VYRO_BANK_BENEFICIARY_NAME;
  const bankName = env.VYRO_LKR_BANK_NAME ?? env.VYRO_BANK_NAME;
  const accountNumber = env.VYRO_LKR_ACCOUNT_NUMBER ?? env.VYRO_BANK_ACCOUNT_NUMBER;
  if (accountName && bankName && accountNumber) {
    return { accountName, bankName, branch: env.VYRO_LKR_BRANCH ?? null, accountNumber, sandbox: false };
  }
  if (env.ENVIRONMENT === 'production') return null;
  return {
    accountName: 'VYRO Escrow (Sandbox)',
    bankName: 'Sandbox Bank',
    branch: 'Colombo 03',
    accountNumber: '0000 0000 0000',
    sandbox: true,
  };
}
