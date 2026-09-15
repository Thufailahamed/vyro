import type { BuyLeadsSubscription, BuyLeadsDigestPayload } from '@vyro/validation';
import { isFeatureEnabled } from '../../lib/featureFlags';
import { buyLeadsRepository } from './repository';
import { buyLeadsMatcher } from './matcher';

const FLAG = 'BUYLEADS_ENABLED';
const DIGEST_LIMIT = 10;
const WINDOW_MS = 24 * 60 * 60 * 1000;

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;',
  );
}

function buildDigestPayload(
  recipientUserId: string,
  recipientEmail: string,
  matches: Array<{ rfqId: string; rfqNumber: string; title: string }>,
): BuyLeadsDigestPayload {
  const count = matches.length;
  const subject = `${count} new RFQ${count === 1 ? '' : 's'} matching your categories`;
  const list = matches
    .map(
      (m) =>
        `<li><a href="/supplier/rfqs/${m.rfqId}">${m.rfqNumber} — ${escapeHtml(m.title)}</a></li>`,
    )
    .join('');
  const body = `<p>Hi,</p><p>${count} new RFQ${count === 1 ? '' : 's'} matched your subscribed categories:</p><ul>${list}</ul><p>— Vyro BuyLeads</p>`;
  return {
    kind: 'buyleads_digest',
    recipientUserId,
    recipientEmail,
    subject,
    body,
    link: '/supplier/buyleads',
  };
}

export const buyLeads = {
  async getMySubscription(d1: D1Database, supplierId: string): Promise<BuyLeadsSubscription> {
    const row = await buyLeadsRepository.getSubscription(d1, supplierId);
    if (!row) return { enabled: false, categoryIds: [] };
    return { enabled: row.enabled, categoryIds: row.categoryIds };
  },

  async updateMySubscription(
    d1: D1Database,
    supplierId: string,
    body: BuyLeadsSubscription,
  ): Promise<BuyLeadsSubscription> {
    await buyLeadsRepository.upsertSubscription(d1, supplierId, body.enabled, body.categoryIds);
    return body;
  },

  async runDailyDigest(
    env: { DB: D1Database; NOTIFICATIONS_QUEUE: { send: (m: unknown) => Promise<unknown> } },
    d1: D1Database,
  ): Promise<{ suppliersEmailed: number; rfqsSent: number }> {
    if (!(await isFeatureEnabled(d1, FLAG))) {
      return { suppliersEmailed: 0, rfqsSent: 0 };
    }
    const since = Date.now() - WINDOW_MS;
    const subs = await buyLeadsRepository.enabledSubscriptions(d1);
    let suppliersEmailed = 0;
    let rfqsSent = 0;
    for (const sub of subs) {
      let matches;
      try {
        matches = await buyLeadsMatcher.topMatchesForSupplier(d1, sub.supplierId, since, DIGEST_LIMIT);
      } catch {
        continue;
      }
      if (matches.length === 0) continue;
      const payload = buildDigestPayload(sub.recipientUserId, sub.recipientEmail, matches);
      try {
        await env.NOTIFICATIONS_QUEUE.send(payload);
        suppliersEmailed++;
        rfqsSent += matches.length;
      } catch {
        // Skip supplier; metric emits upstream.
      }
    }
    return { suppliersEmailed, rfqsSent };
  },
};
