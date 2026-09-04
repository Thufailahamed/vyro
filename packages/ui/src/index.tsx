// ============================================
// VYRO UI — Primitive Library
// Cinematic Tech design system
// ============================================

import { forwardRef } from 'react';
import type { ComponentPropsWithoutRef, ReactNode, ElementType, Ref } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as SelectPrimitive from '@radix-ui/react-select';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2, X as XIcon } from 'lucide-react';
import { cn } from './lib/cn';

// ============================================
// BUTTON
// ============================================
const buttonVariants = cva(
          'inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper focus-visible:ring-offset-2 focus-visible:ring-offset-paper rounded-xs',
  {
    variants: {
      variant: {
        primary: 'bg-ink-1 text-paper hover:bg-ink-2 active:scale-[0.99]',
        accent: 'bg-volt text-ink-1 hover:bg-volt-glow active:scale-[0.99]',
        outline: 'border border-line bg-paper text-ink-1 hover:border-ink-3 hover:bg-pearl active:scale-[0.98]',
        ghost: 'text-ink-1 hover:bg-ink-7 active:scale-[0.98]',
        danger: 'bg-rose text-paper hover:opacity-90 active:scale-[0.98]',
        link: 'text-cyan-deep underline-offset-4 hover:underline px-0 h-auto',
        subtle: 'bg-ink-7 text-ink-1 hover:bg-ink-6 active:scale-[0.98]',
      },
      size: {
        sm: 'h-8 px-3 text-body-sm rounded-sm',
        md: 'h-9 px-4 text-body rounded-sm',
        lg: 'h-11 px-5 text-body-lg rounded-md',
        xl: 'h-12 px-6 text-body-lg rounded-md',
        icon: 'size-9 rounded-sm',
        'icon-sm': 'size-8 rounded-sm',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  }
);

export interface ButtonProps
  extends ComponentPropsWithoutRef<'button'>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
  leftSlot?: ReactNode;
  rightSlot?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild, loading, leftSlot, rightSlot, children, disabled, ...props }, ref) => {
    const Comp = (asChild ? Slot : 'button') as ElementType;
    return (
      <Comp
        ref={ref as Ref<HTMLButtonElement>}
        className={cn(buttonVariants({ variant, size, className }))}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? <Loader2 className="size-4 animate-spin" /> : leftSlot}
        {children}
        {!loading && rightSlot}
      </Comp>
    );
  }
);
Button.displayName = 'Button';

// ============================================
// INPUT
// ============================================
const inputVariants = cva(
        'flex w-full rounded-xs border bg-paper text-ink-1 placeholder:text-ink-4 transition-colors duration-200 focus-visible:outline-none focus-visible:border-ink-1 focus-visible:ring-2 focus-visible:ring-volt/40 disabled:opacity-50 disabled:cursor-not-allowed',
  {
    variants: {
      size: { sm: 'h-8 px-2.5 text-body-sm', md: 'h-9 px-3 text-body', lg: 'h-11 px-4 text-body-lg' },
      state: { default: 'border-line', error: 'border-rose' },
    },
    defaultVariants: { size: 'md', state: 'default' },
  }
);

export interface InputProps extends Omit<ComponentPropsWithoutRef<'input'>, 'size'> {
  inputSize?: 'sm' | 'md' | 'lg';
  error?: boolean;
  leftSlot?: ReactNode;
  rightSlot?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, inputSize = 'md', error, leftSlot, rightSlot, ...props }, ref) => (
    <div className="relative flex w-full items-center">
      {leftSlot && <span className="absolute left-3 text-ink-3 pointer-events-none flex">{leftSlot}</span>}
      <input
        ref={ref}
        className={cn(
          inputVariants({ size: inputSize, state: error ? 'error' : 'default' }),
          leftSlot && 'pl-9',
          rightSlot && 'pr-9',
          className
        )}
        {...props}
      />
      {rightSlot && <span className="absolute right-3 text-ink-3 flex">{rightSlot}</span>}
    </div>
  )
);
Input.displayName = 'Input';

