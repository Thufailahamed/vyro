import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Button, ErrorBanner, Input, Label } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { FlowLine } from '@/components/brand/FlowLine';
import { Surface } from '@/components/brand/Surface';
import { SRI_LANKAN_DISTRICTS } from '@/lib/sriLanka';
import { cn } from '@vyro/ui';
import { usePageTitle } from '@/lib/usePageTitle';
import {
  Building2Icon,
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

const BUYER_CATEGORY_META: Record<
  string,
  {
    subtitle: string;
    tag: string;
    badge: string;
    imageUrl: string;
  }
> = {
  restaurant: {
    tag: 'Kitchen Staples & Bulk Oils',
    badge: 'High Frequency',
    subtitle: 'Commercial kitchen staples, bulk cooking oils, Keeri Samba rice, dairy & daily produce.',
    imageUrl: '/images/placeholder.svg',
  },
  hotel: {
    tag: 'Full-Property Hospitality F&B',
    badge: 'Institutional',
    subtitle: 'Bulk F&B dining lots, guest amenities, estate tea selections & housekeeping cleaning supplies.',
    imageUrl: '/images/placeholder.svg',
  },
  cafe: {
    tag: 'Barista & Bakery Line',
    badge: 'Weekly Cycles',
    subtitle: 'Specialty coffee beans, pure Ceylon BOPF tea, barista syrups, dairy & artisan pastry inputs.',
    imageUrl: '/images/placeholder.svg',
  },
  retail: {
    tag: 'Packaged Grocery Restock',
    badge: 'Bulk Pallets',
    subtitle: 'Packaged dry groceries, branded commodities, FMCG retail restock & wholesale cartons.',
    imageUrl: '/images/placeholder.svg',
  },
  bakery: {
    tag: 'Baking Raw Commodities',
    badge: 'Raw Bulk',
    subtitle: 'Wheat flour 50kg bags, refined white sugar, baking fats, yeast, fresh eggs & bakery packaging.',
    imageUrl: '/images/placeholder.svg',
  },
  catering: {
    tag: 'Large-Batch Event Lots',
    badge: 'Scheduled Lots',
    subtitle: 'High-capacity commercial food lots, bulk seasonings, aluminum trays, disposables & event freight.',
    imageUrl: '/images/placeholder.svg',
  },
};

const STEPS = ['Sector', 'Identity', 'Delivery Place', 'Lead Contact'];

export function BusinessOnboardingPage() {
  usePageTitle('Register a business');
  const { user, refresh } = useAuth();
  const [types, setTypes] = useState<BusinessType[]>([]);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    name: '',
    businessTypeSlug: '',
    address: '',
    city: '',
    district: 'Colombo',
    contactPerson: '',
    phone: '',
    email: user?.email ?? '',
    description: '',
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
      .get<{ types: BusinessType[] }>('/businesses/types')
      .then((d) => {
        // Filter buyer business categories
        const buyerTypes = d.types.filter(
          (t) => !['grocery-wholesaler', 'beverage-distributor'].includes(t.slug),
        );
        setTypes(buyerTypes.length > 0 ? buyerTypes : d.types);
      })
      .catch(() => {});
  }, []);

  if (!user) {
    return (
      <div className="max-w-md mx-auto py-16 text-center space-y-4">
        <h2 className="vyro-display text-3xl">Sign in required</h2>
        <p className="text-sm text-ink-3">Please sign in to register your business on the VYRO network.</p>
        <div className="flex flex-col items-center gap-3 pt-2">
          <Link to="/login">
            <Button>Sign in to continue</Button>
          </Link>
          <Link to="/signup" className="text-xs text-copper hover:text-ink underline underline-offset-2">
            New here? Sign up first
          </Link>
          <Link
            to="/onboarding/supplier"
            className="text-xs text-ink-3 hover:text-copper pt-3 border-t border-ink/10 mt-3"
          >
            Not a buyer? Register as a supplier instead →
          </Link>
        </div>
      </div>
    );
  }

  // Logged-in buyers may already be suppliers — surface the option to add supplier membership.
  const alreadySupplier = (user.supplierMemberships?.length ?? 0) > 0;

  const selectedType = types.find((t) => t.slug === form.businessTypeSlug);

  async function submit() {
    setErr('');
    setLoading(true);
    try {
      const payload = {
        name: form.name.trim(),
        businessTypeSlug: form.businessTypeSlug,
        address: form.address.trim(),
        city: form.city.trim(),
        district: form.district.trim(),
        contactPerson: form.contactPerson.trim(),
        phone: form.phone.trim(),
        email: (form.email || user?.email || '').trim().toLowerCase(),
        description: form.description?.trim() || undefined,
      };
      await api.post('/businesses/onboard', payload);
      await refresh();
      navigate('/dashboard');
    } catch (e) {
      setErr(e instanceof ApiError ? `${e.message}` : 'Failed to register business. Please verify all details.');
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
            <span className="size-2 rounded-full bg-volt animate-pulse" />
            <span className="vyro-kicker text-volt-deep">Commercial Buyer Onboarding</span>
          </div>
          <div className="flex items-center gap-3">
            {alreadySupplier ? (
              <Link
                to="/supplier"
                className="font-mono text-[11px] uppercase tracking-wider bg-copper/10 text-copper border border-copper/30 px-2.5 py-1 hover:bg-copper hover:text-paper"
              >
                Open supplier portal →
              </Link>
            ) : (
              <Link
                to="/onboarding/supplier"
                className="font-mono text-[11px] uppercase tracking-wider bg-mist text-ink-3 border border-line px-2.5 py-1 hover:text-copper hover:border-copper/40"
              >
                Register as supplier instead
              </Link>
            )}
            <span className="font-mono text-ink-3 text-[11px] uppercase tracking-wider bg-mist px-2.5 py-1 border border-line">
              Step {step + 1} of {STEPS.length}: {STEPS[step]}
            </span>
          </div>
        </div>
        <FlowLine
          nodes={STEPS.map((label, i) => ({
            label,
            state: i < step ? 'done' : i === step ? 'active' : 'idle',
          }))}
        />
      </div>

      <ErrorBanner message={err} />

      {/* Step 0: Sector Selection */}
      {step === 0 && (
        <div className="space-y-6">
          <div>
            <h1 className="vyro-display text-4xl sm:text-5xl text-balance">What kind of business are you?</h1>
            <p className="mt-2 text-sm text-ink-3">
              Select your operating sector so primary mills and distributors can recommend the right catalog lines and commercial pack sizes.
            </p>
          </div>

          {types.length === 0 ? (
            <Surface className="p-8 text-center text-sm text-ink-4 animate-pulse">Loading wholesale sectors…</Surface>
          ) : (
            <div className="space-y-6">
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {types.map((t) => {
                  const selected = form.businessTypeSlug === t.slug;
                  const meta = BUYER_CATEGORY_META[t.slug] ?? {
                    subtitle: 'Commercial wholesale purchasing entity',
                    tag: 'Wholesale Trade',
                    badge: 'Commercial',
                    imageUrl: '/images/placeholder.svg',
                  };
                  return (
                    <div
                      key={t.id}
                      onClick={() => setForm({ ...form, businessTypeSlug: t.slug })}
                      className={cn(
                        'relative overflow-hidden border cursor-pointer transition-all duration-200 flex flex-col justify-between group',
                        selected
                          ? 'border-ink ring-2 ring-volt bg-paper shadow-lg scale-[1.01]'
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
                          <span className="px-2 py-0.5 text-[9px] font-mono font-bold uppercase tracking-wider bg-ink/90 text-volt border border-volt/30">
                            {meta.badge}
                          </span>
                          {selected && (
                            <span className="px-2 py-0.5 text-[9px] font-mono font-bold uppercase tracking-wider bg-volt text-ink border border-ink shadow-sm">
                              Selected ✓
                            </span>
                          )}
                        </div>
                        <div className="absolute bottom-2 left-2.5 right-2.5">
                          <span className="text-[10px] font-mono text-volt uppercase tracking-wider block truncate">
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
                          <span className={cn('size-4 rounded-full border flex items-center justify-center text-[10px]', selected ? 'bg-ink text-volt border-ink' : 'border-ink/30 text-transparent')}>
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
                      Selected: <strong className="text-ink text-sm">{selectedType.name}</strong>. Ready to register organization identity.
                    </span>
                  ) : (
                    <span>Please select your operating sector above to proceed.</span>
                  )}
                </div>
                <Button
                  disabled={!form.businessTypeSlug}
                  onClick={() => setStep(1)}
                  className="w-full sm:w-auto bg-volt text-ink hover:bg-volt-glow font-bold uppercase tracking-wider text-xs px-6 py-3"
                >
                  Continue to Business Identity →
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
            {/* Step 1: Business Identity */}
            {step === 1 && (
              <div className="space-y-6">
                <div>
                  <h1 className="vyro-display text-3xl sm:text-4xl text-balance">What is your business called?</h1>
                  <p className="mt-2 text-sm text-ink-3">
                    This official entity or trading name will appear on all purchase orders, delivery manifests, and SVAT tax invoices.
                  </p>
                </div>

                <div className="p-4 bg-paper border border-ink/10 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-3">
                    {selectedType && BUYER_CATEGORY_META[selectedType.slug]?.imageUrl && (
                      <img
                        src={BUYER_CATEGORY_META[selectedType.slug]!.imageUrl}
                        alt={selectedType.name}
                        className="size-9 object-cover rounded-xs border border-ink/20"
                      />
                    )}
                    <div>
                      <span className="text-[10px] uppercase tracking-wider text-copper font-mono block">Selected Sector</span>
                      <span className="font-semibold text-ink text-sm">{selectedType?.name || 'Commercial Buyer'}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setStep(0)}
                    className="text-copper hover:text-ink text-xs underline cursor-pointer"
                  >
                    Change Sector
                  </button>
                </div>

                <div className="space-y-5">
                  <div className="space-y-1.5">
                    <Label htmlFor="b-name" className="flex items-center gap-1.5">
                      <Building2Icon size={13} className="text-copper" />
                      <span>Registered Business / Trading Name *</span>
                    </Label>
                    <Input
                      id="b-name"
                      autoFocus
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="e.g. Ceylon Table Dining (Pvt) Ltd"
                      className="bg-paper text-base"
                    />
                    <p className="text-[11px] text-ink-4">
                      Printed on delivery dock manifests, purchase contracts, and electronic payments.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="b-desc">Operations Note / Procurement Scope (Optional)</Label>
                    <Input
                      id="b-desc"
                      value={form.description}
                      onChange={(e) => setForm({ ...form, description: e.target.value })}
                      placeholder="e.g. 150-seat casual dining restaurant operating daily in Colombo"
                      className="bg-paper"
                    />
                    <p className="text-[11px] text-ink-4">
                      Helps supplier sales desks anticipate delivery frequency and bulk lot packaging.
                    </p>
                  </div>

                  <div className="flex items-center gap-3 pt-4">
                    <Button variant="ghost" onClick={() => setStep(0)}>
                      ← Back
                    </Button>
                    <Button disabled={!form.name.trim()} onClick={() => setStep(2)}>
                      Continue to Delivery Place
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Location & Delivery Receiving Address */}
            {step === 2 && (
              <div className="space-y-6">
                <div>
                  <h1 className="vyro-display text-3xl sm:text-4xl text-balance">Where should goods arrive?</h1>
                  <p className="mt-2 text-sm text-ink-3">
                    Primary mills and logistics fleets calculate transit windows and freight charges to this receiving dock.
                  </p>
                </div>

                <div className="space-y-5">
                  <div className="space-y-1.5">
                    <Label htmlFor="addr" className="flex items-center gap-1.5">
                      <MapPinIcon size={13} className="text-copper" />
                      <span>Street / Delivery Receiving Address *</span>
                    </Label>
                    <Input
                      id="addr"
                      autoFocus
                      value={form.address}
                      onChange={(e) => setForm({ ...form, address: e.target.value })}
                      placeholder="e.g. No. 42, Galle Road, Kollupitiya"
                      className="bg-paper"
                    />
                    <p className="text-[11px] text-ink-4">
                      Include building, street name, and any delivery dock or gate number.
                    </p>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="city">City / Area *</Label>
                      <Input
                        id="city"
                        value={form.city}
                        onChange={(e) => setForm({ ...form, city: e.target.value })}
                        placeholder="e.g. Colombo 03"
                        className="bg-paper"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="district">District *</Label>
                      <select
                        id="district"
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
                      Continue to Contact
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Contact & Authorization */}
            {step === 3 && (
              <div className="space-y-6">
                <div>
                  <h1 className="vyro-display text-3xl sm:text-4xl text-balance">Who should receive orders?</h1>
                  <p className="mt-2 text-sm text-ink-3">
                    Purchase order confirmations, driver arrival SMS alerts, and invoices route to this contact.
                  </p>
                </div>

                <div className="space-y-5">
                  <div className="space-y-1.5">
                    <Label htmlFor="c-person" className="flex items-center gap-1.5">
                      <UserIcon size={13} className="text-copper" />
                      <span>Primary Procurement Officer / Contact Person *</span>
                    </Label>
                    <Input
                      id="c-person"
                      autoFocus
                      value={form.contactPerson}
                      onChange={(e) => setForm({ ...form, contactPerson: e.target.value })}
                      placeholder="e.g. Dinesh Silva"
                      className="bg-paper"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="c-email" className="flex items-center gap-1.5">
                      <MailIcon size={13} className="text-copper" />
                      <span>Work Billing Email *</span>
                    </Label>
                    <Input
                      id="c-email"
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      placeholder="procurement@ceylontable.lk"
                      className="bg-paper font-mono text-sm"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="c-phone" className="flex items-center gap-1.5">
                      <PhoneIcon size={13} className="text-copper" />
                      <span>Direct Phone / WhatsApp *</span>
                    </Label>
                    <Input
                      id="c-phone"
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      placeholder="e.g. +94 77 123 4567"
                      className="bg-paper font-mono text-sm"
                    />
                    <p className="text-[11px] text-ink-4">
                      Used by delivery fleet drivers for dock arrival and gate security clearance.
                    </p>
                  </div>

                  <div className="flex items-center gap-3 pt-4">
                    <Button variant="ghost" onClick={() => setStep(2)}>
                      ← Back
                    </Button>
                    <Button
                      loading={loading}
                      disabled={!form.contactPerson.trim() || !form.phone.trim() || !form.email.trim()}
                      onClick={submit}
                      className="bg-volt text-ink hover:bg-volt-glow font-bold uppercase tracking-wider text-xs px-6 py-3"
                    >
                      Complete Registration & Enter Workspace
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Live Interactive Account Card Preview */}
          <div className="lg:col-span-5 space-y-4 lg:sticky lg:top-24">
            <div className="vyro-kicker text-copper">Live Account Verification Card</div>
            <Surface kind="ink" className="p-6 sm:p-7 relative overflow-hidden grain shadow-xl border border-paper/20">
              <div className="relative z-10 space-y-5">
                {/* Card Top Pill */}
                <div className="flex items-center justify-between pb-3 border-b border-paper/15">
                  <div className="flex items-center gap-2">
                    <span className="size-2 rounded-full bg-volt animate-pulse" />
                    <span className="text-[10px] font-mono text-volt uppercase tracking-wider font-bold">
                      Commercial Buyer Entity
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-paper/50 uppercase tracking-wider">
                    {form.district} District
                  </span>
                </div>

                {/* Sector Preview Header */}
                {selectedType && (
                  <div className="flex items-center gap-3 p-2.5 bg-paper/5 border border-paper/10">
                    {BUYER_CATEGORY_META[selectedType.slug]?.imageUrl && (
                      <img
                        src={BUYER_CATEGORY_META[selectedType.slug]!.imageUrl}
                        alt={selectedType.name}
                        className="size-10 object-cover rounded-xs shrink-0 border border-paper/20"
                      />
                    )}
                    <div className="min-w-0">
                      <span className="text-[9px] font-mono text-volt uppercase tracking-wider block truncate">
                        {BUYER_CATEGORY_META[selectedType.slug]?.tag || 'Wholesale Sector'}
                      </span>
                      <span className="text-xs font-display text-paper font-semibold truncate block">
                        {selectedType.name}
                      </span>
                    </div>
                  </div>
                )}

                {/* Entity Name & Note */}
                <div>
                  <span className="text-[10px] font-mono text-paper/40 uppercase tracking-wider block">
                    Trading Organization Name
                  </span>
                  <h3 className="vyro-display text-2xl text-paper font-bold mt-1 break-words">
                    {form.name.trim() || 'Your Trading Name'}
                  </h3>
                  {form.description?.trim() ? (
                    <p className="text-xs text-paper/70 mt-1 line-clamp-2 leading-relaxed">
                      {form.description}
                    </p>
                  ) : (
                    <p className="text-xs text-paper/40 mt-1 italic">
                      Add operations note in form…
                    </p>
                  )}
                </div>

                {/* Logistics & Delivery Details */}
                <div className="space-y-2 pt-3 border-t border-paper/15 text-xs text-paper/75">
                  <div className="flex items-start gap-2">
                    <MapPinIcon size={14} className="text-copper shrink-0 mt-0.5" />
                    <div>
                      <span className="text-[10px] font-mono text-paper/40 uppercase block">Receiving Dock:</span>
                      <span className={form.address ? 'text-paper font-medium' : 'text-paper/40 italic'}>
                        {form.address ? `${form.address}, ${form.city} (${form.district})` : 'Awaiting address input…'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-start gap-2">
                    <UserIcon size={14} className="text-volt shrink-0 mt-0.5" />
                    <div>
                      <span className="text-[10px] font-mono text-paper/40 uppercase block">Procurement Officer:</span>
                      <span className={form.contactPerson ? 'text-paper font-medium' : 'text-paper/40 italic'}>
                        {form.contactPerson ? `${form.contactPerson} · ${form.phone || 'No phone'}` : 'Awaiting contact person…'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Bottom Badges */}
                <div className="pt-3 border-t border-paper/15 flex items-center justify-between text-[11px] font-mono text-paper/50">
                  <span className="flex items-center gap-1 text-volt font-bold">
                    <ShieldCheckIcon size={12} /> SVAT Invoicing Ready
                  </span>
                  <span>25 LK Districts</span>
                </div>
              </div>
            </Surface>

            {/* Benefits Checklist */}
            <div className="p-4 bg-paper border border-ink/10 space-y-2">
              <span className="text-[10px] font-mono text-copper uppercase tracking-wider block font-bold">
                Workspace Permissions Included:
              </span>
              <ul className="space-y-1.5 text-xs text-ink-3">
                <li className="flex items-center gap-2">
                  <CheckIcon size={12} className="text-volt-deep shrink-0" />
                  <span>Direct mill-gate wholesale prices (0% markup)</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckIcon size={12} className="text-volt-deep shrink-0" />
                  <span>Automated split PO checkout & tax billing</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckIcon size={12} className="text-volt-deep shrink-0" />
                  <span>Digital dockside Goods Receipt Notes (GRN)</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
