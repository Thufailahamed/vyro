import { PayHereGateway, type PayHereConfig } from './payhere';
import { MockGateway, type MockConfig } from './mock';
import type { GatewayAdapter, GatewayProvider } from './types';

export * from './types';
export { PayHereGateway, type PayHereConfig } from './payhere';
export { MockGateway, type MockConfig } from './mock';
export { md5, hmacSha256Hex } from './hash';

export interface GatewayEnv {
  PAYHERE_MERCHANT_ID?: string;
  PAYHERE_MERCHANT_SECRET?: string;
  PAYHERE_SANDBOX?: string;
  PAYHERE_REFUND_API_URL?: string;
  PAYHERE_MOCK?: string;
  PAYHERE_MOCK_FORCE_FAILURE?: string;
}

export interface ResolvedGateway {
  adapter: GatewayAdapter;
  provider: GatewayProvider;
  isMock: boolean;
}

/**
 * Resolve gateway adapter from env. Defaults to MockGateway if merchant creds absent.
 * Set PAYHERE_MOCK="1" to force mock (useful for staging).
 */
export function resolveGateway(env: GatewayEnv | undefined): ResolvedGateway {
  const e = env ?? {};
  const forceMock = e.PAYHERE_MOCK === '1';
  const hasCreds = !!e.PAYHERE_MERCHANT_ID && !!e.PAYHERE_MERCHANT_SECRET;
  if (forceMock || !hasCreds) {
    return {
      adapter: new MockGateway({
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
