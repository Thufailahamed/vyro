import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  TextareaHTMLAttributes,
  SelectHTMLAttributes,
  ReactNode,
} from 'react';
import { AlertCircleIcon, ArrowRightIcon, CheckCircleIcon } from './icons';
import { FlowCanvas } from './brand/FlowLine';

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
  const sizeClasses = {
    sm: 'text-xs h-8 px-3 gap-1.5',
    md: 'text-sm h-10 px-4 gap-2',
    lg: 'text-base h-12 px-5 gap-2.5',
  }[size];

  const variantClasses = {
    primary: 'vyro-btn-primary',
    secondary: 'vyro-btn-secondary',
    outline: 'vyro-btn-secondary',
    ghost: 'bg-transparent text-ink hover:bg-ink/5 shadow-none',
    danger: 'bg-rose text-paper hover:opacity-90',
    success: 'bg-ink text-volt hover:bg-charcoal',
  }[variant];

  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={`vyro-btn ${sizeClasses} ${variantClasses} disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none ${className}`}
    >
      {loading ? (
        <svg className="animate-spin h-4 w-4 text-current" fill="none" viewBox="0 0 24 24" aria-hidden>
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      ) : icon ? (
        <span className="vyro-btn-icon shrink-0">{icon}</span>
      ) : null}
      {children}
      {variant === 'primary' && !loading && (
        <ArrowRightIcon size={15} className="vyro-btn-arrow shrink-0" />
      )}
    </button>
  );
}

export function GhostButton({ className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { children?: ReactNode }) {
  return <Button variant="outline" className={className} {...rest} />;
}

export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full h-11 bg-paper px-3.5 text-sm text-ink placeholder:text-ink-4 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.16)] transition-shadow duration-200 focus:outline-none focus:shadow-[inset_0_0_0_1px_#0C0E0B,0_0_0_3px_rgba(198,220,74,0.35)] disabled:cursor-not-allowed disabled:bg-bone disabled:text-ink-4 ${className}`}
    />
  );
}

export function Textarea({ className = '', ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full bg-paper px-3.5 py-3 text-sm text-ink placeholder:text-ink-4 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.16)] transition-shadow duration-200 focus:outline-none focus:shadow-[inset_0_0_0_1px_#0C0E0B,0_0_0_3px_rgba(198,220,74,0.35)] disabled:cursor-not-allowed disabled:bg-bone ${className}`}
    />
  );
}

export function Select({ className = '', children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { children?: ReactNode }) {
  return (
    <div className="relative w-full">
      <select
        {...props}
        className={`w-full appearance-none h-11 bg-paper px-3.5 pr-9 text-sm text-ink shadow-[inset_0_0_0_1px_rgba(12,14,11,0.16)] focus:outline-none focus:shadow-[inset_0_0_0_1px_#0C0E0B,0_0_0_3px_rgba(198,220,74,0.35)] ${className}`}
      >
        {children}
      </select>
      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-ink-4">
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M6 9l6 6 6-6" />
        </svg>
      </div>
    </div>
  );
}

export function Label({ children, htmlFor, className = '' }: { children: ReactNode; htmlFor?: string; className?: string }) {
  return (
    <label htmlFor={htmlFor} className={`block text-[11px] font-semibold text-ink-3 tracking-[0.14em] uppercase mb-1.5 ${className}`}>
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
      className={`vyro-surface p-5 ${hoverEffect ? 'transition-transform duration-240 ease-vyro hover:-translate-y-0.5 hover:shadow-2' : ''} ${className}`}
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
    neutral: 'bg-mist text-ink-3',
    brand: 'bg-volt/20 text-ink',
    success: 'bg-mint/15 text-mint',
    warning: 'bg-amber/15 text-amber',
    danger: 'bg-rose/15 text-rose',
    purple: 'bg-copper/15 text-copper-deep',
  }[variant];

  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-semibold tracking-[0.12em] uppercase ${styles} ${className}`}>
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase().replace(/_/g, ' ');
  let variant: 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'purple' = 'neutral';
  let dotColor = 'bg-ink-4';

  switch (status.toLowerCase()) {
    case 'pending':
      variant = 'warning';
      dotColor = 'bg-amber';
      break;
    case 'accepted':
    case 'confirmed':
    case 'preparing':
      variant = 'brand';
      dotColor = 'bg-volt-deep';
      break;
    case 'in_transit':
    case 'shipped':
      variant = 'purple';
      dotColor = 'bg-copper';
      break;
    case 'delivered':
    case 'completed':
      variant = 'success';
      dotColor = 'bg-mint';
      break;
    case 'cancelled':
    case 'rejected':
      variant = 'danger';
      dotColor = 'bg-rose';
      break;
    case 'disputed':
      variant = 'danger';
      dotColor = 'bg-rose animate-pulse';
      break;
  }

  return (
    <Badge variant={variant} className="capitalize tracking-normal normal-case">
      <span className={`w-1.5 h-1.5 rotate-45 ${dotColor}`} />
      {normalized}
    </Badge>
  );
}

export function ErrorBanner({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div className="flex items-start gap-3 bg-rose/10 text-rose text-sm p-4 animate-fade-in">
      <AlertCircleIcon size={18} className="shrink-0 mt-0.5" />
      <div className="font-medium">{message}</div>
    </div>
  );
}

export function SuccessBanner({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div className="flex items-start gap-3 bg-mint/10 text-mint text-sm p-4 animate-fade-in">
      <CheckCircleIcon size={18} className="shrink-0 mt-0.5" />
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
    <div className="relative text-center py-16 px-6 my-4 overflow-hidden vyro-surface">
      <div className="absolute inset-x-0 top-0 opacity-70">
        <FlowCanvas density="dense" />
      </div>
      <div className="relative">
        {icon && <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center bg-ink text-volt">{icon}</div>}
        <h3 className="vyro-display text-2xl text-ink">{title}</h3>
        {description && <p className="mt-2 text-sm text-ink-4 max-w-sm mx-auto">{description}</p>}
        {action && <div className="mt-6">{action}</div>}
      </div>
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
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-8 mb-8 border-b border-ink/10">
      <div>
        {badge && <div className="mb-3">{badge}</div>}
        <h1 className="vyro-display text-3xl sm:text-4xl text-ink">{title}</h1>
        {description && <p className="mt-2 text-sm text-ink-4 max-w-xl">{description}</p>}
      </div>
      {action && <div className="flex items-center gap-3 shrink-0">{action}</div>}
    </div>
  );
}

export { Sparkline, BarChart, ProgressRing, StatTile, TimeSeries } from '@vyro/ui';
