import type { ButtonHTMLAttributes, InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes, ReactNode } from 'react';
import { AlertCircleIcon, CheckCircleIcon } from './icons';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  children?: ReactNode;
  icon?: ReactNode;
}

export function Button({
  className = '',
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  children,
  icon,
  ...rest
}: ButtonProps) {
  const baseClasses = 'inline-flex items-center justify-center font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none active:scale-[0.98] select-none';

  const sizeClasses = {
    sm: 'text-xs px-2.5 py-1.5 rounded-lg gap-1.5',
    md: 'text-sm px-4 py-2 rounded-lg gap-2 shadow-soft-sm',
    lg: 'text-base px-5 py-2.5 rounded-xl gap-2.5 shadow-soft-sm',
  }[size];

  const variantClasses = {
    primary: 'bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 focus-visible:ring-brand-500 border border-transparent',
    secondary: 'bg-slate-100 text-slate-800 hover:bg-slate-200 active:bg-slate-300 focus-visible:ring-slate-400 border border-transparent',
    outline: 'border border-slate-300 bg-white text-slate-750 hover:bg-slate-50 hover:border-slate-400 text-slate-700 active:bg-slate-100 focus-visible:ring-brand-500 shadow-soft-sm',
    ghost: 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900 active:bg-slate-200 focus-visible:ring-slate-400 border border-transparent shadow-none',
    danger: 'bg-rose-600 text-white hover:bg-rose-700 active:bg-rose-800 focus-visible:ring-rose-500 border border-transparent',
    success: 'bg-emerald-600 text-white hover:bg-emerald-700 active:bg-emerald-800 focus-visible:ring-emerald-500 border border-transparent',
  }[variant];

  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={`${baseClasses} ${sizeClasses} ${variantClasses} ${className}`}
    >
      {loading ? (
        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-current" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      ) : icon ? (
        <span className="shrink-0">{icon}</span>
      ) : null}
      {children}
    </button>
  );
}

export function GhostButton({ className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { children?: ReactNode }) {
  return (
    <Button
      variant="outline"
      className={className}
      {...rest}
    />
  );
}

export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 shadow-soft-sm transition-all focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500 ${className}`}
    />
  );
}

export function Textarea({ className = '', ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 shadow-soft-sm transition-all focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500 ${className}`}
    />
  );
}

export function Select({ className = '', children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { children?: ReactNode }) {
  return (
    <div className="relative w-full">
      <select
        {...props}
        className={`w-full appearance-none rounded-lg border border-slate-300 bg-white px-3.5 py-2 pr-9 text-sm text-slate-900 shadow-soft-sm transition-all focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500 ${className}`}
      >
        {children}
      </select>
      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-slate-500">
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </div>
    </div>
  );
}

export function Label({ children, htmlFor, className = '' }: { children: ReactNode; htmlFor?: string; className?: string }) {
  return (
    <label htmlFor={htmlFor} className={`block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5 ${className}`}>
      {children}
    </label>
  );
}

export function Card({
  children,
  className = '',
  hoverEffect = false,
  ...props
}: {
  children: ReactNode;
  className?: string;
  hoverEffect?: boolean;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={`bg-white border border-slate-200/80 rounded-xl p-5 shadow-soft-sm ${
        hoverEffect ? 'hover:shadow-soft-md hover:border-brand-200/90 transition-all duration-200' : ''
      } ${className}`}
    >
      {children}
    </div>
  );
}

export function Badge({
  children,
  variant = 'neutral',
  className = '',
}: {
  children: ReactNode;
  variant?: 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'purple';
  className?: string;
}) {
  const styles = {
    neutral: 'bg-slate-100 text-slate-700 border-slate-200',
    brand: 'bg-brand-50 text-brand-700 border-brand-200',
    success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    warning: 'bg-amber-50 text-amber-800 border-amber-200',
    danger: 'bg-rose-50 text-rose-700 border-rose-200',
    purple: 'bg-purple-50 text-purple-700 border-purple-200',
  }[variant];

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${styles} ${className}`}>
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase().replace(/_/g, ' ');

  let variant: 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'purple' = 'neutral';
  let dotColor = 'bg-slate-400';

  switch (status.toLowerCase()) {
    case 'pending':
      variant = 'warning';
      dotColor = 'bg-amber-500';
      break;
    case 'accepted':
    case 'confirmed':
      variant = 'brand';
      dotColor = 'bg-brand-500';
      break;
    case 'in_transit':
    case 'shipped':
      variant = 'purple';
      dotColor = 'bg-purple-500';
      break;
    case 'delivered':
    case 'completed':
      variant = 'success';
      dotColor = 'bg-emerald-500';
      break;
    case 'cancelled':
    case 'rejected':
      variant = 'danger';
      dotColor = 'bg-rose-500';
      break;
    case 'disputed':
      variant = 'danger';
      dotColor = 'bg-rose-600 animate-pulse';
      break;
  }

  return (
    <Badge variant={variant} className="capitalize">
      <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
      {normalized}
    </Badge>
  );
}

export function ErrorBanner({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div className="flex items-start gap-3 bg-rose-50/90 border border-rose-200 text-rose-800 text-sm rounded-xl p-4 shadow-soft-sm animate-in fade-in-50 duration-200">
      <AlertCircleIcon size={18} className="text-rose-600 shrink-0 mt-0.5" />
      <div className="font-medium">{message}</div>
    </div>
  );
}

export function SuccessBanner({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div className="flex items-start gap-3 bg-emerald-50/90 border border-emerald-200 text-emerald-800 text-sm rounded-xl p-4 shadow-soft-sm animate-in fade-in-50 duration-200">
      <CheckCircleIcon size={18} className="text-emerald-600 shrink-0 mt-0.5" />
      <div className="font-medium">{message}</div>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="text-center py-12 px-4 rounded-2xl border-2 border-dashed border-slate-200 bg-white/50 my-6">
      {icon && <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 mb-4 shadow-soft-sm">{icon}</div>}
      <h3 className="text-base font-semibold text-slate-800">{title}</h3>
      {description && <p className="mt-1 text-sm text-slate-500 max-w-sm mx-auto">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  badge,
  action,
}: {
  title: ReactNode;
  description?: ReactNode;
  badge?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200 mb-6">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
          {badge}
        </div>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {action && <div className="flex items-center gap-3 shrink-0">{action}</div>}
    </div>
  );
}

// Re-export chart primitives from @vyro/ui
export { Sparkline, BarChart, ProgressRing, StatTile, TimeSeries } from '@vyro/ui';
