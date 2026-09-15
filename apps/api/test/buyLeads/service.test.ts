import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buyLeads } from '../../src/modules/buyLeads/service';
import { buyLeadsRepository } from '../../src/modules/buyLeads/repository';
import { buyLeadsMatcher } from '../../src/modules/buyLeads/matcher';
import * as featureFlags from '../../src/lib/featureFlags';

const DB = {} as D1Database;
const queueSend = vi.fn().mockResolvedValue(undefined);
const env = { DB, NOTIFICATIONS_QUEUE: { send: queueSend } } as any;

describe('buyLeads.getMySubscription', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('returns defaults when no row', async () => {
    vi.spyOn(buyLeadsRepository, 'getSubscription').mockResolvedValue(null);
    const result = await buyLeads.getMySubscription(DB, 'supA');
    expect(result).toEqual({ enabled: false, categoryIds: [] });
  });

  it('returns stored values', async () => {
    vi.spyOn(buyLeadsRepository, 'getSubscription').mockResolvedValue({
      supplierId: 'supA',
      enabled: true,
      categoryIds: ['cat1', 'cat2'],
    });
    const result = await buyLeads.getMySubscription(DB, 'supA');
    expect(result).toEqual({ enabled: true, categoryIds: ['cat1', 'cat2'] });
  });
});

describe('buyLeads.updateMySubscription', () => {
  it('upserts via repository', async () => {
    const upsertSpy = vi
      .spyOn(buyLeadsRepository, 'upsertSubscription')
      .mockResolvedValue(undefined);
    const body = { enabled: true, categoryIds: ['cat1'] };
    const result = await buyLeads.updateMySubscription(DB, 'supA', body);
    expect(upsertSpy).toHaveBeenCalledWith(DB, 'supA', true, ['cat1']);
    expect(result).toEqual(body);
  });
});

describe('buyLeads.runDailyDigest', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    queueSend.mockClear();
  });

  it('no-ops when flag is off', async () => {
    vi.spyOn(featureFlags, 'isFeatureEnabled').mockResolvedValue(false);
    const result = await buyLeads.runDailyDigest(env, DB);
    expect(result).toEqual({ suppliersEmailed: 0, rfqsSent: 0 });
    expect(queueSend).not.toHaveBeenCalled();
  });

  it('emails matched suppliers', async () => {
    vi.spyOn(featureFlags, 'isFeatureEnabled').mockResolvedValue(true);
    vi.spyOn(buyLeadsRepository, 'enabledSubscriptions').mockResolvedValue([
      { supplierId: 'supA', recipientUserId: 'u1', recipientEmail: 'a@a.lk' },
    ]);
    vi.spyOn(buyLeadsMatcher, 'topMatchesForSupplier').mockResolvedValue([
      { rfqId: 'rfq1', rfqNumber: 'RFQ-001', title: 'Need 100kg rice', createdAt: 1000 },
    ]);
    const result = await buyLeads.runDailyDigest(env, DB);
    expect(result.suppliersEmailed).toBe(1);
    expect(result.rfqsSent).toBe(1);
    expect(queueSend).toHaveBeenCalledOnce();
    const payload = queueSend.mock.calls[0][0];
    expect(payload.kind).toBe('buyleads_digest');
    expect(payload.recipientEmail).toBe('a@a.lk');
    expect(payload.subject).toMatch(/1 new RFQ/);
    expect(payload.link).toBe('/supplier/buyleads');
  });
});
