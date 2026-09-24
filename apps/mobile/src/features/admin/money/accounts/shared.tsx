/**
 * Shared pieces for the admin Accounts / Finance / Transaction screens —
 * the mobile twin of apps/web/src/accounts/shared.tsx plus money helpers.
 */
import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useInfiniteQuery, useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { LucideIcon } from 'lucide-react-native';
import { api, ApiError, errorMessage } from '@/lib/api';
import { humanize } from '@/lib/format';
import { colors } from '@/theme/tokens';
import type { Tone } from '@/theme/tokens';
import { Badge, Button, Card, EmptyState, ErrorState, SkeletonList, Text, useToast, type ButtonVariant } from '@/ui';
import { MoneyText, ToneRule, type FlowTone } from '@/features/admin/platform/kit';

/* --------------------------------- Status --------------------------------- */

/** Same buckets as the web's StatusPill (amber / violet / mint / rose / ink / copper). */
const PILL_TONE: Record<string, Tone> = {
  pending: 'warning',
  pending_verification: 'warning',
  proof_submitted: 'warning',
  correction_requested: 'warning',
  processing: 'volt',
  authorized: 'volt',
  approved: 'volt',
  confirmed: 'success',
  paid: 'success',
  completed: 'success',
  verified: 'success',
  matched: 'success',
  reconciled: 'success',
  resolved: 'success',
  applied: 'success',
  failed: 'danger',
  rejected: 'danger',
  cancelled: 'neutral',
  expired: 'neutral',
  chargeback: 'danger',
  refunded: 'copper',
  partially_refunded: 'copper',
  eligible: 'success',
  settled: 'copper',
  held: 'warning',
  ineligible: 'neutral',
  open: 'warning',
  partial: 'warning',
  collected: 'success',
  unreconciled: 'warning',
  requested: 'warning',
  exception: 'danger',
  under_collected: 'danger',
  over_collected: 'warning',
  missing: 'danger',
  disputed: 'danger',
  critical: 'danger',
  warning: 'warning',
  info: 'info',
  active: 'success',
  inactive: 'neutral',
};

export function acctTone(status?: string | null): Tone {
  return PILL_TONE[(status ?? '').toLowerCase()] ?? 'neutral';
}

export function AcctStatus({ status, size = 'sm' }: { status?: string | null; size?: 'sm' | 'md' }) {
  return <Badge label={humanize(status ?? 'unknown')} tone={acctTone(status)} dot size={size} />;
}

/** Money direction implied by a payment status. */
export function paymentFlow(status?: string | null): FlowTone {
  const s = (status ?? '').toLowerCase();
  if (['confirmed', 'paid', 'completed', 'captured'].includes(s)) return 'in';
  if (['refunded', 'partially_refunded', 'chargeback'].includes(s)) return 'out';
  if (['failed', 'cancelled', 'expired'].includes(s)) return 'warn';
  return 'neutral';
}

/* ------------------------------- Mutations -------------------------------- */

/** Client idempotency key (Hermes has no crypto.randomUUID). */
export function idemKey(): string {
  const r = () => Math.random().toString(36).slice(2, 10);
  return `${Date.now().toString(36)}-${r()}-${r()}`;
}

/** `CODE: message` like the web's toast copy. */
export function actionError(e: unknown): string {
  if (e instanceof ApiError) return `${e.code}: ${e.message}`;
  return errorMessage(e, 'Action failed');
}

/**
 * Mutation that toasts success/error and invalidates the affected keys —
 * the mobile version of the web's `useRefresh(keys)` helper.
 */
export function useMoneyMutation<V, R = unknown>({
  fn,
  invalidate,
  success,
  onDone,
}: {
  fn: (v: V) => Promise<R>;
  invalidate: QueryKey[];
  success: string | ((r: R, v: V) => string);
  onDone?: (r: R, v: V) => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: fn,
    onSuccess: (r, v) => {
      toast.success(typeof success === 'function' ? success(r, v) : success);
      for (const k of invalidate) void qc.invalidateQueries({ queryKey: k });
      onDone?.(r, v);
    },
    onError: (e) => toast.error('Action failed', actionError(e)),
  });
}

/* ---------------------------- Cursor pagination ---------------------------- */

/**
 * Infinite list over the finance endpoints. Most return `{ nextCursor }`;
 * the rest page on the last row's `createdAt` when a full page came back.
 */
export function useCursorList<R, T extends { createdAt?: number | null }>({
  key,
  path,
  pick,
  next,
  limit = 50,
  enabled = true,
}: {
  key: QueryKey;
  path: (cursor: number | undefined) => string;
  pick: (res: R) => T[] | undefined;
  next?: (res: R) => number | null | undefined;
  limit?: number;
  enabled?: boolean;
}) {
  const q = useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam }) => api.get<R>(path(pageParam)),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (last: R) => {
      if (next) return next(last) ?? undefined;
      const items = pick(last) ?? [];
      return items.length >= limit ? (items[items.length - 1]?.createdAt ?? undefined) : undefined;
    },
    enabled,
  });
  const items: T[] = q.data?.pages.flatMap((p) => pick(p) ?? []) ?? [];
  return { q, items };
}

