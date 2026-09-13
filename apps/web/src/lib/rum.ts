import { onLCP, onINP, onCLS } from 'web-vitals';

let booted = false;

export function bootRum(): void {
  if (booted || typeof window === 'undefined') return;
  booted = true;
  const collect = (kind: string, value: number) => {
    const payload: Record<string, unknown> = {
      route: window.location.pathname,
    };
    if (kind === 'lcp') payload.lcp_ms = value;
    if (kind === 'inp') payload.inp_ms = value;
    if (kind === 'cls') payload.cls = value;
    if (!navigator.sendBeacon) return;
    navigator.sendBeacon(
      '/api/metrics/web',
      new Blob([JSON.stringify(payload)], {
        type: 'application/json',
      }),
    );
  };
  onLCP((m) => collect('lcp', m.value));
  onINP((m) => collect('inp', m.value));
  onCLS((m) => collect('cls', m.value));
}