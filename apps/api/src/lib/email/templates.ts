import type { EmailMessage } from './types';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface PasswordResetEmail {
  to: string;
  url: string;
  ttlMinutes: number;
}

export function renderPasswordReset(e: PasswordResetEmail): EmailMessage {
  return {
    to: e.to,
    subject: 'Reset your Vyro password',
    text:
      `Someone (hopefully you) asked to reset your Vyro password.\n\n` +
      `Open this link within ${e.ttlMinutes} minutes to choose a new one:\n${e.url}\n\n` +
      `If you didn't request this, ignore this email — your password has not been changed.\n`,
    html:
      `<p>Someone (hopefully you) asked to reset your Vyro password.</p>` +
      `<p>Open this link within <strong>${e.ttlMinutes} minutes</strong> to choose a new one:</p>` +
      `<p><a href="${escapeHtml(e.url)}">${escapeHtml(e.url)}</a></p>` +
      `<p style="color:#666;font-size:12px">If you didn't request this, ignore this email — your password has not been changed.</p>`,
  };
}

export interface AdminInviteEmail {
  to: string;
  acceptUrl: string;
  role: string;
  expiresAtIso: string;
  invitedBy: string;
}

export function renderAdminInvite(e: AdminInviteEmail): EmailMessage {
  return {
    to: e.to,
    subject: `You're invited to join Vyro as ${e.role}`,
    text:
      `${e.invitedBy} invited you to join Vyro as a ${e.role}.\n\n` +
      `Accept your invite (link expires ${e.expiresAtIso}):\n${e.acceptUrl}\n\n` +
      `If you weren't expecting this, you can ignore this email.\n`,
    html:
      `<p><strong>${escapeHtml(e.invitedBy)}</strong> invited you to join Vyro as a <strong>${escapeHtml(e.role)}</strong>.</p>` +
      `<p>Accept your invite (link expires ${escapeHtml(e.expiresAtIso)}):</p>` +
      `<p><a href="${escapeHtml(e.acceptUrl)}">${escapeHtml(e.acceptUrl)}</a></p>` +
      `<p style="color:#666;font-size:12px">If you weren't expecting this, you can ignore this email.</p>`,
  };
}

export interface VerificationEmail {
  to: string;
  status: 'verified' | 'rejected';
  reason?: string | null;
  link: string;
}

export function renderSupplierVerification(e: VerificationEmail): EmailMessage {
  const subject =
    e.status === 'verified' ? 'You are verified on Vyro' : 'Your verification was rejected';
  const intro =
    e.status === 'verified'
      ? 'Good news — your supplier account is now verified on Vyro. Buyers can find you and you can publish offers.'
      : 'Unfortunately we were not able to verify your supplier account.';
  const tail = e.status === 'verified'
    ? ''
    : `\nReason: ${e.reason ?? '(no reason supplied)'}\n\nUpdate your verification details: ${e.link}\n`;
  return {
    to: e.to,
    subject,
    text: `${intro}\n\nView your supplier account: ${e.link}\n${tail}`,
    html:
      `<p>${escapeHtml(intro)}</p>` +
      `<p><a href="${escapeHtml(e.link)}">${escapeHtml(e.link)}</a></p>` +
      (e.status === 'rejected'
        ? `<p><strong>Reason:</strong> ${escapeHtml(e.reason ?? '(no reason supplied)')}</p>`
        : ''),
  };
}

export interface EmailVerificationEmail {
  to: string;
  url: string;
  ttlMinutes: number;
}

export function renderEmailVerification(e: EmailVerificationEmail): EmailMessage {
  return {
    to: e.to,
    subject: 'Verify your Vyro email',
    text:
      `Welcome to Vyro! Confirm your email address to unlock all features.\n\n` +
      `Open this link within ${e.ttlMinutes} minutes:\n${e.url}\n\n` +
      `You can keep using Vyro without verifying — some features will be limited until you do.\n`,
    html:
      `<p>Welcome to Vyro! Confirm your email address to unlock all features.</p>` +
      `<p>Open this link within <strong>${e.ttlMinutes} minutes</strong>:</p>` +
      `<p><a href="${escapeHtml(e.url)}">${escapeHtml(e.url)}</a></p>` +
      `<p style="color:#666;font-size:12px">You can keep using Vyro without verifying — some features will be limited until you do.</p>`,
  };
}

export interface AdminAlertEmail {
  to: string;
  title: string;
  body: string;
  link: string | null;
  severity: 'info' | 'warning' | 'critical';
}

export function renderAdminAlert(e: AdminAlertEmail): EmailMessage {
  const subject = `[vyro][${e.severity}] ${e.title}`;
  const text = `${e.title}\n\n${e.body}${e.link ? `\n\n${e.link}` : ''}`;
  const html =
    `<h2 style="color:${e.severity === 'critical' ? '#c00' : '#444'}">${escapeHtml(subject)}</h2>` +
    `<p>${escapeHtml(e.body)}</p>` +
    (e.link ? `<p><a href="${escapeHtml(e.link)}">${escapeHtml(e.link)}</a></p>` : '');
  return { to: e.to, subject, text, html };
}
