import { useEffect, useState, useMemo, useRef, type FormEvent } from 'react';
import { useNavigate, useParams, Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import {
  Button,
  ErrorBanner,
  Input,
  Label,
  Select,
  Textarea,
  SuccessBanner,
} from '@/components/ui';
import { Surface } from '@/components/brand/Surface';
import { useSupplierId } from './useSupplierId';
import { SupplierErrorState, SupplierLoadingState } from './SupplierPageState';
import { useToast } from '@vyro/ui';
import {
  PackageIcon,
  ArrowLeftIcon,
  CheckIcon,
  TruckIcon,
  SearchIcon,
  EyeIcon,
  ClockIcon,
  XIcon,
  AlertCircleIcon,
  Edit3Icon,
  Building2Icon,
  ShieldCheckIcon,
  WarehouseIcon,
  UploadCloudIcon,
  PlusIcon,
  LayersIcon,
  CheckCircle2Icon,
  BanknoteIcon,
  PercentIcon,
  SparklesIcon,
  ChevronRightIcon,
  ArrowRightIcon,
} from '@/components/icons';
import { formatLKR } from '@/lib/format';
import { cn } from '@vyro/ui';

type Category = {
  id: string;
  slug: string;
  name: string;
  parentId?: string | null;
  sortOrder?: number;
};

type Product = {
  id: string;
  name: string;
  description: string | null;
  brand?: string | null;
  unit: string;
  packSize?: string | null;
  imageUrl?: string | null;
  categoryId: string;
};

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
  tier1MinQty?: number;
  tier1DiscountPct?: number;
  tier2MinQty?: number;
  tier2DiscountPct?: number;
  tier3MinQty?: number;
  tier3DiscountPct?: number;
};

const COMMON_UNITS = [
  'kg',
  'bag',
  'unit',
  'set',
  'pack',
  'box',
  'bottle',
  'liter',
  'meter',
  'carton',
  'drum',
];

const MOQ_PRESETS = [1, 5, 10, 25, 50, 100];
const LEAD_PRESETS = [
  { label: 'Same Day', value: '0' },
  { label: '1 Day', value: '1' },
  { label: '2-3 Days', value: '3' },
  { label: '5-7 Days', value: '7' },
];

const RADIUS_PRESETS = [
  { label: '25 km (Local)', value: '25' },
  { label: '50 km (Metro)', value: '50' },
  { label: '100 km (Regional)', value: '100' },
  { label: 'Island-wide', value: '' },
];

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = reader.result as string;
      const base64 = res.split(',')[1] || res;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const FORM_SECTIONS = [
  { key: 'category', label: 'Category', hint: 'Admin taxonomy', icon: LayersIcon },
  { key: 'details', label: 'Product', hint: 'Identity & specs', icon: PackageIcon },
  { key: 'photo', label: 'Photo', hint: 'Depot imagery', icon: UploadCloudIcon },
  { key: 'pricing', label: 'Pricing', hint: 'Wholesale & MOQ', icon: BanknoteIcon },
  { key: 'tiers', label: 'Tiers', hint: 'Volume discounts', icon: PercentIcon },
  { key: 'delivery', label: 'Fulfillment', hint: 'Delivery & coverage', icon: TruckIcon },
] as const;

