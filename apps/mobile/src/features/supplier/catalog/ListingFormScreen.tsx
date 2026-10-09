/**
 * Add / edit a wholesale listing — a native port of the web's
 * `apps/web/src/supplier/ProductFormPage.tsx`, with the same entry flows:
 *
 *  - search  `/supplier/products/new`                 find an existing SKU first
 *  - attach  `/supplier/products/new?productId=…`     set only your rate on an existing SKU
 *  - create  `/supplier/products/new?new=1`           create a new catalog SKU + your rate
 *  - edit    `/supplier/products/:id/edit`            product identity + commercial terms
 */
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Banknote,
  Camera,
  Clock,
  Layers,
  Package,
  Percent,
  Search,
  Sparkles,
  Store,
  Trash2,
  Truck,
  UploadCloud,
  type LucideIcon,
} from 'lucide-react-native';
import { colors, fonts, radii, tones } from '@/theme/tokens';
import { ApiError, api, errorMessage } from '@/lib/api';
import { useSupplierId } from '@/lib/auth';
import { pickImage, type PickedFile } from '@/lib/files';
import { formatLKR } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import {
  Badge,
  Button,
  Card,
  ErrorState,
  Field,
  Input,
  Kicker,
  ProductImage,
  RadioCards,
  Row,
  Screen,
  SearchBar,
  SkeletonList,
  Stepper,
  Text,
  ToggleRow,
  Touchable,
  useToast,
} from '@/ui';
import {
  catalogKey,
  lkrToCents,
  offersKey,
  useCatalogProduct,
  useCategories,
  useOffers,
  useOnboardingGate,
  type Availability,
} from './api';
import { CatalogPicker, SelectedCatalogProduct } from './CatalogPicker';
import { AvailabilityToggle, CheckRow, ImageSourceSheet, MetaChip, PresetChips, StepSection, TrainingBanner } from './components';

/* -------------------------------- Constants ------------------------------- */

const COMMON_UNITS = ['kg', 'bag', 'unit', 'set', 'pack', 'box', 'bottle', 'liter', 'meter', 'carton', 'drum'];
const MOQ_PRESETS = [1, 5, 10, 25, 50, 100];
const LEAD_PRESETS = [
  { label: 'Same day', value: '0' },
  { label: '1 day', value: '1' },
  { label: '2–3 days', value: '3' },
  { label: '5–7 days', value: '7' },
];
const RADIUS_PRESETS = [
  { label: '25 km · Local', value: '25' },
  { label: '50 km · Metro', value: '50' },
  { label: '100 km · Regional', value: '100' },
  { label: 'Island-wide', value: '' },
];
const HS_RE = /^[0-9]{6,10}(\.[0-9]{0,4})?$/;
const ISO2_RE = /^[A-Z]{2}$/;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

type Flow = 'search' | 'attach' | 'create' | 'edit';
type SectionKey = 'category' | 'details' | 'photo' | 'pricing' | 'tiers' | 'delivery';
type Tiers = { q1: string; d1: string; q2: string; d2: string; q3: string; d3: string };
type Market = { lowestCents: number | null; suppliers: number };

const SECTIONS: Record<SectionKey, { label: string; icon: LucideIcon }> = {
  category: { label: 'Category', icon: Layers },
  details: { label: 'Product', icon: Package },
  photo: { label: 'Photo', icon: UploadCloud },
  pricing: { label: 'Pricing', icon: Banknote },
  tiers: { label: 'Tiers', icon: Percent },
  delivery: { label: 'Fulfillment', icon: Truck },
};

const go = (path: string) => router.push(path as never);
const replace = (path: string) => router.replace(path as never);
const num = (v: string) => Number(v) || 0;

/* ---------------------------------- Entry --------------------------------- */

export function SupplierProductFormScreen({ mode }: { mode: 'new' | 'edit' }) {
  const params = useLocalSearchParams<{ id?: string; productId?: string; new?: string; lowest?: string; quotes?: string }>();
  const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);

  const flow: Flow = mode === 'edit' ? 'edit' : str(params.productId) ? 'attach' : params.new === '1' ? 'create' : 'search';
  if (flow === 'search') return <SearchFlow />;

  const lowest = str(params.lowest);
  const quotes = str(params.quotes);
  return (
    <ListingForm
      flow={flow}
      offerId={str(params.id)}
      productId={str(params.productId)}
      market={quotes != null ? { lowestCents: lowest ? Number(lowest) : null, suppliers: Number(quotes) } : null}
    />
  );
}

/* ------------------------------- Search flow ------------------------------ */

