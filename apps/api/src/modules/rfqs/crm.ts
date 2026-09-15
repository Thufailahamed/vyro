import { crmRepository } from './crmRepository';
import type { LeadsListQuery, Tag, ConversionStatus } from '@vyro/validation';

const NOTE_MAX = 1000;

export const crm = {
  async crmList(
    d1: D1Database,
    supplierId: string,
    filter: LeadsListQuery,
  ) {
    return crmRepository.listLeadsForSupplier(d1, supplierId, filter);
  },

  async crmGet(d1: D1Database, supplierId: string, leadId: string) {
    return crmRepository.getLeadForSupplier(d1, supplierId, leadId);
  },

  async crmSetTag(
    d1: D1Database,
    supplierId: string,
    leadId: string,
    tag: Tag | null,
  ) {
    await crmRepository.updateLeadTag(d1, supplierId, leadId, tag);
  },

  async crmSetStatus(
    d1: D1Database,
    supplierId: string,
    leadId: string,
    status: ConversionStatus,
  ) {
    await crmRepository.updateLeadStatus(d1, supplierId, leadId, status);
  },

  async crmAddNote(
    d1: D1Database,
    supplierId: string,
    leadId: string,
    userId: string,
    body: string,
  ) {
    const trimmed = body.trim();
    if (trimmed.length === 0) throw new Error('note cannot be empty');
    if (trimmed.length > NOTE_MAX) {
      throw new Error(`note cannot exceed ${NOTE_MAX} characters`);
    }
    const lead = await crmRepository.getLeadForSupplier(d1, supplierId, leadId);
    if (!lead) throw new Error('lead not found');
    return crmRepository.insertNote(d1, leadId, userId, trimmed);
  },

  async crmListNotes(
    d1: D1Database,
    supplierId: string,
    leadId: string,
    cursor: string | undefined,
    limit: number,
  ) {
    const lead = await crmRepository.getLeadForSupplier(d1, supplierId, leadId);
    if (!lead) throw new Error('lead not found');
    return crmRepository.listNotes(d1, leadId, cursor, limit);
  },

  async crmSummary(d1: D1Database, supplierId: string) {
    return crmRepository.summaryForSupplier(d1, supplierId);
  },

  // Internal hooks ------------------------------------------------------

  async markQuoted(d1: D1Database, rfqSupplierId: string) {
    await crmRepository.setQuoted(d1, rfqSupplierId);
  },

  async markOrdered(
    d1: D1Database,
    rfqId: string,
    supplierId: string,
    orderId: string,
    orderValueCents: number,
  ) {
    const lead = await crmRepository.findLeadByRfqAndSupplier(d1, rfqId, supplierId);
    if (!lead) return; // silent skip — RFQ→order path may not always originate from an RFQ invitation
    await crmRepository.setOrdered(d1, lead.id, orderId, orderValueCents);
  },
};