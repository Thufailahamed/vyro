import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Button, Card, ErrorBanner, Input, Label, Select, Textarea } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import {
  StoreIcon,
  PhoneIcon,
  MailIcon,
  MapPinIcon,
  UserIcon,
  ArrowRightIcon,
  FileTextIcon,
  ShieldCheckIcon,
} from '@/components/icons';

interface BusinessType {
  id: string;
  name: string;
  slug: string;
}

export function SupplierOnboardingPage() {
  const { user, refresh } = useAuth();
  const [types, setTypes] = useState<BusinessType[]>([]);
  const [form, setForm] = useState({
    name: '',
    businessTypeSlug: '',
    contactPerson: '',
    phone: '',
    email: user?.email ?? '',
    address: '',
    city: '',
    district: '',
    description: '',
  });
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    api
      .get<{ types: BusinessType[] }>('/suppliers/types')
      .then((d) => setTypes(d.types))
      .catch(() => {});
  }, []);

  if (!user) {
    return (
      <div className="max-w-md mx-auto py-12 text-center">
        <Card className="p-8 space-y-4">
          <StoreIcon size={32} className="mx-auto text-slate-400" />
          <h2 className="text-xl font-bold text-slate-800">Sign In Required</h2>
          <p className="text-xs text-slate-500">Sign in to list your business catalog as an authorized supplier.</p>
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
      await api.post('/suppliers/onboard', form);
      await refresh();
      navigate('/profile');
    } catch (e) {
      setErr(e instanceof ApiError ? `${e.message}` : 'Supplier onboarding failed. Please check your information.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto py-6 space-y-6">
      <div>
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold border border-emerald-200 mb-2">
          <StoreIcon size={14} /> Supplier Merchant Program
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
          List Your Business as a Supplier
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-1">
          Receive wholesale purchase orders directly from hotels, supermarkets, contractors, and retailers across Sri Lanka.
        </p>
      </div>

      <ErrorBanner message={err} />

      <form onSubmit={submit} className="space-y-6">
        {/* Section 1: Business Identity */}
        <Card className="p-6 border-slate-200/90 space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
            <StoreIcon size={18} className="text-emerald-600" />
            <h2 className="text-base font-bold text-slate-900">1. Supplier & Brand Details</h2>
          </div>

          <div className="space-y-4">
            <div>
              <Label htmlFor="s-name">Company / Wholesale Trading Name</Label>
              <Input
                id="s-name"
                required
                placeholder="e.g. Ceylon Agro Mills & Exports Ltd"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="s-type">Wholesale Category</Label>
              <Select
                id="s-type"
                required
                value={form.businessTypeSlug}
                onChange={(e) => setForm({ ...form, businessTypeSlug: e.target.value })}
              >
                <option value="">Select primary category...</option>
                {types.map((t) => (
                  <option key={t.id} value={t.slug}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <Label htmlFor="s-desc">Company & Capabilities Overview</Label>
              <Textarea
                id="s-desc"
                rows={3}
                placeholder="Describe your manufacturing capacity, lead times, or product portfolio..."
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
          </div>
        </Card>

        {/* Section 2: Contact Person & Communication */}
        <Card className="p-6 border-slate-200/90 space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
            <UserIcon size={18} className="text-emerald-600" />
            <h2 className="text-base font-bold text-slate-900">2. Sales & Operations Contact</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="s-person">Key Account Manager Name</Label>
              <Input
                id="s-person"
                required
                placeholder="e.g. Nimal Fernando"
                value={form.contactPerson}
                onChange={(e) => setForm({ ...form, contactPerson: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="s-phone">Direct Phone / Hotline</Label>
              <Input
                id="s-phone"
                required
                placeholder="e.g. 011 234 5678"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>

            <div className="sm:col-span-2">
              <Label htmlFor="s-email">Official Order Notification Email</Label>
              <Input
                id="s-email"
                type="email"
                required
                placeholder="orders@supplier.lk"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
          </div>
        </Card>

        {/* Section 3: Distribution Center & Warehouse */}
        <Card className="p-6 border-slate-200/90 space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
            <MapPinIcon size={18} className="text-emerald-600" />
            <h2 className="text-base font-bold text-slate-900">3. Warehouse / Depot Location</h2>
          </div>

          <div className="space-y-4">
            <div>
              <Label htmlFor="s-addr">Warehouse / Facility Street Address</Label>
              <Input
                id="s-addr"
                required
                placeholder="e.g. Industrial Zone, Block B, Kelaniya"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="s-city">City / Hub</Label>
                <Input
                  id="s-city"
                  required
                  placeholder="e.g. Kelaniya"
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                />
              </div>

              <div>
                <Label htmlFor="s-district">District</Label>
                <Input
                  id="s-district"
                  required
                  placeholder="e.g. Gampaha"
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
          className="w-full font-bold shadow-soft-sm justify-center bg-emerald-600 hover:bg-emerald-700"
        >
          <span>Publish Supplier Listing</span>
          <ArrowRightIcon size={18} />
        </Button>
      </form>
    </div>
  );
}
