import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Button, ErrorBanner, Input, Label, Textarea } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { FlowLine } from '@/components/brand/FlowLine';
import { Surface } from '@/components/brand/Surface';
import { cn } from '@vyro/ui';
import { SRI_LANKAN_DISTRICTS } from './BusinessOnboardingPage';

interface BusinessType {
  id: string;
  name: string;
  slug: string;
}

const SUPPLIER_CATEGORY_META: Record<string, { subtitle: string; icon: string }> = {
  'grocery-wholesaler': {
    subtitle: 'Staple grains, sugar, flour, cooking oils & dry provisions',
    icon: '🌾',
  },
  'beverage-distributor': {
    subtitle: 'Ceylon teas, estate coffees, bottled beverages & syrups',
    icon: '☕',
  },
  'dairy-producer': {
    subtitle: 'Fresh pasteurized milk, commercial cheeses, butter & yogurts',
    icon: '🥛',
  },
  'packaging-supplier': {
    subtitle: 'Corrugated cartons, food boxes, eco packaging & wrap',
    icon: '📦',
  },
  'spices-commodities': {
    subtitle: 'Ceylon cinnamon, black pepper, cardamoms & export-grade lots',
    icon: '🌿',
  },
  'meat-seafood': {
    subtitle: 'Poultry, beef, fresh coastal seafood & cold storage supply',
    icon: '🐟',
  },
};

const BUYER_SLUGS = ['restaurant', 'hotel', 'cafe', 'retail', 'bakery', 'catering'];

const STEPS = ['Supply Line', 'Trade Identity', 'Dispatch Base', 'Key Contact'];