// ============================================
// TEXTAREA
// ============================================
export interface TextareaProps extends ComponentPropsWithoutRef<'textarea'> {
  error?: boolean;
}
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, error, rows = 4, ...props }, ref) => (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(
        'flex w-full rounded-md border bg-paper px-3 py-2 text-body text-ink-1 placeholder:text-ink-4 transition-colors duration-140 focus-visible:outline-none focus-visible:border-cyan-deep focus-visible:ring-2 focus-visible:ring-cyan/30 disabled:opacity-50 resize-y',
        error ? 'border-rose' : 'border-line',
        className
      )}
      {...props}
    />
  )
);
Textarea.displayName = 'Textarea';

// ============================================
// LABEL / FIELD
// ============================================
export const Field = ({
  label,
  htmlFor,
  required,
  hint,
  error,
  children,
  className,
}: {
  label: ReactNode;
  htmlFor?: string;
  required?: boolean;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  className?: string;
}) => (
  <div className={cn('flex flex-col gap-1.5', className)}>
    <label htmlFor={htmlFor} className="text-body-sm font-medium text-ink-2 flex items-center gap-1">
      {label}
      {required && <span className="text-rose">*</span>}
    </label>
    {children}
    {error ? (
      <p className="text-caption text-rose">{error}</p>
    ) : hint ? (
      <p className="text-caption text-ink-3">{hint}</p>
    ) : null}
  </div>
);

// ============================================
// CARD
// ============================================
const cardVariants = cva('rounded-lg border bg-paper transition-all duration-200', {
  variants: {
    variant: {
      default: 'border-line shadow-1',
      flat: 'border-line',
      elevated: 'border-line shadow-3',
      interactive: 'border-line cursor-pointer hover:border-ink-3 hover:shadow-3 hover:-translate-y-0.5',
      dark: 'border-midnight-3 bg-midnight-2 text-paper shadow-3',
    },
    padding: { none: 'p-0', sm: 'p-4', md: 'p-6', lg: 'p-8' },
  },
  defaultVariants: { variant: 'default', padding: 'md' },
});

export interface CardProps extends ComponentPropsWithoutRef<'div'>, VariantProps<typeof cardVariants> {}
export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant, padding, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(cardVariants({ variant, padding }), className)}
      {...props}
    />
  )
);
Card.displayName = 'Card';

export interface SectionCardProps extends ComponentPropsWithoutRef<'div'> {
  tone?: 'light' | 'dark';
  className?: string;
}
export const SectionCard = forwardRef<HTMLDivElement, SectionCardProps>(
  ({ tone = 'light', className, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'rounded-lg border p-6',
        tone === 'dark'
          ? 'bg-midnight-2 text-paper border-midnight-3'
          : 'bg-paper text-ink-1 border-line',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
);
SectionCard.displayName = 'SectionCard';

// ============================================
// BADGE
// ============================================
const badgeVariants = cva(
  'inline-flex items-center gap-1 px-2 py-0.5 rounded-xs text-caption font-medium transition-colors',
  {
    variants: {
      variant: {
        neutral: 'bg-ink-7 text-ink-2',
        brand: 'bg-cyan/15 text-cyan-deep',
        success: 'bg-mint/15 text-mint',
        warning: 'bg-amber/15 text-amber',
        danger: 'bg-rose/15 text-rose',
        violet: 'bg-violet/15 text-violet',
        outline: 'border border-line bg-transparent text-ink-2',
      },
    },
    defaultVariants: { variant: 'neutral' },
  }
);

export interface BadgeProps
  extends ComponentPropsWithoutRef<'span'>,
    VariantProps<typeof badgeVariants> {}
export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant, ...props }, ref) => (
    <span ref={ref} className={cn(badgeVariants({ variant }), className)} {...props} />
  )
);
Badge.displayName = 'Badge';

// ============================================
// STATUS BADGE (Order status)
// ============================================
export type OrderStatus =
  | 'draft'
  | 'pending'
  | 'preparing'
  | 'in_transit'
  | 'delivered'
  | 'completed'
  | 'cancelled'
  | 'disputed'
  | 'returning'
  | 'returned'
  | 'refunded'
  | 'paid'
  | 'unpaid';

