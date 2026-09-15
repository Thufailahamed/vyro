import { useState, type JSX } from 'react';

export function HelpfulButton({ reviewId, initialCount }: { reviewId: string; initialCount: number }): JSX.Element {
  const [count, setCount] = useState(initialCount);
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/reviews/${reviewId}/helpful`, {
        method: on ? 'DELETE' : 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        setOn(!on);
        setCount((c) => c + (on ? -1 : 1));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={busy}
      aria-pressed={on}
      className="text-xs text-gray-600 underline disabled:opacity-50"
    >
      Helpful ({count})
    </button>
  );
}
