/**
 * Helpers shared by the floating Ask panel and the cart hints banner.
 * Pure functions — easy to unit-test.
 */

export function dismissKey(raw: string): string {
  return `vyro:dismiss:${raw}`;
}

export function isDismissed(raw: string): boolean {
  try {
    return localStorage.getItem(dismissKey(raw)) === '1';
  } catch {
    return false;
  }
}

export function clearDismiss(raw: string): void {
  try {
    localStorage.removeItem(dismissKey(raw));
  } catch {
    // noop
  }
}