const statusMap: Record<OrderStatus, { variant: VariantProps<typeof badgeVariants>['variant']; label: string }> = {
  draft: { variant: 'neutral', label: 'Draft' },
  pending: { variant: 'warning', label: 'Pending' },
  preparing: { variant: 'brand', label: 'Preparing' },
  in_transit: { variant: 'brand', label: 'In transit' },
  delivered: { variant: 'success', label: 'Delivered' },
  completed: { variant: 'success', label: 'Completed' },
  cancelled: { variant: 'neutral', label: 'Cancelled' },
  disputed: { variant: 'danger', label: 'Disputed' },
  returning: { variant: 'warning', label: 'Returning' },
  returned: { variant: 'warning', label: 'Returned' },
  refunded: { variant: 'warning', label: 'Refunded' },
  paid: { variant: 'success', label: 'Paid' },
  unpaid: { variant: 'neutral', label: 'Unpaid' },
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  const s = statusMap[status];
  return <Badge variant={s.variant}>{s.label}</Badge>;
}

// ============================================
// CHIP
// ============================================
const chipVariants = cva(
  'inline-flex items-center gap-1.5 px-3 h-8 rounded-full text-body-sm font-medium cursor-pointer transition-colors duration-140 border',
  {
    variants: {
      selected: { true: 'bg-ink-1 text-paper border-ink-1', false: 'bg-paper text-ink-2 border-line hover:border-ink-3' },
    },
    defaultVariants: { selected: false },
  }
);
export interface ChipProps extends ComponentPropsWithoutRef<'button'> {
  selected?: boolean;
}
export const Chip = forwardRef<HTMLButtonElement, ChipProps>(
  ({ className, selected, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      className={cn(chipVariants({ selected: !!selected }), className)}
      {...props}
    />
  )
);
Chip.displayName = 'Chip';

// ============================================
// AVATAR
// ============================================
const avatarSizes = {
  xs: 'size-6 text-caption',
  sm: 'size-8 text-body-sm',
  md: 'size-10 text-body',
  lg: 'size-12 text-body-lg',
};

export interface AvatarProps extends ComponentPropsWithoutRef<'div'> {
  name: string;
  size?: keyof typeof avatarSizes;
  tone?: 'auto' | 'light' | 'dark';
}
function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0]!.toUpperCase())
    .slice(0, 2)
    .join('');
}
export function Avatar({ name, size = 'md', className, ...props }: AvatarProps) {
  const palette = ['bg-ink-2', 'bg-cyan-deep', 'bg-mint', 'bg-violet', 'bg-amber'];
  const idx = name.charCodeAt(0) % palette.length;
  return (
    <div
      className={cn(
        'inline-flex items-center justify-center rounded-full text-paper font-semibold shrink-0',
        avatarSizes[size],
        palette[idx],
        className
      )}
      aria-label={name}
      {...props}
    >
      {initials(name) || '?'}
    </div>
  );
}

// ============================================
// DIALOG (Modal)
// ============================================
export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export const DialogPortal = DialogPrimitive.Portal;

export const DialogOverlay = forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-50 bg-midnight-1/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      className
    )}
    {...props}
  />
));
DialogOverlay.displayName = 'DialogOverlay';

export const DialogContent = forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { title?: string; description?: string }
>(({ className, children, title, description, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        'fixed left-1/2 top-1/2 z-50 grid w-full max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border border-line bg-paper p-6 shadow-5 focus:outline-none',
        className
      )}
      {...props}
    >
      {title && <DialogPrimitive.Title className="text-h2 font-semibold text-ink-1">{title}</DialogPrimitive.Title>}
      {description && <DialogPrimitive.Description className="text-body-sm text-ink-3">{description}</DialogPrimitive.Description>}
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 inline-flex size-7 items-center justify-center rounded-sm text-ink-3 hover:bg-ink-7 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan">
        <XIcon className="size-4" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContent.displayName = 'DialogContent';

export const DialogTitle = DialogPrimitive.Title;
export const DialogDescription = DialogPrimitive.Description;

// ============================================
// DRAWER (slide-in side panel)
// ============================================
export interface DrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}
export function Drawer({ open, onOpenChange, children }: DrawerProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      {children}
    </DialogPrimitive.Root>
  );
}
export const DrawerTrigger = DialogPrimitive.Trigger;
export const DrawerClose = DialogPrimitive.Close;

