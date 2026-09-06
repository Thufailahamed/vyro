import type { ReactNode } from 'react';
import { Button, EmptyState, ErrorBanner } from '@/components/ui';

export function SupplierLoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="space-y-4 animate-pulse" aria-busy="true" aria-label={label}>
      <div className="h-10 w-48 bg-mist" />
      <div className="h-4 w-72 bg-mist/80" />
      <div className="h-40 bg-mist/60 border border-ink/5" />
      <div className="grid sm:grid-cols-3 gap-3">
        <div className="h-24 bg-mist/50" />
        <div className="h-24 bg-mist/50" />
        <div className="h-24 bg-mist/50" />
      </div>
    </div>
  );
}

export function SupplierErrorState({
  message,
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="space-y-4">
      <ErrorBanner message={message ?? 'Something went wrong loading this page.'} />
      {onRetry ? (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Retry
        </Button>
      ) : null}
    </div>
  );
}

export function SupplierEmptyState({
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
    <EmptyState
      title={title}
      {...(icon !== undefined ? { icon } : {})}
      {...(description !== undefined ? { description } : {})}
      {...(action !== undefined ? { action } : {})}
    />
  );
}
