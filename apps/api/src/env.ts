export interface Env {
  DB: D1Database;
  PRODUCTS: R2Bucket;
  INVOICES: R2Bucket;
  CACHE: KVNamespace;
  ALERTS_KV: KVNamespace;
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
  /** payments.lk REST secret key (sk_test_… / sk_live_…). */
  PAYMENTS_LK_SECRET_KEY?: string;
  /** payments.lk webhook signing secret. */
  PAYMENTS_LK_WEBHOOK_SECRET?: string;
  /** Override payments.lk API base (default https://api.payments.lk). */
  PAYMENTS_LK_API_URL?: string;
  /** Override the hosted-checkout return URL. */
  PAYMENTS_LK_RETURN_URL?: string;
  /** Override the hosted-checkout cancel URL. */
  PAYMENTS_LK_CANCEL_URL?: string;
  /** Override the webhook endpoint registered at payments.lk (default /api/webhooks/payments-lk). */
  PAYMENTS_LK_WEBHOOK_URL?: string;
  /** =1 forces the mock gateway (local/staging only). */
  PAYMENTS_LK_MOCK?: string;
  PAYMENTS_LK_MOCK_FORCE_FAILURE?: string;
  LEDGER_ENCRYPTION_KEY?: string;
  /** Resend transactional email API key. Optional. */
  RESEND_API_KEY?: string;
  /** Default `From:` address for outbound email. */
  EMAIL_FROM?: string;
  /** Slack incoming webhook URL for observability alerts. */
  ALERT_SLACK_WEBHOOK_URL?: string;
  /** Ops recipient address for alert emails. */
  OPS_EMAIL?: string;
  /** Public status page origin (CORS allow). */
  STATUS_PAGE_ORIGIN?: string;
  /** HMAC secret for UptimeRobot webhook callbacks. */
  UPTIMEROBOT_WEBHOOK_SECRET?: string;
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
  /** Cross-border trade master switch. "true" enables. Defaults off. */
  CROSS_BORDER_ENABLED?: string;
  /** KV namespace for FX rates + sanctions list cache. */
  CROSS_BORDER_KV: KVNamespace;
  /** R2 bucket for commercial invoice + COO PDFs. */
  CROSS_BORDER_DOCS: R2Bucket;
  /** Cross-border wire beneficiary shown to buyers paying by SWIFT. */
  VYRO_BANK_BENEFICIARY_NAME?: string;
  VYRO_BANK_BENEFICIARY_ADDRESS?: string;
  VYRO_BANK_NAME?: string;
  VYRO_BANK_ADDRESS?: string;
  VYRO_BANK_ACCOUNT_NUMBER?: string;
  VYRO_BANK_SWIFT_BIC?: string;
  VYRO_BANK_IBAN?: string;
  /** Intermediary (correspondent) bank for USD wires. Optional. */
  VYRO_BANK_INTERMEDIARY_NAME?: string;
  VYRO_BANK_INTERMEDIARY_SWIFT?: string;
  /** Reference prefix prepended to wire references for matching. */
  VYRO_BANK_REFERENCE_PREFIX?: string;
}
