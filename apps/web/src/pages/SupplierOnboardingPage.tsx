import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Button, ErrorBanner, Input, Label, Textarea } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { FlowLine } from '@/components/brand/FlowLine';
import { Surface } from '@/components/brand/Surface';
import { cn } from '@vyro/ui';
import { SRI_LANKAN_DISTRICTS } from '@/lib/sriLanka';
import { usePageTitle } from '@/lib/usePageTitle';
import {
  StoreIcon,
  MapPinIcon,
  UserIcon,
  MailIcon,
  PhoneIcon,
  ShieldCheckIcon,
  CheckIcon,
} from '@/components/icons';

interface BusinessType {
  id: string;
  name: string;
  slug: string;
}

const SUPPLIER_CATEGORY_META: Record<
  string,
  {
    subtitle: string;
    tag: string;
    badge: string;
    imageUrl: string;
  }
> = {
  'grocery-wholesaler': {
    tag: 'Mill Gate & Dry Provisions',
    badge: 'Staples',
    subtitle: 'Primary rice millers, refined white sugar importers, commercial wheat flour & wholesale cooking oil.',
    imageUrl: '/images/placeholder.svg',
  },
  'beverage-distributor': {
    tag: 'Estate Tea & Beverage Lines',
    badge: 'Beverages',
    subtitle: 'Pure Ceylon BOPF tea estates, single-origin coffees, bottled mineral waters & commercial syrups.',
    imageUrl: '/images/placeholder.svg',
  },
  'dairy-producer': {
    tag: 'Cold Chain Dairy Supply',
    badge: 'Refrigerated',
    subtitle: 'Fresh pasteurized cow milk, commercial cheddar cheese blocks, cooking butter & culinary yogurts.',
    imageUrl: '/images/placeholder.svg',
  },
  'packaging-supplier': {
    tag: 'Export & Corrugated Shipping',
    badge: 'Packaging',
    subtitle: 'Heavy-duty 5-ply cartons, food takeout containers, cling film, strapping tape & bulk sacks.',
    imageUrl: '/images/placeholder.svg',
  },
  'spices-commodities': {
    tag: 'Export Grade Commodities',
    badge: 'Spices',
    subtitle: 'Ceylon Alba cinnamon, black peppercorns, green cardamoms, cloves & agricultural lots.',
    imageUrl: '/images/placeholder.svg',
  },
  'meat-seafood': {
    tag: 'Fresh Coastal & Cold Storage',
    badge: 'Cold Storage',
    subtitle: 'Commercial poultry, beef portions, coastal fresh fish, prawns & frozen culinary proteins.',
    imageUrl: '/images/placeholder.svg',
  },
};

const BUYER_SLUGS = ['restaurant', 'hotel', 'cafe', 'retail', 'bakery', 'catering'];

const STEPS = ['Supply Line', 'Trade Identity', 'Dispatch Base', 'Key Contact'];

