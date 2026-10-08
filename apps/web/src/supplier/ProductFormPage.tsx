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
import { LearningCta } from './learning/LearningCta';
import { useToast } from '@vyro/ui';
import {
  PackageIcon,
  ArrowLeftIcon,
  CheckIcon,
  TruckIcon,
  SearchIcon,
  EyeIcon,
  XIcon,
  Edit3Icon,
  Building2Icon,
  WarehouseIcon,
  UploadCloudIcon,
  PlusIcon,
  LayersIcon,
  CheckCircle2Icon,
  BanknoteIcon,
  PercentIcon,
  SparklesIcon,
  ChevronRightIcon,
} from '@/components/icons';
import { formatLKR } from '@/lib/format';
import { cn } from '@vyro/ui';
import { existingOfferForProduct, listedOfferByProductId } from './catalogListing';
import { CatalogProductPicker, SelectedCatalogProduct } from './CatalogProductPicker';

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
  hsCode?: string | null;
  countryOfOrigin?: string | null;
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

const ATTACH_SECTIONS = [
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
  const productIdParam = !isEdit ? searchParams.get('productId') : null;
  const isCreateNew = !isEdit && searchParams.get('new') === '1';
  const isSearch = !isEdit && !productIdParam && !isCreateNew;
  const isAttach = Boolean(productIdParam);

  // Queries
  const offers = useQuery({
    queryKey: ['supplier', supplierId, 'offers'],
    queryFn: () => api.get<{ offers: Offer[] }>(`/supplier-products/by-supplier/${supplierId}`),
    enabled: Boolean(supplierId),
  });

  const categoriesQuery = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get<{ categories: Category[] }>('/categories'),
  });

  const categories = useMemo(() => categoriesQuery.data?.categories ?? [], [categoriesQuery.data]);
  const existingOffer = isEdit ? offers.data?.offers.find((o) => o.id === id) ?? null : null;
  const listedByProductId = useMemo(
    () => listedOfferByProductId(offers.data?.offers ?? []),
    [offers.data],
  );
  const catalogProductId = isEdit ? existingOffer?.productId ?? null : productIdParam;

  const productQuery = useQuery({
    queryKey: ['product', catalogProductId],
    queryFn: () =>
      api.get<{ product: Product; images: { id: string; url: string }[] }>(
        `/products/${catalogProductId}`,
      ),
    enabled: Boolean(catalogProductId),
  });

  // Category & Product Specification state
  const [categoryId, setCategoryId] = useState<string>('');
  const [categorySearch, setCategorySearch] = useState('');
  const [productName, setProductName] = useState('');
  const [brand, setBrand] = useState('');
  const [unit, setUnit] = useState('unit');
  const [packSize, setPackSize] = useState('');
  const [description, setDescription] = useState('');
  // Cross-border trade — declared by supplier for customs docs + HS tariff lookup.
  const [hsCode, setHsCode] = useState('');
  const [countryOfOrigin, setCountryOfOrigin] = useState('LK');

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

  useEffect(() => {
    if (!isAttach || !productIdParam || !offers.data) return;
    const listed = existingOfferForProduct(offers.data.offers, productIdParam);
    if (listed) {
      navigate(`/supplier/products/${listed.id}/edit`, { replace: true });
    }
  }, [isAttach, productIdParam, offers.data, navigate]);

  useEffect(() => {
    if (!isCreateNew) return;
    setCategoryId('');
    setCategorySearch('');
    setProductName('');
    setBrand('');
    setUnit('unit');
    setPackSize('');
    setDescription('');
    setHsCode('');
    setCountryOfOrigin('LK');
    setSelectedImageFile(null);
    setImagePreviewUrl(null);
    setExistingImageUrl(null);
  }, [isCreateNew]);

  // Populate product details when editing or attaching an existing SKU
  useEffect(() => {
    if (!productQuery.data?.product) return;
    if (!isEdit && !isAttach) return;
    const p = productQuery.data.product;
    setCategoryId(p.categoryId);
    setProductName(p.name);
    setBrand(p.brand ?? '');
    setUnit(p.unit ?? 'unit');
    setPackSize(p.packSize ?? '');
    setDescription(p.description ?? '');
    setHsCode(p.hsCode ?? '');
    setCountryOfOrigin((p.countryOfOrigin ?? 'LK').toUpperCase());
    if (p.imageUrl) setExistingImageUrl(p.imageUrl);
  }, [productQuery.data, isEdit, isAttach]);

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
  const listingReadinessItems = isAttach
    ? [
        { key: 'price', label: 'Wholesale unit rate configured', done: hasPrice },
        { key: 'moq', label: 'Minimum order quantity set', done: hasMoq },
      ]
    : readinessItems;
  const stepperState = isAttach
    ? [
        { key: 'pricing', done: hasPrice && hasMoq },
        { key: 'tiers', done: enableTiers },
        { key: 'delivery', done: hasPrice && hasMoq },
      ]
    : [
        { key: 'category', done: hasCategory },
        { key: 'details', done: hasName && hasUnit },
        { key: 'photo', done: hasImage },
        { key: 'pricing', done: hasPrice && hasMoq },
        { key: 'tiers', done: enableTiers },
        { key: 'delivery', done: hasPrice && hasMoq },
      ];
  const readinessScore = listingReadinessItems.filter((r) => r.done).length;
  const totalReadinessSteps = listingReadinessItems.length;
  const readinessPct = (readinessScore / Math.max(totalReadinessSteps, 1)) * 100;
  const canPublish = isSearch
    ? false
    : isAttach
      ? hasPrice && hasMoq && Boolean(productQuery.data?.product)
      : hasCategory && hasName && hasUnit && hasPrice && hasMoq;

  const handleSubmit = async (e?: FormEvent) => {
    e?.preventDefault();
    setErr(null);
    if (isSearch) return;

    if (!isAttach) {
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
    } else if (!productIdParam || !productQuery.data?.product) {
      setErr('Select a catalog product before publishing your wholesale rate.');
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
        if (isAttach && productIdParam) {
          targetProductId = productIdParam;
        } else {
          const prodPayload: {
            name: string;
            categoryId: string;
            unit: string;
            brand?: string;
            packSize?: string;
            description?: string;
            hsCode?: string;
            countryOfOrigin?: string;
          } = {
            name: productName.trim(),
            categoryId,
            unit: unit.trim(),
          };
          if (brand.trim()) prodPayload.brand = brand.trim();
          if (packSize.trim()) prodPayload.packSize = packSize.trim();
          if (description.trim()) prodPayload.description = description.trim();
          if (hsCode.trim()) prodPayload.hsCode = hsCode.trim();
          if (countryOfOrigin.trim()) prodPayload.countryOfOrigin = countryOfOrigin.trim().toUpperCase();

          const prodRes = await api.post<{ id: string }>('/products', prodPayload);
          targetProductId = prodRes.id;
        }
      } else {
        const updatePayload: {
          name: string;
          categoryId: string;
          unit: string;
          brand?: string;
          packSize?: string;
          description?: string;
          hsCode?: string;
          countryOfOrigin?: string;
        } = {
          name: productName.trim(),
          categoryId,
          unit: unit.trim(),
        };
        if (brand.trim()) updatePayload.brand = brand.trim();
        if (packSize.trim()) updatePayload.packSize = packSize.trim();
        if (description.trim()) updatePayload.description = description.trim();
        if (hsCode.trim()) updatePayload.hsCode = hsCode.trim();
        if (countryOfOrigin.trim())
          updatePayload.countryOfOrigin = countryOfOrigin.trim().toUpperCase();

        await api.patch(`/products/${targetProductId}`, updatePayload);
      }

      if (selectedImageFile && !isAttach) {
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
      toast.show(
        toast.success(
          isEdit
            ? 'Product changes saved'
            : isAttach
              ? 'Wholesale rate published'
              : 'Wholesale product published',
        ),
      );
      navigate('/supplier/products');
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Failed to save product listing. Please check inputs.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if ((isEdit || isAttach) && (offers.isLoading || productQuery.isLoading)) {
    return <SupplierLoadingState label="Loading product listing specifications..." />;
  }

  if (isEdit && offers.isError) {
    return (
      <SupplierErrorState
        message="Could not load the requested product listing. It may have been removed."
      />
    );
  }

  if (isAttach && productQuery.isError) {
    return (
      <SupplierErrorState
        message="That catalog product could not be found."
        onRetry={() => {
          void navigate('/supplier/products/new');
        }}
      />
    );
  }

  const displayImageUrl = imagePreviewUrl || existingImageUrl || null;
  const displayPriceCents = priceCentsValue();
  const displayMoq = Number(minQty) || 1;
  const [previewWhole, previewFraction] = (displayPriceCents / 100)
    .toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .split('.');

  return (
    <div className={cn('max-w-7xl mx-auto', isSearch ? 'space-y-6 pb-8' : 'space-y-8 pb-32')}>
      {/* Back link */}
      <Link
        to="/supplier/products"
        className="group inline-flex items-center gap-2 text-[13px] font-medium text-ink-3 transition-colors hover:text-ink"
      >
        <span className="flex size-7 items-center justify-center rounded-full border border-ink/10 bg-paper transition-colors group-hover:border-ink/30">
          <ArrowLeftIcon size={13} />
        </span>
        Back to products
      </Link>

      {/* Search-mode hero */}
      {isSearch && (
        <Surface kind="ink" className="grain rounded-2xl shadow-soft-lg">
          <div className="pointer-events-none absolute -top-32 -right-16 size-96 rounded-full bg-volt/[0.12] blur-3xl" aria-hidden />
          <div className="pointer-events-none absolute -bottom-36 -left-20 size-80 rounded-full bg-copper/25 blur-3xl" aria-hidden />
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.06] [background-image:linear-gradient(to_right,#FAF7F0_1px,transparent_1px),linear-gradient(to_bottom,#FAF7F0_1px,transparent_1px)] [background-size:44px_44px] [mask-image:radial-gradient(ellipse_at_top_right,black,transparent_70%)]"
            aria-hidden
          />
          <div className="relative grid gap-8 p-6 sm:p-9 lg:grid-cols-[1.2fr_1fr] lg:items-end">
            <div className="min-w-0">
              <span className="inline-flex items-center gap-2 rounded-full border border-volt/25 bg-volt/10 px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-volt">
                <span className="size-1.5 rounded-full bg-volt animate-pulse" />
                Wholesale catalog
              </span>
              <h1 className="vyro-display mt-4 text-3xl font-bold leading-[1.04] tracking-tight text-paper sm:text-[2.75rem] text-balance">
                Add a <span className="text-volt">wholesale</span> listing
              </h1>
              <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-paper/60">
                Search for a product already on VYRO and publish your rate — or create a new SKU
                when nothing matches.
              </p>
            </div>
            <ol className="grid gap-px overflow-hidden rounded-xl border border-paper/10 bg-paper/10 sm:grid-cols-3 lg:grid-cols-1">
              {[
                { icon: SearchIcon, title: 'Find the SKU', body: 'Match an existing catalog product' },
                { icon: BanknoteIcon, title: 'Set your rate', body: 'Mill-gate price, MOQ & dispatch' },
                { icon: SparklesIcon, title: 'Go live', body: 'Buyers compare you instantly' },
              ].map((step, i) => (
                <li key={step.title} className="flex items-center gap-3.5 bg-ink/80 px-4 py-3.5 backdrop-blur-sm">
                  <span
                    className={cn(
                      'flex size-9 shrink-0 items-center justify-center rounded-lg',
                      i === 0 ? 'bg-volt text-ink' : 'bg-paper/[0.06] text-paper/50 ring-1 ring-paper/10',
                    )}
                  >
                    <step.icon size={16} />
                  </span>
                  <div className="min-w-0">
                    <div className={cn('text-[13px] font-semibold', i === 0 ? 'text-paper' : 'text-paper/70')}>
                      <span className="mr-1.5 font-mono text-[10px] text-paper/35">0{i + 1}</span>
                      {step.title}
                    </div>
                    <div className="truncate text-[11px] text-paper/40">{step.body}</div>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </Surface>
      )}

      {/* Form-mode hero */}
      {!isSearch && (
        <Surface kind="ink" className="grain rounded-2xl shadow-soft-lg">
          <div className="pointer-events-none absolute -top-32 -right-16 size-96 rounded-full bg-volt/[0.12] blur-3xl" aria-hidden />
          <div className="pointer-events-none absolute -bottom-36 -left-20 size-80 rounded-full bg-copper/25 blur-3xl" aria-hidden />
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.06] [background-image:linear-gradient(to_right,#FAF7F0_1px,transparent_1px),linear-gradient(to_bottom,#FAF7F0_1px,transparent_1px)] [background-size:44px_44px] [mask-image:radial-gradient(ellipse_at_top_right,black,transparent_70%)]"
            aria-hidden
          />
          <div className="relative p-6 sm:p-8">
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-2 rounded-full border border-volt/25 bg-volt/10 px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-volt">
                    <span className="size-1.5 rounded-full bg-volt animate-pulse" />
                    Wholesale catalog
                  </span>
                  <span className="rounded-full border border-paper/15 bg-paper/5 px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-paper/70">
                    {isEdit ? 'Editing' : isAttach ? 'Existing SKU' : 'New SKU'}
                  </span>
                </div>
                <h1 className="vyro-display mt-4 text-3xl font-bold leading-[1.04] tracking-tight text-paper sm:text-[2.6rem] text-balance">
                  {isEdit
                    ? 'Edit wholesale product'
                    : isAttach
                      ? 'Add your wholesale rate'
                      : 'Create a new product'}
                </h1>
                <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-paper/60">
                  {isEdit
                    ? 'Update this listing’s identity and commercial terms.'
                    : isAttach
                      ? 'This SKU already exists on VYRO. Set only your mill-gate price, MOQ and dispatch terms.'
                      : 'Add a new catalog SKU. Search first if buyers already shop this item.'}
                </p>
              </div>
              {isCreateNew && (
                <button
                  type="button"
                  onClick={() => {
                    void navigate('/supplier/products/new');
                  }}
                  className="inline-flex h-10 items-center gap-2 rounded-xl border border-paper/15 bg-paper/5 px-4 text-[13px] font-semibold text-paper/85 transition-colors hover:bg-paper/10 hover:text-paper"
                >
                  <SearchIcon size={14} className="text-volt" />
                  Search existing products instead
                </button>
              )}
            </div>

            <div className="mt-8 border-t border-paper/10 pt-5">
              <FormStepper sections={isAttach ? ATTACH_SECTIONS : FORM_SECTIONS} state={stepperState} />
            </div>
          </div>
        </Surface>
      )}

      {err && <ErrorBanner message={err} />}

      <LearningCta />

      <form
        onSubmit={handleSubmit}
        className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start"
      >
        {/* LEFT — Form sections */}
        <div className={cn('space-y-5', isSearch ? 'lg:col-span-12' : 'lg:col-span-8')}>
          {isSearch && (
            <CatalogProductPicker
              listedByProductId={listedByProductId}
              onSelect={(productId) => {
                const offerId = listedByProductId.get(productId);
                if (offerId) void navigate(`/supplier/products/${offerId}/edit`);
                else void navigate(`/supplier/products/new?productId=${encodeURIComponent(productId)}`);
              }}
              onCreateNew={() => {
                void navigate('/supplier/products/new?new=1');
              }}
            />
          )}

          {isAttach && productQuery.data?.product && (
            <SelectedCatalogProduct
              name={productQuery.data.product.name}
              brand={productQuery.data.product.brand ?? null}
              packSize={productQuery.data.product.packSize ?? null}
              unit={productQuery.data.product.unit}
              imageUrl={productQuery.data.product.imageUrl ?? null}
              seed={productQuery.data.product.id}
              onChange={() => {
                void navigate('/supplier/products/new');
              }}
            />
          )}

          {(isEdit || isCreateNew) && (
            <>
          {/* SECTION 1 — Category */}
          <SectionCard
            id="category"
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
                      'flex items-center justify-between rounded-xl border p-3.5 text-left transition-all',
                      isSelected
                        ? 'border-ink bg-ink shadow-[0_12px_24px_-16px_rgba(12,14,11,0.6)]'
                        : 'border-ink/10 bg-paper hover:-translate-y-px hover:border-ink/30',
                    )}
                  >
                    <div className="min-w-0 pr-2">
                      <p
                        className={cn(
                          'text-xs truncate',
                          'text-[13px]',
                          isSelected ? 'font-semibold text-paper' : 'font-medium text-ink-2',
                        )}
                      >
                        {cat.name}
                      </p>
                      <p className={cn('text-[10px] font-mono truncate', isSelected ? 'text-paper/50' : 'text-ink-4')}>{cat.slug}</p>
                    </div>
                    {isSelected ? (
                      <span className="flex size-5 flex-shrink-0 items-center justify-center rounded-full bg-volt text-ink">
                        <CheckIcon size={12} />
                      </span>
                    ) : (
                      <span className="size-5 flex-shrink-0 rounded-full border border-dashed border-ink/20" />
                    )}
                  </button>
                );
              })}
            </div>

            {selectedCategoryObj && (
              <div className="flex items-center justify-between rounded-xl border border-mint/25 bg-mint/[0.07] px-4 py-3 text-xs text-ink-1">
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
            id="details"
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
                        'rounded-full border px-3 py-1 text-xs font-mono transition-all',
                        unit.toLowerCase() === u
                          ? 'border-ink bg-ink text-volt font-semibold'
                          : 'border-ink/10 bg-paper text-ink-3 hover:border-ink/30 hover:text-ink',
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field
                  label="HS / tariff code"
                  optional
                  hint="Required for cross-border customs — 6 digits minimum (e.g. 0901.21 for roasted coffee)"
                >
                  <Input
                    type="text"
                    inputMode="numeric"
                    placeholder="0901.21"
                    value={hsCode}
                    onChange={(e) => setHsCode(e.target.value)}
                    className="bg-paper font-mono"
                  />
                </Field>
                <Field
                  label="Country of origin"
                  optional
                  hint="ISO-3166 alpha-2 — required for COO document"
                >
                  <Input
                    type="text"
                    placeholder="LK"
                    maxLength={2}
                    value={countryOfOrigin}
                    onChange={(e) =>
                      setCountryOfOrigin(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))
                    }
                    className="bg-paper font-mono uppercase"
                  />
                </Field>
              </div>

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
            id="photo"
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
                className="group flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-ink/15 bg-bone/40 p-10 text-center transition-all hover:border-ink/40 hover:bg-volt/[0.06]"
              >
                <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-paper text-ink-3 shadow-sm ring-1 ring-ink/10 transition-all group-hover:-translate-y-0.5 group-hover:bg-ink group-hover:text-volt">
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
              <div className="flex flex-col items-center gap-5 rounded-2xl border border-ink/10 bg-bone/40 p-4 sm:flex-row">
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
            </>
          )}

          {!isSearch && (
            <>
          {/* SECTION 4 — Pricing & MOQ */}
          <SectionCard
            id="pricing"
            step={isAttach ? 1 : 4}
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
                  <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-ink-4">
                    Rs.
                  </span>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={priceLkr}
                    onChange={(e) => setPriceLkr(e.target.value)}
                    className="h-14 pl-12 pr-20 bg-paper font-display text-2xl font-bold tracking-tight"
                    required
                  />
                  <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 rounded-md bg-bone px-2 py-1 text-xs text-ink-4">
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
                <div className="flex items-center justify-between rounded-xl bg-ink p-4 text-paper shadow-[0_16px_32px_-20px_rgba(12,14,11,0.7)]">
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
            id="tiers"
            step={isAttach ? 2 : 5}
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
            id="delivery"
            step={isAttach ? 3 : 6}
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
                        'rounded-full border px-3 py-1 text-xs transition-all',
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
            <Surface className="flex items-center justify-between rounded-2xl border border-ink/[0.08] bg-paper p-5">
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
                    'rounded-full px-2.5 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider',
                    active ? 'bg-mint/10 text-mint' : 'bg-ink/[0.06] text-ink-3',
                  )}
                >
                  {active ? 'Active' : 'Archived'}
                </span>
                <ToggleSwitch checked={active} onChange={setActive} hideLabel />
              </div>
            </Surface>
          )}
            </>
          )}
        </div>

        {/* RIGHT — Live preview & readiness */}
        {!isSearch && (
        <div className="lg:col-span-4 space-y-4 lg:sticky lg:top-24">
          <div className="flex items-center justify-between px-1">
            <span className="flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-4">
              <EyeIcon size={12} /> Live buyer preview
            </span>
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset',
                avail === 'in_stock'
                  ? 'bg-mint/10 text-mint ring-mint/25'
                  : avail === 'low'
                    ? 'bg-amber/10 text-amber ring-amber/25'
                    : 'bg-rose/10 text-rose ring-rose/25',
              )}
            >
              <span
                className={cn(
                  'size-1.5 rounded-full',
                  avail === 'in_stock' ? 'bg-mint' : avail === 'low' ? 'bg-amber' : 'bg-rose',
                )}
              />
              {avail === 'in_stock' ? 'In stock' : avail === 'low' ? 'Low stock' : 'Out of stock'}
            </span>
          </div>

          {/* Mirrors the marketplace product card */}
          <article className="rounded-[1.25rem] border border-ink/[0.08] bg-paper p-2 shadow-[0_30px_60px_-36px_rgba(12,14,11,0.5)]">
            <div className="relative aspect-[16/11] w-full overflow-hidden rounded-[0.9rem] bg-ink">
              {displayImageUrl ? (
                <img
                  src={displayImageUrl}
                  alt={productName || 'Product preview'}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full flex-col items-center justify-center text-center text-paper/40">
                  <span className="flex size-12 items-center justify-center rounded-2xl bg-paper/[0.06] ring-1 ring-paper/10">
                    <UploadCloudIcon size={20} />
                  </span>
                  <p className="mt-3 text-xs font-medium text-paper/60">No photo yet</p>
                  <p className="mt-0.5 text-[11px]">Listings with photos convert better</p>
                </div>
              )}
              <div className="absolute inset-x-3 top-3 flex items-start justify-between gap-2">
                {brand ? (
                  <span className="rounded-full bg-paper/90 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-ink shadow-sm backdrop-blur">
                    {brand}
                  </span>
                ) : (
                  <span />
                )}
                {selectedCategoryObj && (
                  <span className="rounded-full bg-void/55 px-2.5 py-1 text-[11px] font-medium text-paper ring-1 ring-paper/15 backdrop-blur-md">
                    {selectedCategoryObj.name}
                  </span>
                )}
              </div>
            </div>

            <div className="px-3 pb-2 pt-4">
              <div className="flex items-center justify-between gap-3 text-[11px]">
                <span className="truncate font-mono font-semibold uppercase tracking-[0.14em] text-copper">
                  {packSize || unit || 'Pack size'}
                </span>
                <span
                  className={cn(
                    'inline-flex shrink-0 items-center gap-1.5 font-medium',
                    Number(lead) <= 2 ? 'text-mint' : 'text-ink-4',
                  )}
                >
                  <span className={cn('size-1.5 rounded-full', Number(lead) <= 2 ? 'bg-mint' : 'bg-ink-5')} />
                  {lead === '0' ? 'Same-day dispatch' : `${lead || '—'}d dispatch`}
                </span>
              </div>

              <h3
                className={cn(
                  'mt-2 font-display text-[1.15rem] font-bold leading-snug tracking-tight line-clamp-2',
                  productName ? 'text-ink' : 'text-ink-5',
                )}
              >
                {productName || 'Your product title'}
              </h3>
              <div className="mt-1.5 flex min-w-0 items-center gap-1.5 text-[13px] text-ink-4">
                <span className="truncate">
                  by <span className="font-medium text-ink-2">{supplierName || 'Your depot'}</span>
                </span>
                <CheckCircle2Icon size={13} className="shrink-0 text-volt-deep" />
              </div>

              <div className="mt-5 flex items-end justify-between gap-3 border-t border-dashed border-ink/10 pt-4">
                <div className="min-w-0">
                  <div className="flex items-baseline gap-1 text-ink">
                    <span className="text-xs font-semibold text-ink-4">Rs.</span>
                    <span
                      className={cn(
                        'font-display text-[1.75rem] font-bold leading-none tracking-tight tabular-nums',
                        displayPriceCents > 0 ? 'text-ink' : 'text-ink-5',
                      )}
                    >
                      {previewWhole}
                    </span>
                    <span className="text-sm font-semibold text-ink-3">.{previewFraction}</span>
                    <span className="ml-0.5 text-xs text-ink-4">/ {unit || 'unit'}</span>
                  </div>
                  <span className="mt-1 block text-[11px] text-ink-4">
                    Min. order {minQty || '1'} {unit || 'units'}
                  </span>
                </div>
                <span className="flex h-11 shrink-0 items-center gap-2 rounded-full bg-ink pl-3.5 pr-4 text-[13px] font-semibold text-paper">
                  <span className="flex size-6 items-center justify-center rounded-full bg-volt text-ink">
                    <PlusIcon size={13} />
                  </span>
                  Add
                </span>
              </div>

              {enableTiers && Number(tier1DiscountPct) > 0 && (
                <div className="mt-4 space-y-1.5 rounded-xl bg-bone/70 p-3 text-[12px]">
                  <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-ink-4">
                    Volume pricing
                  </p>
                  {[
                    [tier1MinQty, tier1DiscountPct],
                    [tier2MinQty, tier2DiscountPct],
                    [tier3MinQty, tier3DiscountPct],
                  ]
                    .filter(([, pct]) => Number(pct) > 0)
                    .map(([qty, pct]) => (
                      <div key={`${qty}-${pct}`} className="flex justify-between text-ink-3">
                        <span>
                          {qty}+ {unit || 'units'}
                        </span>
                        <span className="font-semibold text-volt-deep">{pct}% off</span>
                      </div>
                    ))}
                </div>
              )}

              <div className="mt-4 flex items-center gap-2 border-t border-ink/[0.06] pt-3 text-[11px] text-ink-4">
                <TruckIcon size={13} className="text-copper" />
                {deliveryAvailable
                  ? radius
                    ? `Delivery within ${radius}km + dock pickup`
                    : 'Island-wide delivery + dock pickup'
                  : 'Depot dock pickup only'}
              </div>
            </div>
          </article>

          {/* Readiness card */}
          <div className="rounded-2xl border border-ink/[0.08] bg-paper p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-display text-[15px] font-bold text-ink">Listing readiness</p>
                <p className="mt-0.5 text-[12px] text-ink-4">Complete the must-haves to publish</p>
              </div>
              <ProgressRing value={readinessPct} label={`${readinessScore}/${totalReadinessSteps}`} />
            </div>

            <ul className="mt-4 space-y-2">
              {listingReadinessItems.map((r) => (
                <li key={r.key} className="flex items-center gap-2.5 text-[13px]">
                  <span
                    className={cn(
                      'flex size-5 shrink-0 items-center justify-center rounded-full',
                      r.done ? 'bg-mint text-paper' : 'border border-dashed border-ink/20',
                    )}
                  >
                    {r.done && <CheckIcon size={11} />}
                  </span>
                  <span className={cn(r.done ? 'text-ink' : 'text-ink-3')}>{r.label}</span>
                  {r.optional && (
                    <span className="ml-auto font-mono text-[9px] uppercase tracking-[0.14em] text-ink-4">
                      Optional
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {/* Tips card */}
          <div className="rounded-2xl border border-copper/20 bg-copper-soft/25 p-5">
            <div className="flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-copper-deep">
              <SparklesIcon size={12} /> Listing tips
            </div>
            <ul className="mt-3 space-y-2.5 text-[12px] leading-relaxed text-ink-3">
              {[
                'Use the mill-gate pack size (e.g. 50kg bag) for clearer commercial pricing.',
                'Photos with packaging visible build more buyer trust.',
                'Add at least one bulk tier — buyers prefer stacking discounts.',
              ].map((tip) => (
                <li key={tip} className="flex gap-2">
                  <ChevronRightIcon size={13} className="mt-0.5 shrink-0 text-copper" />
                  {tip}
                </li>
              ))}
            </ul>
          </div>
        </div>
        )}
      </form>

      {/* Sticky bottom action bar */}
      {!isSearch && (
      <div className="sticky bottom-4 z-30">
        <div className="flex flex-col gap-3 rounded-2xl border border-ink/10 bg-paper/90 px-4 py-3 shadow-[0_24px_60px_-28px_rgba(12,14,11,0.55)] backdrop-blur-md sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <ProgressRing value={readinessPct} label={canPublish ? '' : `${readinessScore}`} done={canPublish} />
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-4">Listing progress</div>
              <div className="text-[13px] font-semibold text-ink">
                {canPublish
                  ? isEdit
                    ? 'Ready to save changes'
                    : 'Ready to publish'
                  : `${readinessScore} of ${totalReadinessSteps} required fields complete`}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:shrink-0">
            <Link
              to="/supplier/products"
              className="hidden h-11 items-center rounded-xl px-4 text-[13px] font-semibold text-ink-3 transition-colors hover:bg-bone hover:text-ink sm:inline-flex"
            >
              Cancel
            </Link>
            <Button
              type="button"
              onClick={() => void handleSubmit()}
              loading={isSubmitting}
              disabled={!canPublish}
              className="h-11 flex-1 rounded-xl px-5 font-semibold sm:flex-none"
            >
              {isEdit ? 'Save changes' : isAttach ? 'Publish wholesale rate' : 'Publish product'}
            </Button>
          </div>
        </div>
      </div>
      )}
    </div>
  );
}

/* ---------- Local helpers ---------- */

function ProgressRing({ value, label, done }: { value: number; label: string; done?: boolean }) {
  const r = 16;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative flex size-10 shrink-0 items-center justify-center">
      <svg viewBox="0 0 40 40" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="20" cy="20" r={r} fill="none" strokeWidth="3.5" className="stroke-ink/[0.08]" />
        <circle
          cx="20"
          cy="20"
          r={r}
          fill="none"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.min(Math.max(value, 0), 100) / 100)}
          className={cn('transition-[stroke-dashoffset] duration-500', done ? 'stroke-mint' : 'stroke-volt-deep')}
        />
      </svg>
      {done ? (
        <CheckIcon size={14} className="text-mint" />
      ) : (
        <span className="font-mono text-[10px] font-bold text-ink">{label}</span>
      )}
    </span>
  );
}

