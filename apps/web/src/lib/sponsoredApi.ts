import { api } from './api';
import {
  type SponsorPlan,
  type SponsorSlot,
  type SponsorCampaign,
  type SponsorInvoice,
  type SponsorSubscription,
  type SponsorDisclosure,
  type CreateCampaignInput,
  type UpdateCampaignInput,
} from '@vyro/validation';

export interface ResolvedSlot {
  slotId: string;
  surface: 'search' | 'category' | 'homepage' | 'storefront';
  position: number;
  campaignId: string | null;
  productId: string | null;
  supplierId: string | null;
  dailyRateCents: number;
  label: string;
}

export const sponsoredApi = {
  fetchDisclosure() {
    return api.get<SponsorDisclosure>(`/sponsored/disclosure`);
  },
  logEvent(payload: { campaignId: string; eventType: 'impression' | 'click'; surface: string; requestId: string }) {
    return api.post<{ ok: true; deduped?: boolean }>(`/sponsored/events`, payload).catch(() => ({ ok: true as const }));
  },
  resolveSlots(surface: ResolvedSlot['surface'], categoryId: string | null) {
    const qs = new URLSearchParams();
    if (categoryId) qs.set('categoryId', categoryId);
    const q = qs.toString();
    return api.get<{ sponsored: ResolvedSlot[] }>(`/sponsored/resolve/${surface}${q ? `?${q}` : ''}`);
  },

  // Supplier
  listPlans() {
    return api.get<SponsorPlan[]>(`/supplier/sponsored/plans`);
  },
  subscribePlan(planId: string) {
    return api.post<SponsorSubscription>(`/supplier/sponsored/subscriptions`, { planId });
  },
  getMySubscription(supplierId: string) {
    return api.get<SponsorSubscription | null>(`/supplier/sponsored/subscriptions/me?supplierId=${encodeURIComponent(supplierId)}`);
  },
  cancelSubscription(id: string, supplierId: string) {
    return api.del<{ ok: true }>(`/supplier/sponsored/subscriptions/${id}?supplierId=${encodeURIComponent(supplierId)}`);
  },
  listSlots(surface: string, categoryId: string | null, supplierId: string) {
    const qs = new URLSearchParams({ surface, supplierId });
    if (categoryId) qs.set('categoryId', categoryId);
    return api.get<SponsorSlot[]>(`/supplier/sponsored/slots?${qs.toString()}`);
  },
  listCampaigns(supplierId: string, status?: string) {
    const qs = new URLSearchParams({ supplierId });
    if (status) qs.set('status', status);
    return api.get<SponsorCampaign[]>(`/supplier/sponsored/campaigns?${qs.toString()}`);
  },
  getCampaign(id: string, supplierId: string) {
    return api.get<SponsorCampaign>(`/supplier/sponsored/campaigns/${id}?supplierId=${encodeURIComponent(supplierId)}`);
  },
  createCampaign(input: CreateCampaignInput & { supplierId: string }) {
    const { supplierId, ...body } = input;
    return api.post<{ campaign: SponsorCampaign; invoice: SponsorInvoice }>(
      `/supplier/sponsored/campaigns?supplierId=${encodeURIComponent(supplierId)}`,
      body,
    );
  },
  updateCampaign(id: string, input: UpdateCampaignInput & { supplierId: string }) {
    const { supplierId, ...body } = input;
    return api.patch<{ ok: true }>(
      `/supplier/sponsored/campaigns/${id}?supplierId=${encodeURIComponent(supplierId)}`,
      body,
    );
  },
  cancelCampaign(id: string, supplierId: string) {
    return api.del<{ ok: true }>(`/supplier/sponsored/campaigns/${id}?supplierId=${encodeURIComponent(supplierId)}`);
  },
  listInvoices(supplierId: string, status?: string) {
    const qs = new URLSearchParams({ supplierId });
    if (status) qs.set('status', status);
    return api.get<SponsorInvoice[]>(`/supplier/sponsored/invoices?${qs.toString()}`);
  },
  payInvoice(id: string, supplierId: string) {
    return api.post<{ ok: true }>(`/supplier/sponsored/invoices/${id}/pay?supplierId=${encodeURIComponent(supplierId)}`);
  },

  // Admin
  adminListPlans() { return api.get<SponsorPlan[]>(`/admin/sponsored/plans`); },
  adminUpsertPlan(id: string | null, input: { tier: 'bronze'|'silver'|'gold'; name: string; monthlyRateCents: number; includedSlotCredits: number; active: boolean }) {
    return id
      ? api.patch<{ ok: true }>(`/admin/sponsored/plans/${id}`, input)
      : api.post<{ ok: true }>(`/admin/sponsored/plans`, input);
  },
  adminDeletePlan(id: string) { return api.del<{ ok: true }>(`/admin/sponsored/plans/${id}`); },
  adminListSlots() { return api.get<SponsorSlot[]>(`/admin/sponsored/slots`); },
  adminUpsertSlot(id: string | null, input: { surface: 'search'|'category'|'homepage'|'storefront'; position: number; categoryId: string | null; label: string; dailyRateCents: number; active: boolean }) {
    return id
      ? api.patch<{ ok: true }>(`/admin/sponsored/slots/${id}`, input)
      : api.post<{ ok: true }>(`/admin/sponsored/slots`, input);
  },
  adminDeleteSlot(id: string) { return api.del<{ ok: true }>(`/admin/sponsored/slots/${id}`); },
  adminListCampaigns(opts: { status?: string; surface?: string; supplierId?: string } = {}) {
    const qs = new URLSearchParams();
    if (opts.status) qs.set('status', opts.status);
    if (opts.surface) qs.set('surface', opts.surface);
    if (opts.supplierId) qs.set('supplierId', opts.supplierId);
    const q = qs.toString();
    return api.get<SponsorCampaign[]>(`/admin/sponsored/campaigns${q ? `?${q}` : ''}`);
  },
  adminApprove(id: string, adminNotes?: string) {
    return api.post<{ ok: true }>(`/admin/sponsored/campaigns/${id}/approve`, adminNotes ? { adminNotes } : {});
  },
  adminReject(id: string, reason: string) {
    return api.post<{ ok: true }>(`/admin/sponsored/campaigns/${id}/reject`, { reason });
  },
  adminRevoke(id: string, reason: string) {
    return api.post<{ ok: true }>(`/admin/sponsored/campaigns/${id}/revoke`, { reason });
  },
  adminPin(id: string) {
    return api.post<{ ok: true; pinned: number }>(`/admin/sponsored/campaigns/${id}/pin`, {});
  },
  adminWaiveInvoice(id: string) { return api.post<{ ok: true }>(`/admin/sponsored/invoices/${id}/waive`, {}); },
  adminMarkPaidInvoice(id: string) { return api.post<{ ok: true }>(`/admin/sponsored/invoices/${id}/mark-paid`, {}); },
  adminAnalytics(from?: number, to?: number) {
    const qs = new URLSearchParams();
    if (from) qs.set('from', String(from));
    if (to) qs.set('to', String(to));
    const q = qs.toString();
    return api.get<{ analytics: Array<{ campaignId: string; impressions: number; clicks: number }> }>(
      `/admin/sponsored/analytics${q ? `?${q}` : ''}`,
    );
  },
};