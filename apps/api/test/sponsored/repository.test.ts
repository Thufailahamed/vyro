import { describe, expect, it } from 'vitest';
import * as repo from '../../src/modules/sponsored/repository';

describe('sponsored repository shape', () => {
  it('exports plan helpers', () => {
    expect(typeof repo.listActivePlans).toBe('function');
    expect(typeof repo.listAllPlans).toBe('function');
    expect(typeof repo.getPlan).toBe('function');
    expect(typeof repo.insertPlan).toBe('function');
    expect(typeof repo.updatePlan).toBe('function');
    expect(typeof repo.deletePlan).toBe('function');
  });

  it('exports slot helpers', () => {
    expect(typeof repo.listSlotsForSurface).toBe('function');
    expect(typeof repo.listAllSlots).toBe('function');
    expect(typeof repo.getSlot).toBe('function');
    expect(typeof repo.insertSlot).toBe('function');
    expect(typeof repo.updateSlot).toBe('function');
    expect(typeof repo.deleteSlot).toBe('function');
  });

  it('exports subscription helpers', () => {
    expect(typeof repo.insertSubscription).toBe('function');
    expect(typeof repo.getSubscription).toBe('function');
    expect(typeof repo.cancelSubscription).toBe('function');
    expect(typeof repo.listSubscriptionsBySupplier).toBe('function');
    expect(typeof repo.getActiveSubscriptionBySupplier).toBe('function');
  });

  it('exports campaign helpers', () => {
    expect(typeof repo.insertCampaign).toBe('function');
    expect(typeof repo.getCampaign).toBe('function');
    expect(typeof repo.updateCampaignStatus).toBe('function');
    expect(typeof repo.updateCampaignDates).toBe('function');
    expect(typeof repo.setCampaignPinned).toBe('function');
    expect(typeof repo.setCampaignInvoice).toBe('function');
    expect(typeof repo.setCampaignAdminNotes).toBe('function');
    expect(typeof repo.listCampaignsBySupplier).toBe('function');
    expect(typeof repo.listCampaignsByStatus).toBe('function');
    expect(typeof repo.listAllCampaignsFiltered).toBe('function');
    expect(typeof repo.findLiveCandidates).toBe('function');
  });

  it('exports event helpers', () => {
    expect(typeof repo.insertEvent).toBe('function');
    expect(typeof repo.listEventsForCampaign).toBe('function');
    expect(typeof repo.deleteEventsOlderThan).toBe('function');
  });

  it('exports invoice helpers', () => {
    expect(typeof repo.insertInvoice).toBe('function');
    expect(typeof repo.getInvoice).toBe('function');
    expect(typeof repo.markInvoicePaid).toBe('function');
    expect(typeof repo.waiveInvoice).toBe('function');
    expect(typeof repo.listInvoicesBySupplier).toBe('function');
    expect(typeof repo.listInvoicesByCampaign).toBe('function');
  });
});