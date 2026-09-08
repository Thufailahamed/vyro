import { describe, it, expect } from 'vitest';
import { buildWhyAnswer } from './why';

describe('buildWhyAnswer', () => {
  it('returns deterministic answer with evidence', () => {
    const r = buildWhyAnswer({
      question: 'Why did spending increase?',
      intent: 'spend_summary',
      evidence: [
        { label: 'Spend this period', value: 'Rs. 1,250,000' },
        { label: 'Spend last period', value: 'Rs. 1,080,000' },
        { label: 'Top driver', value: 'Chicken (+22%)' },
      ],
      recommendation: 'Compare alternative chicken suppliers.',
    });
    expect(r.answer).toMatch(/Rs\. 1,250,000/);
    expect(r.evidence).toHaveLength(3);
    expect(r.recommendation).toMatch(/alternative/i);
  });

  it('omits null recommendation when not provided', () => {
    const r = buildWhyAnswer({
      question: 'q',
      intent: 'spend_summary',
      evidence: [],
    });
    expect(r.recommendation).toBeNull();
  });
});
