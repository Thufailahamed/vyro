/** Money is stored in cents (LKR) everywhere on the API, same as the web. */
export function formatLKR(cents: number | null | undefined): string {
  const v = (cents ?? 0) / 100;
  return 'Rs. ' + v.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatCompactLKR(cents: number | null | undefined): string {
  const v = (cents ?? 0) / 100;
  if (Math.abs(v) >= 1_000_000_000) return `Rs. ${(v / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(v) >= 1_000_000) return `Rs. ${(v / 1_000_000).toFixed(2)}M`;
  if (Math.abs(v) >= 1_000) return `Rs. ${(v / 1_000).toFixed(1)}K`;
  return formatLKR(cents);
}

/** Whole-rupee formatting without decimals, for tight tiles. */
export function formatRs(cents: number | null | undefined): string {
  return 'Rs. ' + Math.round((cents ?? 0) / 100).toLocaleString('en-LK');
}

export function formatNumber(n: number | null | undefined, digits = 0): string {
  return (n ?? 0).toLocaleString('en-LK', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function formatPercent(n: number | null | undefined, digits = 1): string {
  return `${(n ?? 0).toFixed(digits)}%`;
}

function toDate(input: number | string | Date | null | undefined): Date | null {
  if (input === null || input === undefined || input === '') return null;
  if (input instanceof Date) return input;
  if (typeof input === 'number') {
    // Some endpoints return seconds, most return ms.
    return new Date(input < 10_000_000_000 ? input * 1000 : input);
  }
  const d = new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDate(input: number | string | Date | null | undefined): string {
  const d = toDate(input);
  if (!d) return '—';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateTime(input: number | string | Date | null | undefined): string {
  const d = toDate(input);
  if (!d) return '—';
  return `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · ${d.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

export function timeAgo(input: number | string | Date | null | undefined): string {
  const d = toDate(input);
  if (!d) return '—';
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 0) {
    const f = -s;
    if (f < 3600) return `in ${Math.max(1, Math.round(f / 60))}m`;
    if (f < 86400) return `in ${Math.round(f / 3600)}h`;
    return `in ${Math.round(f / 86400)}d`;
  }
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.round(s / 86400)}d ago`;
  return formatDate(d);
}

export function greetingForNow(date = new Date()): string {
  const h = date.getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

/** `pending_payment` → `Pending payment` */
export function humanize(s: string | null | undefined): string {
  if (!s) return '—';
  const t = s.replace(/[_-]+/g, ' ').trim();
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

export function initials(name: string | null | undefined): string {
  if (!name) return 'V';
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || 'V';
}

export function shortId(id: string | null | undefined, len = 8): string {
  if (!id) return '—';
  return id.length > len ? id.slice(-len).toUpperCase() : id.toUpperCase();
}
