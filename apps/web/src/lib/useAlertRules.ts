import { useEffect, useState } from 'react';

type SloRule = {
  name: string;
  component: string;
  description: string;
  severity: string;
  threshold: number;
  window: string;
  comparator: string;
  enabled: boolean;
  silenced: boolean;
};

export function useAlertRules(): SloRule[] | null {
  const [rules, setRules] = useState<SloRule[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/observability/alerts/rules', {
      credentials: 'include',
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: unknown) => {
        if (
          !cancelled &&
          j &&
          typeof j === 'object' &&
          Array.isArray((j as { rules?: unknown }).rules)
        ) {
          setRules((j as { rules: SloRule[] }).rules);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return rules;
}

export async function silenceRule(
  ruleName: string,
  durationMinutes: number,
  reason: string,
): Promise<unknown> {
  const res = await fetch('/api/admin/observability/alerts/silence', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ruleName, durationMinutes, reason }),
  });
  if (!res.ok) throw new Error('silence_failed');
  return res.json();
}

export async function unsilenceRule(
  ruleName: string,
): Promise<unknown> {
  const res = await fetch(
    `/api/admin/observability/alerts/silence/${encodeURIComponent(ruleName)}`,
    { method: 'DELETE', credentials: 'include' },
  );
  if (!res.ok) throw new Error('unsilence_failed');
  return res.json();
}