function SearchFlow() {
  const supplierId = useSupplierId();
  const offers = useOffers(supplierId);
  const listed = useMemo(() => new Map((offers.data?.offers ?? []).map((o) => [o.productId, o.id])), [offers.data]);

  return (
    <Screen back kicker="Catalog" title="Add a listing" subtitle="Find the product on VYRO, then publish your rate." onRefresh={() => offers.refetch()}>
      <Card kind="ink" padding={20} radius={radii['2xl']} style={{ gap: 18 }}>
        <HeroPill label="Wholesale catalog" />
        <View style={{ gap: 6 }}>
          <Text style={{ fontFamily: fonts.displayBold, fontSize: 26, lineHeight: 31, letterSpacing: -0.8, color: colors.paper }}>
            Add a <Text style={{ fontFamily: fonts.displayBold, fontSize: 26, lineHeight: 31, letterSpacing: -0.8, color: colors.volt }}>wholesale</Text> listing
          </Text>
          <Text variant="bodySm" color="paperMuted">
            Search for a product already on VYRO and publish your rate — or create a new SKU when nothing matches.
          </Text>
        </View>
        <View style={{ gap: 1, borderRadius: radii.lg, borderCurve: 'continuous', overflow: 'hidden', backgroundColor: colors.paperLine }}>
          {[
            { icon: Search, title: 'Find the SKU', body: 'Match an existing catalog product' },
            { icon: Banknote, title: 'Set your rate', body: 'Mill-gate price, MOQ & dispatch' },
            { icon: Sparkles, title: 'Go live', body: 'Buyers compare you instantly' },
          ].map((s, i) => (
            <Row key={s.title} gap={12} style={{ paddingHorizontal: 14, paddingVertical: 12, backgroundColor: colors.ink2 }}>
              <View
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 10,
                  borderCurve: 'continuous',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: i === 0 ? colors.volt : 'rgba(250,247,240,0.06)',
                }}
              >
                <s.icon size={15} color={i === 0 ? colors.ink : colors.paperMuted} />
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="bodySm" weight="semibold" color={i === 0 ? 'paper' : 'paperMuted'}>
                  <Text style={{ fontFamily: fonts.mono, fontSize: 10.5, color: colors.paperFaint }}>{`0${i + 1}  `}</Text>
                  {s.title}
                </Text>
                <Text variant="caption" color="paperFaint">
                  {s.body}
                </Text>
              </View>
            </Row>
          ))}
        </View>
      </Card>

      <TrainingBanner />

      <CatalogPicker
        listedByProductId={listed}
        onSelect={(productId, hit) => {
          const offerId = listed.get(productId);
          if (offerId) go(`/supplier/products/${offerId}/edit`);
          else
            go(
              `/supplier/products/new?productId=${encodeURIComponent(productId)}&quotes=${hit.offerCount}` +
                (hit.bestOffer ? `&lowest=${hit.bestOffer.priceCents}` : ''),
            );
        }}
        onCreateNew={() => go('/supplier/products/new?new=1')}
      />
    </Screen>
  );
}

/* ------------------------------- Listing form ----------------------------- */

