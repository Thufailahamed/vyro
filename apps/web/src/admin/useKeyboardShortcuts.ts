import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

export type ShortcutsOptions = {
  focusSearch?: () => void;
};

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable) return true;
  return false;
}

const CHORD_TIMEOUT_MS = 1500;

const SHORTCUTS: Array<[string, string]> = [
  ['Cmd/Ctrl+K', 'Focus search'],
  ['/', 'Focus search'],
  ['g o', 'Go to Overview'],
  ['g u', 'Go to Users'],
  ['g a', 'Go to Audit'],
  ['?', 'Open shortcuts overlay'],
  ['Esc', 'Close overlay'],
];

export function useKeyboardShortcuts(opts: ShortcutsOptions = {}) {
  const navigate = useNavigate();
  const lastKey = useRef<{ key: string; ts: number } | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) {
        if (e.key === 'Escape') {
          (e.target as HTMLElement).blur();
        }
        return;
      }

      const mod = e.metaKey || e.ctrlKey;

      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        opts.focusSearch?.();
        return;
      }

      if (e.key === '/') {
        e.preventDefault();
        opts.focusSearch?.();
        return;
      }

      if (e.key === '?') {
        e.preventDefault();
        setHelpOpen((v) => !v);
        return;
      }

      if (e.key === 'Escape') {
        setHelpOpen(false);
        return;
      }

      if (e.key === 'g') {
        lastKey.current = { key: 'g', ts: Date.now() };
        return;
      }

      const last = lastKey.current;
      if (last && last.key === 'g' && Date.now() - last.ts < CHORD_TIMEOUT_MS) {
        if (e.key === 'o') {
          e.preventDefault();
          navigate('/admin');
          lastKey.current = null;
          return;
        }
        if (e.key === 'u') {
          e.preventDefault();
          navigate('/admin/users');
          lastKey.current = null;
          return;
        }
        if (e.key === 'a') {
          e.preventDefault();
          navigate('/admin/audit');
          lastKey.current = null;
          return;
        }
      }

      lastKey.current = null;
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate, opts]);

  return { helpOpen, setHelpOpen, SHORTCUTS };
}
