import { type ReactNode } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import type { LucideIcon } from 'lucide-react-native';
import { errorMessage } from '@/lib/api';
import { EmptyState, ErrorState, SkeletonList } from './Feedback';

/**
 * Renders loading / error / empty / data states for a react-query result so
 * every screen handles them the same way.
 *
 *   <QueryView query={q} empty={(d) => !d.items.length} emptyTitle="No orders yet">
 *     {(d) => d.items.map(...)}
 *   </QueryView>
 */
export function QueryView<T>({
  query,
  children,
  empty,
  emptyTitle = 'Nothing here yet',
  emptyMessage,
  emptyIcon,
  emptyAction,
  loading,
}: {
  query: UseQueryResult<T>;
  children: (data: T) => ReactNode;
  empty?: (data: T) => boolean;
  emptyTitle?: string;
  emptyMessage?: string;
  emptyIcon?: LucideIcon;
  emptyAction?: { label: string; onPress: () => void };
  loading?: ReactNode;
}) {
  if (query.isLoading) return <>{loading ?? <SkeletonList />}</>;
  if (query.isError) return <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />;
  const data = query.data as T;
  if (data === undefined || data === null || (empty && empty(data))) {
    return <EmptyState title={emptyTitle} message={emptyMessage} icon={emptyIcon} action={emptyAction} />;
  }
  return <>{children(data)}</>;
}
