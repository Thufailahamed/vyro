export interface Env {
  DB: D1Database;
  PRODUCTS: R2Bucket;
  INVOICES: R2Bucket;
  CACHE: KVNamespace;
  ASSETS?: Fetcher;
  AUDIT_QUEUE: Queue;
  NOTIFICATIONS_QUEUE: Queue;
  INVOICES_QUEUE: Queue;
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
  /** Cloudflare Workers AI binding. Optional in unit tests. */
  AI?: Ai;
  /** Master switch. "false" returns 503 from /api/ai/*. */
  VYRO_AI_ENABLED?: string;
  /** Model used for slot extraction. */
  VYRO_AI_CLASSIFY_MODEL?: string;
  /** Model used for narrating handler results. */
  VYRO_AI_NARRATE_MODEL?: string;
  /** Per-business daily token cap (soft). */
  VYRO_AI_DAILY_TOKEN_CAP?: string;
  /** Force routing: 'auto' (default) | 'workers' | 'gemini'. */
  VYRO_AI_PROVIDER?: string;
  /** Gemini API key (secret). Absence disables the Gemini path. */
  GEMINI_API_KEY?: string;
  /** Cloudflare account id for Analytics Engine SQL API. */
  CF_ACCOUNT_ID?: string;
  /** Cloudflare API token with Analytics Engine: Read scope. */
  CF_API_TOKEN?: string;
  /** Days to retain queue_events rows. Defaults to 7. */
  QUEUE_EVENTS_RETENTION_DAYS?: string;
  /** Override Gemini REST base (e.g. Cloudflare AI Gateway endpoint). */
  VYRO_AI_GEMINI_BASE_URL?: string;
  /** Gemini model for complex reasoning. */
  VYRO_AI_GEMINI_MODEL?: string;
  /** Narration mode: 'deterministic' (default, no LLM) | 'llm'. */
  VYRO_AI_NARRATE_MODE?: string;
}
