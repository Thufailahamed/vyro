import { newId } from '@vyro/shared';

function dayStamp(now = Date.now()): string {
  const d = new Date(now);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

function suffix(): string {
  // UUIDv7 prefixes are time-ordered (same-ms calls share a prefix), so the
  // suffix MUST come from the random tail — never the head.
  return newId().replace(/-/g, '').slice(-6).toUpperCase();
}

/** VYRO-PAY-20260910-00124 style human reference (spec §10). */
export function paymentNumber(now = Date.now()): string {
  return `VYRO-PAY-${dayStamp(now)}-${suffix()}`;
}

export function refundNumber(now = Date.now()): string {
  return `VYRO-RFD-${dayStamp(now)}-${suffix()}`;
}

export function settlementNumber(now = Date.now()): string {
  return `SET-${dayStamp(now)}-${suffix()}`;
}

export function payoutNumber(now = Date.now()): string {
  return `PO-${dayStamp(now)}-${suffix()}`;
}

export function adjustmentNumber(now = Date.now()): string {
  return `ADJ-${dayStamp(now)}-${suffix()}`;
}

export function bankTransferReference(now = Date.now()): string {
  return `VYRO-PAY-${dayStamp(now)}-${suffix()}`;
}
