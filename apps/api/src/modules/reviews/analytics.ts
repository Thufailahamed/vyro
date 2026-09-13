// Lightweight analytics emit for review events.
// Persisted to console as structured JSON so the platform can aggregate later.
// Not crash-on-error: analytics failures must never break user flows.

export type ReviewEvent =
  | 'review_submitted'
  | 'review_replied'
  | 'review_flagged'
  | 'review_flag_resolved'
  | 'review_deleted';

export function emit(event: ReviewEvent, props: Record<string, unknown>): void {
  try {
    console.info(
      JSON.stringify({
        type: 'analytics',
        event,
        ts: Date.now(),
        ...props,
      }),
    );
  } catch {
    // never throw
  }
}
