import { PayHereGateway, type PayHereConfig } from './payhere';
import { MockGateway, type MockConfig } from './mock';
import type { GatewayAdapter, GatewayProvider } from './types';

export * from './types';
export { PayHereGateway, type PayHereConfig, formatPayHereAmount, hashCheckoutRequest, verifyPayHereMd5sig, type PayHereNotifyParams } from './payhere';
export { MockGateway, type MockConfig } from './mock';
export { md5, hmacSha256Hex } from './hash';

export interface GatewayEnv {
  PAYHERE_MERCHANT_ID?: string;
  PAYHERE_MERCHANT_SECRET?: string;
  PAYHERE_SANDBOX?: string;
  PAYHERE_REFUND_API_URL?: string;
  PAYHERE_MOCK?: string;
  PAYHERE_MOCK_FORCE_FAILURE?: string;
  /**
   * Environment name. When 'production' and the resolved gateway is mock,
   * `resolveGateway` throws — preventing silent mock usage in prod.
   */
  ENVIRONMENT?: string;
}

export interface ResolvedGateway {
  adapter: GatewayAdapter;
  provider: GatewayProvider;
  isMock: boolean;
}

export class GatewayConfigError extends Error {
  readonly status = 500 as const;
  constructor(message: string) {
    super(message);
    this.name = 'GatewayConfigError';
  }
}

/**
 * Resolve gateway adapter from env. Throws GatewayConfigError when running
 * in production and the mock gateway would be selected — preventing silent
 * money-loss when merchant creds are missing on a prod deploy.
 *
 * Local + staging may explicitly opt into mock via `PAYHERE_MOCK=1`.
 */
export function resolveGateway(env: GatewayEnv | undefined): ResolvedGateway {
  const e = env ?? {};
  const forceMock = e.PAYHERE_MOCK === '1';
  const hasCreds = !!e.PAYHERE_MERCHANT_ID && !!e.PAYHERE_MERCHANT_SECRET;
  const wouldUseMock = forceMock || !hasCreds;

  if (wouldUseMock && e.ENVIRONMENT === 'production') {
    throw new GatewayConfigError(
      'PAYHERE_MERCHANT_ID / PAYHERE_MERCHANT_SECRET missing in production. ' +
        'Refusing to fall back to mock gateway to prevent silent money loss.',
    );
  }

  if (wouldUseMock) {
    return {
      adapter: new MockGateway({
        secret: e.PAYHERE_MERCHANT_SECRET,
        forceFailure: e.PAYHERE_MOCK_FORCE_FAILURE === '1',
      }),
      provider: 'mock',
      isMock: true,
    };
  }
  const cfg: PayHereConfig = {
    merchantId: e.PAYHERE_MERCHANT_ID!,
    merchantSecret: e.PAYHERE_MERCHANT_SECRET!,
    sandbox: e.PAYHERE_SANDBOX === '1',
    refundApiUrl: e.PAYHERE_REFUND_API_URL,
  };
  return {
    adapter: new PayHereGateway(cfg),
    provider: 'payhere',
    isMock: false,
  };
}