export interface DrawerContentProps
  extends Omit<ComponentPropsWithoutRef<typeof DialogPrimitive.Content>, 'title'> {
  title?: string;
  description?: string;
  side?: 'right' | 'left';
}
export const DrawerContent = forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  DrawerContentProps
>(({ className, children, title, description, side = 'right', ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        'fixed z-50 top-0 bottom-0 w-full max-w-md bg-paper shadow-5 focus:outline-none flex flex-col',
        side === 'right' ? 'right-0 border-l border-line' : 'left-0 border-r border-line',
        className
      )}
      {...props}
    >
      {(title || description) && (
        <header className="flex items-start justify-between border-b border-line-soft px-6 py-4">
          <div>
            {title && <DialogPrimitive.Title className="text-h2 font-semibold text-ink-1">{title}</DialogPrimitive.Title>}
            {description && <DialogPrimitive.Description className="mt-1 text-body-sm text-ink-3">{description}</DialogPrimitive.Description>}
          </div>
          <DialogPrimitive.Close className="inline-flex size-7 items-center justify-center rounded-sm text-ink-3 hover:bg-ink-7">
            <XIcon className="size-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        </header>
      )}
      <div className="flex-1 overflow-y-auto px-6 py-4">{children}</div>
    </DialogPrimitive.Content>
  </DialogPortal>
));
DrawerContent.displayName = 'DrawerContent';

// ============================================
// TABS
// ============================================
export const Tabs = TabsPrimitive.Root;
export const TabsList = forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn('inline-flex items-center gap-1 border-b border-line', className)}
    {...props}
  />
));
TabsList.displayName = 'TabsList';

export const TabsTrigger = forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      'inline-flex items-center justify-center whitespace-nowrap px-4 h-10 text-body-sm font-medium text-ink-3 border-b-2 border-transparent transition-colors hover:text-ink-1 data-[state=active]:text-ink-1 data-[state=active]:border-cyan-deep focus-visible:outline-none focus-visible:text-ink-1',
      className
    )}
    {...props}
  />
));
TabsTrigger.displayName = 'TabsTrigger';

export const TabsContent = forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn('mt-4 focus-visible:outline-none animate-fade-in', className)}
    {...props}
  />
));
TabsContent.displayName = 'TabsContent';

// ============================================
// SELECT
// ============================================
export const Select = SelectPrimitive.Root;
export const SelectValue = SelectPrimitive.Value;
export const SelectGroup = SelectPrimitive.Group;

export const SelectTrigger = forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn(
      'flex h-9 w-full items-center justify-between rounded-md border border-line bg-paper px-3 py-2 text-body text-ink-1 placeholder:text-ink-4 focus-visible:outline-none focus-visible:border-cyan-deep focus-visible:ring-2 focus-visible:ring-cyan/30 disabled:opacity-50 [&>span]:line-clamp-1',
      className
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="opacity-60"><path d="M3 5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
));
SelectTrigger.displayName = 'SelectTrigger';

export const SelectContent = forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = 'popper', ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      className={cn(
        'relative z-50 max-h-96 min-w-[8rem] overflow-hidden rounded-md border border-line bg-paper shadow-4 text-ink-1',
        position === 'popper' && 'data-[side=bottom]:translate-y-1 data-[side=top]:-translate-y-1',
        className
      )}
      position={position}
      {...props}
    >
      <SelectPrimitive.Viewport className="p-1">{children}</SelectPrimitive.Viewport>
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
));
SelectContent.displayName = 'SelectContent';

export const SelectItem = forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      'relative flex w-full cursor-pointer select-none items-center rounded-xs py-1.5 pl-7 pr-2 text-body outline-none focus:bg-ink-7 data-[disabled]:opacity-50 data-[disabled]:pointer-events-none',
      className
    )}
    {...props}
  >
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </SelectPrimitive.ItemIndicator>
    </span>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
));
SelectItem.displayName = 'SelectItem';