function ListingForm({
  flow,
  offerId,
  productId: productIdParam,
  market,
}: {
  flow: Exclude<Flow, 'search'>;
  offerId: string | undefined;
  productId: string | undefined;
  market: Market | null;
}) {
  const supplierId = useSupplierId();
  const qc = useQueryClient();
  const toast = useToast();
  const isEdit = flow === 'edit';
  const isAttach = flow === 'attach';
  const isCreate = flow === 'create';
  const editsProduct = isEdit || isCreate;

  const offers = useOffers(supplierId);
  const categories = useCategories();
  const gate = useOnboardingGate(isEdit ? undefined : supplierId);
  const trainingRequired = !isEdit && !!gate.data?.required;

  const existingOffer = isEdit ? offers.data?.offers.find((o) => o.id === offerId) : undefined;
  const catalogProductId = isEdit ? existingOffer?.productId : productIdParam;
  const productQuery = useCatalogProduct(catalogProductId);
  const product = productQuery.data?.product;

  // Product identity
  const [categoryId, setCategoryId] = useState('');
  const [categorySearch, setCategorySearch] = useState('');
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [unit, setUnit] = useState('unit');
  const [packSize, setPackSize] = useState('');
  const [description, setDescription] = useState('');
  const [hsCode, setHsCode] = useState('');
  const [origin, setOrigin] = useState('LK');
  const [photo, setPhoto] = useState<PickedFile | null>(null);
  const [existingImage, setExistingImage] = useState<string | null>(null);
  const [photoSheet, setPhotoSheet] = useState(false);

  // Commercial terms
  const [sku, setSku] = useState('');
  const [price, setPrice] = useState('');
  const [moq, setMoq] = useState(1);
  const [lead, setLead] = useState('1');
  const [avail, setAvail] = useState<Availability>('in_stock');
  const [delivery, setDelivery] = useState(true);
  const [radius, setRadius] = useState('');
  const [active, setActive] = useState(true);

  // Volume tiers
  const [tiersOn, setTiersOn] = useState(false);
  const [tiers, setTiers] = useState<Tiers>({ q1: '10', d1: '3', q2: '50', d2: '5', q3: '100', d3: '10' });

  // Hydrate from the existing offer / catalog product once (adjust state during render).
  const [offerLoaded, setOfferLoaded] = useState(false);
  if (existingOffer && !offerLoaded) {
    const t = existingOffer;
    setOfferLoaded(true);
    setSku(t.supplierSku ?? '');
    setPrice((t.priceCents / 100).toFixed(2));
    setMoq(t.minOrderQty);
    setLead(String(t.leadTimeDays));
    setAvail(t.availabilityStatus);
    setDelivery(t.deliveryAvailable ?? true);
    setRadius(t.deliveryRadiusKm == null ? '' : String(t.deliveryRadiusKm));
    setActive(t.active);
    setTiersOn(!!(t.tier1DiscountPct || t.tier2DiscountPct || t.tier3DiscountPct));
    setTiers((cur) => ({
      q1: t.tier1MinQty != null ? String(t.tier1MinQty) : cur.q1,
      d1: t.tier1DiscountPct != null ? String(t.tier1DiscountPct) : cur.d1,
      q2: t.tier2MinQty != null ? String(t.tier2MinQty) : cur.q2,
      d2: t.tier2DiscountPct != null ? String(t.tier2DiscountPct) : cur.d2,
      q3: t.tier3MinQty != null ? String(t.tier3MinQty) : cur.q3,
      d3: t.tier3DiscountPct != null ? String(t.tier3DiscountPct) : cur.d3,
    }));
  }
  const [productLoaded, setProductLoaded] = useState(false);
  if (product && !productLoaded) {
    setProductLoaded(true);
    setCategoryId(product.categoryId);
    setName(product.name);
    setBrand(product.brand ?? '');
    setUnit(product.unit ?? 'unit');
    setPackSize(product.packSize ?? '');
    setDescription(product.description ?? '');
    setHsCode(product.hsCode ?? '');
    setOrigin((product.countryOfOrigin ?? 'LK').toUpperCase());
    setExistingImage(productQuery.data?.images[0]?.url ?? product.imageUrl ?? null);
  }

  /* --------------------------- Derived / readiness -------------------------- */

  const cats = useMemo(() => (categories.data?.categories ?? []).filter((c) => c.active !== false), [categories.data]);
  const visibleCats = useMemo(() => {
    const q = categorySearch.trim().toLowerCase();
    return q ? cats.filter((c) => c.name.toLowerCase().includes(q) || c.slug.includes(q)) : cats;
  }, [cats, categorySearch]);
  const category = cats.find((c) => c.id === categoryId);

  const cents = lkrToCents(price);
  const unitLabel = unit.trim() || 'unit';
  const leadNum = num(lead);
  const radiusNum = radius.trim() === '' ? null : Number(radius);

  const hsInvalid = !!hsCode.trim() && !HS_RE.test(hsCode.trim());
  const originInvalid = !!origin.trim() && !ISO2_RE.test(origin.trim().toUpperCase());
  const radiusInvalid = radiusNum != null && (!Number.isInteger(radiusNum) || radiusNum < 0 || radiusNum > 500);
  const tierError = tiersOn ? validateTiers(tiers) : null;

  const hasCategory = !!categoryId;
  const hasName = !!name.trim();
  const hasUnit = !!unit.trim();
  const hasPrice = cents > 0;
  const hasMoq = moq >= 1;
  const hasImage = !!(photo || existingImage);

  const readiness: { label: string; done: boolean; optional?: boolean }[] = isAttach
    ? [
        { label: 'Wholesale unit rate set', done: hasPrice },
        { label: 'Minimum order quantity set', done: hasMoq },
      ]
    : [
        { label: 'Category selected', done: hasCategory },
        { label: 'Product title added', done: hasName },
        { label: 'Billing unit set', done: hasUnit },
        { label: 'Wholesale unit rate set', done: hasPrice },
        { label: 'Minimum order quantity set', done: hasMoq },
        { label: 'Product photo added', done: hasImage, optional: true },
      ];
  const readyCount = readiness.filter((r) => r.done).length;

  const sectionOrder: SectionKey[] = isAttach ? ['pricing', 'tiers', 'delivery'] : ['category', 'details', 'photo', 'pricing', 'tiers', 'delivery'];
  const sectionDone: Record<SectionKey, boolean> = {
    category: hasCategory,
    details: hasName && hasUnit,
    photo: hasImage,
    pricing: hasPrice && hasMoq,
    tiers: tiersOn && !tierError,
    delivery: hasPrice && hasMoq && !radiusInvalid,
  };
  const stepOf = (k: SectionKey) => sectionOrder.indexOf(k) + 1;

  const blocker = trainingRequired
    ? 'Finish onboarding training to publish'
    : editsProduct && !hasCategory
      ? 'Select a category'
      : editsProduct && !hasName
        ? 'Add a product title'
        : editsProduct && !hasUnit
          ? 'Set the billing unit'
          : isAttach && !product
            ? 'Loading product…'
            : !hasPrice
              ? `Enter your price per ${unitLabel}`
              : hsInvalid || originInvalid
                ? 'Fix the customs fields'
                : tierError
                  ? tierError
                  : radiusInvalid
                    ? 'Delivery radius must be 0–500 km'
                    : null;

  /* --------------------------------- Save ---------------------------------- */

  const save = useMutation({
    mutationFn: async () => {
      let targetProductId = isEdit ? (existingOffer?.productId ?? '') : (productIdParam ?? '');

      if (editsProduct) {
        const identity = { name: name.trim(), categoryId, unit: unit.trim() };
        if (isCreate) {
          const res = await api.post<{ id: string }>('/products', {
            ...identity,
            ...(brand.trim() ? { brand: brand.trim() } : {}),
            ...(packSize.trim() ? { packSize: packSize.trim() } : {}),
            ...(description.trim() ? { description: description.trim() } : {}),
            ...(hsCode.trim() ? { hsCode: hsCode.trim() } : {}),
            ...(origin.trim() ? { countryOfOrigin: origin.trim().toUpperCase() } : {}),
          });
          targetProductId = res.id;
        } else {
          await api.patch(`/products/${targetProductId}`, {
            ...identity,
            brand: brand.trim() || null,
            packSize: packSize.trim() || null,
            description: description.trim() || null,
            hsCode: hsCode.trim() || null,
            countryOfOrigin: origin.trim() ? origin.trim().toUpperCase() : null,
          });
        }
        if (photo?.base64) {
          await api.post(`/products/${targetProductId}/images`, {
            filename: photo.name,
            contentType: photo.type || 'image/jpeg',
            base64: photo.base64,
          });
        }
      }

      const offer: Record<string, unknown> = {
        priceCents: cents,
        minOrderQty: moq,
        leadTimeDays: leadNum,
        availabilityStatus: avail,
        deliveryAvailable: delivery,
        deliveryRadiusKm: delivery ? radiusNum : null,
        tier1DiscountPct: tiersOn ? num(tiers.d1) : 0,
        tier2DiscountPct: tiersOn ? num(tiers.d2) : 0,
        tier3DiscountPct: tiersOn ? num(tiers.d3) : 0,
        ...(tiersOn && num(tiers.d1) > 0 ? { tier1MinQty: num(tiers.q1) } : {}),
        ...(tiersOn && num(tiers.d2) > 0 ? { tier2MinQty: num(tiers.q2) } : {}),
        ...(tiersOn && num(tiers.d3) > 0 ? { tier3MinQty: num(tiers.q3) } : {}),
      };
      // Both offer schemas are strict: create takes the ids and an optional SKU
      // string; update takes `active` and a nullable SKU.
      if (isEdit && offerId) {
        return api.patch(`/supplier-products/${offerId}`, { ...offer, supplierSku: sku.trim() || null, active });
      }
      return api.post('/supplier-products', {
        ...offer,
        supplierId,
        productId: targetProductId,
        ...(sku.trim() ? { supplierSku: sku.trim() } : {}),
      });
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Product changes saved' : isAttach ? 'Wholesale rate published' : 'Wholesale product published');
      void qc.invalidateQueries({ queryKey: offersKey(supplierId) });
      void qc.invalidateQueries({ queryKey: catalogKey });
      if (catalogProductId) void qc.invalidateQueries({ queryKey: ['product', catalogProductId] });
      if (isEdit) router.back();
      else replace('/supplier/products');
    },
    onError: (e) => {
      if (e instanceof ApiError && e.message === 'TRAINING_REQUIRED') {
        toast.error('Training required', 'Finish the onboarding lessons to publish.');
        return;
      }
      const existingId = e instanceof ApiError ? (e.details as { offerId?: string } | undefined)?.offerId : undefined;
      if (existingId) {
        toast.error('Already listed', errorMessage(e));
        replace(`/supplier/products/${existingId}/edit`);
        return;
      }
      toast.error('Could not save', errorMessage(e));
    },
  });

  const onPickPhoto = async (camera: boolean) => {
    setPhotoSheet(false);
    const [file] = await pickImage({ camera, base64: true });
    if (!file) return;
    if ((file.size ?? 0) > MAX_PHOTO_BYTES) {
      toast.error('Photo too large', 'Product photos must be 5 MB or smaller.');
      return;
    }
    haptic.tap();
    setPhoto(file);
  };

  /* -------------------------------- Render --------------------------------- */

  const titleText = isEdit ? 'Edit product' : isAttach ? 'Add your rate' : 'New product';

  if ((isEdit && offers.isLoading) || (catalogProductId && productQuery.isLoading)) {
    return (
      <Screen back kicker="Catalog" title={titleText}>
        <SkeletonList rows={4} height={140} />
      </Screen>
    );
  }
  if ((isEdit && (offers.isError || (offers.data && !existingOffer))) || (isAttach && productQuery.isError)) {
    return (
      <Screen back kicker="Catalog" title={titleText} onRefresh={() => Promise.all([offers.refetch(), productQuery.refetch()])}>
        <ErrorState
          message={isAttach ? 'That catalog product could not be found.' : 'Could not load this listing. It may have been removed.'}
          onRetry={() => (isAttach ? replace('/supplier/products/new') : void offers.refetch())}
        />
      </Screen>
    );
  }

  const maxTierPct = tiersOn && !tierError ? Math.max(num(tiers.d1), num(tiers.d2), num(tiers.d3)) : 0;
  const previewMeta = [brand.trim(), packSize.trim(), category?.name].filter(Boolean).join(' · ');

  return (
    <Screen
      back
      keyboard
      kicker="Catalog"
      title={titleText}
      onRefresh={() => Promise.all([offers.refetch(), categories.refetch(), productQuery.refetch()])}
      footer={
        <View style={{ gap: 8 }}>
          {blocker && !save.isPending ? (
            <Text variant="caption" color="ink4" align="center">
              {blocker}
            </Text>
          ) : null}
          <Button
            title={save.isPending ? 'Saving…' : isEdit ? 'Save changes' : isAttach ? 'Publish rate' : 'Publish product'}
            variant={blocker ? 'secondary' : 'primary'}
            size="lg"
            full
            loading={save.isPending}
            disabled={!!blocker || !supplierId}
            onPress={() => save.mutate()}
          />
        </View>
      }
    >
      {/* Hero with section stepper */}
      <Card kind="ink" padding={20} radius={radii['2xl']} style={{ gap: 16 }}>
        <Row gap={8} wrap>
          <HeroPill label="Wholesale catalog" />
          <HeroPill label={isEdit ? 'Editing' : isAttach ? 'Existing SKU' : 'New SKU'} muted />
        </Row>
        <View style={{ gap: 6 }}>
          <Text style={{ fontFamily: fonts.displayBold, fontSize: 25, lineHeight: 30, letterSpacing: -0.75, color: colors.paper }}>
            {isEdit ? 'Edit wholesale product' : isAttach ? 'Add your wholesale rate' : 'Create a new product'}
          </Text>
          <Text variant="bodySm" color="paperMuted">
            {isEdit
              ? 'Update this listing’s identity and commercial terms.'
              : isAttach
                ? 'This SKU already exists on VYRO. Set only your mill-gate price, MOQ and dispatch terms.'
                : 'Add a new catalog SKU. Search first if buyers already shop this item.'}
          </Text>
        </View>
        <Row gap={6} wrap style={{ paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.paperLine }}>
          {sectionOrder.map((k, i) => {
            const S = SECTIONS[k];
            const done = sectionDone[k];
            return (
              <View
                key={k}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 5,
                  height: 26,
                  paddingHorizontal: 9,
                  borderRadius: radii.pill,
                  backgroundColor: done ? 'rgba(198,220,74,0.14)' : 'rgba(250,247,240,0.05)',
                }}
              >
                <S.icon size={11} color={done ? colors.volt : colors.paperFaint} />
                <Text style={{ fontFamily: fonts.sansMedium, fontSize: 11, color: done ? colors.volt : colors.paperMuted }}>{`${i + 1}. ${S.label}`}</Text>
              </View>
            );
          })}
        </Row>
        {isCreate ? (
          <Button title="Search existing products instead" icon={Search} variant="outlinePaper" size="sm" onPress={() => replace('/supplier/products/new')} />
        ) : null}
      </Card>

      {!isEdit ? <TrainingBanner /> : null}

      {isAttach && product ? (
        <SelectedCatalogProduct
          product={{ ...product, unit: product.unit ?? 'unit', imageUrl: existingImage ?? product.imageUrl }}
          onChange={() => replace('/supplier/products/new')}
        />
      ) : null}

      {editsProduct ? (
        <>
          {/* Category */}
          <StepSection
            step={stepOf('category')}
            kicker="Category"
            title="Select product category"
            sub="Choose from categories created by platform administrators."
            complete={hasCategory}
            right={<CountPill label={String(cats.length)} />}
          >
            {cats.length > 6 ? <SearchBar value={categorySearch} onChangeText={setCategorySearch} placeholder="Filter categories…" /> : null}
            {categories.isLoading ? (
              <SkeletonList rows={1} height={44} />
            ) : visibleCats.length === 0 ? (
              <Text variant="caption" color="ink4">
                No categories match “{categorySearch}”.
              </Text>
            ) : (
              <PresetChips options={visibleCats.map((c) => ({ label: c.name, value: c.id }))} value={categoryId} onChange={setCategoryId} />
            )}
            {category ? (
              <Text variant="caption" color="mint">
                Listed under {category.name}
              </Text>
            ) : null}
          </StepSection>

          {/* Product details */}
          <StepSection
            step={stepOf('details')}
            kicker="Product"
            title="Details & specifications"
            sub="Identity buyers see on search, orders and invoices."
            complete={hasName && hasUnit}
          >
            <Field label="Product title / name" required>
              <Input value={name} onChangeText={setName} placeholder="e.g. Ceylon Cinnamon Quills ALBA 25kg" maxLength={200} />
            </Field>
            <Field label="Brand / manufacturer" hint="Optional">
              <Input value={brand} onChangeText={setBrand} placeholder="e.g. Royal Spices, In-House" maxLength={120} />
            </Field>
            <Field label="Standard billing unit" required>
              <View style={{ gap: 10 }}>
                <PresetChips options={COMMON_UNITS.map((u) => ({ label: u, value: u }))} value={unit} onChange={setUnit} />
                <Input value={unit} onChangeText={setUnit} placeholder="e.g. kg, bag, unit, set" autoCapitalize="none" maxLength={40} />
              </View>
            </Field>
            <Field label="Pack size" hint="Packaging format, e.g. 25kg sack, 12 bottles / carton">
              <Input value={packSize} onChangeText={setPackSize} placeholder="e.g. 25kg vacuum-sealed sack" maxLength={40} />
            </Field>
            <Row gap={10} align="flex-start">
              <Field label="HS / tariff code" error={hsInvalid ? '6–10 digits' : null} hint="For customs" style={{ flex: 1 }}>
                <Input value={hsCode} onChangeText={setHsCode} placeholder="090611" keyboardType="numbers-and-punctuation" invalid={hsInvalid} />
              </Field>
              <Field label="Origin" error={originInvalid ? '2 letters' : null} hint="Country" style={{ width: 104 }}>
                <Input value={origin} onChangeText={(v) => setOrigin(v.toUpperCase())} placeholder="LK" autoCapitalize="characters" maxLength={2} invalid={originInvalid} />
              </Field>
            </Row>
            <Field label="Specifications & details" hint="Grades, moisture, certifications, warranty — for procurement managers.">
              <Input value={description} onChangeText={setDescription} placeholder="Technical specifications…" multiline maxLength={2000} />
            </Field>
          </StepSection>

          {/* Photo */}
          <StepSection
            step={stepOf('photo')}
            kicker="Photo"
            title="Product photo"
            sub="Show the packaging as it leaves your depot. Up to 5 MB."
            complete={hasImage}
            right={hasImage ? <CountPill label="Attached" tone="success" /> : null}
          >
            {hasImage ? (
              <View style={{ gap: 10 }}>
                <ProductImage
                  src={photo ? photo.uri : existingImage}
                  seed={catalogProductId ?? 'new-product'}
                  style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: radii.xl, borderCurve: 'continuous' }}
                />
                <Row gap={8}>
                  <View style={{ flex: 1 }}>
                    <Button title="Replace" icon={Camera} variant="secondary" size="sm" full onPress={() => setPhotoSheet(true)} />
                  </View>
                  {photo ? (
                    <View style={{ flex: 1 }}>
                      <Button title="Remove" icon={Trash2} variant="ghost" size="sm" full onPress={() => setPhoto(null)} />
                    </View>
                  ) : null}
                </Row>
              </View>
            ) : (
              <Touchable
                onPress={() => {
                  haptic.tap();
                  setPhotoSheet(true);
                }}
                scaleTo={0.98}
                style={{
                  alignItems: 'center',
                  gap: 8,
                  paddingVertical: 28,
                  borderRadius: radii.xl,
                  borderCurve: 'continuous',
                  borderWidth: 1.5,
                  borderStyle: 'dashed',
                  borderColor: colors.lineStrong,
                  backgroundColor: colors.pearl,
                }}
              >
                <View style={{ width: 48, height: 48, borderRadius: 16, borderCurve: 'continuous', backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}>
                  <UploadCloud size={20} color={colors.volt} />
                </View>
                <Text variant="h3">Add a product photo</Text>
                <Text variant="caption" color="ink4">
                  Take a photo or choose from your library
                </Text>
              </Touchable>
            )}
            {isEdit && photo ? (
              <Text variant="caption" color="ink4">
                The new photo is added to this product when you save.
              </Text>
            ) : null}
          </StepSection>
        </>
      ) : null}

      {/* Pricing */}
      <StepSection step={stepOf('pricing')} kicker="Pricing" title="Wholesale rate & MOQ" sub="Mill-gate price, minimum order and dispatch time." complete={hasPrice && hasMoq}>
        <Field label={`Base wholesale rate (LKR / ${unitLabel})`} required>
          <Input
            value={price}
            onChangeText={setPrice}
            placeholder="0.00"
            keyboardType="decimal-pad"
            prefix="Rs."
            suffix={`/ ${unitLabel}`}
            style={{ fontFamily: fonts.monoMedium, fontSize: 20 }}
          />
        </Field>
        {market ? <MarketHint market={market} cents={cents} /> : null}

        <Field label="Minimum order quantity (MOQ)" right={<Text variant="caption" color="ink4">{`${moq.toLocaleString()} ${unitLabel}`}</Text>}>
          <View style={{ gap: 10 }}>
            <PresetChips options={MOQ_PRESETS.map((v) => ({ label: String(v), value: String(v) }))} value={String(moq)} onChange={(v) => setMoq(Number(v))} />
            <Stepper value={moq} onChange={setMoq} min={1} max={100000} />
          </View>
        </Field>
        {hasPrice && moq > 1 ? (
          <Row justify="space-between" style={{ paddingHorizontal: 2 }}>
            <Text variant="caption" color="ink4">
              Smallest order value
            </Text>
            <Text style={{ fontFamily: fonts.monoMedium, fontSize: 13, color: colors.ink }}>{formatLKR(cents * moq)}</Text>
          </Row>
        ) : null}

        <Field
          label="Dispatch lead time"
          right={<Text variant="caption" color="ink4">{leadNum === 0 ? 'Same-day dispatch' : `${leadNum} day${leadNum === 1 ? '' : 's'}`}</Text>}
        >
          <PresetChips options={LEAD_PRESETS} value={lead} onChange={setLead} />
        </Field>

        <Field label="Stock availability" hint="Shown to buyers on the marketplace.">
          <AvailabilityToggle value={avail} onChange={setAvail} />
        </Field>

        <Field label="Internal supplier SKU" hint="Optional warehouse reference, shown on purchase orders.">
          <Input value={sku} onChangeText={setSku} placeholder="e.g. WH-SUG-2026-01" autoCapitalize="characters" maxLength={60} />
        </Field>
      </StepSection>

      {/* Tiers */}
      <StepSection
        step={stepOf('tiers')}
        kicker="Tiers"
        title="Volume discounts"
        sub="Optional. Discounts apply automatically at checkout."
        complete={tiersOn && !tierError}
        right={<CountPill label={tiersOn ? 'On' : 'Off'} tone={tiersOn ? 'success' : 'neutral'} />}
      >
        <View style={{ borderRadius: radii.xl, borderCurve: 'continuous', backgroundColor: colors.pearl, paddingHorizontal: 14 }}>
          <ToggleRow label="Enable volume tiers" description="Reward buyers who consolidate larger orders." value={tiersOn} onValueChange={setTiersOn} last />
        </View>
        {tiersOn ? (
          <View style={{ gap: 10 }}>
            {(
              [
                ['q1', 'd1', 'Tier 1'],
                ['q2', 'd2', 'Tier 2'],
                ['q3', 'd3', 'Tier 3'],
              ] as const
            ).map(([qk, dk, label]) => {
              const pct = num(tiers[dk]);
              return (
                <View key={label} style={{ gap: 8, padding: 12, borderRadius: radii.lg, borderCurve: 'continuous', backgroundColor: pct > 0 ? colors.voltSoft : colors.pearl }}>
                  <Row justify="space-between">
                    <Kicker color={pct > 0 ? 'voltDeep' : 'ink5'}>{label}</Kicker>
                    {hasPrice && pct > 0 ? (
                      <Text style={{ fontFamily: fonts.monoMedium, fontSize: 12.5, color: colors.ink }}>
                        {formatLKR(Math.round(cents * (1 - pct / 100)))}
                        <Text variant="caption" color="ink4">{` / ${unitLabel}`}</Text>
                      </Text>
                    ) : null}
                  </Row>
                  <Row gap={10}>
                    <Input
                      value={tiers[qk]}
                      onChangeText={(v) => setTiers((t) => ({ ...t, [qk]: v.replace(/[^0-9]/g, '') }))}
                      keyboardType="number-pad"
                      prefix="≥"
                      suffix={unitLabel}
                      containerStyle={{ flex: 1 }}
                    />
                    <Input
                      value={tiers[dk]}
                      onChangeText={(v) => setTiers((t) => ({ ...t, [dk]: v.replace(/[^0-9]/g, '') }))}
                      keyboardType="number-pad"
                      suffix="% off"
                      containerStyle={{ flex: 1 }}
                    />
                  </Row>
                </View>
              );
            })}
            {tierError ? (
              <Text variant="caption" color="rose">
                {tierError}
              </Text>
            ) : null}
          </View>
        ) : null}
      </StepSection>

      {/* Fulfillment */}
      <StepSection
        step={stepOf('delivery')}
        kicker="Fulfillment"
        title="Delivery & coverage"
        complete={sectionDone.delivery}
        right={<CountPill label={delivery ? 'Delivery' : 'Pickup'} />}
      >
        <RadioCards
          value={delivery ? 'delivery' : 'pickup'}
          onChange={(v) => setDelivery(v === 'delivery')}
          options={[
            { value: 'pickup', label: 'Depot dock pickup', description: 'Buyers send transport to collect from your depot.', icon: Store },
            { value: 'delivery', label: 'Supplier fleet delivery', description: 'You deliver to the buyer’s warehouse with your own vehicles.', icon: Truck },
          ]}
        />
        {delivery ? (
          <Field label="Delivery radius" error={radiusInvalid ? 'Enter a whole number from 0 to 500.' : null} hint="Leave blank to deliver island-wide.">
            <View style={{ gap: 10 }}>
              <PresetChips options={RADIUS_PRESETS} value={radius} onChange={setRadius} />
              <Input value={radius} onChangeText={setRadius} placeholder="Island-wide" keyboardType="number-pad" suffix="km" invalid={radiusInvalid} />
            </View>
          </Field>
        ) : null}
        {isEdit ? (
          <View style={{ borderRadius: radii.xl, borderCurve: 'continuous', backgroundColor: colors.pearl, paddingHorizontal: 14 }}>
            <ToggleRow label="Live to buyers" description="Hidden listings keep their terms but can’t be ordered." value={active} onValueChange={setActive} last />
          </View>
        ) : null}
      </StepSection>

      {/* Live preview & readiness — the web's sidebar */}
      <Card kind="elevated" padding={18} style={{ gap: 16 }}>
        <Row justify="space-between">
          <Kicker>Buyer preview</Kicker>
          <Badge label={isEdit && !active ? 'Hidden' : 'Live'} tone={isEdit && !active ? 'neutral' : 'success'} dot size="sm" />
        </Row>
        <Row gap={14} align="flex-start">
          <ProductImage
            src={photo ? photo.uri : existingImage}
            seed={catalogProductId ?? 'new-product'}
            label={unitLabel}
            style={{ width: 72, height: 72, borderRadius: 18, borderCurve: 'continuous' }}
          />
          <View style={{ flex: 1, gap: 3, minWidth: 0 }}>
            <Text variant="h3" color={hasName ? 'ink' : 'ink5'} numberOfLines={2}>
              {name.trim() || 'Your product title'}
            </Text>
            {previewMeta ? (
              <Text variant="caption" color="ink4" numberOfLines={1}>
                {previewMeta}
              </Text>
            ) : null}
            <Text style={{ fontFamily: fonts.displayBold, fontSize: 24, lineHeight: 30, letterSpacing: -0.7, color: hasPrice ? colors.ink : colors.ink5 }}>
              {hasPrice ? formatLKR(cents) : 'Rs. —'}
              <Text variant="caption" color="ink4">{`  / ${unitLabel}`}</Text>
            </Text>
          </View>
        </Row>
        <Row gap={6} wrap>
          <MetaChip icon={Package} label={`MOQ ${moq.toLocaleString()}`} />
          <MetaChip icon={Clock} label={leadNum === 0 ? 'Same day' : `${leadNum}d lead`} />
          <MetaChip icon={Truck} label={delivery ? (radiusNum != null ? `${radiusNum} km` : 'Island-wide') : 'Pickup'} />
          {maxTierPct > 0 ? <MetaChip icon={Percent} label={`Up to ${maxTierPct}% off`} tone="volt" /> : null}
        </Row>

        <View style={{ gap: 10, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.lineSoft }}>
          <Row justify="space-between">
            <Text variant="bodySm" weight="semibold">
              Listing readiness
            </Text>
            <Text style={{ fontFamily: fonts.monoMedium, fontSize: 12, color: colors.ink3 }}>{`${readyCount}/${readiness.length}`}</Text>
          </Row>
          <View style={{ height: 4, borderRadius: 2, backgroundColor: colors.mist, overflow: 'hidden' }}>
            <View style={{ width: `${(readyCount / readiness.length) * 100}%`, height: '100%', borderRadius: 2, backgroundColor: colors.mint }} />
          </View>
          {readiness.map((r) => (
            <CheckRow key={r.label} done={r.done} label={r.label} {...(r.optional ? { optional: true } : {})} />
          ))}
        </View>
      </Card>

      <ImageSourceSheet visible={photoSheet} onClose={() => setPhotoSheet(false)} onPick={(camera) => void onPickPhoto(camera)} />
    </Screen>
  );
}

