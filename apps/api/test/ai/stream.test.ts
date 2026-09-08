import { describe, expect, it } from 'vitest';
import { encodeEvent, validateEvent } from '../../src/modules/ai/stream';

describe('stream encoder', () => {
  it('encodes status event', () => {
    const s = encodeEvent('status', { stage: 'classifying' });
    expect(s).toBe('event: status\ndata: {"stage":"classifying"}\n\n');
  });

  it('encodes tool_call event', () => {
    const s = encodeEvent('tool_call', { name: 'find_cheapest', slots: { productName: 'rice' } });
    expect(s.startsWith('event: tool_call\ndata: ')).toBe(true);
  });

  it('round-trips through validateEvent', () => {
    const s = encodeEvent('final', { summary: 'all good', actions: [] });
    const frame = s.split('\n')[1]!.replace(/^data: /, '');
    const parsed = validateEvent('final', frame);
    expect(parsed).toEqual({ summary: 'all good', actions: [] });
  });

  it('rejects malformed payload', () => {
    expect(() => validateEvent('final', '{"summary":')).toThrow();
  });
});