function SectionCard({
  id,
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
  id?: string;
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
    <section
      id={id ? `section-${id}` : undefined}
      className="scroll-mt-24 rounded-2xl border border-ink/[0.08] bg-paper shadow-[0_1px_2px_rgba(12,14,11,0.04)] animate-fade-in"
    >
      <header className="flex items-start justify-between gap-4 border-b border-ink/[0.06] px-5 pb-5 pt-5 sm:px-6 sm:pt-6">
        <div className="flex min-w-0 items-start gap-4">
          <span
            className={cn(
              'flex size-10 shrink-0 items-center justify-center rounded-xl font-mono text-[13px] font-bold transition-colors',
              complete ? 'bg-mint/10 text-mint ring-1 ring-inset ring-mint/25' : 'bg-ink text-volt',
            )}
          >
            {complete ? <CheckIcon size={16} /> : String(step).padStart(2, '0')}
          </span>
          <div className="min-w-0">
            <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-copper">{eyebrow}</div>
            <h2 className="mt-1 font-display text-lg font-bold leading-snug tracking-tight text-ink sm:text-xl">{title}</h2>
            {sub && <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-ink-3">{sub}</p>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {countLabel && (
            <span
              className={cn(
                'hidden items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset sm:inline-flex',
                countTone === 'mint' && 'bg-mint/10 text-mint ring-mint/25',
                countTone === 'volt' && 'bg-volt/15 text-ink ring-volt/30',
                countTone === 'amber' && 'bg-amber/10 text-amber ring-amber/25',
                (countTone === 'ink' || !countTone) && 'bg-ink/[0.04] text-ink-3 ring-ink/10',
              )}
            >
              {countLabel}
            </span>
          )}
          {actions}
        </div>
      </header>
      <div className="space-y-5 p-5 sm:p-6">{children}</div>
    </section>
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
              'rounded-full border px-2.5 py-1 text-[11px] font-mono transition-all',
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
    <div className="space-y-3 rounded-xl border border-ink/10 bg-bone/40 p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-ink-1">
          {label} · {name}
        </span>
        <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-mono font-bold', cm.bg, cm.text, cm.border)}>
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
          : 'border-ink/10 bg-paper opacity-70',
        !locked && 'cursor-pointer hover:opacity-100',
      )}
    >
      <div
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-xl',
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
            <span className="rounded-full bg-mint/10 px-2 py-0.5 text-[9px] font-mono font-bold uppercase tracking-wider text-mint ring-1 ring-inset ring-mint/25">
              Always on
            </span>
          )}
          {!locked && (
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-[9px] font-mono font-bold uppercase tracking-wider',
                active ? 'bg-mint/10 text-mint' : 'bg-ink/[0.06] text-ink-3',
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
  const activeIndex = sections.findIndex((x) => !state.find((y) => y.key === x.key)?.done);
  return (
    <ol className={cn('grid gap-x-3 gap-y-4', sections.length > 3 ? 'grid-cols-3 md:grid-cols-6' : 'grid-cols-3')}>
      {sections.map((s, i) => {
        const done = Boolean(state.find((x) => x.key === s.key)?.done);
        const isActive = i === activeIndex;
        const Icon = s.icon;
        return (
          <li key={s.key} className="min-w-0">
            <button
              type="button"
              onClick={() =>
                document.getElementById(`section-${s.key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }
              className="group w-full text-left"
            >
              <span className="block h-1 overflow-hidden rounded-full bg-paper/10">
                <span
                  className={cn(
                    'block h-full rounded-full transition-all duration-500',
                    done ? 'w-full bg-mint' : isActive ? 'w-1/2 bg-volt' : 'w-0',
                  )}
                />
              </span>
              <span className="mt-3 flex items-center gap-2.5">
                <span
                  className={cn(
                    'flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors',
                    done
                      ? 'bg-mint/20 text-mint'
                      : isActive
                        ? 'bg-volt text-ink'
                        : 'bg-paper/[0.06] text-paper/40 group-hover:text-paper/70',
                  )}
                >
                  {done ? <CheckIcon size={13} /> : <Icon size={13} />}
                </span>
                <span className="min-w-0">
                  <span
                    className={cn(
                      'block truncate text-[12px] font-semibold',
                      done || isActive ? 'text-paper' : 'text-paper/55 group-hover:text-paper/80',
                    )}
                  >
                    {s.label}
                  </span>
                  <span className="hidden truncate text-[10px] text-paper/40 lg:block">{s.hint}</span>
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
