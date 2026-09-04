import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button, Card, EmptyState } from '@/components/ui';
import { formatLKR } from '@/lib/format';
import { useAuth } from '@/lib/auth';
import {
  ShoppingCartIcon,
  StoreIcon,
  Trash2Icon,
  ArrowRightIcon,
  Building2Icon,
  PackageIcon,
  ShieldCheckIcon,
} from '@/components/icons';

interface CartItem {
  id: string;
  quantity: number;
  priceCents: number;
  lineTotalCents: number;
  product: { name: string };
  supplier: { name: string };
  offer: { minOrderQty: number };
}

const STEPS = ['Review Cart', 'Checkout & Notes', 'PO Confirmation'];

export function CartPage() {
  const { user } = useAuth();
  const businessId = user?.memberships?.[0]?.businessId;
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data, refetch, isLoading } = useQuery({
    queryKey: ['cart', businessId],
    queryFn: () =>
      api.get<{
        cart: { id: string };
        items: CartItem[];
        subtotalCents: number;
        supplierCount: number;
      }>(`/cart?businessId=${businessId}`),
    enabled: !!businessId,
  });

  if (!user || !businessId) {
    return (
      <div className="max-w-xl mx-auto py-12">
        <Card className="p-10 text-center space-y-4">
          <div className="h-12 w-12 rounded-2xl bg-sky-50 text-sky-700 flex items-center justify-center mx-auto">
            <Building2Icon size={24} />
          </div>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Business profile required</h2>
          <p className="text-sm text-slate-500 max-w-sm mx-auto">
            Sign in and set up your business profile to view your wholesale cart.
          </p>
          <div className="pt-2 flex justify-center gap-3">
            <Link to="/onboarding/business"><Button>Set up business</Button></Link>
            <Link to="/login"><Button variant="outline">Sign in</Button></Link>
          </div>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto py-4">
        <div className="h-8 w-48 bg-slate-200 rounded animate-pulse" />
        <div className="h-64 bg-slate-100 rounded-2xl animate-pulse border border-slate-200" />
      </div>
    );
  }

  async function remove(id: string) {
    setDeletingId(id);
    try {
      await api.del(`/cart/items/${id}`);
      await refetch();
    } finally {
      setDeletingId(null);
    }
  }

  const items = data?.items ?? [];
  const subtotal = data?.subtotalCents ?? 0;
  const supplierCount = data?.supplierCount ?? 0;

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* Stepper */}
      <ol className="flex items-center justify-center gap-2 text-xs font-medium">
        {STEPS.map((s, i) => (
          <li key={s} className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-2 px-3 h-7 rounded-full border transition-colors ${
                i === 0
                  ? 'bg-slate-950 text-white border-slate-950'
                  : 'bg-white text-slate-500 border-slate-200'
              }`}
            >
              <span
                className={`size-5 rounded-full inline-flex items-center justify-center text-[10px] font-bold ${
                  i === 0 ? 'bg-cyan text-slate-950' : 'bg-slate-100 text-slate-500'
                }`}
              >
                {i + 1}
              </span>
              {s}
            </span>
            {i < STEPS.length - 1 && <span className="h-px w-10 bg-slate-200" aria-hidden />}
          </li>
        ))}
      </ol>

      {/* Header */}
      <header>
        <Badge variant="brand">Cart</Badge>
        <h1 className="mt-2 text-3xl sm:text-4xl font-semibold tracking-tight text-slate-950 text-balance">
          Your wholesale cart
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Review items and quantities. On checkout we'll split this into {supplierCount > 0 ? supplierCount : 'one'} dedicated Purchase Order{supplierCount > 1 ? 's' : ''}.
        </p>
      </header>

      {items.length === 0 ? (
        <EmptyState
          icon={<ShoppingCartIcon size={28} />}
          title="Your cart is empty"
          description="Browse our catalog of verified manufacturers and distributors to add products."
          action={
            <Link to="/search">
              <Button>
                <PackageIcon size={16} /> Browse wholesale catalog
              </Button>
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-8 items-start">
          <div className="space-y-4">
            {/* Multi-supplier notice */}
            <div className="rounded-lg border-l-4 border-cyan bg-cyan/5 border border-cyan/30 p-4 text-sm text-slate-800 flex items-start gap-3">
              <span className="size-8 rounded-md bg-cyan text-slate-950 inline-flex items-center justify-center shrink-0">
                <StoreIcon size={16} />
              </span>
              <div>
                <strong className="font-semibold">Multi-supplier notice.</strong>{' '}
                Items in your cart originate from{' '}
                <strong className="font-semibold underline decoration-cyan-deep decoration-2 underline-offset-2">
                  {supplierCount} different supplier{supplierCount > 1 ? 's' : ''}
                </strong>
                . On checkout, VYRO will split into {supplierCount} direct Purchase Order{supplierCount > 1 ? 's' : ''}.
              </div>
            </div>

            <ul className="space-y-3">
              {items.map((it) => (
                <li key={it.id}>
                  <Card hoverEffect className="p-5 border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200">
                        <StoreIcon size={12} className="text-slate-500" />
                        {it.supplier.name}
                      </span>
                      <h3 className="font-semibold text-base text-slate-950 leading-snug truncate">
                        {it.product.name}
                      </h3>
                      <div className="text-xs text-slate-500 flex items-center gap-2 flex-wrap">
                        <span>Unit price <strong className="text-slate-800 font-mono">{formatLKR(it.priceCents)}</strong></span>
                        <span className="text-slate-300">•</span>
                        <span>Qty <strong className="text-slate-800 num-tabular">{it.quantity}</strong></span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-6 border-t sm:border-t-0 pt-3 sm:pt-0">
                      <div className="text-left sm:text-right">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Line total</div>
                        <div className="text-lg font-bold font-mono text-slate-950 num-tabular">
                          {formatLKR(it.lineTotalCents)}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => remove(it.id)}
                        loading={deletingId === it.id}
                        className="text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                        aria-label="Remove item"
                      >
                        <Trash2Icon size={16} />
                      </Button>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          </div>

          {/* Summary */}
          <Card className="p-6 border-slate-200 space-y-5 lg:sticky lg:top-24 shadow-soft-sm">
            <h2 className="text-lg font-semibold text-slate-950 pb-3 border-b border-slate-200">Order summary</h2>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between text-slate-600">
                <dt>Items</dt>
                <dd className="font-semibold text-slate-800 num-tabular">{items.length}</dd>
              </div>
              <div className="flex justify-between text-slate-600">
                <dt>Suppliers involved</dt>
                <dd className="font-semibold text-slate-800 num-tabular">{supplierCount}</dd>
              </div>
              <div className="flex justify-between text-slate-600">
                <dt>Purchase orders issued</dt>
                <dd className="font-semibold text-cyan-deep num-tabular">{supplierCount} PO{supplierCount > 1 ? 's' : ''}</dd>
              </div>
              <div className="pt-3 border-t border-slate-200 flex justify-between items-baseline">
                <dt className="font-semibold text-slate-950 text-base">Subtotal</dt>
                <dd className="text-right">
                  <div className="text-2xl font-bold font-mono text-slate-950 num-tabular">{formatLKR(subtotal)}</div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-500 mt-0.5">LKR wholesale net</div>
                </dd>
              </div>
            </dl>
            <Link to="/checkout" className="block">
              <Button size="lg" className="w-full font-semibold">
                Proceed to checkout <ArrowRightIcon size={18} />
              </Button>
            </Link>
            <p className="pt-1 text-center text-xs text-slate-500 flex items-center justify-center gap-1.5">
              <ShieldCheckIcon size={14} className="text-emerald-600" /> Protected by VYRO Purchase Order Escrow
            </p>
          </Card>
        </div>
      )}
    </div>
  );
}

function Badge({ variant, children }: { variant: 'brand'; children: React.ReactNode }) {
  const cls = variant === 'brand' ? 'bg-cyan/15 text-cyan-deep' : '';
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${cls}`}>
      {children}
    </span>
  );
}
