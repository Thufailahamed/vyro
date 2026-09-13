import { useEffect, useState } from 'react';

type ComponentStatus =
  | 'operational'
  | 'degraded'
  | 'down'
  | 'unknown';

type StatusEntry = {
  status: ComponentStatus;
  updatedAt: number;
  detail?: string;
};

type Incident = {
  id: string;
  title: string;
  severity: string;
  startedAt: number;
  resolvedAt?: number;
};

export type StatusPayload = {
  components: Record<string, StatusEntry>;
  incidents: Incident[];
  updatedAt: number;
  version: string;
};

export function useStatus(): StatusPayload | null {
  const [data, setData] = useState<StatusPayload | null>(null);
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch('/status.json', {
          credentials: 'omit',
        });
        if (!res.ok) return;
        const json = (await res.json()) as StatusPayload;
        if (!cancelled) setData(json);
      } catch {
        // ignore
      }
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);
  return data;
}