import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { cn } from '../lib/cn';

export interface ToastItem {
  id: number;
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  description?: string | undefined;
}

interface ToastContextValue {
  show: (t: Omit<ToastItem, 'id'>) => void;
  success: (title: string, description?: string) => Omit<ToastItem, 'id'>;
  error: (title: string, description?: string) => Omit<ToastItem, 'id'>;
  info: (title: string, description?: string) => Omit<ToastItem, 'id'>;
  warning: (title: string, description?: string) => Omit<ToastItem, 'id'>;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const show = useCallback((t: Omit<ToastItem, 'id'>) => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s, { ...t, id }]);
    setTimeout(() => setItems((s) => s.filter((x) => x.id !== id)), 4200);
  }, []);

  const value: ToastContextValue = {
    show,
    success: (title, description) => ({ type: 'success', title, description: description ?? undefined }),
    error: (title, description) => ({ type: 'error', title, description: description ?? undefined }),
    info: (title, description) => ({ type: 'info', title, description: description ?? undefined }),
    warning: (title, description) => ({ type: 'warning', title, description: description ?? undefined }),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-full" aria-live="polite">
        {items.map((t) => (
          <ToastCard key={t.id} toast={t} onClose={() => setItems((s) => s.filter((x) => x.id !== t.id))} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({ toast, onClose }: { toast: ToastItem; onClose: () => void }) {
  const Icon = toast.type === 'success' ? CheckCircle2 : toast.type === 'error' ? AlertCircle : toast.type === 'warning' ? AlertCircle : Info;
  const accent =
    toast.type === 'success'
      ? 'border-mint/40 bg-mint/5 text-mint'
      : toast.type === 'error'
      ? 'border-rose/40 bg-rose/5 text-rose'
      : toast.type === 'warning'
      ? 'border-amber/40 bg-amber/5 text-amber'
      : 'border-cyan-deep/40 bg-cyan/10 text-cyan-deep';
  return (
    <div
      role="status"
      className={cn(
        'flex items-start gap-3 rounded-md border bg-paper px-4 py-3 shadow-4 animate-fade-in',
        accent
      )}
    >
      <Icon className="size-4 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="text-body-sm font-medium text-ink-1">{toast.title}</div>
        {toast.description && <div className="text-caption text-ink-3 mt-0.5">{toast.description}</div>}
      </div>
      <button onClick={onClose} className="text-ink-3 hover:text-ink-1" aria-label="Dismiss">
        <X className="size-3.5" />
      </button>
    </div>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

export function ToastDev() {
  // used only in stories / testing
  useEffect(() => {}, []);
  return null;
}
