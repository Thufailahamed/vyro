import { describe, it, expect, vi, beforeEach } from 'vitest';

const sendMock = vi.fn();
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));

import { sendEmail, sendEmailOrThrow } from '../../../src/lib/email/client';

const env = {
  RESEND_API_KEY: 'test_key',
  EMAIL_FROM: 'Vyro <no-reply@vyro.local>',
  ENVIRONMENT: 'production',
} as any;

beforeEach(() => {
  sendMock.mockReset();
});

describe('email client', () => {
  it('returns ok:false when RESEND_API_KEY missing', async () => {
    const r = await sendEmail({} as any, { to: 'a@b.com', subject: 's', text: 't' });
    expect(r).toEqual({ ok: false, provider: 'resend', error: 'no api key' });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('returns ok on SDK success', async () => {
    sendMock.mockResolvedValueOnce({ data: { id: 'msg_123' }, error: null, headers: null });
    const r = await sendEmail(env, { to: 'a@b.com', subject: 's', text: 't' });
    expect(r).toEqual({ ok: true, provider: 'resend', id: 'msg_123' });
  });

  it('returns error on SDK error response', async () => {
    sendMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'validation_error: invalid_payload', statusCode: 422, name: 'validation_error' },
      headers: null,
    });
    const r = await sendEmail(env, { to: 'a@b.com', subject: 's', text: 't' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('validation_error');
  });

  it('returns error on SDK thrown exception', async () => {
    sendMock.mockRejectedValueOnce(new Error('network down'));
    const r = await sendEmail(env, { to: 'a@b.com', subject: 's', text: 't' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('network down');
  });

  it('sendEmailOrThrow throws httpError 502 EMAIL_NOT_CONFIGURED on missing key', async () => {
    await expect(
      sendEmailOrThrow({} as any, { to: 'a@b.com', subject: 's', text: 't' }),
    ).rejects.toMatchObject({ status: 502, code: 'EMAIL_NOT_CONFIGURED' });
  });

  it('sendEmailOrThrow throws httpError 502 EMAIL_SEND_FAILED on send failure', async () => {
    sendMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'quota', statusCode: 429, name: 'rate_limit_exceeded' },
      headers: null,
    });
    await expect(
      sendEmailOrThrow(env, { to: 'a@b.com', subject: 's', text: 't' }),
    ).rejects.toMatchObject({ status: 502, code: 'EMAIL_SEND_FAILED' });
  });

  it('passes idempotency key as second arg options when provided', async () => {
    sendMock.mockResolvedValueOnce({ data: { id: 'msg_456' }, error: null, headers: null });
    await sendEmail(env, {
      to: 'a@b.com',
      subject: 's',
      text: 't',
      idempotencyKey: 'idem_xyz',
    });
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: ['a@b.com'], from: 'Vyro <no-reply@vyro.local>' }),
      { idempotencyKey: 'idem_xyz' },
    );
  });

  it('omits options arg when no idempotency key', async () => {
    sendMock.mockResolvedValueOnce({ data: { id: 'msg_789' }, error: null, headers: null });
    await sendEmail(env, { to: 'a@b.com', subject: 's', text: 't' });
    expect(sendMock).toHaveBeenCalledWith(expect.any(Object), undefined);
  });

  it('uses msg.from override when provided', async () => {
    sendMock.mockResolvedValueOnce({ data: { id: 'msg_000' }, error: null, headers: null });
    await sendEmail(env, {
      to: 'a@b.com',
      subject: 's',
      text: 't',
      from: 'Custom <c@vyro.lk>',
    });
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'Custom <c@vyro.lk>' }),
      undefined,
    );
  });

  it('maps attachments to SDK shape', async () => {
    sendMock.mockResolvedValueOnce({ data: { id: 'msg_att' }, error: null, headers: null });
    await sendEmail(env, {
      to: 'a@b.com',
      subject: 's',
      text: 't',
      attachments: [{ filename: 'inv.pdf', content: 'BASE64DATA' }],
    });
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: [{ filename: 'inv.pdf', content: 'BASE64DATA' }],
      }),
      undefined,
    );
  });
});
