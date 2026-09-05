import { useState } from 'react';
import { useInstallPrompt } from '@/hooks/useInstallPrompt';

const KEY = 'vyro.install.dismissed';

export function InstallBanner() {
  const { canInstall, prompt, installed } = useInstallPrompt();
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.localStorage.getItem(KEY) === '1';
    } catch {
      return false;
    }
  });

  if (!canInstall || installed || dismissed) return null;

  async function go() {
    const r = await prompt();
    if (r === 'accepted') {
      try {
        window.localStorage.setItem(KEY, '1');
      } catch {}
      setDismissed(true);
    }
  }

  function dismiss() {
    try {
      window.localStorage.setItem(KEY, '1');
    } catch {}
    setDismissed(true);
  }

  return (
    <div
      role="dialog"
      aria-label="Install VYRO"
      className="fixed inset-x-4 bottom-4 sm:left-auto sm:right-6 sm:bottom-6 sm:max-w-sm bg-paper border border-ink/10 shadow-xl p-4 rounded-lg z-50 safe-area-inset-bottom"
    >
      <div className="font-display text-base text-ink">Install VYRO</div>
      <div className="text-xs text-ink-4 mt-1">Add to home screen for one-tap ordering, even offline.</div>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={go}
          className="px-3 py-2 min-h-[44px] bg-copper text-paper text-sm rounded font-medium"
        >
          Install
        </button>
        <button
          type="button"
          onClick={dismiss}
          className="px-3 py-2 min-h-[44px] text-sm text-ink-4"
        >
          Not now
        </button>
      </div>
    </div>
  );
}
