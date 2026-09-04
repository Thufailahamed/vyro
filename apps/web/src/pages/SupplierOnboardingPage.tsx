import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Button, ErrorBanner, Input, Label, Textarea } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { FlowLine } from '@/components/brand/FlowLine';

interface BusinessType {
  id: string;
  name: string;
  slug: string;
}

export function SupplierOnboardingPage() {
  const { user, refresh } = useAuth();
  const [types, setTypes] = useState<BusinessType[]>([]);
  const [step, setStep] = useState(0);
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
      <div className="py-12">
        <h2 className="vyro-display text-3xl">Sign in required</h2>
        <Link to="/login" className="mt-4 inline-block">
          <Button>Sign in</Button>
        </Link>
      </div>
    );
  }

  async function submit() {
    setErr('');
    setLoading(true);
    try {
      await api.post('/suppliers/onboard', form);
      await refresh();
      navigate('/supplier/orders');
    } catch (e) {
      setErr(e instanceof ApiError ? `${e.message}` : 'Supplier onboarding failed.');
    } finally {
      setLoading(false);
    }
  }

  const labels = ['Category', 'Identity', 'Place', 'Contact'];

  return (
    <div className="max-w-2xl mx-auto py-4 space-y-10">
      <FlowLine
        nodes={labels.map((label, i) => ({
          label,
          state: i < step ? 'done' : i === step ? 'active' : 'idle',
        }))}
      />
      <ErrorBanner message={err} />

      {step === 0 && (
        <div>
          <h1 className="vyro-display text-4xl sm:text-5xl text-balance">What do you supply?</h1>
          <div className="mt-8 grid grid-cols-2 sm:grid-cols-3 gap-px bg-ink/10">
            {types.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setForm({ ...form, businessTypeSlug: t.slug });
                  setStep(1);
                }}
                className="p-5 text-left bg-paper hover:bg-ink hover:text-paper transition-colors"
              >
                <span className="font-display text-lg">{t.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4">
          <h1 className="vyro-display text-4xl">Name the supplier.</h1>
          <Label htmlFor="s-name">Trading name</Label>
          <Input id="s-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Label htmlFor="s-desc">Capabilities</Label>
          <Textarea id="s-desc" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <div className="flex gap-3">
            <Button variant="ghost" onClick={() => setStep(0)}>
              Back
            </Button>
            <Button disabled={!form.name.trim()} onClick={() => setStep(2)}>
              Continue
            </Button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <h1 className="vyro-display text-4xl">Where do you dispatch from?</h1>
          <Label htmlFor="s-addr">Warehouse address</Label>
          <Input id="s-addr" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="s-city">City</Label>
              <Input id="s-city" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="s-district">District</Label>
              <Input id="s-district" value={form.district} onChange={(e) => setForm({ ...form, district: e.target.value })} />
            </div>
          </div>
          <div className="flex gap-3">
            <Button variant="ghost" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button disabled={!form.address || !form.city || !form.district} onClick={() => setStep(3)}>
              Continue
            </Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <h1 className="vyro-display text-4xl">Who receives orders?</h1>
          <Label htmlFor="s-person">Account manager</Label>
          <Input id="s-person" value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} />
          <Label htmlFor="s-phone">Phone</Label>
          <Input id="s-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <Label htmlFor="s-email">Order email</Label>
          <Input id="s-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <div className="flex gap-3">
            <Button variant="ghost" onClick={() => setStep(2)}>
              Back
            </Button>
            <Button loading={loading} disabled={!form.contactPerson || !form.phone || !form.email} onClick={submit}>
              Publish listing
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