// ============================================
// SWITCH
// ============================================
export interface SwitchProps extends Omit<ComponentPropsWithoutRef<'button'>, 'onChange'> {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}
export const Switch = forwardRef<HTMLButtonElement, SwitchProps>(
  ({ className, checked, defaultChecked, onCheckedChange, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      role="switch"
      aria-checked={checked}
      data-state={checked ? 'checked' : 'unchecked'}
      onClick={() => onCheckedChange?.(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-paper disabled:opacity-50',
        checked ? 'bg-ink-1' : 'bg-ink-5',
        className
      )}
      {...(defaultChecked ? { defaultChecked } : {})}
      {...props}
    >
      <span
        data-state={checked ? 'checked' : 'unchecked'}
        className={cn(
          'pointer-events-none block size-5 rounded-full bg-paper shadow-1 transition-transform duration-200',
          checked ? 'translate-x-5' : 'translate-x-0'
        )}
      />
    </button>
  )
);
Switch.displayName = 'Switch';

// ============================================
// CHECKBOX
// ============================================
export interface CheckboxProps extends Omit<ComponentPropsWithoutRef<'button'>, 'onChange'> {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}
export const Checkbox = forwardRef<HTMLButtonElement, CheckboxProps>(
  ({ className, checked, defaultChecked, onCheckedChange, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      role="checkbox"
      aria-checked={checked}
      data-state={checked ? 'checked' : 'unchecked'}
      onClick={() => onCheckedChange?.(!checked)}
      className={cn(
        'peer size-4 shrink-0 rounded-xs border border-ink-3 bg-paper transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan focus-visible:ring-offset-2 disabled:opacity-50',
        checked && 'bg-ink-1 border-ink-1',
        className
      )}
      {...(defaultChecked ? { defaultChecked } : {})}
      {...props}
    >
      {checked && (
        <svg viewBox="0 0 14 14" fill="none" className="size-full text-paper">
          <path d="M3 7l3 3 5-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  )
);
Checkbox.displayName = 'Checkbox';

// ============================================
// SKELETON
// ============================================
export function Skeleton({ className, size = 'text' }: { className?: string; size?: 'text' | 'card' }) {
  return (
    <div
      className={cn(
        'animate-shimmer bg-gradient-to-r from-ink-7 via-ink-6 to-ink-7 rounded-sm',
        size === 'card' ? 'h-40 w-full' : 'h-4 w-full',
        '[background-size:200%_100%]',
        className
      )}
      aria-hidden
    />
  );
}

// ============================================
// SPINNER
// ============================================
export function Spinner({ className, size = 16 }: { className?: string; size?: number }) {
  return (
    <Loader2
      className={cn('animate-spin text-ink-3', className)}
      style={{ width: size, height: size }}
      aria-label="Loading"
    />
  );
}

// ============================================
// EMPTY STATE
// ============================================
export interface EmptyStateProps {
  icon?: ElementType;
  title: string;
  description?: string;
  action?: ReactNode;
}
export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6 rounded-lg border border-dashed border-line bg-pearl">
      {Icon && (
        <div className="size-12 rounded-full bg-paper border border-line flex items-center justify-center mb-4">
          <Icon className="size-5 text-ink-3" />
        </div>
      )}
      <h3 className="text-h3 font-semibold text-ink-1">{title}</h3>
      {description && <p className="mt-1.5 text-body-sm text-ink-3 max-w-sm">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

// ============================================
// TABLE
// ============================================
export const Table = forwardRef<HTMLTableElement, ComponentPropsWithoutRef<'table'>>(
  ({ className, ...props }, ref) => (
    <div className="w-full overflow-x-auto">
      <table ref={ref} className={cn('w-full text-sm caption-bottom', className)} {...props} />
    </div>
  )
);
Table.displayName = 'Table';

export const THead = forwardRef<HTMLTableSectionElement, ComponentPropsWithoutRef<'thead'>>(
  ({ className, ...props }, ref) => (
    <thead ref={ref} className={cn('bg-pearl', className)} {...props} />
  )
);
THead.displayName = 'THead';

export const TBody = forwardRef<HTMLTableSectionElement, ComponentPropsWithoutRef<'tbody'>>(
  ({ className, ...props }, ref) => (
    <tbody ref={ref} className={className} {...props} />
  )
);
TBody.displayName = 'TBody';

export const TR = forwardRef<HTMLTableRowElement, ComponentPropsWithoutRef<'tr'>>(
  ({ className, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn(
        'border-b border-line-soft transition-colors duration-140 hover:bg-pearl/60 data-[state=selected]:bg-cyan/10',
        className
      )}
      {...props}
    />
  )
);
TR.displayName = 'TR';

export const TH = forwardRef<HTMLTableCellElement, ComponentPropsWithoutRef<'th'>>(
  ({ className, ...props }, ref) => (
    <th
      ref={ref}
      className={cn(
        'h-10 px-4 text-left align-middle text-caption font-semibold uppercase tracking-wider text-ink-3',
        className
      )}
      {...props}
    />
  )
);
TH.displayName = 'TH';

export const TD = forwardRef<HTMLTableCellElement, ComponentPropsWithoutRef<'td'>>(
  ({ className, ...props }, ref) => (
    <td ref={ref} className={cn('px-4 py-3 align-middle text-ink-2', className)} {...props} />
  )
);
TD.displayName = 'TD';

// ============================================
// TOOLTIP (via title + wrapper for now)
// ============================================
export interface TooltipProps {
  label: string;
  children: ReactNode;
}
export function Tooltip({ label, children }: TooltipProps) {
  return (
    <span className="relative group inline-flex">
      {children}
      <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 rounded-xs bg-ink-1 text-paper text-caption whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-140 z-50 shadow-3">
        {label}
      </span>
    </span>
  );
}

// ============================================
// DIVIDER
// ============================================
export function Divider({ className }: { className?: string }) {
  return <div role="separator" className={cn('h-px w-full bg-line-soft', className)} />;
}

// ============================================
// METRIC TILE
// ============================================
export interface MetricTileProps {
  label: string;
  value: string;
  delta?: { value: string; direction: 'up' | 'down' };
  sparkline?: number[];
}
export function MetricTile({ label, value, delta, sparkline }: MetricTileProps) {
  return (
    <Card padding="md" className="relative overflow-hidden">
      <div className="text-caption uppercase tracking-wider text-ink-3 font-medium">{label}</div>
      <div className="mt-2 text-display-sm text-ink-1 num-tabular">{value}</div>
      {delta && (
        <div className={cn('mt-1.5 text-body-sm font-medium num-tabular flex items-center gap-1', delta.direction === 'up' ? 'text-mint' : 'text-rose')}>
          <span>{delta.direction === 'up' ? '↑' : '↓'}</span>
          {delta.value}
        </div>
      )}
      {sparkline && sparkline.length > 1 && (
        <Sparkline
          data={sparkline}
          color={delta?.direction === 'down' ? '#E5526A' : '#5EE2FF'}
          fill={delta?.direction === 'down' ? 'rgba(229,82,106,0.10)' : 'rgba(94,226,255,0.10)'}
          height={32}
          className="absolute bottom-0 left-0 right-0 opacity-90"
        />
      )}
    </Card>
  );
}

// ============================================
// INLINE SPARKLINE (so MetricTile doesn't pull chart code in same file)
// ============================================
function Sparkline({ data, color = '#5EE2FF', fill, height = 32, className }: { data: number[]; color?: string; fill?: string; height?: number; className?: string }) {
  if (data.length < 2) return null;
  const width = 200;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const step = width / (data.length - 1);
  const points = data.map((v, i) => `${i * step},${height - ((v - min) / range) * height}`).join(' ');
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={cn('w-full', className)} preserveAspectRatio="none" aria-hidden>
      {fill && <polygon points={`0,${height} ${points} ${width},${height}`} fill={fill} />}
      <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ============================================
// ALERT / ALERTCIRCLE accent
// ============================================
export const AlertCircle = forwardRef<SVGSVGElement, ComponentPropsWithoutRef<'svg'>>(
  ({ className, ...props }, ref) => (
    <svg ref={ref} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cn('size-4', className)} {...props}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  )
);
AlertCircle.displayName = 'AlertCircle';

// ============================================
// EXPORTS
// ============================================
export { cn };
export type { VariantProps };
export { Logo } from './components/Logo';
export type { LogoProps } from './components/Logo';
export { ToastProvider, useToast } from './components/Toast';
export type { ToastItem } from './components/Toast';
export { Progress } from './components/Progress';
export type { ProgressProps } from './components/Progress';
export { Sparkline, BarChart, ProgressRing, StatTile, TimeSeries } from './components/Charts';
export { AuthProvider, useAuth, AdminAuthProvider, useAdminAuth, api } from './components/auth';
