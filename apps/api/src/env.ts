export interface Env {
  DB: D1Database;
  PRODUCTS: R2Bucket;
  CACHE: KVNamespace;
  AUDIT_QUEUE: Queue;
  NOTIFICATIONS_QUEUE: Queue;
  ENVIRONMENT: string;
  WEB_ORIGIN: string;
  ADMIN_ORIGIN: string;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
}