/* ---------------------------------- Bits ---------------------------------- */

/** Mirrors the API's tier rules: increasing minimums, non-shrinking discounts, ≤ 50%. */
function validateTiers(t: Tiers): string | null {
  const rows = [
    { q: num(t.q1), d: num(t.d1), label: 'Tier 1' },
    { q: num(t.q2), d: num(t.d2), label: 'Tier 2' },
    { q: num(t.q3), d: num(t.d3), label: 'Tier 3' },
  ].filter((r) => r.d > 0);
  for (const r of rows) {
    if (r.d > 50) return `${r.label} discount can be at most 50%.`;
    if (r.q < 1) return `${r.label} needs a minimum quantity.`;
  }
  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1]!;
    const cur = rows[i]!;
    if (cur.q <= prev.q) return `${cur.label} quantity must be greater than ${prev.label}.`;
    if (cur.d < prev.d) return `${cur.label} discount can’t be smaller than ${prev.label}.`;
  }
  return null;
}

function HeroPill({ label, muted }: { label: string; muted?: boolean }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        alignSelf: 'flex-start',
        height: 24,
        paddingHorizontal: 10,
        borderRadius: radii.pill,
        backgroundColor: muted ? 'rgba(250,247,240,0.06)' : 'rgba(198,220,74,0.12)',
      }}
    >
      {!muted ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.volt }} /> : null}
      <Text style={{ fontFamily: fonts.monoMedium, fontSize: 9.5, letterSpacing: 1.6, textTransform: 'uppercase', color: muted ? colors.paperMuted : colors.volt }}>
        {label}
      </Text>
    </View>
  );
}

