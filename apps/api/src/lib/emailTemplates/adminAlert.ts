export type AdminAlertSeverity = 'info' | 'warning' | 'critical';

export type AdminAlertEmail = {
  title: string;
  body: string;
  link?: string | null;
  severity: AdminAlertSeverity;
};

export function renderAdminAlertEmail(a: AdminAlertEmail): { subject: string; html: string } {
  const sevColor = a.severity === 'critical' ? '#dc2626'
    : a.severity === 'warning' ? '#d97706'
    : '#0f766e';
  const linkHtml = a.link
    ? `<p style="margin-top:16px"><a href="${a.link}" style="color:#0f766e">Open in Vyro →</a></p>`
    : '';
  const subject = `[${a.severity.toUpperCase()}] ${a.title}`;
  const html = `<!doctype html><html><body style="font-family:system-ui,sans-serif;color:#0f172a">
    <div style="border-left:4px solid ${sevColor};padding:8px 12px;margin-bottom:16px">
      <h2 style="margin:0 0 8px 0;font-size:16px">${escapeHtml(a.title)}</h2>
      <p style="margin:0;color:#475569">${escapeHtml(a.body)}</p>
    </div>
    ${linkHtml}
    <p style="color:#94a3b8;font-size:12px;margin-top:24px">
      Vyro admin alert · manage in Settings → Notifications
    </p>
  </body></html>`;
  return { subject, html };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
