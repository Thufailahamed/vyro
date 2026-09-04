import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { PageHeader, Button, Input, Label } from '@/components/ui';
import { Surface } from '@/components/brand/Surface';
import { useSupplierId } from './useSupplierId';

type Product = { id: string; name: string; description: string | null };
type Offer = {
  id: string;
  productId: string;
  supplierSku: string | null;
  priceCents: number;
  minOrderQty: number;
  leadTimeDays: number;
  deliveryAvailable: boolean;
  deliveryRadiusKm: number | null;
  availabilityStatus: 'in_stock' | 'low' | 'out_of_stock';
  active: boolean;
};

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

export function SupplierProductFormPage({ mode }: { mode: 'create' | 'edit' }) {
  const { supplierId } = useSupplierId();
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isEdit = mode === 'edit';

  const offers = useQuery({
    queryKey: ['supplier', supplierId, 'offers'],
    queryFn: () => api.get<{ offers: Offer[] }>(`/supplier-products/by-supplier/${supplierId}`),
    enabled: isEdit,
  });
  const catalog = useQuery({
    queryKey: ['products', 'catalog'],
    queryFn: () => api.get<{ products: Product[] }>('/products?limit=500'),
  });

  const existing = isEdit ? offers.data?.offers.find((o) => o.id === id) ?? null : null;

  const [productId, setProductId] = useState('');
  const [supplierSku, setSupplierSku] = useState('');
  const [price, setPrice] = useState('0');
  const [minQty, setMinQty] = useState('1');
  const [lead, setLead] = useState('1');
  const [avail, setAvail] = useState<'in_stock' | 'low' | 'out_of_stock'>('in_stock');
  const [deliveryAvailable, setDeliveryAvailable] = useState(true);
  const [radius, setRadius] = useState('');
  const [active, setActive] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!existing) return;
    setProductId(existing.productId);
    setSupplierSku(existing.supplierSku ?? '');
    setPrice(String(existing.priceCents));
    setMinQty(String(existing.minOrderQty));
    setLead(String(existing.leadTimeDays));
    setAvail(existing.availabilityStatus);
    setDeliveryAvailable(existing.deliveryAvailable);
    setRadius(existing.deliveryRadiusKm == null ? '' : String(existing.deliveryRadiusKm));
    setActive(existing.active);
  }, [existing]);

  const create = useMutation({
    mutationFn: () =>
      api.post<{ id: string }>('/supplier-products', {
        supplierId,
        productId,
        supplierSku: supplierSku || undefined,
        priceCents: Number(price),
        minOrderQty: Number(minQty),
        leadTimeDays: Number(lead),
        availabilityStatus: avail,
        deliveryAvailable,
        deliveryRadiusKm: radius === '' ? null : Number(radius),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['supplier', supplierId, 'offers'] });
      navigate('/supplier/products');
    },
    onError: (e) => setErr(e instanceof ApiError ? e.message : 'Failed'),
  });

  const update = useMutation({
    mutationFn: () =>
      api.patch(`/supplier-products/${id}`, {
        supplierSku: supplierSku || null,
        priceCents: Number(price),
        minOrderQty: Number(minQty),
        leadTimeDays: Number(lead),
        availabilityStatus: avail,
        deliveryAvailable,
        deliveryRadiusKm: radius === '' ? null : Number(radius),
        active,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['supplier', supplierId, 'offers'] });
      navigate('/supplier/products');
    },
    onError: (e) => setErr(e instanceof ApiError ? e.message : 'Failed'),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (isEdit) update.mutate();
    else create.mutate();
  };

  const pending = create.isPending || update.isPending;
  const nameMap = new Map((catalog.data?.products ?? []).map((p) => [p.id, p]));

  return (
    <div className="space-y-6 max-w-3xl">
      <header className="flex items-end justify-between gap-4">
        <PageHeader
          kicker={isEdit ? 'Edit product' : 'New product'}
          title={isEdit ? `Edit ${nameMap.get(existing?.productId ?? '')?.name ?? 'offer'}` : 'Add a product'}
          sub="Catalog details, pricing, and inventory."
        />
        <Link to="/supplier/products">
          <Button variant="ghost">← Back</Button>
        </Link>
      </header>

      <Surface kind="elevated" className="p-6">
        <form onSubmit={submit} className="space-y-5">
          {!isEdit && (
            <FormField label="Product">
              <select
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                required
                className="flex h-9 w-full rounded-xs border border-line bg-paper text-ink-1 px-3 text-body"
              >
                <option value="">Select a product…</option>
                {(catalog.data?.products ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </FormField>
          )}

          <div className="grid sm:grid-cols-2 gap-4">
            <FormField label="Supplier SKU">
              <Input value={supplierSku} onChange={(e) => setSupplierSku(e.target.value)} placeholder="OPT-1234" />
            </FormField>
            <FormField label="Price (cents)">
              <Input value={price} onChange={(e) => setPrice(e.target.value)} required />
            </FormField>
            <FormField label="Minimum order qty">
              <Input value={minQty} onChange={(e) => setMinQty(e.target.value)} required />
            </FormField>
            <FormField label="Lead time (days)">
              <Input value={lead} onChange={(e) => setLead(e.target.value)} required />
            </FormField>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <FormField label="Availability">
              <select
                value={avail}
                onChange={(e) => setAvail(e.target.value as typeof avail)}
                className="flex h-9 w-full rounded-xs border border-line bg-paper text-ink-1 px-3 text-body"
              >
                <option value="in_stock">In stock</option>
                <option value="low">Low stock</option>
                <option value="out_of_stock">Out of stock</option>
              </select>
            </FormField>
            <FormField label="Delivery radius (km, optional)">
              <Input
                value={radius}
                onChange={(e) => setRadius(e.target.value)}
                placeholder="leave blank for no limit"
              />
            </FormField>
          </div>

          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={deliveryAvailable}
                onChange={(e) => setDeliveryAvailable(e.target.checked)}
              />
              Delivery available
            </label>
            {isEdit && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
                Active
              </label>
            )}
          </div>

          {err && <p className="text-sm text-rose">{err}</p>}

          <div className="flex gap-3 pt-2">
            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? 'Saving…' : isEdit ? 'Save changes' : 'Create offer'}
            </Button>
            <Link to="/supplier/products">
              <Button type="button" variant="ghost">Cancel</Button>
            </Link>
          </div>

          {!isEdit && !productId && (
            <p className="text-xs text-ink-4">
              Need to add a new product? Contact admin — products are catalog-wide.
            </p>
          )}
        </form>
      </Surface>
    </div>
  );
}