export function SupplierOnboardingPage() {
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
      };
      await api.post('/suppliers/onboard', payload);
      await refresh();
      navigate('/supplier/orders');
    } catch (e) {
      setErr(e instanceof ApiError ? `${e.message}` : 'Failed to register supplier listing. Please verify all details.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {/* Stepper Progress */}
      <div>
        <div className="flex items-center justify-between text-xs text-ink-4 mb-3">
          <span className="vyro-kicker text-copper">Step {step + 1} of {STEPS.length}</span>
          <span className="font-mono text-ink-3">{STEPS[step]}</span>
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
            <div className="grid sm:grid-cols-2 gap-3">
              {types.map((t) => {
                const selected = form.businessTypeSlug === t.slug;
                const meta = SUPPLIER_CATEGORY_META[t.slug] ?? {
                  subtitle: 'Wholesale producer and regional distributor',
                  icon: '🏭',
                };
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setForm({ ...form, businessTypeSlug: t.slug });
                      setStep(1);
                    }}
                    className={cn(
                      'p-5 text-left transition-all duration-200 border flex flex-col justify-between cursor-pointer group',
                      selected
                        ? 'bg-ink text-paper border-ink shadow-md scale-[1.01]'
                        : 'bg-paper text-ink border-ink/15 hover:border-ink hover:bg-paper/80 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.04)]',
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-2xl" aria-hidden>{meta.icon}</span>
                      {selected ? (
                        <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-volt text-ink">
                          Selected ✓
                        </span>
                      ) : (
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-copper group-hover:text-ink">
                          Select →
                        </span>
                      )}
                    </div>
                    <div className="mt-4">
                      <h3 className={cn('font-display text-xl leading-tight', selected ? 'text-paper' : 'text-ink')}>
                        {t.name}
                      </h3>
                      <p className={cn('mt-1.5 text-xs leading-relaxed', selected ? 'text-paper/75' : 'text-ink-4')}>
                        {meta.subtitle}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Step 1: Supplier Identity */}
      {step === 1 && (
        <div className="space-y-6">
          <div>
            <h1 className="vyro-display text-4xl text-balance">Name your wholesale business.</h1>
            <p className="mt-2 text-sm text-ink-3">
              This entity name is verified by buyers and printed on delivery manifests and commercial bills.
            </p>
          </div>

          <div className="p-4 bg-paper border border-ink/10 flex items-center justify-between text-xs">
            <div>
              <span className="text-[10px] uppercase tracking-wider text-copper block">Primary Supply Line</span>
              <span className="font-semibold text-ink text-sm">{selectedType?.name || 'Wholesale Supplier'}</span>
            </div>
            <button
              type="button"
              onClick={() => setStep(0)}
              className="text-copper hover:text-ink text-xs underline cursor-pointer"
            >
              Change
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <Label htmlFor="s-name">Trading / Commercial Name *</Label>
              <Input
                id="s-name"
                autoFocus
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Lanka Agro Mills & Processing (Pvt) Ltd"
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="s-desc">Catalog Capabilities & Operations (Optional)</Label>
              <Textarea
                id="s-desc"
                rows={3}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="e.g. Direct importer of grain commodities, operating 3 temperature-controlled warehouses with 24-hour Colombo dispatch."
                className="mt-1"
              />
            </div>

            <div className="flex gap-3 pt-4">
              <Button variant="ghost" onClick={() => setStep(0)}>
                ← Back
              </Button>
              <Button disabled={!form.name.trim()} onClick={() => setStep(2)}>
                Continue to Dispatch Base →
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Dispatch Base */}
      {step === 2 && (
        <div className="space-y-6">
          <div>
            <h1 className="vyro-display text-4xl text-balance">Where do you dispatch from?</h1>
            <p className="mt-2 text-sm text-ink-3">
              Enter your main warehouse, mill, or logistics depot address for pickup and fulfillment routing.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <Label htmlFor="s-addr">Warehouse / Depot Address *</Label>
              <Input
                id="s-addr"
                autoFocus
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder="e.g. 15 Industrial Zone, Dambulla Road"
                className="mt-1"
              />
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="s-city">City / Industrial Area *</Label>
                <Input
                  id="s-city"
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                  placeholder="e.g. Kurunegala"
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="s-district">District *</Label>
                <select
                  id="s-district"
                  value={form.district}
                  onChange={(e) => setForm({ ...form, district: e.target.value })}
                  className="w-full h-11 bg-paper px-3 text-sm shadow-[inset_0_0_0_1px_rgba(12,14,11,0.16)] focus:outline-none focus:shadow-[inset_0_0_0_1px_#0C0E0B] mt-1"
                >
                  {SRI_LANKAN_DISTRICTS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <Button variant="ghost" onClick={() => setStep(1)}>
                ← Back
              </Button>
              <Button disabled={!form.address.trim() || !form.city.trim()} onClick={() => setStep(3)}>
                Continue to Key Contact →
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Sales Lead Contact */}
      {step === 3 && (
        <div className="space-y-6">
          <div>
            <h1 className="vyro-display text-4xl text-balance">Who manages incoming orders?</h1>
            <p className="mt-2 text-sm text-ink-3">
              Purchase orders, pickup notifications, and dispatch updates will route to this account manager.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <Label htmlFor="s-person">Account Manager / Key Contact *</Label>
              <Input
                id="s-person"
                autoFocus
                value={form.contactPerson}
                onChange={(e) => setForm({ ...form, contactPerson: e.target.value })}
                placeholder="e.g. Sunil Bandara"
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="s-phone">Direct Phone / WhatsApp *</Label>
              <Input
                id="s-phone"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="e.g. +94 37 222 9876"
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="s-email">Order Notification Email *</Label>
              <Input
                id="s-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="sales@lankaagromills.lk"
                className="mt-1"
              />
            </div>

            {/* Summary review box */}
            <div className="p-5 bg-paper border border-ink/10 space-y-2 text-xs">
              <div className="vyro-kicker text-copper">Supplier Profile Summary</div>
              <div className="grid sm:grid-cols-2 gap-2 text-ink pt-1">
                <div>
                  <span className="text-ink-4">Company:</span> <strong>{form.name || '—'}</strong>
                </div>
                <div>
                  <span className="text-ink-4">Sector:</span> <strong>{selectedType?.name || '—'}</strong>
                </div>
                <div>
                  <span className="text-ink-4">Depot:</span> {form.address}, {form.city} ({form.district})
                </div>
                <div>
                  <span className="text-ink-4">Manager:</span> {form.contactPerson} ({form.phone})
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <Button variant="ghost" onClick={() => setStep(2)}>
                ← Back
              </Button>
              <Button
                loading={loading}
                disabled={!form.contactPerson.trim() || !form.phone.trim() || !form.email.trim()}
                onClick={submit}
              >
                Publish Supplier Profile & Enter Workspace →
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
