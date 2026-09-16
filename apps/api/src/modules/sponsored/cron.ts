import * as repo from './repository';

export async function sponsoredExpireSweep(
  d1: D1Database,
  now: number,
): Promise<{ flippedToLive: number; flippedToExpired: number; cleanedEvents: number }> {
  let flippedToLive = 0;
  let flippedToExpired = 0;

  const approved = await repo.listCampaignsByStatus(d1, 'approved');
  for (const c of approved) {
    if (c.startsAt <= now && c.endsAt >= now) {
      await repo.updateCampaignStatus(d1, c.id, 'live', now);
      flippedToLive++;
    } else if (c.endsAt < now) {
      await repo.updateCampaignStatus(d1, c.id, 'expired', now);
      flippedToExpired++;
    }
  }

  const live = await repo.listCampaignsByStatus(d1, 'live');
  for (const c of live) {
    if (c.endsAt < now) {
      await repo.updateCampaignStatus(d1, c.id, 'expired', now);
      flippedToExpired++;
    }
  }

  const cutoff = now - 7 * 86400;
  const cleanedEvents = await repo.deleteEventsOlderThan(d1, cutoff);

  return { flippedToLive, flippedToExpired, cleanedEvents };
}