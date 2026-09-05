import { describe, expect, it, beforeEach } from 'vitest';
import { list, save, remove, clear } from './savedViews';

// In-memory localStorage stub (no jsdom in this app).
const memory = new Map<string, string>();
const stubStorage = {
  getItem: (k: string) => memory.get(k) ?? null,
  setItem: (k: string, v: string) => { memory.set(k, v); },
  removeItem: (k: string) => { memory.delete(k); },
  clear: () => { memory.clear(); },
  key: (i: number) => Array.from(memory.keys())[i] ?? null,
  get length() { return memory.size; },
};
(globalThis as { localStorage: typeof stubStorage }).localStorage = stubStorage;

describe('savedViews', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('list returns empty when nothing saved', () => {
    expect(list('refunds')).toEqual([]);
  });

  it('save adds a view, list returns it', () => {
    const v = save('refunds', 'Open > 7 days', { status: 'requested', minAgeDays: 7 });
    expect(v.name).toBe('Open > 7 days');
    expect(list('refunds').length).toBe(1);
  });

  it('remove deletes a view', () => {
    const v = save('refunds', 'a', { x: 1 });
    remove('refunds', v.id);
    expect(list('refunds')).toEqual([]);
  });

  it('clear removes all views for a page', () => {
    save('refunds', 'a', { x: 1 });
    save('refunds', 'b', { y: 2 });
    clear('refunds');
    expect(list('refunds')).toEqual([]);
  });

  it('views are scoped by page', () => {
    save('refunds', 'r', { x: 1 });
    save('abuse', 'a', { y: 2 });
    expect(list('refunds').length).toBe(1);
    expect(list('abuse').length).toBe(1);
    expect(list('payouts')).toEqual([]);
  });

  it('list returns [] for malformed JSON', () => {
    localStorage.setItem('vyro.admin.savedViews.refunds', 'not json');
    expect(list('refunds')).toEqual([]);
  });
});