export function SupplierProductFormPage({ mode }: { mode: 'create' | 'edit' }) {
  const { supplierId, supplierName } = useSupplierId();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const isEdit = mode === 'edit';
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Queries
  const offers = useQuery({
    queryKey: ['supplier', supplierId, 'offers'],
    queryFn: () => api.get<{ offers: Offer[] }>(`/supplier-products/by-supplier/${supplierId}`),
    enabled: isEdit,
  });

  const categoriesQuery = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get<{ categories: Category[] }>('/categories'),
  });

  const categories = useMemo(() => categoriesQuery.data?.categories ?? [], [categoriesQuery.data]);
  const existingOffer = isEdit ? offers.data?.offers.find((o) => o.id === id) ?? null : null;

  // If editing, fetch product details
  const productQuery = useQuery({
    queryKey: ['product', existingOffer?.productId],
    queryFn: () =>
      api.get<{ product: Product; images: { id: string; url: string }[] }>(
        `/products/${existingOffer!.productId}`,
      ),
    enabled: isEdit && !!existingOffer?.productId,
  });

  // Category & Product Specification state
  const [categoryId, setCategoryId] = useState<string>('');
  const [categorySearch, setCategorySearch] = useState('');
  const [productName, setProductName] = useState('');
  const [brand, setBrand] = useState('');
  const [unit, setUnit] = useState('unit');
  const [packSize, setPackSize] = useState('');
  const [description, setDescription] = useState('');

  // Image upload state
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [existingImageUrl, setExistingImageUrl] = useState<string | null>(null);

  // Commercial & inventory terms state
  const [supplierSku, setSupplierSku] = useState('');
  const [priceLkr, setPriceLkr] = useState('');
  const [minQty, setMinQty] = useState('1');
  const [lead, setLead] = useState('1');
  const [avail, setAvail] = useState<'in_stock' | 'low' | 'out_of_stock'>('in_stock');
  const [deliveryAvailable, setDeliveryAvailable] = useState(true);
  const [radius, setRadius] = useState('');
  const [active, setActive] = useState(true);

  // Volume tiers
  const [enableTiers, setEnableTiers] = useState(false);
  const [tier1MinQty, setTier1MinQty] = useState('10');
  const [tier1DiscountPct, setTier1DiscountPct] = useState('3');
  const [tier2MinQty, setTier2MinQty] = useState('50');
  const [tier2DiscountPct, setTier2DiscountPct] = useState('5');
  const [tier3MinQty, setTier3MinQty] = useState('100');
  const [tier3DiscountPct, setTier3DiscountPct] = useState('10');

  const [err, setErr] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Populate state in edit mode
  useEffect(() => {
    if (!isEdit || !existingOffer) return;
    setSupplierSku(existingOffer.supplierSku ?? '');
    setPriceLkr((existingOffer.priceCents / 100).toFixed(2));
    setMinQty(String(existingOffer.minOrderQty));
    setLead(String(existingOffer.leadTimeDays));
    setAvail(existingOffer.availabilityStatus);
    setDeliveryAvailable(existingOffer.deliveryAvailable);
    setRadius(existingOffer.deliveryRadiusKm == null ? '' : String(existingOffer.deliveryRadiusKm));
    setActive(existingOffer.active);

    const hasTiers =
      (existingOffer.tier1DiscountPct && existingOffer.tier1DiscountPct > 0) ||
      (existingOffer.tier2DiscountPct && existingOffer.tier2DiscountPct > 0) ||
      (existingOffer.tier3DiscountPct && existingOffer.tier3DiscountPct > 0);
    setEnableTiers(Boolean(hasTiers));

    if (existingOffer.tier1MinQty != null) setTier1MinQty(String(existingOffer.tier1MinQty));
    if (existingOffer.tier1DiscountPct != null)
      setTier1DiscountPct(String(existingOffer.tier1DiscountPct));
    if (existingOffer.tier2MinQty != null) setTier2MinQty(String(existingOffer.tier2MinQty));
    if (existingOffer.tier2DiscountPct != null)
      setTier2DiscountPct(String(existingOffer.tier2DiscountPct));
    if (existingOffer.tier3MinQty != null) setTier3MinQty(String(existingOffer.tier3MinQty));
    if (existingOffer.tier3DiscountPct != null)
      setTier3DiscountPct(String(existingOffer.tier3DiscountPct));
  }, [isEdit, existingOffer]);

  // Populate product details in edit mode
  useEffect(() => {
    if (!productQuery.data?.product) return;
    const p = productQuery.data.product;
    setCategoryId(p.categoryId);
    setProductName(p.name);
    setBrand(p.brand ?? '');
    setUnit(p.unit ?? 'unit');
    setPackSize(p.packSize ?? '');
    setDescription(p.description ?? '');
    if (p.imageUrl) setExistingImageUrl(p.imageUrl);
  }, [productQuery.data]);

  // Handle URL query parameter pre-selection for category
  useEffect(() => {
    if (isEdit) return;
    const catParam = searchParams.get('categoryId');
    if (catParam && !categoryId) {
      setCategoryId(catParam);
    }
  }, [searchParams, isEdit, categoryId]);

  // Filtered categories
  const filteredCategories = useMemo(() => {
    if (!categorySearch.trim()) return categories;
    const q = categorySearch.toLowerCase();
    return categories.filter(
      (c) => c.name.toLowerCase().includes(q) || c.slug.toLowerCase().includes(q),
    );
  }, [categories, categorySearch]);

  const selectedCategoryObj = useMemo(
    () => categories.find((c) => c.id === categoryId) ?? null,
    [categories, categoryId],
  );

  // Clean image preview object URL on cleanup
  useEffect(() => {
    return () => {
      if (imagePreviewUrl && imagePreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(imagePreviewUrl);
      }
    };
  }, [imagePreviewUrl]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setErr('Product photo exceeds the maximum 5MB size limit.');
      return;
    }
    setSelectedImageFile(file);
    const objectUrl = URL.createObjectURL(file);
    setImagePreviewUrl(objectUrl);
    setErr(null);
  };

  const removeSelectedImage = () => {
    setSelectedImageFile(null);
    if (imagePreviewUrl && imagePreviewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(imagePreviewUrl);
    }
    setImagePreviewUrl(null);
    setExistingImageUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const priceCentsValue = (): number => {
    const n = Number.parseFloat(priceLkr);
    if (Number.isNaN(n) || n <= 0) return 0;
    return Math.round(n * 100);
  };

  // Readiness Checklist calculation
  const hasCategory = Boolean(categoryId);
  const hasName = Boolean(productName.trim());
  const hasUnit = Boolean(unit.trim());
  const hasPrice = priceCentsValue() > 0;
  const hasMoq = Number(minQty) >= 1;
  const hasImage = Boolean(imagePreviewUrl || existingImageUrl);

  const readinessItems = [
    { key: 'category', label: 'Admin category selected', done: hasCategory },
    { key: 'name', label: 'Product title defined', done: hasName },
    { key: 'unit', label: 'Billing unit specified', done: hasUnit },
    { key: 'price', label: 'Wholesale unit rate configured', done: hasPrice },
    { key: 'moq', label: 'Minimum order quantity set', done: hasMoq },
    { key: 'image', label: 'Product photo uploaded', done: hasImage, optional: true },
  ];
  const readinessScore = readinessItems.filter((r) => r.done).length;
  const totalReadinessSteps = readinessItems.length;
  const readinessPct = (readinessScore / totalReadinessSteps) * 100;
  const canPublish = hasCategory && hasName && hasUnit && hasPrice && hasMoq;

  const handleSubmit = async (e?: FormEvent) => {
    e?.preventDefault();
    setErr(null);

    if (!categoryId) {
      setErr('Please select a category created by administrators for your product.');
      return;
    }
    if (!productName.trim()) {
      setErr('Please provide a product title / name.');
      return;
    }
    if (!unit.trim()) {
      setErr('Please specify the standard billing unit of measure (e.g. kg, bag, unit, set).');
      return;
    }
    const cents = priceCentsValue();
    if (!cents || cents <= 0) {
      setErr('Please enter a valid base wholesale price in LKR.');
      return;
    }

    if (enableTiers) {
      const t1Qty = Number(tier1MinQty) || 0;
      const t2Qty = Number(tier2MinQty) || 0;
      const t3Qty = Number(tier3MinQty) || 0;
      const t1Pct = Number(tier1DiscountPct) || 0;
      const t2Pct = Number(tier2DiscountPct) || 0;
      const t3Pct = Number(tier3DiscountPct) || 0;

      if (t2Pct > 0 && t2Qty <= t1Qty) {
        setErr('Tier 2 minimum quantity must be strictly greater than Tier 1.');
        return;
      }
      if (t3Pct > 0 && t3Qty <= t2Qty) {
        setErr('Tier 3 minimum quantity must be strictly greater than Tier 2.');
        return;
      }
    }

    setIsSubmitting(true);

    try {
      let targetProductId = existingOffer?.productId || '';

      if (!isEdit) {
        const prodPayload: {
          name: string;
          categoryId: string;
          unit: string;
          brand?: string;
          packSize?: string;
          description?: string;
        } = {
          name: productName.trim(),
          categoryId,
          unit: unit.trim(),
        };
        if (brand.trim()) prodPayload.brand = brand.trim();
        if (packSize.trim()) prodPayload.packSize = packSize.trim();
        if (description.trim()) prodPayload.description = description.trim();

        const prodRes = await api.post<{ id: string }>('/products', prodPayload);
        targetProductId = prodRes.id;
      } else {
        const updatePayload: {
          name: string;
          categoryId: string;
          unit: string;
          brand?: string;
          packSize?: string;
          description?: string;
        } = {
          name: productName.trim(),
          categoryId,
          unit: unit.trim(),
        };
        if (brand.trim()) updatePayload.brand = brand.trim();
        if (packSize.trim()) updatePayload.packSize = packSize.trim();
        if (description.trim()) updatePayload.description = description.trim();

        await api.patch(`/products/${targetProductId}`, updatePayload);
      }

      if (selectedImageFile) {
        const base64 = await fileToBase64(selectedImageFile);
        await api.post(`/products/${targetProductId}/images`, {
          filename: selectedImageFile.name,
          contentType: selectedImageFile.type || 'image/jpeg',
          base64,
        });
      }

      const offerPayload: Record<string, unknown> = {
        priceCents: cents,
        minOrderQty: Number(minQty) || 1,
        leadTimeDays: Number(lead) || 1,
        availabilityStatus: avail,
        deliveryAvailable,
        tier1DiscountPct: enableTiers ? Number(tier1DiscountPct) || 0 : 0,
        tier2DiscountPct: enableTiers ? Number(tier2DiscountPct) || 0 : 0,
        tier3DiscountPct: enableTiers ? Number(tier3DiscountPct) || 0 : 0,
      };

      if (supplierSku.trim()) {
        offerPayload.supplierSku = supplierSku.trim();
      } else {
        offerPayload.supplierSku = null;
      }

      if (radius !== '') {
        offerPayload.deliveryRadiusKm = Number(radius);
      } else {
        offerPayload.deliveryRadiusKm = null;
      }

      if (isEdit) {
        offerPayload.active = active;
      } else {
        offerPayload.supplierId = supplierId;
        offerPayload.productId = targetProductId;
      }

      if (enableTiers && Number(tier1DiscountPct) > 0) {
        offerPayload.tier1MinQty = Number(tier1MinQty);
      }
      if (enableTiers && Number(tier2DiscountPct) > 0) {
        offerPayload.tier2MinQty = Number(tier2MinQty);
      }
      if (enableTiers && Number(tier3DiscountPct) > 0) {
        offerPayload.tier3MinQty = Number(tier3MinQty);
      }

      if (isEdit) {
        await api.patch(`/supplier-products/${id}`, offerPayload);
      } else {
        await api.post('/supplier-products', offerPayload);
      }

      await qc.invalidateQueries({ queryKey: ['supplier', supplierId, 'offers'] });
      await qc.invalidateQueries({ queryKey: ['products', 'catalog'] });
      toast.show(toast.success(isEdit ? 'Product changes saved' : 'Wholesale product published'));
      navigate('/supplier/products');
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Failed to save product listing. Please check inputs.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isEdit && (offers.isLoading || productQuery.isLoading)) {
    return <SupplierLoadingState label="Loading product listing specifications..." />;
  }

  if (isEdit && offers.isError) {
    return (
      <SupplierErrorState
        message="Could not load the requested product listing. It may have been removed."
      />
    );
  }

  const displayImageUrl = imagePreviewUrl || existingImageUrl || null;
  const displayPriceCents = priceCentsValue();
  const displayMoq = Number(minQty) || 1;

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-32">
      {/* Top bar: back link + stepper */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-ink/10 pb-4">
        <Link
          to="/supplier/products"
          className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ink-3 hover:text-ink-1 transition-colors"
        >
          <ArrowLeftIcon size={14} /> Back to Products
        </Link>
        <div className="w-full sm:w-[36rem]">
          <FormStepper sections={FORM_SECTIONS} state={readinessItems} />
        </div>
      </div>

      {/* Header banner */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="size-2 rounded-full bg-volt animate-pulse" />
            <span className="vyro-kicker text-volt-deep">Wholesale Catalog</span>
            {isEdit && (
              <span className="ml-1 font-mono text-[10px] font-semibold uppercase tracking-wider bg-copper/10 text-copper border border-copper/30 px-2 py-0.5">
                Editing
              </span>
            )}
          </div>
          <h1 className="vyro-display text-4xl sm:text-5xl text-balance text-ink">
            {isEdit ? 'Edit Wholesale Product' : 'Create Wholesale Product'}
          </h1>
          <p className="mt-3 text-body-lg text-ink-3 max-w-2xl">
            Select an admin category, define your product details and imagery, and set your
            wholesale commercial terms.
          </p>
        </div>
      </div>

      {err && <ErrorBanner message={err} />}

      <form
        onSubmit={handleSubmit}
        className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start"
      >
        {/* LEFT — Form sections */}
        <div className="lg:col-span-8 space-y-5">
          {/* SECTION 1 — Category */}
          <SectionCard
            step={1}
            eyebrow="Category"
            title="Select product category"
            sub="Choose from categories created by platform administrators"
            complete={hasCategory}
            countLabel={`${categories.length} categories`}
          >
            {categories.length > 6 && (
              <div className="relative">
                <SearchIcon
                  size={15}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-4"
                />
                <Input
                  type="text"
                  placeholder="Filter categories (e.g. Food, Furniture, Packaging, Hardware)..."
                  value={categorySearch}
                  onChange={(e) => setCategorySearch(e.target.value)}
                  className="pl-9 bg-paper"
                />
                {categorySearch && (
                  <button
                    type="button"
                    onClick={() => setCategorySearch('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-4 hover:text-ink-1 text-[11px] font-semibold"
                  >
                    Clear
                  </button>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 max-h-72 overflow-y-auto pr-1 scrollbar-thin">
              {filteredCategories.map((cat) => {
                const isSelected = categoryId === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategoryId(cat.id)}
                    className={cn(
                      'flex items-center justify-between p-3 rounded-xl border text-left transition-all',
                      isSelected
                        ? 'border-ink bg-ink/[0.04] ring-1 ring-volt/40 shadow-sm'
                        : 'border-ink/10 bg-paper hover:border-ink/30',
                    )}
                  >
                    <div className="min-w-0 pr-2">
                      <p
                        className={cn(
                          'text-xs truncate',
                          isSelected ? 'font-bold text-ink' : 'font-medium text-ink-2',
                        )}
                      >
                        {cat.name}
                      </p>
                      <p className="text-[10px] text-ink-4 font-mono truncate">{cat.slug}</p>
                    </div>
                    {isSelected ? (
                      <span className="w-5 h-5 rounded-full bg-ink text-volt flex items-center justify-center flex-shrink-0">
                        <CheckIcon size={12} />
                      </span>
                    ) : (
                      <span className="w-4 h-4 rounded-full border border-ink/15 flex-shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>

            {selectedCategoryObj && (
              <div className="p-3 rounded-xl bg-mint/10 border border-mint/30 text-xs flex items-center justify-between text-ink-1">
                <span className="flex items-center gap-2 font-semibold">
                  <CheckCircle2Icon size={14} className="text-mint" />
                  Listing under category: <strong>{selectedCategoryObj.name}</strong>
                </span>
                <span className="text-[11px] font-mono text-ink-3">{selectedCategoryObj.slug}</span>
              </div>
            )}
          </SectionCard>

          {/* SECTION 2 — Product details */}
          <SectionCard
            step={2}
            eyebrow="Product"
            title="Product details & specifications"
            sub="Define the name, brand, billing unit, and packaging for your product"
            complete={hasName && hasUnit}
          >
            <div className="space-y-5">
              <Field
                label="Product title / name"
                required
                hint="Descriptive name visible to all wholesale buyers"
                icon={<PackageIcon size={13} className="text-copper" />}
              >
                <Input
                  type="text"
                  placeholder="e.g. Ceylon Cinnamon Quills Grade ALBA 25kg"
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  className="bg-paper"
                  required
                />
              </Field>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field
                  label="Brand / manufacturer"
                  optional
                  hint="Leave blank if unbranded"
                  icon={<Building2Icon size={13} className="text-copper" />}
                >
                  <Input
                    type="text"
                    placeholder="e.g. Royal Spices, CraftWood, In-House"
                    value={brand}
                    onChange={(e) => setBrand(e.target.value)}
                    className="bg-paper"
                  />
                </Field>

                <Field
                  label="Standard billing unit"
                  required
                  hint="Wholesale transaction unit"
                  icon={<PackageIcon size={13} className="text-copper" />}
                >
                  <Input
                    type="text"
                    placeholder="e.g. kg, bag, unit, set"
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    className="bg-paper"
                    required
                  />
                </Field>
              </div>

              {/* Quick unit presets */}
              <div>
                <div className="text-[10px] font-mono text-ink-3 uppercase tracking-wider font-semibold mb-1.5">
                  Common units
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {COMMON_UNITS.map((u) => (
                    <button
                      key={u}
                      type="button"
                      onClick={() => setUnit(u)}
                      className={cn(
                        'px-2.5 py-0.5 text-xs font-mono transition-all rounded-md',
                        unit.toLowerCase() === u
                          ? 'bg-ink text-volt font-semibold'
                          : 'bg-paper border border-ink/10 text-ink-3 hover:border-ink/30',
                      )}
                    >
                      {u}
                    </button>
                  ))}
                </div>
              </div>

              <Field label="Packaging specification / pack size" optional hint="Packaging format or dimensions">
                <Input
                  type="text"
                  placeholder="e.g. 25kg vacuum-sealed sack, Set of 4, 12 bottles/carton"
                  value={packSize}
                  onChange={(e) => setPackSize(e.target.value)}
                  className="bg-paper"
                />
              </Field>

              <Field label="Product specifications & details" optional hint="Detailed specs, material origin, certifications">
                <Textarea
                  rows={3}
                  placeholder="Provide technical specifications, quality grades, moisture levels, warranty, or packaging details for enterprise purchasing managers..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="bg-paper"
                />
              </Field>
            </div>
          </SectionCard>

          {/* SECTION 3 — Product photo */}
          <SectionCard
            step={3}
            eyebrow="Photo"
            title="Product photo & depot packaging"
            sub="Upload direct photography of your product or packaging as received at depot"
            complete={hasImage}
            {...(hasImage ? { countLabel: 'Photo attached', countTone: 'mint' as const } : {})}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleImageChange}
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
            />

            {!displayImageUrl ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-ink/15 hover:border-volt rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all bg-paper-subtle/30 hover:bg-volt/5 group"
              >
                <div className="w-12 h-12 rounded-2xl bg-bone group-hover:bg-volt/20 text-ink-3 group-hover:text-volt-deep flex items-center justify-center transition-colors mb-3">
                  <UploadCloudIcon size={24} />
                </div>
                <p className="text-sm font-bold text-ink-1">
                  Click or drag to upload product photography
                </p>
                <p className="text-xs text-ink-3 mt-1">
                  Supports JPG, PNG, and WEBP formats up to 5MB
                </p>
                <div className="mt-4">
                  <Button type="button" variant="secondary" size="sm" className="gap-2 text-xs">
                    <PlusIcon size={12} /> Browse Image Files
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row items-center gap-5 p-4 rounded-2xl bg-paper-subtle/30 border border-ink/10">
                <div className="w-24 h-24 rounded-xl overflow-hidden bg-bone border border-ink/10 flex-shrink-0 shadow-inner">
                  <img
                    src={displayImageUrl}
                    alt={productName || 'Product photo'}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex-1 min-w-0 text-center sm:text-left">
                  <p className="text-xs font-bold text-ink-1 truncate">
                    {selectedImageFile ? selectedImageFile.name : 'Current depot product photo'}
                  </p>
                  <p className="text-[11px] text-ink-4 mt-0.5">
                    {selectedImageFile
                      ? `${(selectedImageFile.size / 1024).toFixed(1)} KB · Ready for cloud upload`
                      : 'Saved in product catalog'}
                  </p>
                  <div className="flex items-center gap-2 mt-3 justify-center sm:justify-start">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      className="text-xs gap-1.5"
                    >
                      <Edit3Icon size={12} /> Change photo
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={removeSelectedImage}
                      className="text-xs text-rose hover:text-rose gap-1.5"
                    >
                      <XIcon size={12} /> Remove
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </SectionCard>

          {/* SECTION 4 — Pricing & MOQ */}
          <SectionCard
            step={4}
            eyebrow="Pricing"
            title="Wholesale pricing & minimum order (MOQ)"
            sub="Set your base wholesale unit rate and purchase commitment rules"
            complete={hasPrice && hasMoq}
          >
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Internal supplier SKU" optional hint="Warehouse reference" mono>
                  <Input
                    type="text"
                    placeholder="e.g. WH-FURN-2026-01"
                    value={supplierSku}
                    onChange={(e) => setSupplierSku(e.target.value)}
                    className="bg-paper font-mono text-xs"
                  />
                </Field>

                <Field label="Stock availability" hint="Marketplace visibility">
                  <Select
                    value={avail}
                    onChange={(e) => setAvail(e.target.value as typeof avail)}
                    className="bg-paper"
                  >
                    <option value="in_stock">✓ In Stock — ready for immediate dispatch</option>
                    <option value="low">⚠ Low Stock — limited depot allocation</option>
                    <option value="out_of_stock">✕ Out of Stock — pre-order / backorder</option>
                  </Select>
                </Field>
              </div>

              <Field
                label={`Base wholesale rate (LKR / ${unit || 'unit'})`}
                required
                hint="Net wholesale price per unit before volume discounts"
                icon={<BanknoteIcon size={13} className="text-copper" />}
              >
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-xs font-bold text-ink-3 pointer-events-none">
                    Rs.
                  </span>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={priceLkr}
                    onChange={(e) => setPriceLkr(e.target.value)}
                    className="pl-11 pr-16 bg-paper font-mono font-bold text-sm"
                    required
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-4 pointer-events-none">
                    / {unit || 'unit'}
                  </span>
                </div>
              </Field>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <PresetField
                  label="Minimum order qty (MOQ)"
                  required
                  hint="Smallest order accepted"
                  value={minQty}
                  onChange={setMinQty}
                  presets={MOQ_PRESETS.map((q) => ({ label: String(q), value: String(q) }))}
                  inputMode="numeric"
                  mono
                />
                <PresetField
                  label="Dispatch lead time (days)"
                  required
                  hint="Time from order to dispatch"
                  value={lead}
                  onChange={setLead}
                  presets={LEAD_PRESETS}
                  inputMode="numeric"
                  mono
                />
              </div>

              {/* Min order commitment banner */}
              {displayPriceCents > 0 && displayMoq > 0 && (
                <div className="p-4 rounded-xl bg-ink text-paper flex items-center justify-between shadow-sm">
                  <div className="text-xs">
                    <p className="font-mono uppercase tracking-wider text-volt text-[10px] font-bold">
                      Minimum order commitment
                    </p>
                    <p className="text-[11px] text-paper/70 font-mono mt-0.5">
                      {minQty} {unit || 'units'} × {formatLKR(displayPriceCents)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono font-bold text-lg text-volt">
                      {formatLKR(displayPriceCents * displayMoq)}
                    </p>
                    <p className="text-[10px] text-paper/60">Minimum PO value</p>
                  </div>
                </div>
              )}
            </div>
          </SectionCard>

          {/* SECTION 5 — Volume tiers */}
          <SectionCard
            step={5}
            eyebrow="Tiers"
            title="Volume discount ladders (optional)"
            sub="Reward buyers who order pallet or truckload quantities"
            complete={enableTiers}
            countLabel={enableTiers ? 'Enabled' : 'Off'}
            countTone={enableTiers ? 'mint' : 'ink'}
            actions={
              <ToggleSwitch
                checked={enableTiers}
                onChange={setEnableTiers}
                label="Enable tiers"
              />
            }
          >
            {enableTiers && (
              <div className="space-y-4">
                <p className="text-xs text-ink-3">
                  Configure tiered bulk discounts based on minimum order quantity thresholds.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <TierCard
                    label="Tier 1"
                    name="Wholesale"
                    color="volt"
                    qtyValue={tier1MinQty}
                    qtyOnChange={setTier1MinQty}
                    pctValue={tier1DiscountPct}
                    pctOnChange={setTier1DiscountPct}
                    basePriceCents={displayPriceCents}
                    unit={unit || 'units'}
                  />
                  <TierCard
                    label="Tier 2"
                    name="Pallet"
                    color="copper"
                    qtyValue={tier2MinQty}
                    qtyOnChange={setTier2MinQty}
                    pctValue={tier2DiscountPct}
                    pctOnChange={setTier2DiscountPct}
                    basePriceCents={displayPriceCents}
                    unit={unit || 'units'}
                  />
                  <TierCard
                    label="Tier 3"
                    name="Truckload"
                    color="mint"
                    qtyValue={tier3MinQty}
                    qtyOnChange={setTier3MinQty}
                    pctValue={tier3DiscountPct}
                    pctOnChange={setTier3DiscountPct}
                    basePriceCents={displayPriceCents}
                    unit={unit || 'units'}
                  />
                </div>
              </div>
            )}
            {!enableTiers && (
              <p className="text-xs text-ink-4 italic">
                Tiers are off. Enable to configure bulk-volume discounts.
              </p>
            )}
          </SectionCard>

          {/* SECTION 6 — Fulfillment & delivery */}
          <SectionCard
            step={6}
            eyebrow="Fulfillment"
            title="Delivery & coverage"
            sub="Configure dock collection and supplier fleet delivery"
            complete={deliveryAvailable}
            countLabel={deliveryAvailable ? 'Delivery on' : 'Pickup only'}
            countTone={deliveryAvailable ? 'mint' : 'ink'}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FulfillmentOption
                icon={<WarehouseIcon size={18} />}
                title="Depot dock pickup"
                description="Buyers dispatch transport to pick up directly from your depot dock"
                active
                locked
                tone="volt"
              />
              <FulfillmentOption
                icon={<TruckIcon size={18} />}
                title="Supplier fleet delivery"
                description="Deliver directly to buyer warehouse with your own vehicles"
                active={deliveryAvailable}
                onToggle={() => setDeliveryAvailable(!deliveryAvailable)}
                tone="copper"
              />
            </div>

            {deliveryAvailable && (
              <div className="space-y-2 pt-1">
                <Field
                  label="Delivery radius (km)"
                  optional
                  hint="Leave blank for island-wide delivery"
                  mono
                >
                  <Input
                    type="number"
                    placeholder="e.g. 50 (blank = island-wide)"
                    value={radius}
                    onChange={(e) => setRadius(e.target.value)}
                    className="bg-paper font-mono text-xs"
                  />
                </Field>
                <div className="flex flex-wrap gap-1.5">
                  {RADIUS_PRESETS.map((p) => (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => setRadius(p.value)}
                      className={cn(
                        'px-2.5 py-1 text-xs rounded-md border transition-all',
                        radius === p.value
                          ? 'bg-ink text-volt font-semibold border-ink'
                          : 'bg-paper text-ink-3 border-ink/10 hover:border-ink/30',
                      )}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </SectionCard>

          {/* Edit-only: active toggle */}
          {isEdit && (
            <Surface className="p-4 rounded-2xl border border-ink/10 bg-paper flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-ink-1">Listing active status</p>
                <p className="text-[11px] text-ink-3 mt-0.5">
                  When active, enterprise buyers can find and purchase this product on the
                  marketplace.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    'text-[10px] font-mono uppercase tracking-wider font-bold px-2 py-0.5',
                    active ? 'bg-mint/15 text-mint' : 'bg-ink/10 text-ink-3',
                  )}
                >
                  {active ? 'Active' : 'Archived'}
                </span>
                <ToggleSwitch checked={active} onChange={setActive} hideLabel />
              </div>
            </Surface>
          )}
        </div>

        {/* RIGHT — Live preview & readiness */}
        <div className="lg:col-span-4 space-y-4 lg:sticky lg:top-6">
          <div className="vyro-kicker text-copper">Marketplace Live Preview</div>

          <Surface kind="ink" className="p-5 relative overflow-hidden grain shadow-xl border border-paper/20">
            <div className="relative z-10 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-paper/15">
                <span className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-volt font-bold">
                  <EyeIcon size={12} /> Buyer view
                </span>
                <span
                  className={cn(
                    'inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 font-bold',
                    avail === 'in_stock'
                      ? 'bg-mint text-paper'
                      : avail === 'low'
                      ? 'bg-amber text-ink'
                      : 'bg-rose text-paper',
                  )}
                >
                  {avail === 'in_stock' ? 'In stock' : avail === 'low' ? 'Low stock' : 'Out of stock'}
                </span>
              </div>

              {/* Product image */}
              <div className="w-full aspect-[4/3] rounded-xl overflow-hidden bg-bone border border-paper/15 relative flex items-center justify-center">
                {displayImageUrl ? (
                  <img
                    src={displayImageUrl}
                    alt={productName || 'Product preview'}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center p-6 text-center text-paper/40">
                    <PackageIcon size={40} className="stroke-1 mb-2 opacity-50" />
                    <p className="text-xs font-medium">No photo uploaded yet</p>
                    <p className="text-[10px] text-paper/40 mt-0.5">Upload photo in Step 3</p>
                  </div>
                )}
              </div>

              {/* Supplier & category */}
              <div>
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="w-5 h-5 rounded-md bg-volt/20 text-volt text-[10px] font-bold flex items-center justify-center">
                    {(supplierName || 'S').charAt(0).toUpperCase()}
                  </span>
                  <span className="text-xs font-bold text-paper truncate">
                    {supplierName || 'Your Supplier Depot'}
                  </span>
                  <span className="text-[10px] text-mint font-medium flex items-center gap-0.5">
                    <ShieldCheckIcon size={10} className="inline" /> Verified
                  </span>
                </div>

                {selectedCategoryObj && (
                  <span className="inline-block px-2 py-0.5 rounded-md bg-copper/20 text-copper border border-copper/30 text-[10px] font-mono font-bold uppercase tracking-wider mb-1.5">
                    {selectedCategoryObj.name}
                  </span>
                )}

                <h3 className="font-display text-lg text-paper font-bold leading-snug">
                  {productName || 'Product title…'}
                </h3>
                <div className="flex items-center gap-2 text-[11px] text-paper/60 mt-1 font-mono">
                  {brand && <span>Brand: <strong className="text-paper">{brand}</strong></span>}
                  {packSize && <span>· Pack: <strong className="text-paper">{packSize}</strong></span>}
                </div>
              </div>

              {/* Wholesale rate box */}
              <div className="p-3.5 rounded-xl bg-paper/[0.04] border border-paper/15">
                <div className="flex items-baseline justify-between">
                  <span className="text-[10px] font-mono text-paper/60 uppercase tracking-wider font-bold">
                    Wholesale rate
                  </span>
                  <span className="text-[10px] font-mono text-paper/40">Per {unit || 'unit'}</span>
                </div>
                <div className="mt-1">
                  <span className="font-mono font-bold text-2xl text-volt">
                    {displayPriceCents > 0 ? formatLKR(displayPriceCents) : 'Rs. 0.00'}
                  </span>
                  <span className="text-xs text-paper/60 ml-1">/ {unit || 'unit'}</span>
                </div>
              </div>

              {/* MOQ + Lead time */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 rounded-lg border border-paper/15 bg-paper/[0.04]">
                  <span className="text-[10px] text-paper/50 uppercase tracking-wider font-mono block">
                    Min order
                  </span>
                  <span className="font-mono font-bold text-paper text-sm">
                    {minQty || '1'} {unit || 'units'}
                  </span>
                </div>
                <div className="p-2.5 rounded-lg border border-paper/15 bg-paper/[0.04]">
                  <span className="text-[10px] text-paper/50 uppercase tracking-wider font-mono block">
                    Dispatch lead
                  </span>
                  <span className="font-mono font-bold text-paper text-sm">
                    {lead === '0' ? 'Same day' : `${lead} day${lead === '1' ? '' : 's'}`}
                  </span>
                </div>
              </div>

              {/* Tier preview */}
              {enableTiers && Number(tier1DiscountPct) > 0 && (
                <div className="p-3 rounded-xl border border-paper/15 bg-paper/[0.04] space-y-1.5 text-[11px]">
                  <p className="text-[10px] font-mono text-paper/50 uppercase tracking-wider font-bold">
                    Bulk volume tiers
                  </p>
                  <div className="space-y-1 font-mono text-paper/80">
                    <div className="flex justify-between">
                      <span>{tier1MinQty}+ {unit || 'units'}</span>
                      <span className="text-volt font-semibold">{tier1DiscountPct}% off</span>
                    </div>
                    {Number(tier2DiscountPct) > 0 && (
                      <div className="flex justify-between">
                        <span>{tier2MinQty}+ {unit || 'units'}</span>
                        <span className="text-volt font-semibold">{tier2DiscountPct}% off</span>
                      </div>
                    )}
                    {Number(tier3DiscountPct) > 0 && (
                      <div className="flex justify-between">
                        <span>{tier3MinQty}+ {unit || 'units'}</span>
                        <span className="text-volt font-semibold">{tier3DiscountPct}% off</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Fulfillment tag */}
              <div className="text-[11px] text-paper/70 flex items-center gap-2 pt-1 border-t border-paper/15 font-mono">
                <TruckIcon size={12} className="text-volt" />
                <span>
                  {deliveryAvailable
                    ? radius
                      ? `Depot delivery · ${radius}km radius + dock pickup`
                      : 'Island-wide delivery + dock pickup'
                    : 'Depot dock pickup only'}
                </span>
              </div>
            </div>
          </Surface>

          {/* Readiness card */}
          <Surface className="p-5 rounded-2xl border border-ink/10 bg-paper space-y-3 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-ink-1 uppercase tracking-wider">
                  Listing readiness
                </span>
                <p className="text-[11px] text-ink-4 mt-0.5">Complete the must-haves to publish</p>
              </div>
              <span className="text-[11px] font-mono font-bold text-volt-deep">
                {readinessScore}/{totalReadinessSteps}
              </span>
            </div>

            <div className="w-full h-2 rounded-full bg-bone overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-volt to-volt-deep transition-all duration-300"
                style={{ width: `${readinessPct}%` }}
              />
            </div>

            <ul className="space-y-1.5 text-xs pt-1">
              {readinessItems.map((r) => (
                <li
                  key={r.key}
                  className={cn(
                    'flex items-center gap-2',
                    r.done ? 'text-mint font-semibold' : 'text-ink-3',
                    r.optional && !r.done && 'text-ink-4',
                  )}
                >
                  <span
                    className={cn(
                      'w-4 h-4 rounded-full flex items-center justify-center text-[10px]',
                      r.done
                        ? 'bg-mint/15 text-mint'
                        : r.optional
                        ? 'bg-bone text-ink-4'
                        : 'bg-bone text-ink-4',
                    )}
                  >
                    {r.done ? <CheckIcon size={10} /> : r.optional ? '○' : '○'}
                  </span>
                  {r.label}
                  {r.optional && (
                    <span className="text-[9px] font-mono uppercase text-ink-4 tracking-wider">
                      (optional)
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </Surface>

          {/* Tips card */}
          <div className="p-4 bg-paper border border-ink/10 space-y-2.5">
            <div className="text-[10px] font-mono text-copper uppercase tracking-wider font-bold flex items-center gap-1.5">
              <SparklesIcon size={11} className="text-copper" /> Listing tips
            </div>
            <ul className="space-y-1.5 text-[11px] text-ink-3 leading-relaxed">
              <li>· Use the mill-gate pack size (e.g. 50kg bag) for clearer commercial pricing</li>
              <li>· Photos with packaging visible build 2.4× more buyer trust</li>
              <li>· Add at least one bulk tier — buyers prefer stacking discounts</li>
            </ul>
          </div>
        </div>
      </form>

      {/* Sticky bottom action bar */}
      <div className="sticky bottom-4 z-30 -mx-4 sm:mx-0">
        <div className="bg-paper border border-ink/15 shadow-float rounded-2xl px-5 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3 text-xs">
            <div
              className={cn(
                'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                canPublish
                  ? 'bg-ink text-volt'
                  : 'bg-ink/10 text-ink-3',
              )}
            >
              {canPublish ? <CheckCircle2Icon size={14} /> : <AlertCircleIcon size={14} />}
            </div>
            <div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-ink-4">
                Listing progress
              </div>
              <div className="font-semibold text-ink-1">
                {canPublish
                  ? isEdit
                    ? 'Ready to save changes'
                    : 'Ready to publish'
                  : `${readinessScore} of ${totalReadinessSteps} required fields complete`}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:shrink-0">
            <Link to="/supplier/products" className="hidden sm:inline-flex">
              <Button variant="ghost">Cancel</Button>
            </Link>
            <Button
              type="button"
              onClick={() => void handleSubmit()}
              loading={isSubmitting}
              disabled={!canPublish}
              className="font-bold uppercase tracking-wider"
            >
              {isEdit ? 'Save changes' : 'Publish wholesale product'}
              <ArrowRightIcon size={14} />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Local helpers ---------- */

function SectionCard({
  step,
  eyebrow,
  title,
  sub,
  complete,
  countLabel,
  countTone,
  actions,
  children,
}: {
  step: number;
  eyebrow: string;
  title: string;
  sub?: string;
  complete?: boolean;
  countLabel?: string;
  countTone?: 'mint' | 'ink' | 'volt' | 'amber';
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Surface className="p-6 rounded-2xl space-y-5 animate-fade-in">
      <div className="flex items-start justify-between gap-3 pb-3 border-b border-ink/10">
        <div className="flex items-start gap-3 min-w-0">
          <div
            className={cn(
              'w-8 h-8 rounded-full font-mono font-bold text-xs flex items-center justify-center shrink-0 shadow-xs',
              complete ? 'bg-mint text-paper' : 'bg-ink text-volt',
            )}
          >
            {complete ? <CheckCircle2Icon size={14} /> : step}
          </div>
          <div className="min-w-0">
            <div className="vyro-kicker text-copper">{eyebrow}</div>
            <h2 className="mt-1 text-lg font-bold text-ink-1">{title}</h2>
            {sub && <p className="text-xs text-ink-3 mt-0.5 max-w-xl">{sub}</p>}
          </div>
        </div>
        <div className="shrink-0 flex items-center gap-2">
          {countLabel && (
            <span
              className={cn(
                'hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-mono font-bold uppercase tracking-wider border',
                countTone === 'mint' && 'bg-mint/15 text-mint border-mint/30',
                countTone === 'ink' && 'bg-ink/10 text-ink-3 border-ink/20',
                countTone === 'volt' && 'bg-volt/15 text-ink-1 border-volt/30',
                countTone === 'amber' && 'bg-amber/15 text-amber border-amber/30',
                !countTone && 'bg-ink/10 text-ink-3 border-ink/20',
              )}
            >
              {countLabel}
            </span>
          )}
          {actions}
        </div>
      </div>
      {children}
    </Surface>
  );
}

function Field({
  label,
  required,
  optional,
  hint,
  mono,
  icon,
  children,
}: {
  label: string;
  required?: boolean;
  optional?: boolean;
  hint?: string;
  mono?: boolean;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1.5">
        {icon}
        <span>{label}</span>
        {required && <span className="text-rose">*</span>}
        {optional && (
          <span className="ml-1 font-mono text-[10px] uppercase tracking-wider text-ink-4 font-normal">
            optional
          </span>
        )}
      </Label>
      {children}
      {hint && <p className={cn('text-[11px] text-ink-4', mono && 'font-mono')}>{hint}</p>}
    </div>
  );
}

function PresetField({
  label,
  required,
  hint,
  value,
  onChange,
  presets,
  inputMode,
  mono,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  presets: { label: string; value: string }[];
  inputMode?: 'numeric' | 'decimal' | 'text';
  mono?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1.5">
        {label}
        {required && <span className="text-rose">*</span>}
      </Label>
      <Input
        type="text"
        inputMode={inputMode}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn('bg-paper', mono && 'font-mono text-xs font-bold')}
        required={required}
      />
      <div className="flex flex-wrap gap-1">
        {presets.map((p) => (
          <button
            key={p.value + p.label}
            type="button"
            onClick={() => onChange(p.value)}
            className={cn(
              'px-2 py-0.5 text-[11px] font-mono rounded-md border transition-all',
              value === p.value
                ? 'bg-ink text-volt font-bold border-ink'
                : 'bg-paper text-ink-3 border-ink/10 hover:border-ink/30',
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
      {hint && <p className="text-[11px] text-ink-4">{hint}</p>}
    </div>
  );
}

function TierCard({
  label,
  name,
  color,
  qtyValue,
  qtyOnChange,
  pctValue,
  pctOnChange,
  basePriceCents,
  unit,
}: {
  label: string;
  name: string;
  color: 'volt' | 'copper' | 'mint';
  qtyValue: string;
  qtyOnChange: (v: string) => void;
  pctValue: string;
  pctOnChange: (v: string) => void;
  basePriceCents: number;
  unit: string;
}) {
  const pct = Number(pctValue) || 0;
  const net = basePriceCents > 0 ? Math.round(basePriceCents * (1 - pct / 100)) : 0;
  const colorMap = {
    volt: { bg: 'bg-volt/10', text: 'text-volt-deep', border: 'border-volt/30' },
    copper: { bg: 'bg-copper/10', text: 'text-copper-deep', border: 'border-copper/30' },
    mint: { bg: 'bg-mint/10', text: 'text-mint', border: 'border-mint/30' },
  };
  const cm = colorMap[color];

  return (
    <div className="p-3.5 rounded-xl border border-ink/10 bg-paper-subtle/30 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-ink-1">
          {label} · {name}
        </span>
        <span className={cn('text-[10px] font-mono px-1.5 py-0.5 font-bold border', cm.bg, cm.text, cm.border)}>
          {pctValue}% OFF
        </span>
      </div>
      <div className="space-y-2">
        <div>
          <Label className="text-[10px] text-ink-4">Min qty</Label>
          <Input
            type="number"
            value={qtyValue}
            onChange={(e) => qtyOnChange(e.target.value)}
            className="bg-paper font-mono text-xs"
          />
        </div>
        <div>
          <Label className="text-[10px] text-ink-4">Discount %</Label>
          <Input
            type="number"
            min="0"
            max="90"
            value={pctValue}
            onChange={(e) => pctOnChange(e.target.value)}
            className="bg-paper font-mono text-xs font-bold"
          />
        </div>
        {basePriceCents > 0 && (
          <p className="text-[11px] font-mono text-ink-3 pt-1 border-t border-ink/10">
            Net: <span className="text-ink-1 font-bold">{formatLKR(net)}</span>{' '}
            <span className="text-ink-4">/ {unit}</span>
          </p>
        )}
      </div>
    </div>
  );
}

function FulfillmentOption({
  icon,
  title,
  description,
  active,
  locked,
  onToggle,
  tone,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  active: boolean;
  locked?: boolean;
  onToggle?: () => void;
  tone: 'volt' | 'copper';
}) {
  return (
    <div
      onClick={locked ? undefined : onToggle}
      className={cn(
        'p-4 rounded-xl border flex items-start gap-3 transition-all',
        active
          ? tone === 'volt'
            ? 'border-volt/40 bg-volt/[0.06]'
            : 'border-copper/40 bg-copper/[0.06]'
          : 'border-ink/10 bg-paper-subtle/20 opacity-70',
        !locked && 'cursor-pointer hover:opacity-100',
      )}
    >
      <div
        className={cn(
          'size-9 flex items-center justify-center shrink-0',
          active
            ? tone === 'volt'
              ? 'bg-volt/20 text-volt-deep'
              : 'bg-copper/20 text-copper-deep'
            : 'bg-bone text-ink-3',
        )}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-xs font-bold text-ink-1">{title}</p>
          {locked && (
            <span className="text-[9px] font-mono uppercase tracking-wider bg-mint/15 text-mint border border-mint/30 px-1.5 py-0.5 font-bold">
              Always on
            </span>
          )}
          {!locked && (
            <span
              className={cn(
                'text-[9px] font-mono uppercase tracking-wider font-bold px-1.5 py-0.5',
                active ? 'bg-mint/15 text-mint' : 'bg-ink/10 text-ink-3',
              )}
            >
              {active ? 'On' : 'Off'}
            </span>
          )}
        </div>
        <p className="text-[11px] text-ink-3 mt-1 leading-relaxed">{description}</p>
      </div>
      {!locked && (
        <ToggleSwitch checked={active} onChange={() => onToggle?.()} hideLabel />
      )}
    </div>
  );
}

function ToggleSwitch({
  checked,
  onChange,
  label,
  hideLabel,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  hideLabel?: boolean;
}) {
  return (
    <label className="inline-flex items-center gap-2 cursor-pointer select-none">
      {!hideLabel && label && (
        <span className="text-xs font-semibold text-ink-2">{label}</span>
      )}
      <button
        type="button"
        onClick={() => onChange(!checked)}
        aria-pressed={checked}
        className={cn(
          'relative inline-flex h-5 w-9 rounded-full transition-colors',
          checked ? 'bg-ink' : 'bg-mist',
        )}
      >
        <span
          className={cn(
            'inline-block size-4 rounded-full bg-paper shadow transform transition-transform mt-0.5',
            checked ? 'translate-x-[18px] bg-volt' : 'translate-x-0.5',
          )}
        />
      </button>
    </label>
  );
}

function FormStepper({
  sections,
  state,
}: {
  sections: ReadonlyArray<{ key: string; label: string; hint: string; icon: React.ComponentType<{ size?: number; className?: string }> }>;
  state: { key: string; done: boolean }[];
}) {
  return (
    <ol className="flex items-start w-full">
      {sections.map((s, i) => {
        const done = state.find((x) => x.key === s.key)?.done;
        const isActive = !done && (i === sections.findIndex((x) => !state.find((y) => y.key === x.key)?.done));
        return (
          <li key={s.key} className="flex-1 min-w-0 flex items-start">
            <div className="flex flex-col items-start gap-1.5 min-w-0 w-full">
              <div className="flex items-center w-full">
                <span
                  className={cn(
                    'relative z-[1] size-2.5 rotate-45 shrink-0',
                    done ? 'bg-mint' : isActive ? 'bg-volt animate-mark-pulse' : 'bg-mist',
                  )}
                />
                {i < sections.length - 1 && (
                  <span className="relative mx-2 h-px flex-1 overflow-hidden bg-ink/15">
                    <span
                      className={cn(
                        'absolute inset-y-0 left-0 w-1/2 bg-volt',
                        done && 'w-full',
                      )}
                    />
                  </span>
                )}
              </div>
              <div className="min-w-0 pr-3">
                <div
                  className={cn(
                    'text-[10px] font-mono font-bold tracking-wide uppercase',
                    done ? 'text-mint' : isActive ? 'text-ink' : 'text-ink-4',
                  )}
                >
                  0{i + 1} · {s.label}
                </div>
                <div className="text-[9px] text-ink-4 mt-0.5 truncate">{s.hint}</div>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