function CountPill({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'success' }) {
  const t = tones[tone];
  return (
    <View style={{ height: 22, paddingHorizontal: 8, borderRadius: radii.pill, justifyContent: 'center', backgroundColor: t.bg }}>
      <Text style={{ fontFamily: fonts.monoMedium, fontSize: 10.5, color: t.fg }}>{label}</Text>
    </View>
  );
}

function MarketHint({ market, cents }: { market: Market; cents: number }) {
  if (market.lowestCents == null) {
    return <Hint tone="success" text="No other supplier lists this yet. You’d be the first rate buyers see." />;
  }
  const diff = cents > 0 ? Math.round(((cents - market.lowestCents) / market.lowestCents) * 100) : null;
  if (diff != null && (diff > 200 || diff < -80)) {
    return (
      <Hint
        tone="warning"
        text={`That’s far ${diff > 0 ? 'above' : 'below'} the lowest live rate of ${formatLKR(market.lowestCents)}. Check the price is for a single unit.`}
      />
    );
  }
  const text =
    `Lowest live rate ${formatLKR(market.lowestCents)} · ${market.suppliers} supplier${market.suppliers === 1 ? '' : 's'}` +
    (diff == null ? '' : diff === 0 ? ' · you match it' : diff < 0 ? ` · you’re ${Math.abs(diff)}% lower` : ` · you’re ${diff}% higher`);
  return <Hint tone={diff != null && diff > 15 ? 'warning' : diff != null && diff <= 0 ? 'success' : 'info'} text={text} />;
}

function Hint({ tone, text }: { tone: 'success' | 'warning' | 'info'; text: string }) {
  const t = tones[tone];
  return (
    <Row gap={10} style={{ padding: 12, borderRadius: radii.lg, borderCurve: 'continuous', backgroundColor: t.bg }}>
      <Search size={14} color={t.dot} />
      <Text variant="caption" style={{ flex: 1, color: t.fg }}>
        {text}
      </Text>
    </Row>
  );
}
