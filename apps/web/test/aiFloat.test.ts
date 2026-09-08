import { describe, expect, it, vi, beforeEach } from 'vitest';
import { dismissKey, isDismissed, clearDismiss } from '../src/ai/floatHelpers';

describe('floatHelpers dismiss', () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
  });

  it('namespaces dismiss keys', () => {
    expect(dismissKey('switch_save:abc')).toBe('vyro:dismiss:switch_save:abc');
  });

  it('isDismissed returns false when unset', () => {
    expect(isDismissed('nonexistent:test')).toBe(false);
  });

  it('roundtrips set + clear via localStorage', () => {
    localStorage.setItem(dismissKey('roundtrip:test'), '1');
    expect(isDismissed('roundtrip:test')).toBe(true);
    clearDismiss('roundtrip:test');
    expect(isDismissed('roundtrip:test')).toBe(false);
  });
});

