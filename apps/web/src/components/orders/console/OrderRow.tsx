import { Link } from 'react-router-dom';
import { Badge, Button, StatusDots, type OrderStatus } from '@/components/ui';
import { PaymentStateBadge } from '@/components/orders/LifecycleUi';
import { Surface } from '@/components/brand/Surface';
import {
  ArrowRightIcon,
  CheckCircleIcon,
  ClockIcon,
  EyeIcon,
  MapPinIcon,
  XIcon,
} from '@/components/icons';
import { formatLKR } from '@/lib/format';
import { returnStateMeta } from '@/lib/orderLifecycle';
import { statusSpine, type ConsoleOrder } from './types';

export function OrderRow({
  order: o,
  index,
  busy,
  next,
  nextLabel,
  onAccept,
  onReject,
  onAdvance,
  onQuickView,
}: {
  order: ConsoleOrder;
  index: number;
  busy: boolean;
  next: string | null;
  nextLabel?: string | undefined;
  onAccept: () => void;
  onReject: () => void;
  onAdvance: () => void;
  onQuickView: () => void;
}) {
  const isPending = o.status === 'pending';
  const ret = returnStateMeta(o.returnState);

  return (
    <Surface
      kind="elevated"
      className={`group animate-fade-in transition-all duration-240 ease-vyro hover:-translate-y-0.5 hover:shadow-soft-lg ${
        isPending ? 'bg-amber/[0.045]' : ''
      }`}
      style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
    >
      {/* Status spine */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-[3px]"
        style={{ background: ret?.spine ?? statusSpine(o.status) }}
      />

      <div className="flex flex-col gap-4 p-5 pl-6 md:flex-row md:items-center">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className="vyro-metric text-[15px] font-bold tracking-tight text-ink transition-colors duration-200 ease-vyro group-hover:text-copper-deep">
              {o.poNumber}
            </span>
            {ret ? (
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${ret.pill}`}>
                <span className={`size-1.5 rotate-45 ${ret.dot}`} aria-hidden />
                {ret.label}
              </span>
            ) : (
              <StatusDots status={(o.status as OrderStatus) ?? 'pending'} />
            )}
            <PaymentStateBadge state={o.paymentState} />
            {isPending && (
              <Badge variant="warning" className="font-mono">
                <span className="size-1 animate-pulse rounded-full bg-amber" />
                Action Required
              </Badge>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-4">
            <span className="flex items-center gap-1.5 text-ink-3">
              <MapPinIcon size={12} className="text-copper" />
              {o.deliveryCity
                ? `${o.deliveryCity}${o.deliveryDistrict ? `, ${o.deliveryDistrict}` : ''}`
                : 'Commercial Dock Delivery'}
            </span>
            <span aria-hidden className="text-ink/20">
              /
            </span>
            <span className="flex items-center gap-1.5 font-mono text-[11px]">
              <ClockIcon size={12} />
              {new Date(o.createdAt).toLocaleString()}
            </span>
          </div>
        </div>

        <div className="shrink-0 text-left md:border-l md:border-line md:pl-5 md:text-right">
          <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-ink-4">Total Net</div>
          <div className="vyro-metric mt-0.5 text-lg font-bold text-ink">{formatLKR(o.totalCents)}</div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-line pt-3.5 md:border-t-0 md:pt-0">
          {isPending ? (
            <>
              <Button
                size="sm"
                variant="success"
                loading={busy}
                onClick={onAccept}
                className="gap-1.5"
                title="Accept all lines in full — open the order to accept partially"
              >
                <CheckCircleIcon size={14} />
                Accept PO
              </Button>
              <Button
                size="sm"
                variant="danger"
                disabled={busy}
                onClick={onReject}
                title="Reject purchase order"
                className="px-2.5"
              >
                <XIcon size={14} />
              </Button>
            </>
          ) : next ? (
            <Button size="sm" variant="primary" loading={busy} onClick={onAdvance}>
              {nextLabel ?? next}
            </Button>
          ) : null}

          <Button variant="secondary" size="sm" onClick={onQuickView} className="gap-1.5 text-xs">
            <EyeIcon size={13} />
            Quick View
          </Button>

          <Link to={`/supplier/orders/${o.id}`}>
            <Button variant="ghost" size="sm" className="gap-1 text-xs">
              View
              <ArrowRightIcon
                size={12}
                className="transition-transform duration-200 ease-vyro group-hover:translate-x-0.5"
              />
            </Button>
          </Link>
        </div>
      </div>
    </Surface>
  );
}
