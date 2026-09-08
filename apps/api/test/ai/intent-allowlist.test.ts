import { describe, it, expect, beforeEach } from 'vitest';
import { orchestrate } from '../../src/modules/ai/orchestrator';
import { aiEnvFixture } from './helpers/aiFixture';
import { __resetCostCapForTests } from '../../src/modules/ai/guard';

const dict = { products: ['samba rice', 'chicken', 'cooking oil'], suppliers: ['Supplier A', 'Alpha Foods'] };

function parseSse(frame: string): { event: string; data: any } | null {
  const lines = frame.split('\n');
  let event = '';
  let data: any = null;
  for (const line of lines) {
    if (line.startsWith('event: ')) event = line.slice(7).trim();
    else if (line.startsWith('data: ')) {
      try { data = JSON.parse(line.slice(6)); } catch { data = line.slice(6); }
    }
  }
  return event ? { event, data } : null;
}

async function run(role: 'admin' | 'member' | 'viewer', forcedIntent?: string) {
  const env = aiEnvFixture();
  const forcedSlots = forcedIntent === 'clarify' ? { question: 'q', options: ['a', 'b'] } : {};
  env.AI = {
    run: async () => ({
      response: JSON.stringify({ intent: forcedIntent ?? 'find_cheapest', slots: forcedSlots, confidence: 0.9 }),
    }),
  };
  const events: any[] = [];
  for await (const ev of orchestrate(
    env as any,
    { prompt: 'test', businessId: 'b1', userId: 'u1', role, businessName: 'Test', dict },
    'test',
  )) {
    const parsed = parseSse(ev);
    if (parsed) events.push(parsed);
  }
  return events;
}

describe('intent allowlist gate', () => {
  beforeEach(() => { __resetCostCapForTests(); });

  it('viewer invoking usual_order (write intent) is rejected with INTENT_FORBIDDEN', async () => {
    const events = await run('viewer', 'usual_order');
    const error = events.find((e) => e.event === 'error');
    expect(error?.data?.code).toBe('INTENT_FORBIDDEN');
  });

  it('viewer invoking savings (read intent) flows through without forbidden error', async () => {
    const events = await run('viewer', 'savings');
    const error = events.find((e) => e.event === 'error');
    expect(error?.data?.code).not.toBe('INTENT_FORBIDDEN');
  });

  it('member invoking usual_order flows through without forbidden error', async () => {
    const events = await run('member', 'usual_order');
    const error = events.find((e) => e.event === 'error');
    expect(error?.data?.code).not.toBe('INTENT_FORBIDDEN');
  });

  it('admin invoking any intent flows through without forbidden error', async () => {
    const events = await run('admin', 'usual_order');
    const error = events.find((e) => e.event === 'error');
    expect(error?.data?.code).not.toBe('INTENT_FORBIDDEN');
  });
});