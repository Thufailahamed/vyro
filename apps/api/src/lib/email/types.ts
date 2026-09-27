export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  from?: string;
  replyTo?: string;
  attachments?: Array<{ filename: string; content: string }>; // base64
  idempotencyKey?: string;
}

export interface SendResult {
  ok: true;
  provider: 'resend';
  id: string;
}

export type SendOutcome =
  | SendResult
  | { ok: false; provider: 'resend'; error: string };

export type ResendEventType =
  | 'email.delivered'
  | 'email.bounced'
  | 'email.complained'
  | 'email.delivery_delayed';

export interface ResendEvent {
  type: ResendEventType;
  recipient: string;
  messageId: string; // Resend message id
  occurredAt: string; // ISO timestamp
  reason?: string;
}
