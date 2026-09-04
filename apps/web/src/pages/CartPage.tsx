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
        <Card className="p-8 text-center space-y-4">
          <div className="h-12 w-12 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center mx-auto">
            <Building2Icon size={24} />
          </div>
          <h2 className="text-xl font-bold text-slate-800">Business Profile Required</h2>
          <p className="text-xs sm:text-sm text-slate-500 max-w-sm mx-auto">
            Please sign in and set up your business profile to view and manage wholesale orders.
          </p>
          <div className="pt-2 flex justify-center gap-3">
            <Link to="/onboarding/business">
              <Button>Set Up Business</Button>
            </Link>
            <Link to="/login">
              <Button variant="outline">Sign In</Button>
            </Link>
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
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Checkout Flow Step Indicator */}
      <div className="flex items-center justify-center gap-3 text-xs font-semibold pb-2">
        <div className="flex items-center gap-2 text-brand-700 bg-brand-50 px-3 py-1.5 rounded-full border border-brand-200 shadow-soft-sm">
          <span className="h-5 w-5 rounded-full bg-brand-600 text-white flex items-center justify-center text-[10px] font-bold">1</span>
          <span>Review Cart</span>
        </div>
        <div className="h-px w-8 bg-slate-300" />
        <div className="flex items-center gap-2 text-slate-600 px-3 py-1.5">
          <span className="h-5 w-5 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-[10px] font-bold">2</span>
          <span>Checkout & Notes</span>
        </div>
        <div className="h-px w-8 bg-slate-300" />
        <div className="flex items-center gap-2 text-slate-600 px-3 py-1.5">
          <span className="h-5 w-5 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-[10px] font-bold">3</span>
          <span>PO Confirmation</span>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
            Wholesale Cart
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Review items, quantities, and supplier breakdown before issuing Purchase Orders.
          </p>
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={<ShoppingCartIcon size={28} />}
          title="Your wholesale cart is empty"
          description="Browse our catalog of verified manufacturers and distributors to add products to your cart."
          action={
            <Link to="/search">
              <Button>
                <PackageIcon size={16} /> Browse Wholesale Catalog
              </Button>
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          {/* Items List */}
          <div className="lg:col-span-2 space-y-4">
            {/* Multi-supplier Notice */}
            <div className="rounded-2xl bg-brand-50/70 border border-brand-200 p-4 text-xs text-brand-900 flex items-start gap-3 shadow-soft-sm">
              <StoreIcon size={18} className="text-brand-700 shrink-0 mt-0.5" />
              <div>
                <strong className="font-bold">Multi-Supplier Partitioning:</strong> Items in your cart originate from{' '}
                <span className="font-bold underline">{supplierCount} different supplier{supplierCount > 1 ? 's' : ''}</span>.
                On checkout, VYRO will split your order into {supplierCount} dedicated Purchase Order{supplierCount > 1 ? 's' : ''} with direct tracking.
              </div>
            </div>

            <div className="space-y-3">
              {items.map((it) => (
                <Card
                  key={it.id}
                  hoverEffect
                  className="p-5 border-slate-200/90 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="space-y-1.5 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700 bg-slate-100 px-2.5 py-0.5 rounded-md border border-slate-200">
                        <StoreIcon size={12} className="text-slate-400" />
                        {it.supplier.name}
                      </span>
                    </div>

                    <h3 className="font-bold text-base text-slate-900 leading-snug">
                      {it.product.name}
                    </h3>

                    <div className="text-xs text-slate-500 flex items-center gap-2">
                      <span>Unit Price: <strong className="text-slate-700">{formatLKR(it.priceCents)}</strong></span>
                      <span>•</span>
                      <span>Order Qty: <strong className="text-slate-700">{it.quantity}</strong></span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-6 border-t sm:border-t-0 pt-3 sm:pt-0">
                    <div className="text-left sm:text-right">
                      <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                        Line Total
                      </div>
                      <div className="text-lg font-black text-slate-900">
                        {formatLKR(it.lineTotalCents)}
                      </div>
                    </div>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => remove(it.id)}
                      loading={deletingId === it.id}
                      className="text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                      title="Remove item"
                    >
                      <Trash2Icon size={16} />
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          </div>

          {/* Order Summary Sidebar */}
          <div className="space-y-4">
            <Card className="p-6 border-slate-200/90 space-y-5 sticky top-24 shadow-soft-sm">
              <h2 className="text-lg font-bold text-slate-900 pb-3 border-b border-slate-100">
                Order Summary
              </h2>

              <div className="space-y-3 text-sm">
                <div className="flex justify-between text-slate-600">
                  <span>Distinct Items</span>
                  <span className="font-semibold text-slate-800">{items.length}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Suppliers Involved</span>
                  <span className="font-semibold text-slate-800">{supplierCount}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Purchase Orders Issued</span>
                  <span className="font-semibold text-brand-700">{supplierCount} POs</span>
                </div>
                <div className="pt-3 border-t border-slate-200 flex justify-between items-baseline">
                  <span className="font-bold text-slate-900 text-base">Subtotal</span>
                  <div className="text-right">
                    <div className="text-2xl font-black text-brand-700">
                      {formatLKR(subtotal)}
                    </div>
                    <div className="text-[11px] text-slate-600">LKR wholesale net</div>
                  </div>
                </div>
              </div>

              <Link to="/checkout" className="block pt-2">
                <Button size="lg" className="w-full font-bold shadow-soft-sm justify-center">
                  Proceed to Checkout <ArrowRightIcon size={18} />
                </Button>
              </Link>

              <div className="pt-2 text-center text-xs text-slate-600 flex items-center justify-center gap-1.5">
                <ShieldCheckIcon size={14} className="text-emerald-600" />
                <span>Protected by VYRO Purchase Order Escrow</span>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
