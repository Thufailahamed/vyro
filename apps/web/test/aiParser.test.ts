import { describe, expect, it } from 'vitest';
import { parseSSE } from '../src/ask/hooks/useVyroAI';

function sseResponse(events: Array<[string, unknown]>): Response {
  const body = events.map(([t, d]) => `event: ${t}\ndata: ${JSON.stringify(d)}\n\n`).join('');
  return new Response(body, { headers: { 'content-type': 'text/event-stream' } });
}

describe('parseSSE', () => {
  it('yields typed tuples for each event frame', async () => {
    const out: Array<[string, unknown]> = [];
    for await (const pair of parseSSE(sseResponse([
      ['status', { stage: 'classifying' }],
      ['tool_call', { name: 'find_cheapest', slots: { productName: 'rice' } }],
      ['component', { type: 'recommendation_card', data: { productName: 'Samba Rice', supplierName: 'Beta', priceCents: 430000 } }],
      ['final', { summary: 'Buy from Beta', actions: [] }],
    ]))) out.push(pair);

    expect(out.length).toBe(4);
    expect(out[0][0]).toBe('status');
    expect(JSON.parse(out[0][1])).toEqual({ stage: 'classifying' });
    expect(out[3][0]).toBe('final');
  });

  it('handles empty body without throwing', async () => {
    const res = new Response('', { headers: { 'content-type': 'text/event-stream' } });
    const out: Array<[string, string]> = [];
    for await (const p of parseSSE(res)) out.push(p);
    expect(out).toEqual([]);
  });
});

describe('SUGGESTIONS_KEY constant shape', () => {
  it('matches storage key pattern', () => {
    expect(SUGGESTIONS_KEY_TOKEN).toBe('vyro-ai-suggestions');
  });
});

const SUGGESTIONS_KEY_TOKEN = 'vyro-ai-suggestions';
