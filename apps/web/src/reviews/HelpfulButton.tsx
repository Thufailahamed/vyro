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
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors disabled:opacity-50 cursor-pointer ${
        on
          ? 'bg-volt/10 text-ink border-volt/40 font-semibold'
          : 'bg-paper text-ink-3 border-ink/15 hover:border-ink/30 hover:text-ink'
      }`}
    >
      <span className="text-[11px] select-none">👍</span>
      <span>Helpful ({count})</span>
    </button>
  );
}
