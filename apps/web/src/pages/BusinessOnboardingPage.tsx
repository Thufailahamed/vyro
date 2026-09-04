import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Button, Card, ErrorBanner, Input, Label, Select } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import {
  Building2Icon,
  PhoneIcon,
  MapPinIcon,
  UserIcon,
  ArrowRightIcon,
  ShieldCheckIcon,
} from '@/components/icons';

interface BusinessType {
  id: string;
  name: string;
  slug: string;
}

export function BusinessOnboardingPage() {
  const { user, refresh } = useAuth();
  const [types, setTypes] = useState<BusinessType[]>([]);
  const [form, setForm] = useState({
    name: '',
    businessTypeSlug: '',
    address: '',
    city: '',
    district: '',
    contactPerson: '',
    phone: '',
  });
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    api
      .get<{ types: BusinessType[] }>('/businesses/types')
      .then((d) => setTypes(d.types))
      .catch(() => {});
  }, []);

  if (!user) {
    return (
      <div className="max-w-md mx-auto py-12 text-center">
        <Card className="p-8 space-y-4">
          <Building2Icon size={32} className="mx-auto text-slate-400" />
          <h2 className="text-xl font-bold text-slate-800">Sign In Required</h2>
          <p className="text-xs text-slate-500">Sign in to register and link your business organization.</p>
          <Link to="/login">
            <Button>Sign In to Continue</Button>
          </Link>
        </Card>
      </div>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setLoading(true);
    try {
      await api.post('/businesses/onboard', form);
      await refresh();
      navigate('/profile');
    } catch (e) {
      setErr(e instanceof ApiError ? `${e.message}` : 'Failed to register business. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto py-6 space-y-7">
      <div className="pb-4 border-b border-slate-200">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-violet/15 text-violet mb-2.5">
          <Building2Icon size={12} /> Step 1 of 1 · Business registration
        </div>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-950 text-balance">
          Set up your business profile
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Register your business entity to issue formal Purchase Orders and unlock wholesale pricing.
        </p>
      </div>

      <ErrorBanner message={err} />

      <form onSubmit={submit} className="space-y-5">
        {/* Section 1: Entity Info */}
        <Card className="p-6 border-slate-200/90 space-y-4">
          <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
            <span className="size-7 rounded-md bg-violet/15 text-violet inline-flex items-center justify-center">
              <Building2Icon size={13} />
            </span>
            <h2 className="text-base font-semibold text-slate-950">Business information</h2>
          </div>

          <div className="space-y-4">
            <div>
              <Label htmlFor="b-name">Registered Business / Company Name</Label>
              <Input
                id="b-name"
                required
                placeholder="e.g. Lanka Grand Supermarket (Pvt) Ltd"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="b-type">Industry / Business Type</Label>
              <Select
                id="b-type"
                required
                value={form.businessTypeSlug}
                onChange={(e) => setForm({ ...form, businessTypeSlug: e.target.value })}
              >
                <option value="">Select industry category...</option>
                {types.map((t) => (
                  <option key={t.id} value={t.slug}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        </Card>

        {/* Section 2: Contact Details */}
        <Card className="p-6 border-slate-200/90 space-y-4">
          <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
            <span className="size-7 rounded-md bg-cyan/15 text-cyan-deep inline-flex items-center justify-center">
              <UserIcon size={13} />
            </span>
            <h2 className="text-base font-semibold text-slate-950">Primary procurement contact</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="c-person">Contact Person Name</Label>
              <Input
                id="c-person"
                required
                placeholder="e.g. Priyantha Silva"
                value={form.contactPerson}
                onChange={(e) => setForm({ ...form, contactPerson: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="c-phone">Direct Phone Number</Label>
              <Input
                id="c-phone"
                required
                placeholder="e.g. 077 123 4567"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
          </div>
        </Card>

        {/* Section 3: Operating Location */}
        <Card className="p-6 border-slate-200/90 space-y-4">
          <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
            <span className="size-7 rounded-md bg-mint/15 text-mint inline-flex items-center justify-center">
              <MapPinIcon size={13} />
            </span>
            <h2 className="text-base font-semibold text-slate-950">Operating address & dispatch</h2>
          </div>

          <div className="space-y-4">
            <div>
              <Label htmlFor="addr">Street Address / Warehouse Location</Label>
              <Input
                id="addr"
                required
                placeholder="e.g. 142 Galle Road, Bambalapitiya"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="city">City / Town</Label>
                <Input
                  id="city"
                  required
                  placeholder="e.g. Colombo 04"
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                />
              </div>

              <div>
                <Label htmlFor="district">District</Label>
                <Input
                  id="district"
                  required
                  placeholder="e.g. Colombo, Gampaha, Kandy..."
                  value={form.district}
                  onChange={(e) => setForm({ ...form, district: e.target.value })}
                />
              </div>
            </div>
          </div>
        </Card>

        <Button
          type="submit"
          disabled={loading}
          loading={loading}
          size="lg"
          className="w-full font-bold shadow-soft-sm justify-center"
        >
          <span>Complete Business Registration</span>
          <ArrowRightIcon size={18} />
        </Button>
      </form>
    </div>
  );
}
