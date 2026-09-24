import { PaymentsLkGateway, type PaymentsLkConfig } from './paymentslk';
import { MockGateway, type MockConfig } from './mock';
import type { GatewayAdapter, GatewayProvider } from './types';

export * from './types';
export {
  PaymentsLkGateway,
  type PaymentsLkConfig,
  buildPaymentsSignatureHeader,
  verifyPaymentsSignature,
  paymentsLkEventToType,
  paymentsLkStatusCode,
  type FetchLike,
} from './paymentslk';
export { MockGateway, type MockConfig } from './mock';
export { md5, hmacSha256Hex, hmacSha256Sync, sha256Hex, timingSafeEqualHex } from './hash';

export interface GatewayEnv {
  PAYMENTS_LK_SECRET_KEY?: string;
  PAYMENTS_LK_WEBHOOK_SECRET?: string;
  PAYMENTS_LK_API_URL?: string;
  PAYMENTS_LK_RETURN_URL?: string;
  PAYMENTS_LK_CANCEL_URL?: string;
  PAYMENTS_LK_WEBHOOK_URL?: string;
  /** =1 forces the mock gateway (local/staging only). */
  PAYMENTS_LK_MOCK?: string;
  PAYMENTS_LK_MOCK_FORCE_FAILURE?: string;
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
 * Resolve gateway adapter from env. Throws GatewayConfigError when running in
 * production and the mock gateway would be selected — preventing silent
 * money-loss when gateway secrets are missing on a prod deploy.
 *
 * Local + staging may explicitly opt into mock via `PAYMENTS_LK_MOCK=1`.
 */
export function resolveGateway(env: GatewayEnv | undefined): ResolvedGateway {
  const e = env ?? {};
  const forceMock = e.PAYMENTS_LK_MOCK === '1';
  const hasCreds = !!e.PAYMENTS_LK_SECRET_KEY && !!e.PAYMENTS_LK_WEBHOOK_SECRET;
  const wouldUseMock = forceMock || !hasCreds;

  if (wouldUseMock && e.ENVIRONMENT === 'production') {
    throw new GatewayConfigError(
      'PAYMENTS_LK_SECRET_KEY / PAYMENTS_LK_WEBHOOK_SECRET missing in production. ' +
        'Refusing to fall back to mock gateway to prevent silent money loss.',
    );
  }

  if (wouldUseMock) {
    return {
      adapter: new MockGateway({
        secret: e.PAYMENTS_LK_WEBHOOK_SECRET,
        forceFailure: e.PAYMENTS_LK_MOCK_FORCE_FAILURE === '1',
      }),
      provider: 'mock',
      isMock: true,
    };
  }

  const cfg: PaymentsLkConfig = {
    secretKey: e.PAYMENTS_LK_SECRET_KEY!,
    webhookSecret: e.PAYMENTS_LK_WEBHOOK_SECRET!,
    apiBaseUrl: e.PAYMENTS_LK_API_URL,
  };
  return {
    adapter: new PaymentsLkGateway(cfg),
    provider: 'payments_lk',
    isMock: false,
  };
}
