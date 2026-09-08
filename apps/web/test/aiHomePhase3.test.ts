import { describe, it, expect } from 'vitest';
import { healthHeadline, concentrationLabel } from '../src/ai/home';

describe('phase3 home headliners', () => {
  it('maps health score bands', () => {
    expect(healthHeadline(85)).toBe('Excellent');
    expect(healthHeadline(75)).toBe('Healthy');
    expect(healthHeadline(55)).toBe('Watch');
    expect(healthHeadline(30)).toBe('At risk');
  });

  it('maps concentration label', () => {
    expect(concentrationLabel(0.7)).toBe('High concentration risk');
    expect(concentrationLabel(0.35)).toBe('Moderate concentration');
    expect(concentrationLabel(0.2)).toBe('Diversified');
  });
});
