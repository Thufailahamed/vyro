import { useEffect, useState } from 'react';
import { Button } from '@vyro/ui';

const KEY = 'vyro_consent';

interface Consent {
  essential: true;
  analytics: boolean;
  marketing: boolean;
  decidedAt: string;
}

export function CookieConsentBanner() {
  const [decided, setDecided] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!localStorage.getItem(KEY)) setDecided(false);
  }, []);

  if (decided) return null;

  const choose = (analytics: boolean, marketing: boolean) => {
    const value: Consent = {
      essential: true,
      analytics,
      marketing,
      decidedAt: new Date().toISOString(),
    };
    localStorage.setItem(KEY, JSON.stringify(value));
    setDecided(true);
  };

  return (
    <div
      role="dialog"
      aria-live="polite"
      className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:max-w-md z-50 bg-paper border border-ink/15 rounded-lg shadow-lg p-4 space-y-3"
    >
      <p className="text-sm text-ink">
        VYRO uses essential cookies to keep you signed in. We do not load analytics or marketing scripts in this version.
      </p>
      <div className="flex gap-2">
        <Button onClick={() => choose(true, true)}>Accept all</Button>
        <Button variant="ghost" onClick={() => choose(false, false)}>Essential only</Button>
      </div>
    </div>
  );
}