/** Loading / error / empty wrapper for plain arrays (infinite lists). */
export function ListState({
  loading,
  error,
  onRetry,
  empty,
  emptyTitle,
  emptyMessage,
  emptyIcon,
  children,
}: {
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  empty: boolean;
  emptyTitle: string;
  emptyMessage?: string;
  emptyIcon?: LucideIcon;
  children: ReactNode;
}) {
  if (loading) return <SkeletonList rows={4} height={96} />;
  if (error) return <ErrorState message={errorMessage(error)} onRetry={onRetry} />;
  if (empty) return <EmptyState title={emptyTitle} message={emptyMessage} icon={emptyIcon} />;
  return <>{children}</>;
}

/* ---------------------------------- Files ---------------------------------- */

function safeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'file';
}

/**
 * Stream an authenticated API file (CSV export, transfer proof) through the
 * session-aware client into the cache and open the OS share sheet.
 */
export async function shareApiFile(path: string, fileName: string, mimeType = 'application/octet-stream') {
  const res = await api.raw(path.replace(/^\/api(?=\/)/, ''));
  const buf = new Uint8Array(await res.arrayBuffer());
  const file = new File(Paths.cache, safeName(fileName));
  if (file.exists) file.delete();
  file.create();
  file.write(buf);
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
  await Sharing.shareAsync(file.uri, { mimeType: res.headers.get('content-type') ?? mimeType, dialogTitle: fileName });
}

/** Button that downloads an authenticated file and hands it to the share sheet. */
export function ExportButton({
  title,
  path,
  fileName,
  mimeType = 'text/csv',
  icon,
  variant = 'secondary',
  full,
  size = 'sm',
}: {
  title: string;
  path: string;
  fileName: string;
  mimeType?: string;
  icon?: LucideIcon;
  variant?: ButtonVariant;
  full?: boolean;
  size?: 'sm' | 'md';
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      title={title}
      icon={icon}
      variant={variant}
      size={size}
      full={full}
      loading={busy}
      onPress={async () => {
        setBusy(true);
        try {
          await shareApiFile(path, fileName, mimeType);
        } catch (e) {
          toast.error('Export failed', actionError(e));
        } finally {
          setBusy(false);
        }
      }}
    />
  );
}

/* ---------------------------------- Cards ---------------------------------- */

/**
 * One money record: tone rule on the left, mono amount on the right,
 * badges and actions underneath. Used by every accounts queue.
 */
export function EntryCard({
  title,
  subtitle,
  meta,
  cents,
  tone = 'neutral',
  signed,
  badges,
  actions,
  onPress,
  children,
}: {
  title: string;
  subtitle?: string;
  meta?: string;
  cents?: number | null;
  tone?: FlowTone;
  signed?: boolean;
  badges?: ReactNode;
  actions?: ReactNode;
  onPress?: () => void;
  children?: ReactNode;
}) {
  return (
    <Card kind="flat" padding={16} onPress={onPress} style={{ paddingLeft: 20, gap: 12 }}>
      <ToneRule tone={tone} />
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <View style={{ flex: 1, gap: 3 }}>
          <Text variant="h3" numberOfLines={1} style={{ letterSpacing: -0.2 }}>
            {title}
          </Text>
          {subtitle ? (
            <Text variant="bodySm" color="ink4" numberOfLines={2}>
              {subtitle}
            </Text>
          ) : null}
          {meta ? (
            <Text variant="caption" color="ink5" numberOfLines={1}>
              {meta}
            </Text>
          ) : null}
        </View>
        {cents !== undefined ? (
          cents === null ? (
            <Text variant="mono" color="ink5">
              —
            </Text>
          ) : (
            <View style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, borderCurve: 'continuous', backgroundColor: colors.pearl, maxWidth: 170 }}>
              <MoneyText cents={cents} tone={tone} signed={signed} />
            </View>
          )
        ) : null}
      </View>
      {badges ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{badges}</View> : null}
      {children}
      {actions ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 }}>{actions}</View> : null}
    </Card>
  );
}

/** Small label/money pair used inside cards and sheets. */
export function MoneyPair({ label, cents, tone = 'neutral' }: { label: string; cents: number | null | undefined; tone?: FlowTone }) {
  return (
    <View style={{ flex: 1, minWidth: 90, gap: 2 }}>
      <Text variant="overline" color="ink5">
        {label}
      </Text>
      {cents === null || cents === undefined ? (
        <Text variant="mono" color="ink5">
          —
        </Text>
      ) : (
        <MoneyText cents={cents} tone={tone} size="sm" />
      )}
    </View>
  );
}

export function PairRow({ children }: { children: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: colors.lineSoft }}>
      {children}
    </View>
  );
}

/** Loaded-count + sum strip above a list. */
export function ListSummary({ count, cents, label = 'shown', more }: { count: number; cents?: number; label?: string; more?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 4 }}>
      <Text variant="overline" color="ink4">
        {count}
        {more ? '+' : ''} {label}
      </Text>
      {cents !== undefined ? <MoneyText cents={cents} size="sm" compact /> : null}
    </View>
  );
}
