import { useEffect, useState, useMemo, useRef, type FormEvent } from 'react';
import { useNavigate, useParams, Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { PageHeader, Button, Input, Label, Badge } from '@/components/ui';
import { Surface, ProductImage } from '@/components/brand/Surface';
import { useSupplierId } from './useSupplierId';
import { SupplierErrorState, SupplierLoadingState } from './SupplierPageState';
import {
  PackageIcon,
  ArrowLeftIcon,
  CheckCircleIcon,
  TruckIcon,
  PercentIcon,
  SearchIcon,
  EyeIcon,
  CheckIcon,
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
} from '@/components/icons';
import { formatLKR } from '@/lib/format';

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
  { label: 'Same Day (0d)', value: '0' },
  { label: '1 Day', value: '1' },
  { label: '2-3 Days', value: '3' },
  { label: '5-7 Days', value: '7' },
];

const RADIUS_PRESETS = [
  { label: '25 km (Local)', value: '25' },
  { label: '50 km (Metro)', value: '50' },
  { label: '100 km (Regional)', value: '100' },
  { label: 'Island-wide (No limit)', value: '' },
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

function FormField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <Label className="text-xs font-semibold uppercase tracking-wider text-ink-3">{label}</Label>
        {hint && <span className="text-[11px] text-ink-4">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

export function SupplierProductFormPage({ mode }: { mode: 'create' | 'edit' }) {
  const { supplierId, supplierName } = useSupplierId();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
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
    if (existingOffer.tier1DiscountPct != null) setTier1DiscountPct(String(existingOffer.tier1DiscountPct));
    if (existingOffer.tier2MinQty != null) setTier2MinQty(String(existingOffer.tier2MinQty));
    if (existingOffer.tier2DiscountPct != null) setTier2DiscountPct(String(existingOffer.tier2DiscountPct));
    if (existingOffer.tier3MinQty != null) setTier3MinQty(String(existingOffer.tier3MinQty));
    if (existingOffer.tier3DiscountPct != null) setTier3DiscountPct(String(existingOffer.tier3DiscountPct));
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
    return categories.filter((c) => c.name.toLowerCase().includes(q) || c.slug.toLowerCase().includes(q));
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

  const priceCents = () => {
    const n = Number.parseFloat(priceLkr);
    if (Number.isNaN(n) || n <= 0) return 0;
    return Math.round(n * 100);
  };

  // Readiness Checklist calculation
  const hasCategory = Boolean(categoryId);
  const hasName = Boolean(productName.trim());
  const hasUnit = Boolean(unit.trim());
  const hasPrice = priceCents() > 0;
  const hasMoq = Number(minQty) >= 1;
  const hasImage = Boolean(imagePreviewUrl || existingImageUrl);

  const readinessScore = [hasCategory, hasName, hasUnit, hasPrice, hasMoq].filter(Boolean).length;
  const totalReadinessSteps = 5;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
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
    const cents = priceCents();
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
        // 1. Create product under the admin category
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
        // Edit mode: update existing product details
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

      // 2. Upload image to R2 if selected
      if (selectedImageFile) {
        const base64 = await fileToBase64(selectedImageFile);
        await api.post(`/products/${targetProductId}/images`, {
          filename: selectedImageFile.name,
          contentType: selectedImageFile.type || 'image/jpeg',
          base64,
        });
      }

      // 3. Create or update supplier-product offer
      const offerPayload: Record<string, any> = {
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

  // Active display image
  const displayImageUrl = imagePreviewUrl || existingImageUrl || null;

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-20">
      {/* Header */}
      <div>
        <Link
          to="/supplier/products"
          className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ink-3 hover:text-ink-1 transition-colors mb-3"
        >
          <ArrowLeftIcon className="w-3.5 h-3.5" /> Back to Products
        </Link>
        <PageHeader
          title={isEdit ? 'Edit Wholesale Product' : 'Create Wholesale Product'}
          sub={
            isEdit
              ? 'Update your product specifications, imagery, pricing, and fulfillment coverage.'
              : 'Select an admin category, define your product details and imagery, and set your wholesale commercial terms.'
          }
        />
      </div>

      {err && (
        <div className="p-4 rounded-xl bg-danger/10 border border-danger/20 text-danger text-sm flex items-start gap-3">
          <AlertCircleIcon className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold">Unable to proceed</p>
            <p className="mt-0.5 text-danger/90">{err}</p>
          </div>
          <button
            type="button"
            onClick={() => setErr(null)}
            className="text-danger/60 hover:text-danger text-xs font-bold uppercase tracking-wider"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* 2-Column Responsive Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Form Configuration (8 Cols) */}
        <form onSubmit={handleSubmit} className="lg:col-span-8 space-y-6">
          {/* SECTION 1: Category Selection */}
          <Surface className="p-6 rounded-2xl border border-paper-subtle space-y-5 bg-paper">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="w-7 h-7 rounded-full bg-emerald-600 text-white font-mono font-bold text-xs flex items-center justify-center shadow-sm">
                  1
                </span>
                <div>
                  <h2 className="text-base font-bold text-ink-1">Select Product Category</h2>
                  <p className="text-xs text-ink-3">
                    Choose from categories created by platform administrators
                  </p>
                </div>
              </div>
              <Badge variant="neutral" className="font-mono text-xs">
                {categories.length} Categories Configured
              </Badge>
            </div>

            {/* Category Search Filter */}
            {categories.length > 6 && (
              <div className="relative">
                <SearchIcon className="w-4 h-4 text-ink-4 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Filter categories (e.g. Food, Furniture, Packaging, Hardware)..."
                  value={categorySearch}
                  onChange={(e) => setCategorySearch(e.target.value)}
                  className="w-full pl-9.5 pr-4 py-2 text-xs rounded-xl bg-paper-subtle/50 border border-paper-subtle focus:border-emerald-600 focus:bg-paper transition-all outline-none"
                />
                {categorySearch && (
                  <button
                    type="button"
                    onClick={() => setCategorySearch('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-4 hover:text-ink-1 text-xs"
                  >
                    Clear
                  </button>
                )}
              </div>
            )}

            {/* Category Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 max-h-72 overflow-y-auto pr-1">
              {filteredCategories.map((cat) => {
                const isSelected = categoryId === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategoryId(cat.id)}
                    className={`flex items-center justify-between p-3 rounded-xl border text-left transition-all ${
                      isSelected
                        ? 'border-emerald-600 bg-emerald-500/10 text-emerald-950 font-semibold shadow-sm'
                        : 'border-paper-subtle hover:border-ink-4 bg-paper-subtle/30 text-ink-2 hover:bg-paper-subtle/60'
                    }`}
                  >
                    <div className="min-w-0 pr-2">
                      <p className="text-xs truncate font-medium">{cat.name}</p>
                      <p className="text-[10px] text-ink-4 font-mono truncate">{cat.slug}</p>
                    </div>
                    {isSelected ? (
                      <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center flex-shrink-0">
                        <CheckIcon className="w-3 h-3" />
                      </span>
                    ) : (
                      <span className="w-4 h-4 rounded-full border border-paper-subtle flex-shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>

            {selectedCategoryObj && (
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs flex items-center justify-between text-emerald-900">
                <span className="flex items-center gap-2">
                  <CheckCircleIcon className="w-4 h-4 text-emerald-600" />
                  Listing under category: <strong>{selectedCategoryObj.name}</strong>
                </span>
                <span className="text-[11px] font-mono opacity-80">{selectedCategoryObj.slug}</span>
              </div>
            )}
          </Surface>

          {/* SECTION 2: Product Identity & Specs */}
          <Surface className="p-6 rounded-2xl border border-paper-subtle space-y-5 bg-paper">
            <div className="flex items-center gap-3">
              <span className="w-7 h-7 rounded-full bg-emerald-600 text-white font-mono font-bold text-xs flex items-center justify-center shadow-sm">
                2
              </span>
              <div>
                <h2 className="text-base font-bold text-ink-1">Product Details & Specifications</h2>
                <p className="text-xs text-ink-3">
                  Define the name, brand, billing unit, and packaging specs for your product
                </p>
              </div>
            </div>

            <div className="space-y-4 pt-1">
              {/* Product Name */}
              <FormField
                label="Product Title / Name *"
                hint="Descriptive name visible to all wholesale buyers"
              >
                <Input
                  type="text"
                  placeholder="e.g. Ceylon Cinnamon Quills Grade ALBA 25kg, Solid Teak 6-Seater Banquet Table"
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  className="font-medium"
                  required
                />
              </FormField>

              {/* Brand & Billing Unit in 2 cols */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField label="Brand / Manufacturer" hint="Optional (leave blank if unbranded)">
                  <Input
                    type="text"
                    placeholder="e.g. Royal Spices, CraftWood, In-House"
                    value={brand}
                    onChange={(e) => setBrand(e.target.value)}
                  />
                </FormField>

                <FormField label="Standard Billing Unit *" hint="Wholesale transaction unit">
                  <Input
                    type="text"
                    placeholder="e.g. kg, bag, unit, set, pack"
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    required
                  />
                </FormField>
              </div>

              {/* Quick Unit Presets */}
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                <span className="text-[11px] font-semibold text-ink-4 mr-1">Common Units:</span>
                {COMMON_UNITS.map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => setUnit(u)}
                    className={`px-2.5 py-0.5 rounded-full text-xs font-mono transition-all ${
                      unit.toLowerCase() === u
                        ? 'bg-emerald-600 text-white font-semibold shadow-xs'
                        : 'bg-paper-subtle/80 hover:bg-paper-subtle text-ink-3 border border-paper-subtle'
                    }`}
                  >
                    {u}
                  </button>
                ))}
              </div>

              {/* Pack Size */}
              <FormField
                label="Packaging Specification / Pack Size"
                hint="Packaging format or dimensions"
              >
                <Input
                  type="text"
                  placeholder="e.g. 25kg vacuum-sealed sack, Set of 4, 12 bottles/carton, 180cm x 90cm"
                  value={packSize}
                  onChange={(e) => setPackSize(e.target.value)}
                />
              </FormField>

              {/* Description */}
              <FormField
                label="Product Specifications & Details"
                hint="Detailed specifications, material origin, certifications, storage conditions"
              >
                <textarea
                  rows={3}
                  placeholder="Provide technical specifications, quality grades, moisture levels, warranty, or packaging details for enterprise purchasing managers..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full p-3 text-xs rounded-xl bg-paper-subtle/30 border border-paper-subtle focus:border-emerald-600 focus:bg-paper outline-none transition-all resize-y"
                />
              </FormField>
            </div>
          </Surface>

          {/* SECTION 3: Product Photography */}
          <Surface className="p-6 rounded-2xl border border-paper-subtle space-y-5 bg-paper">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="w-7 h-7 rounded-full bg-emerald-600 text-white font-mono font-bold text-xs flex items-center justify-center shadow-sm">
                  3
                </span>
                <div>
                  <h2 className="text-base font-bold text-ink-1">Product Photo & Depot Packaging</h2>
                  <p className="text-xs text-ink-3">
                    Upload direct photography of your product or packaging as received at depot
                  </p>
                </div>
              </div>
              {displayImageUrl && (
                <Badge variant="success" className="gap-1 font-semibold text-xs">
                  <CheckIcon className="w-3.5 h-3.5" /> Photo Attached
                </Badge>
              )}
            </div>

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
                className="border-2 border-dashed border-paper-subtle hover:border-emerald-600 rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all bg-paper-subtle/20 hover:bg-emerald-500/5 group"
              >
                <div className="w-12 h-12 rounded-2xl bg-paper-subtle group-hover:bg-emerald-100 text-ink-3 group-hover:text-emerald-700 flex items-center justify-center transition-colors mb-3">
                  <UploadCloudIcon className="w-6 h-6" />
                </div>
                <p className="text-sm font-bold text-ink-1">
                  Click or drag to upload product photography
                </p>
                <p className="text-xs text-ink-3 mt-1">
                  Supports JPG, PNG, and WEBP formats up to 5MB
                </p>
                <div className="mt-4">
                  <Button type="button" variant="secondary" size="sm" className="gap-2 text-xs">
                    <PlusIcon className="w-3.5 h-3.5" /> Browse Image Files
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row items-center gap-5 p-4 rounded-2xl bg-paper-subtle/30 border border-paper-subtle">
                <div className="w-24 h-24 rounded-xl overflow-hidden bg-paper-subtle border border-paper-subtle flex-shrink-0 shadow-inner">
                  <img
                    src={displayImageUrl}
                    alt={productName || 'Product photo'}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex-1 min-w-0 text-center sm:text-left">
                  <p className="text-xs font-bold text-ink-1 truncate">
                    {selectedImageFile ? selectedImageFile.name : 'Current Depot Product Photo'}
                  </p>
                  <p className="text-[11px] text-ink-4 mt-0.5">
                    {selectedImageFile
                      ? `${(selectedImageFile.size / 1024).toFixed(1)} KB • Ready for cloud upload`
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
                      <Edit3Icon className="w-3.5 h-3.5" /> Change Photo
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={removeSelectedImage}
                      className="text-xs text-danger hover:text-danger gap-1.5"
                    >
                      <XIcon className="w-3.5 h-3.5" /> Remove
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </Surface>

          {/* SECTION 4: Commercial Pricing & MOQ */}
          <Surface className="p-6 rounded-2xl border border-paper-subtle space-y-5 bg-paper">
            <div className="flex items-center gap-3">
              <span className="w-7 h-7 rounded-full bg-emerald-600 text-white font-mono font-bold text-xs flex items-center justify-center shadow-sm">
                4
              </span>
              <div>
                <h2 className="text-base font-bold text-ink-1">
                  Wholesale Pricing & Minimum Order (MOQ)
                </h2>
                <p className="text-xs text-ink-3">
                  Set your base wholesale unit rate and purchase commitment rules
                </p>
              </div>
            </div>

            <div className="space-y-4 pt-1">
              {/* Internal SKU & Stock availability */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField label="Internal Supplier SKU" hint="Warehouse reference">
                  <Input
                    type="text"
                    placeholder="e.g. WH-FURN-2026-01"
                    value={supplierSku}
                    onChange={(e) => setSupplierSku(e.target.value)}
                    className="font-mono text-xs"
                  />
                </FormField>

                <FormField label="Stock Availability Status" hint="Marketplace visibility">
                  <select
                    value={avail}
                    onChange={(e) => setAvail(e.target.value as any)}
                    className="w-full h-9 px-3 rounded-lg border border-paper-subtle bg-paper text-ink-1 text-xs focus:border-emerald-600 outline-none"
                  >
                    <option value="in_stock">✓ In Stock (Ready for immediate dispatch)</option>
                    <option value="low">⚠ Low Stock (Limited depot allocation)</option>
                    <option value="out_of_stock">✕ Out of Stock (Pre-order / Backorder)</option>
                  </select>
                </FormField>
              </div>

              {/* Price */}
              <FormField
                label={`Base Wholesale Rate (LKR / ${unit || 'unit'}) *`}
                hint="Net wholesale price per unit before volume discounts"
              >
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-xs font-bold text-ink-3">
                    Rs.
                  </span>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={priceLkr}
                    onChange={(e) => setPriceLkr(e.target.value)}
                    className="pl-11 font-mono font-bold text-sm"
                    required
                  />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-ink-4">
                    / {unit || 'unit'}
                  </span>
                </div>
              </FormField>

              {/* MOQ & Lead Time in 2 cols */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <FormField label="Minimum Order Qty (MOQ) *" hint="Smallest order accepted">
                    <Input
                      type="number"
                      min="1"
                      value={minQty}
                      onChange={(e) => setMinQty(e.target.value)}
                      className="font-mono text-xs font-bold"
                      required
                    />
                  </FormField>
                  <div className="flex flex-wrap gap-1">
                    {MOQ_PRESETS.map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => setMinQty(String(q))}
                        className={`px-2 py-0.5 text-[11px] font-mono rounded border transition-all ${
                          minQty === String(q)
                            ? 'bg-ink-1 text-paper font-bold border-ink-1'
                            : 'bg-paper-subtle/50 text-ink-3 border-paper-subtle hover:border-ink-4'
                        }`}
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <FormField label="Dispatch Lead Time (Days) *" hint="Time from order to dispatch">
                    <Input
                      type="number"
                      min="0"
                      value={lead}
                      onChange={(e) => setLead(e.target.value)}
                      className="font-mono text-xs font-bold"
                      required
                    />
                  </FormField>
                  <div className="flex flex-wrap gap-1">
                    {LEAD_PRESETS.map((p) => (
                      <button
                        key={p.value}
                        type="button"
                        onClick={() => setLead(p.value)}
                        className={`px-2 py-0.5 text-[11px] rounded border transition-all ${
                          lead === p.value
                            ? 'bg-ink-1 text-paper font-bold border-ink-1'
                            : 'bg-paper-subtle/50 text-ink-3 border-paper-subtle hover:border-ink-4'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Minimum Purchase Commitment Banner */}
              {priceCents() > 0 && Number(minQty) > 0 && (
                <div className="p-3.5 rounded-xl bg-ink-1 text-paper flex items-center justify-between shadow-sm">
                  <div className="text-xs">
                    <p className="font-semibold text-paper/80">Minimum Order Commitment</p>
                    <p className="text-[11px] text-paper/60 font-mono">
                      {minQty} {unit || 'units'} × {formatLKR(priceCents())}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono font-bold text-sm text-volt">
                      {formatLKR(priceCents() * (Number(minQty) || 1))}
                    </p>
                    <p className="text-[10px] text-paper/60">Minimum PO Value</p>
                  </div>
                </div>
              )}
            </div>
          </Surface>

          {/* SECTION 5: Volume Discount Ladders (Optional) */}
          <Surface className="p-6 rounded-2xl border border-paper-subtle space-y-5 bg-paper">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="w-7 h-7 rounded-full bg-emerald-600 text-white font-mono font-bold text-xs flex items-center justify-center shadow-sm">
                  5
                </span>
                <div>
                  <h2 className="text-base font-bold text-ink-1">
                    Volume Discount Ladders (Optional)
                  </h2>
                  <p className="text-xs text-ink-3">
                    Reward buyers who order pallet or truckload quantities
                  </p>
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <span className="text-xs font-semibold text-ink-2">Enable Tiers</span>
                <input
                  type="checkbox"
                  checked={enableTiers}
                  onChange={(e) => setEnableTiers(e.target.checked)}
                  className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
                />
              </label>
            </div>

            {enableTiers && (
              <div className="space-y-4 pt-1">
                <p className="text-xs text-ink-3">
                  Configure tiered bulk discounts based on minimum order quantity thresholds:
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Tier 1 */}
                  <div className="p-3.5 rounded-xl border border-paper-subtle bg-paper-subtle/30 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-ink-1">Tier 1 Wholesale</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-paper font-semibold border border-paper-subtle">
                        {tier1DiscountPct}% OFF
                      </span>
                    </div>
                    <div className="space-y-2">
                      <div>
                        <Label className="text-[10px] text-ink-4">Min Qty</Label>
                        <Input
                          type="number"
                          value={tier1MinQty}
                          onChange={(e) => setTier1MinQty(e.target.value)}
                          className="font-mono text-xs"
                        />
                      </div>
                      <div>
                        <Label className="text-[10px] text-ink-4">Discount %</Label>
                        <Input
                          type="number"
                          min="0"
                          max="90"
                          value={tier1DiscountPct}
                          onChange={(e) => setTier1DiscountPct(e.target.value)}
                          className="font-mono text-xs font-bold"
                        />
                      </div>
                      {priceCents() > 0 && (
                        <p className="text-[11px] font-mono text-ink-3 pt-1 border-t border-paper-subtle">
                          Net: {formatLKR(Math.round(priceCents() * (1 - (Number(tier1DiscountPct) || 0) / 100)))}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Tier 2 */}
                  <div className="p-3.5 rounded-xl border border-paper-subtle bg-paper-subtle/30 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-ink-1">Tier 2 Pallet</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-paper font-semibold border border-paper-subtle">
                        {tier2DiscountPct}% OFF
                      </span>
                    </div>
                    <div className="space-y-2">
                      <div>
                        <Label className="text-[10px] text-ink-4">Min Qty</Label>
                        <Input
                          type="number"
                          value={tier2MinQty}
                          onChange={(e) => setTier2MinQty(e.target.value)}
                          className="font-mono text-xs"
                        />
                      </div>
                      <div>
                        <Label className="text-[10px] text-ink-4">Discount %</Label>
                        <Input
                          type="number"
                          min="0"
                          max="90"
                          value={tier2DiscountPct}
                          onChange={(e) => setTier2DiscountPct(e.target.value)}
                          className="font-mono text-xs font-bold"
                        />
                      </div>
                      {priceCents() > 0 && (
                        <p className="text-[11px] font-mono text-ink-3 pt-1 border-t border-paper-subtle">
                          Net: {formatLKR(Math.round(priceCents() * (1 - (Number(tier2DiscountPct) || 0) / 100)))}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Tier 3 */}
                  <div className="p-3.5 rounded-xl border border-paper-subtle bg-paper-subtle/30 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-ink-1">Tier 3 Truckload</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-paper font-semibold border border-paper-subtle">
                        {tier3DiscountPct}% OFF
                      </span>
                    </div>
                    <div className="space-y-2">
                      <div>
                        <Label className="text-[10px] text-ink-4">Min Qty</Label>
                        <Input
                          type="number"
                          value={tier3MinQty}
                          onChange={(e) => setTier3MinQty(e.target.value)}
                          className="font-mono text-xs"
                        />
                      </div>
                      <div>
                        <Label className="text-[10px] text-ink-4">Discount %</Label>
                        <Input
                          type="number"
                          min="0"
                          max="90"
                          value={tier3DiscountPct}
                          onChange={(e) => setTier3DiscountPct(e.target.value)}
                          className="font-mono text-xs font-bold"
                        />
                      </div>
                      {priceCents() > 0 && (
                        <p className="text-[11px] font-mono text-ink-3 pt-1 border-t border-paper-subtle">
                          Net: {formatLKR(Math.round(priceCents() * (1 - (Number(tier3DiscountPct) || 0) / 100)))}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </Surface>

          {/* SECTION 6: Delivery & Fulfillment */}
          <Surface className="p-6 rounded-2xl border border-paper-subtle space-y-5 bg-paper">
            <div className="flex items-center gap-3">
              <span className="w-7 h-7 rounded-full bg-emerald-600 text-white font-mono font-bold text-xs flex items-center justify-center shadow-sm">
                6
              </span>
              <div>
                <h2 className="text-base font-bold text-ink-1">Fulfillment & Delivery Coverage</h2>
                <p className="text-xs text-ink-3">Configure dock collection and fleet delivery</p>
              </div>
            </div>

            <div className="space-y-4 pt-1">
              {/* Pickup & Delivery Option Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Depot Pickup */}
                <div className="p-4 rounded-xl border border-emerald-600/30 bg-emerald-500/5 flex items-start gap-3">
                  <WarehouseIcon className="w-5 h-5 text-emerald-600 mt-0.5" />
                  <div>
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-bold text-ink-1">Depot Dock Pickup</p>
                      <Badge variant="success" className="text-[10px]">Active</Badge>
                    </div>
                    <p className="text-[11px] text-ink-3 mt-1">
                      Buyers dispatch transport to pick up directly from your depot dock
                    </p>
                  </div>
                </div>

                {/* Delivery */}
                <div
                  onClick={() => setDeliveryAvailable(!deliveryAvailable)}
                  className={`p-4 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                    deliveryAvailable
                      ? 'border-emerald-600/30 bg-emerald-500/5'
                      : 'border-paper-subtle bg-paper-subtle/20 opacity-60'
                  }`}
                >
                  <TruckIcon className="w-5 h-5 text-emerald-600 mt-0.5" />
                  <div>
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-bold text-ink-1">Supplier Fleet Delivery</p>
                      <input
                        type="checkbox"
                        checked={deliveryAvailable}
                        onChange={() => {}}
                        className="w-3.5 h-3.5 rounded text-emerald-600"
                      />
                    </div>
                    <p className="text-[11px] text-ink-3 mt-1">
                      Deliver directly to buyer warehouse with your own vehicles
                    </p>
                  </div>
                </div>
              </div>

              {/* Delivery Radius */}
              {deliveryAvailable && (
                <div className="space-y-2 pt-1">
                  <FormField
                    label="Delivery Radius (km)"
                    hint="Leave blank for island-wide delivery"
                  >
                    <Input
                      type="number"
                      placeholder="e.g. 50 (blank = Island-wide)"
                      value={radius}
                      onChange={(e) => setRadius(e.target.value)}
                      className="font-mono text-xs"
                    />
                  </FormField>

                  <div className="flex flex-wrap gap-1.5">
                    {RADIUS_PRESETS.map((p) => (
                      <button
                        key={p.value}
                        type="button"
                        onClick={() => setRadius(p.value)}
                        className={`px-2.5 py-1 rounded text-xs border transition-all ${
                          radius === p.value
                            ? 'bg-ink-1 text-paper font-semibold border-ink-1'
                            : 'bg-paper-subtle/50 text-ink-3 border-paper-subtle hover:border-ink-4'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Surface>

          {/* Active switch in Edit Mode */}
          {isEdit && (
            <Surface className="p-4 rounded-xl border border-paper-subtle bg-paper flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-ink-1">Listing Active Status</p>
                <p className="text-[11px] text-ink-3">
                  When active, enterprise buyers can find and purchase this product on the marketplace
                </p>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                  className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
                />
                <span className="text-xs font-bold text-ink-1">
                  {active ? 'Active' : 'Archived'}
                </span>
              </label>
            </Surface>
          )}
        </form>

        {/* Right Column: Marketplace Live Preview & Readiness (4 Cols Sticky) */}
        <div className="lg:col-span-4 space-y-6 lg:sticky lg:top-6">
          {/* Marketplace Live Preview Card */}
          <Surface className="p-5 rounded-2xl border border-paper-subtle bg-paper space-y-4 shadow-sm">
            <div className="flex items-center justify-between pb-3 border-b border-paper-subtle">
              <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-ink-3">
                <EyeIcon className="w-3.5 h-3.5" /> Marketplace Live Preview
              </span>
              <Badge variant="neutral" className="text-[10px] uppercase font-bold text-emerald-700 bg-emerald-50 border-emerald-200">
                Buyer View
              </Badge>
            </div>

            {/* Product Card as seen on marketplace */}
            <div className="space-y-4">
              {/* Product Image */}
              <div className="w-full aspect-[4/3] rounded-xl overflow-hidden bg-paper-subtle border border-paper-subtle relative flex items-center justify-center">
                {displayImageUrl ? (
                  <img
                    src={displayImageUrl}
                    alt={productName || 'Product preview'}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center p-6 text-center text-ink-4">
                    <PackageIcon className="w-10 h-10 stroke-1 mb-2 opacity-50" />
                    <p className="text-xs font-medium">No photo uploaded yet</p>
                    <p className="text-[10px] text-ink-4 mt-0.5">Upload photo in Step 3</p>
                  </div>
                )}
                {/* Stock badge */}
                <div className="absolute top-2.5 right-2.5">
                  <Badge
                    variant={avail === 'in_stock' ? 'success' : avail === 'low' ? 'warning' : 'danger'}
                    className="text-[10px] uppercase font-mono shadow-xs"
                  >
                    {avail === 'in_stock' ? 'In Stock' : avail === 'low' ? 'Low Stock' : 'Out of Stock'}
                  </Badge>
                </div>
              </div>

              {/* Supplier & Category */}
              <div>
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="w-5 h-5 rounded-md bg-ink-1 text-paper text-[10px] font-bold flex items-center justify-center">
                    {(supplierName || 'S').charAt(0).toUpperCase()}
                  </span>
                  <span className="text-xs font-bold text-ink-2 truncate">
                    {supplierName || 'Your Supplier Depot'}
                  </span>
                  <span className="text-[10px] text-emerald-700 font-medium flex items-center gap-0.5">
                    <ShieldCheckIcon className="w-3 h-3 inline" /> Verified Depot
                  </span>
                </div>

                {selectedCategoryObj && (
                  <span className="inline-block px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-800 text-[10px] font-semibold border border-emerald-500/20 mb-1.5">
                    {selectedCategoryObj.name}
                  </span>
                )}

                <h3 className="text-base font-bold text-ink-1 leading-snug">
                  {productName || 'Product Title...'}
                </h3>
                <div className="flex items-center gap-2 text-[11px] text-ink-3 mt-1">
                  {brand && <span>Brand: <strong>{brand}</strong></span>}
                  {packSize && <span>• Pack: <strong>{packSize}</strong></span>}
                </div>
              </div>

              {/* Wholesale Rate Box */}
              <div className="p-3.5 rounded-xl bg-paper-subtle/50 border border-paper-subtle">
                <div className="flex items-baseline justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">
                    Wholesale Rate
                  </span>
                  <span className="text-xs font-mono text-ink-4">Per {unit || 'unit'}</span>
                </div>
                <div className="mt-1">
                  <span className="text-xl font-mono font-bold text-ink-1">
                    {priceCents() > 0 ? formatLKR(priceCents()) : 'Rs. 0.00'}
                  </span>
                  <span className="text-xs text-ink-3 ml-1">/ {unit || 'unit'}</span>
                </div>
              </div>

              {/* Commercial Badges */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 rounded-lg border border-paper-subtle bg-paper-subtle/20">
                  <span className="text-[10px] text-ink-4 block">Min Order (MOQ)</span>
                  <span className="font-mono font-bold text-ink-1">
                    {minQty || '1'} {unit || 'units'}
                  </span>
                </div>
                <div className="p-2.5 rounded-lg border border-paper-subtle bg-paper-subtle/20">
                  <span className="text-[10px] text-ink-4 block">Dispatch Lead</span>
                  <span className="font-mono font-bold text-ink-1">
                    {lead === '0' ? 'Same Day' : `${lead} day${lead === '1' ? '' : 's'}`}
                  </span>
                </div>
              </div>

              {/* Volume Tiers preview if active */}
              {enableTiers && Number(tier1DiscountPct) > 0 && (
                <div className="p-3 rounded-xl border border-paper-subtle bg-paper-subtle/30 space-y-1.5 text-[11px]">
                  <p className="font-bold text-ink-2">Bulk Volume Tiers</p>
                  <div className="space-y-1 font-mono text-ink-3">
                    <div className="flex justify-between">
                      <span>{tier1MinQty}+ {unit}</span>
                      <span className="text-emerald-700 font-semibold">{tier1DiscountPct}% off</span>
                    </div>
                    {Number(tier2DiscountPct) > 0 && (
                      <div className="flex justify-between">
                        <span>{tier2MinQty}+ {unit}</span>
                        <span className="text-emerald-700 font-semibold">{tier2DiscountPct}% off</span>
                      </div>
                    )}
                    {Number(tier3DiscountPct) > 0 && (
                      <div className="flex justify-between">
                        <span>{tier3MinQty}+ {unit}</span>
                        <span className="text-emerald-700 font-semibold">{tier3DiscountPct}% off</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Fulfillment tags */}
              <div className="text-[11px] text-ink-3 flex items-center gap-2 pt-1 border-t border-paper-subtle">
                <TruckIcon className="w-3.5 h-3.5 text-emerald-600" />
                <span>
                  {deliveryAvailable
                    ? radius
                      ? `Depot Delivery within ${radius}km & Dock Pickup`
                      : 'Island-wide Depot Delivery & Dock Pickup'
                    : 'Depot Dock Pickup Only'}
                </span>
              </div>
            </div>
          </Surface>

          {/* Listing Readiness Meter */}
          <Surface className="p-5 rounded-2xl border border-paper-subtle bg-paper space-y-3 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-ink-1">Listing Readiness</span>
              <span className="text-[11px] font-mono font-bold text-emerald-700">
                {readinessScore}/{totalReadinessSteps} Complete
              </span>
            </div>

            {/* Progress Bar */}
            <div className="w-full h-2 rounded-full bg-paper-subtle overflow-hidden">
              <div
                className="h-full bg-emerald-600 transition-all duration-300"
                style={{ width: `${(readinessScore / totalReadinessSteps) * 100}%` }}
              />
            </div>

            {/* Checklist */}
            <ul className="space-y-1.5 text-xs text-ink-3 pt-1">
              <li className={`flex items-center gap-2 ${hasCategory ? 'text-emerald-700 font-semibold' : ''}`}>
                <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${hasCategory ? 'bg-emerald-100 text-emerald-700' : 'bg-paper-subtle text-ink-4'}`}>
                  {hasCategory ? '✓' : '○'}
                </span>
                Admin category selected
              </li>
              <li className={`flex items-center gap-2 ${hasName ? 'text-emerald-700 font-semibold' : ''}`}>
                <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${hasName ? 'bg-emerald-100 text-emerald-700' : 'bg-paper-subtle text-ink-4'}`}>
                  {hasName ? '✓' : '○'}
                </span>
                Product title defined
              </li>
              <li className={`flex items-center gap-2 ${hasUnit ? 'text-emerald-700 font-semibold' : ''}`}>
                <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${hasUnit ? 'bg-emerald-100 text-emerald-700' : 'bg-paper-subtle text-ink-4'}`}>
                  {hasUnit ? '✓' : '○'}
                </span>
                Billing unit specified
              </li>
              <li className={`flex items-center gap-2 ${hasPrice ? 'text-emerald-700 font-semibold' : ''}`}>
                <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${hasPrice ? 'bg-emerald-100 text-emerald-700' : 'bg-paper-subtle text-ink-4'}`}>
                  {hasPrice ? '✓' : '○'}
                </span>
                Wholesale unit rate configured
              </li>
              <li className={`flex items-center gap-2 ${hasMoq ? 'text-emerald-700 font-semibold' : ''}`}>
                <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${hasMoq ? 'bg-emerald-100 text-emerald-700' : 'bg-paper-subtle text-ink-4'}`}>
                  {hasMoq ? '✓' : '○'}
                </span>
                Minimum order quantity set
              </li>
              <li className={`flex items-center gap-2 ${hasImage ? 'text-emerald-700 font-semibold' : 'text-ink-4'}`}>
                <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${hasImage ? 'bg-emerald-100 text-emerald-700' : 'bg-paper-subtle text-ink-4'}`}>
                  {hasImage ? '✓' : '○'}
                </span>
                Product photo uploaded (Recommended)
              </li>
            </ul>

            {/* Primary Action Button */}
            <div className="pt-3 space-y-2">
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting || readinessScore < totalReadinessSteps}
                className="w-full py-3 text-xs font-bold uppercase tracking-wider bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Saving Listing...
                  </>
                ) : isEdit ? (
                  'Save Product Changes'
                ) : (
                  'Publish Wholesale Product'
                )}
              </Button>

              <Link
                to="/supplier/products"
                className="block text-center text-xs text-ink-4 hover:text-ink-1 py-1"
              >
                Cancel & Return
              </Link>
            </div>
          </Surface>
        </div>
      </div>
    </div>
  );
}
