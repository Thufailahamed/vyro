export { sendEmail, sendEmailOrThrow } from './client';
export { checkRecipient, MAX_PER_HOUR } from './rateLimit';
export {
  renderPasswordReset,
  renderAdminInvite,
  renderSupplierVerification,
  renderEmailVerification,
  renderAdminAlert,
} from './templates';
export { verifyResendSignature, parseEvent } from './webhook';
export type {
  EmailMessage,
  SendOutcome,
  SendResult,
  ResendEvent,
  ResendEventType,
} from './types';
export type {
  PasswordResetEmail,
  AdminInviteEmail,
  VerificationEmail,
  EmailVerificationEmail,
  AdminAlertEmail,
  AdminAlertSeverity,
} from './templates';