export function SupplierOnboardingPage() {
  usePageTitle('Become a supplier');
  const { user, refresh } = useAuth();
  const [types, setTypes] = useState<BusinessType[]>([]);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    name: '',
    businessTypeSlug: '',
    description: '',
    address: '',
    city: '',
    district: 'Colombo',
    contactPerson: '',
    phone: '',
    email: user?.email ?? '',
  });
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (user?.email && !form.email) {
      setForm((f) => ({ ...f, email: user.email }));
    }
  }, [user]);

  useEffect(() => {
    api
      .get<{ types: BusinessType[] }>('/suppliers/types')
      .then((d) => {
        // Filter supplier categories specifically
        const supplierTypes = d.types.filter((t) => !BUYER_SLUGS.includes(t.slug));
        setTypes(supplierTypes.length > 0 ? supplierTypes : d.types);
      })
      .catch(() => {});
  }, []);

  if (!user) {
    return (
      <div className="max-w-md mx-auto py-16 text-center space-y-4">
        <h2 className="vyro-display text-3xl">Sign in required</h2>
        <p className="text-sm text-ink-3">Please sign in to register as an authorized supplier on VYRO.</p>
        <Link to="/login" className="inline-block mt-4">
          <Button>Sign in to continue</Button>
        </Link>
      </div>
    );
  }

  const selectedType = types.find((t) => t.slug === form.businessTypeSlug);

  async function submit() {
    setErr('');
    setLoading(true);
    try {
      const payload = {
        name: form.name.trim(),
        businessTypeSlug: form.businessTypeSlug,
        description: form.description?.trim() || undefined,
        address: form.address.trim(),
        city: form.city.trim(),
        district: form.district.trim(),
        contactPerson: form.contactPerson.trim(),
        phone: form.phone.trim(),
        email: (form.email || user?.email || '').trim().toLowerCase(),
        categories: [form.businessTypeSlug || 'wholesale'],
      };
      await api.post('/suppliers/onboard', payload);
      await refresh();
      navigate('/supplier/orders');
    } catch (e) {
      if (e instanceof ApiError && e.details && typeof e.details === 'object') {
        const details = e.details as { fieldErrors?: Record<string, string[]> };
        if (details.fieldErrors) {
          const messages = Object.entries(details.fieldErrors)
            .map(([field, msgs]) => `${field}: ${msgs.join(', ')}`)
            .join('; ');
          if (messages) {
            setErr(`Validation error: ${messages}`);
            return;
          }
        }
      }
      setErr(e instanceof ApiError ? `${e.message}` : 'Failed to register supplier listing. Please verify all details.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Clean Stepper Progress */}
      <div className="space-y-3 pb-6 border-b border-ink/10">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-copper animate-pulse" />
            <span className="vyro-kicker text-copper">Wholesale Supplier Onboarding</span>
          </div>
          <span className="font-mono text-ink-3 text-[11px] uppercase tracking-wider bg-mist px-2.5 py-1 border border-line">
            Step {step + 1} of {STEPS.length}: {STEPS[step]}
          </span>
        </div>
        <FlowLine
          nodes={STEPS.map((label, i) => ({
            label,
            state: i < step ? 'done' : i === step ? 'active' : 'idle',
          }))}
        />
      </div>

      <ErrorBanner message={err} />

      {/* Step 0: Category Selection */}
      {step === 0 && (
        <div className="space-y-6">
          <div>
            <h1 className="vyro-display text-4xl sm:text-5xl text-balance">What do you supply?</h1>
            <p className="mt-2 text-sm text-ink-3">
              Select your primary wholesale sector so commercial buyers and procurement managers can locate your inventory.
            </p>
          </div>

          {types.length === 0 ? (
            <Surface className="p-8 text-center text-sm text-ink-4 animate-pulse">Loading wholesale sectors…</Surface>
          ) : (
            <div className="space-y-6">
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {types.map((t) => {
                  const selected = form.businessTypeSlug === t.slug;
                  const meta = SUPPLIER_CATEGORY_META[t.slug] ?? {
                    subtitle: 'Wholesale producer and regional distributor',
                    tag: 'Primary Distribution',
                    badge: 'Direct Mill',
                    imageUrl: '/images/placeholder.svg',
                  };
                  return (
                    <div
                      key={t.id}
                      onClick={() => setForm({ ...form, businessTypeSlug: t.slug })}
                      className={cn(
                        'relative overflow-hidden border cursor-pointer transition-all duration-200 flex flex-col justify-between group',
                        selected
                          ? 'border-ink ring-2 ring-copper bg-paper shadow-lg scale-[1.01]'
                          : 'border-ink/15 bg-paper hover:border-ink hover:shadow-md',
                      )}
                    >
                      {/* Photographic Header */}
                      <div className="relative h-32 overflow-hidden bg-mist">
                        <img
                          src={meta.imageUrl}
                          alt={t.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-void/85 via-void/30 to-transparent" />
                        <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between">
                          <span className="px-2 py-0.5 text-[9px] font-mono font-bold uppercase tracking-wider bg-ink/90 text-copper border border-copper/30">
                            {meta.badge}
                          </span>
                          {selected && (
                            <span className="px-2 py-0.5 text-[9px] font-mono font-bold uppercase tracking-wider bg-copper text-paper border border-ink shadow-sm">
                              Selected ✓
                            </span>
                          )}
                        </div>
                        <div className="absolute bottom-2 left-2.5 right-2.5">
                          <span className="text-[10px] font-mono text-paper uppercase tracking-wider block truncate">
                            {meta.tag}
                          </span>
                        </div>
                      </div>

                      {/* Content Body */}
                      <div className="p-4 space-y-2 flex-1 flex flex-col justify-between">
                        <div>
                          <h3 className="font-display text-lg text-ink font-semibold group-hover:text-copper transition-colors leading-tight">
                            {t.name}
                          </h3>
                          <p className="mt-1 text-xs text-ink-3 line-clamp-2 leading-relaxed">
                            {meta.subtitle}
                          </p>
                        </div>

                        <div className="pt-3 border-t border-ink/10 flex items-center justify-between text-xs">
                          <span className={cn('text-[11px] font-semibold uppercase tracking-wider', selected ? 'text-ink font-bold' : 'text-copper group-hover:text-ink')}>
                            {selected ? 'Active Selection' : 'Select Sector →'}
                          </span>
                          <span className={cn('size-4 rounded-full border flex items-center justify-center text-[10px]', selected ? 'bg-ink text-copper border-ink' : 'border-ink/30 text-transparent')}>
                            ✓
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Action Bar */}
              <div className="p-5 bg-paper border border-ink/15 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="text-xs text-ink-3">
                  {selectedType ? (
                    <span>
                      Selected: <strong className="text-ink text-sm">{selectedType.name}</strong>. Ready to register facility identity.
                    </span>
                  ) : (
                    <span>Please select your supply sector above to proceed.</span>
                  )}
                </div>
                <Button
                  disabled={!form.businessTypeSlug}
                  onClick={() => setStep(1)}
                  className="w-full sm:w-auto bg-copper text-paper hover:opacity-90 font-bold uppercase tracking-wider text-xs px-6 py-3"
                >
                  Continue to Trade Identity →
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
      {/* Steps 1, 2, 3: Two-Column Form + Live Preview Card */}
      {step > 0 && (
        <div className="grid lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Form Steps */}
          <div className="lg:col-span-7 space-y-6">
            {/* Step 1: Supplier Identity */}
            {step === 1 && (
              <div className="space-y-6">
                <div>
                  <h1 className="vyro-display text-3xl sm:text-4xl text-balance">Name your wholesale business.</h1>
                  <p className="mt-2 text-sm text-ink-3">
                    This verified facility name is displayed across the commercial catalog and printed on delivery manifests.
                  </p>
                </div>

                <div className="p-4 bg-paper border border-ink/10 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-3">
                    {selectedType && SUPPLIER_CATEGORY_META[selectedType.slug]?.imageUrl && (
                      <img
                        src={SUPPLIER_CATEGORY_META[selectedType.slug]!.imageUrl}
                        alt={selectedType.name}
                        className="size-9 object-cover rounded-xs border border-ink/20"
                      />
                    )}
                    <div>
                      <span className="text-[10px] uppercase tracking-wider text-copper font-mono block">Primary Supply Line</span>
                      <span className="font-semibold text-ink text-sm">{selectedType?.name || 'Wholesale Supplier'}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setStep(0)}
                    className="text-copper hover:text-ink text-xs underline cursor-pointer"
                  >
                    Change Line
                  </button>
                </div>

                <div className="space-y-5">
                  <div className="space-y-1.5">
                    <Label htmlFor="s-name" className="flex items-center gap-1.5">
                      <StoreIcon size={13} className="text-copper" />
                      <span>Trading / Commercial Facility Name *</span>
                    </Label>
                    <Input
                      id="s-name"
                      autoFocus
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="e.g. Lanka Agro Mills & Processing (Pvt) Ltd"
                      className="bg-paper text-base"
                    />
                    <p className="text-[11px] text-ink-4">
                      Official trade name shown to hotels, restaurants, and retail grocers.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="s-desc">Catalog Capabilities & Operations (Optional)</Label>
                    <Textarea
                      id="s-desc"
                      rows={3}
                      value={form.description}
                      onChange={(e) => setForm({ ...form, description: e.target.value })}
                      placeholder="e.g. Direct importer of grain commodities, operating 3 temperature-controlled warehouses with 24-hour Colombo dispatch."
                      className="bg-paper"
                    />
                    <p className="text-[11px] text-ink-4">
                      Summarize your milling capacity, storage specs, or express delivery fleet.
                    </p>
                  </div>

                  <div className="flex items-center gap-3 pt-4">
                    <Button variant="ghost" onClick={() => setStep(0)}>
                      ← Back
                    </Button>
                    <Button disabled={!form.name.trim()} onClick={() => setStep(2)}>
                      Continue to Dispatch Base
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Dispatch Base */}
            {step === 2 && (
              <div className="space-y-6">
                <div>
                  <h1 className="vyro-display text-3xl sm:text-4xl text-balance">Where do you dispatch from?</h1>
                  <p className="mt-2 text-sm text-ink-3">
                    Enter your primary warehouse, agricultural mill, or logistics hub address for dock receiving and driver pickup routing.
                  </p>
                </div>

                <div className="space-y-5">
                  <div className="space-y-1.5">
                    <Label htmlFor="s-addr" className="flex items-center gap-1.5">
                      <MapPinIcon size={13} className="text-copper" />
                      <span>Warehouse / Depot Physical Address *</span>
                    </Label>
                    <Input
                      id="s-addr"
                      autoFocus
                      value={form.address}
                      onChange={(e) => setForm({ ...form, address: e.target.value })}
                      placeholder="e.g. Mill Gate No. 12, Dambulla Industrial Zone"
                      className="bg-paper"
                    />
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="s-city">City / Hub *</Label>
                      <Input
                        id="s-city"
                        value={form.city}
                        onChange={(e) => setForm({ ...form, city: e.target.value })}
                        placeholder="e.g. Dambulla"
                        className="bg-paper"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="s-district">District *</Label>
                      <select
                        id="s-district"
                        value={form.district}
                        onChange={(e) => setForm({ ...form, district: e.target.value })}
                        className="w-full h-11 bg-paper px-3 text-sm shadow-[inset_0_0_0_1px_rgba(12,14,11,0.16)] focus:outline-none focus:shadow-[inset_0_0_0_1px_#0C0E0B] font-medium"
                      >
                        {SRI_LANKAN_DISTRICTS.map((d) => (
                          <option key={d} value={d}>
                            {d} District
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 pt-4">
                    <Button variant="ghost" onClick={() => setStep(1)}>
                      ← Back
                    </Button>
                    <Button disabled={!form.address.trim() || !form.city.trim()} onClick={() => setStep(3)}>
                      Continue to Key Contact
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Sales Lead Contact */}
            {step === 3 && (
              <div className="space-y-6">
                <div>
                  <h1 className="vyro-display text-3xl sm:text-4xl text-balance">Who manages incoming orders?</h1>
                  <p className="mt-2 text-sm text-ink-3">
                    Purchase order alerts, pickup manifests, and settlement statements will route to this key account manager.
                  </p>
                </div>

                <div className="space-y-5">
                  <div className="space-y-1.5">
                    <Label htmlFor="s-person" className="flex items-center gap-1.5">
                      <UserIcon size={13} className="text-copper" />
                      <span>Account Manager / Key Contact Person *</span>
                    </Label>
                    <Input
                      id="s-person"
                      autoFocus
                      value={form.contactPerson}
                      onChange={(e) => setForm({ ...form, contactPerson: e.target.value })}
                      placeholder="e.g. Sunil Bandara"
                      className="bg-paper"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="s-phone" className="flex items-center gap-1.5">
                      <PhoneIcon size={13} className="text-copper" />
                      <span>Direct Phone / WhatsApp *</span>
                    </Label>
                    <Input
                      id="s-phone"
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      placeholder="e.g. +94 37 222 9876"
                      className="bg-paper font-mono text-sm"
                    />
                    <p className="text-[11px] text-ink-4">
                      Direct contact for buyer procurement officers and dispatch fleet coordinators.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="s-email" className="flex items-center gap-1.5">
                      <MailIcon size={13} className="text-copper" />
                      <span>Order Notification & PO Email *</span>
                    </Label>
                    <Input
                      id="s-email"
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      placeholder="sales@lankaagromills.lk"
                      className="bg-paper font-mono text-sm"
                    />
                  </div>

                  <div className="flex items-center gap-3 pt-4">
                    <Button variant="ghost" onClick={() => setStep(2)}>
                      ← Back
                    </Button>
                    <Button
                      loading={loading}
                      disabled={!form.contactPerson.trim() || !form.phone.trim() || !form.email.trim()}
                      onClick={submit}
                      className="bg-copper text-paper hover:opacity-90 font-bold uppercase tracking-wider text-xs px-6 py-3"
                    >
                      Publish Supplier Profile & Enter Workspace
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Live Interactive Supplier Facility Card Preview */}
          <div className="lg:col-span-5 space-y-4 lg:sticky lg:top-24">
            <div className="vyro-kicker text-copper">Live Facility Verification Card</div>
            <Surface kind="ink" className="p-6 sm:p-7 relative overflow-hidden grain shadow-xl border border-paper/20">
              <div className="relative z-10 space-y-5">
                {/* Card Top Pill */}
                <div className="flex items-center justify-between pb-3 border-b border-paper/15">
                  <div className="flex items-center gap-2">
                    <span className="size-2 rounded-full bg-copper animate-pulse" />
                    <span className="text-[10px] font-mono text-copper uppercase tracking-wider font-bold">
                      Authorized Wholesale Supplier
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-paper/50 uppercase tracking-wider">
                    {form.district} Hub
                  </span>
                </div>

                {/* Sector Preview Header */}
                {selectedType && (
                  <div className="flex items-center gap-3 p-2.5 bg-paper/5 border border-paper/10">
                    {SUPPLIER_CATEGORY_META[selectedType.slug]?.imageUrl && (
                      <img
                        src={SUPPLIER_CATEGORY_META[selectedType.slug]!.imageUrl}
                        alt={selectedType.name}
                        className="size-10 object-cover rounded-xs shrink-0 border border-paper/20"
                      />
                    )}
                    <div className="min-w-0">
                      <span className="text-[9px] font-mono text-copper uppercase tracking-wider block truncate">
                        {SUPPLIER_CATEGORY_META[selectedType.slug]?.tag || 'Wholesale Supply'}
                      </span>
                      <span className="text-xs font-display text-paper font-semibold truncate block">
                        {selectedType.name}
                      </span>
                    </div>
                  </div>
                )}

                {/* Entity Name & Operations */}
                <div>
                  <span className="text-[10px] font-mono text-paper/40 uppercase tracking-wider block">
                    Facility / Entity Name
                  </span>
                  <h3 className="vyro-display text-2xl text-paper font-bold mt-1 break-words">
                    {form.name.trim() || 'Your Commercial Entity'}
                  </h3>
                  {form.description?.trim() ? (
                    <p className="text-xs text-paper/70 mt-1 line-clamp-2 leading-relaxed">
                      {form.description}
                    </p>
                  ) : (
                    <p className="text-xs text-paper/40 mt-1 italic">
                      Add facility operations summary…
                    </p>
                  )}
                </div>

                {/* Logistics & Depot Details */}
                <div className="space-y-2 pt-3 border-t border-paper/15 text-xs text-paper/75">
                  <div className="flex items-start gap-2">
                    <MapPinIcon size={14} className="text-copper shrink-0 mt-0.5" />
                    <div>
                      <span className="text-[10px] font-mono text-paper/40 uppercase block">Dispatch Base:</span>
                      <span className={form.address ? 'text-paper font-medium' : 'text-paper/40 italic'}>
                        {form.address ? `${form.address}, ${form.city} (${form.district})` : 'Awaiting depot address…'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-start gap-2">
                    <UserIcon size={14} className="text-copper shrink-0 mt-0.5" />
                    <div>
                      <span className="text-[10px] font-mono text-paper/40 uppercase block">Account Manager:</span>
                      <span className={form.contactPerson ? 'text-paper font-medium' : 'text-paper/40 italic'}>
                        {form.contactPerson ? `${form.contactPerson} · ${form.phone || 'No phone'}` : 'Awaiting contact person…'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Bottom Badges */}
                <div className="pt-3 border-t border-paper/15 flex items-center justify-between text-[11px] font-mono text-paper/50">
                  <span className="flex items-center gap-1 text-copper font-bold">
                    <ShieldCheckIcon size={12} /> Direct PO Acceptance
                  </span>
                  <span>Island-wide Dispatch</span>
                </div>
              </div>
            </Surface>

            {/* Benefits Checklist */}
            <div className="p-4 bg-paper border border-ink/10 space-y-2">
              <span className="text-[10px] font-mono text-copper uppercase tracking-wider block font-bold">
                Supplier Hub Capabilities:
              </span>
              <ul className="space-y-1.5 text-xs text-ink-3">
                <li className="flex items-center gap-2">
                  <CheckIcon size={12} className="text-copper shrink-0" />
                  <span>Receive direct POs from hotels, restaurants & grocers</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckIcon size={12} className="text-copper shrink-0" />
                  <span>Automated dispatch manifests & driver vehicle assignments</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckIcon size={12} className="text-copper shrink-0" />
                  <span>Transparent settlement with zero hidden broker fees</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
