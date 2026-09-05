import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Button, ErrorBanner, Input, Label } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { FlowLine } from '@/components/brand/FlowLine';
import { Surface } from '@/components/brand/Surface';
import { cn } from '@vyro/ui';

interface BusinessType {
  id: string;
  name: string;
  slug: string;
}

export const SRI_LANKAN_DISTRICTS = [
  'Colombo',
  'Gampaha',
  'Kalutara',
  'Kandy',
  'Matale',
  'Nuwara Eliya',
  'Galle',
  'Matara',
  'Hambantota',
  'Jaffna',
  'Kilinochchi',
  'Mannar',
  'Vavuniya',
  'Mullaitivu',
  'Batticaloa',
  'Ampara',
  'Trincomalee',
  'Kurunegala',
  'Puttalam',
  'Anuradhapura',
  'Polonnaruwa',
  'Badulla',
  'Monaragala',
  'Ratnapura',
  'Kegalle',
];

const BUYER_CATEGORY_META: Record<string, { subtitle: string; icon: string }> = {
  restaurant: {
    subtitle: 'Kitchen staples, bulk cooking oil, dairy & produce',
    icon: '🍳',
  },
  hotel: {
    subtitle: 'Bulk F&B, guest amenities & housekeeping supplies',
    icon: '🏨',
  },
  cafe: {
    subtitle: 'Specialty coffee, Ceylon tea, dairy & pastry inputs',
    icon: '☕',
  },
  retail: {
    subtitle: 'Packaged groceries, wholesale shelf restock & FMCG',
    icon: '🛒',
  },
  bakery: {
    subtitle: 'Flour, refined sugar, eggs, yeast & baking fats',
    icon: '🥐',
  },
  catering: {
    subtitle: 'Commercial food lots, packaging & disposables',
    icon: '🍽️',
  },
};

const STEPS = ['Sector', 'Identity', 'Delivery Place', 'Lead Contact'];

export function BusinessOnboardingPage() {
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
    <div className="max-w-3xl mx-auto space-y-8">
      {/* Progress header */}
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

      {/* Step 0: Sector Selection */}
      {step === 0 && (
        <div className="space-y-6">
          <div>
            <h1 className="vyro-display text-4xl sm:text-5xl text-balance">What kind of business are you?</h1>
            <p className="mt-2 text-sm text-ink-3">
              Select your operating sector so suppliers can recommend the right catalog lines and commercial pack sizes.
            </p>
          </div>

          {types.length === 0 ? (
            <Surface className="p-8 text-center text-sm text-ink-4 animate-pulse">Loading sectors…</Surface>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              {types.map((t) => {
                const selected = form.businessTypeSlug === t.slug;
                const meta = BUYER_CATEGORY_META[t.slug] ?? { subtitle: 'Commercial wholesale buyer', icon: '🏢' };
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

      {/* Step 1: Business Identity */}
      {step === 1 && (
        <div className="space-y-6">
          <div>
            <h1 className="vyro-display text-4xl text-balance">What is your business called?</h1>
            <p className="mt-2 text-sm text-ink-3">
              This name will appear on all purchase orders, delivery notes, and tax invoices.
            </p>
          </div>

          <div className="p-4 bg-paper border border-ink/10 flex items-center justify-between text-xs">
            <div>
              <span className="text-[10px] uppercase tracking-wider text-copper block">Selected Sector</span>
              <span className="font-semibold text-ink text-sm">{selectedType?.name || 'Commercial Buyer'}</span>
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
              <Label htmlFor="b-name">Registered Business / Trading Name *</Label>
              <Input
                id="b-name"
                autoFocus
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Ceylon Table Dining (Pvt) Ltd"
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="b-desc">Description / Operations Note (Optional)</Label>
              <Input
                id="b-desc"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="e.g. 150-seat casual dining restaurant operating daily in Colombo"
                className="mt-1"
              />
            </div>

            <div className="flex gap-3 pt-4">
              <Button variant="ghost" onClick={() => setStep(0)}>
                ← Back
              </Button>
              <Button disabled={!form.name.trim()} onClick={() => setStep(2)}>
                Continue to Delivery Place →
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Location & Delivery Receiving Address */}
      {step === 2 && (
        <div className="space-y-6">
          <div>
            <h1 className="vyro-display text-4xl text-balance">Where should goods arrive?</h1>
            <p className="mt-2 text-sm text-ink-3">
              Suppliers will calculate delivery windows and dispatch logistics to this receiving location.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <Label htmlFor="addr">Street / Delivery Address *</Label>
              <Input
                id="addr"
                autoFocus
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder="e.g. No. 42, Galle Road, Kollupitiya"
                className="mt-1"
              />
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="city">City / Area *</Label>
                <Input
                  id="city"
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                  placeholder="e.g. Colombo 03"
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="district">District *</Label>
                <select
                  id="district"
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
                Continue to Contact →
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Contact & Authorization */}
      {step === 3 && (
        <div className="space-y-6">
          <div>
            <h1 className="vyro-display text-4xl text-balance">Who should receive orders?</h1>
            <p className="mt-2 text-sm text-ink-3">
              Purchase orders, delivery dispatch updates, and billing statements will route to this contact.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <Label htmlFor="c-person">Primary Contact Person *</Label>
              <Input
                id="c-person"
                autoFocus
                value={form.contactPerson}
                onChange={(e) => setForm({ ...form, contactPerson: e.target.value })}
                placeholder="e.g. Dinesh Silva"
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="c-email">Work Email *</Label>
              <Input
                id="c-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="procurement@ceylontable.lk"
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="c-phone">Phone / WhatsApp *</Label>
              <Input
                id="c-phone"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="e.g. +94 77 123 4567"
                className="mt-1"
              />
            </div>

            {/* Summary review box */}
            <div className="p-5 bg-paper border border-ink/10 space-y-2 text-xs">
              <div className="vyro-kicker text-copper">Registration Summary</div>
              <div className="grid sm:grid-cols-2 gap-2 text-ink pt-1">
                <div>
                  <span className="text-ink-4">Entity:</span> <strong>{form.name || '—'}</strong>
                </div>
                <div>
                  <span className="text-ink-4">Sector:</span> <strong>{selectedType?.name || '—'}</strong>
                </div>
                <div>
                  <span className="text-ink-4">Delivery:</span> {form.address}, {form.city} ({form.district})
                </div>
                <div>
                  <span className="text-ink-4">Contact:</span> {form.contactPerson} ({form.phone})
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
                Register Business & Enter Workspace →
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
