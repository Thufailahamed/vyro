import { describe, it, expect } from 'vitest';
import {
  renderPasswordReset,
  renderAdminInvite,
  renderSupplierVerification,
  renderEmailVerification,
  renderAdminAlert,
} from '../../../src/lib/email/templates';

describe('email templates', () => {
  it('renderPasswordReset escapes URL and includes ttl', () => {
    const m = renderPasswordReset({ to: 'a@b.com', url: 'https://x?a=1&b=2', ttlMinutes: 30 });
    expect(m.to).toBe('a@b.com');
    expect(m.subject).toMatch(/Reset your Vyro password/);
    expect(m.text).toContain('30 minutes');
    expect(m.html).toContain('https://x?a=1&amp;b=2');
  });

  it('renderAdminInvite escapes role and inviter', () => {
    const m = renderAdminInvite({
      to: 'a@b.com',
      acceptUrl: 'https://vyro.lk/invite?token=abc',
      role: '<super>&admin',
      expiresAtIso: '2026-10-01T00:00:00Z',
      invitedBy: 'Jane "Doe"',
    });
    expect(m.html).toContain('&lt;super&gt;&amp;admin');
    expect(m.html).toContain('Jane &quot;Doe&quot;');
  });

  it('renderSupplierVerification verified branch', () => {
    const m = renderSupplierVerification({ to: 'a@b.com', status: 'verified', link: '/s/v' });
    expect(m.subject).toMatch(/verified/);
    expect(m.html).toContain('/s/v');
  });

  it('renderSupplierVerification rejected branch includes reason', () => {
    const m = renderSupplierVerification({
      to: 'a@b.com',
      status: 'rejected',
      reason: 'Blurry docs',
      link: '/s/v',
    });
    expect(m.subject).toMatch(/rejected/);
    expect(m.html).toContain('Blurry docs');
  });

  it('renderEmailVerification non-blocking copy', () => {
    const m = renderEmailVerification({ to: 'a@b.com', url: 'https://x/v?t=1', ttlMinutes: 60 });
    expect(m.subject).toMatch(/verify/i);
    expect(m.text).toContain('60 minutes');
    expect(m.html).toContain('https://x/v?t=1');
  });

  it('renderAdminAlert severity maps to subject prefix', () => {
    const m = renderAdminAlert({
      to: 'ops@vyro.lk',
      title: 'CPU spike',
      body: 'p99 > 2s',
      link: '/admin',
      severity: 'critical',
    });
    expect(m.subject).toContain('critical');
    expect(m.html).toContain('CPU spike');
  });
});
