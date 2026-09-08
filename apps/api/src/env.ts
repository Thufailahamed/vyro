export interface Env {
  DB: D1Database;
  PRODUCTS: R2Bucket;
  CACHE: KVNamespace;
  ASSETS?: Fetcher;
  AUDIT_QUEUE: Queue;
  NOTIFICATIONS_QUEUE: Queue;
  METRICS?: AnalyticsEngineDataset;
  ENVIRONMENT: string;
  WEB_ORIGIN: string;
  ADMIN_ORIGIN: string;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  VERSION?: string;
  DEPLOYED_AT?: string;
  PAYHERE_MERCHANT_ID?: string;
  PAYHERE_MERCHANT_SECRET?: string;
  PAYHERE_SANDBOX?: string;
  PAYHERE_NOTIFY_URL?: string;
  PAYHERE_REFUND_API_URL?: string;
  PAYHERE_MOCK?: string;
  PAYHERE_MOCK_FORCE_FAILURE?: string;
  LEDGER_ENCRYPTION_KEY?: string;
  /** Resend transactional email API key. Optional. */
  RESEND_API_KEY?: string;
  /** Default `From:` address for outbound email. */
  EMAIL_FROM?: string;
}
