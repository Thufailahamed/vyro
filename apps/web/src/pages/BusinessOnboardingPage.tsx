import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Button, ErrorBanner, Input, Label } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { FlowLine } from '@/components/brand/FlowLine';
import { Surface } from '@/components/brand/Surface';

interface BusinessType {
  id: string;
  name: string;
  slug: string;
}

export function BusinessOnboardingPage() {
  const { user, refresh } = useAuth();
  const [types, setTypes] = useState<BusinessType[]>([]);
  const [step, setStep] = useState(0);
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
      await api.post('/businesses/onboard', form);
      await refresh();
      navigate('/dashboard');
    } catch (e) {
      setErr(e instanceof ApiError ? `${e.message}` : 'Failed to register business. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const steps = ['Type', 'Name', 'Place', 'Contact'];

  return (
    <div className="max-w-2xl mx-auto py-4 space-y-10">
      <FlowLine
        nodes={steps.map((label, i) => ({
          label,
          state: i < step ? 'done' : i === step ? 'active' : 'idle',
        }))}
      />
      <ErrorBanner message={err} />

      {step === 0 && (
        <div>
          <h1 className="vyro-display text-4xl sm:text-5xl text-balance">What kind of business are you?</h1>
          <div className="mt-8 grid grid-cols-2 sm:grid-cols-3 gap-px bg-ink/10">
            {types.map((t) => {
              const selected = form.businessTypeSlug === t.slug;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setForm({ ...form, businessTypeSlug: t.slug });
                    setStep(1);
                  }}
                  className={`p-5 text-left bg-paper hover:bg-ink hover:text-paper transition-colors ${selected ? 'bg-ink text-volt' : ''}`}
                >
                  <span className="font-display text-lg">{t.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {step === 1 && (
        <div>
          <h1 className="vyro-display text-4xl text-balance">What’s the business called?</h1>
          <div className="mt-8 space-y-4">
            <Label htmlFor="b-name">Registered name</Label>
            <Input
              id="b-name"
              autoFocus
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Lanka Grand (Pvt) Ltd"
            />
            <div className="flex gap-3 pt-2">
              <Button variant="ghost" onClick={() => setStep(0)}>
                Back
              </Button>
              <Button disabled={!form.name.trim()} onClick={() => setStep(2)}>
                Continue
              </Button>
            </div>
          </div>
        </div>
      )}

      {step === 2 && (
        <div>
          <h1 className="vyro-display text-4xl text-balance">Where should goods arrive?</h1>
          <div className="mt-8 space-y-4">
            <div>
              <Label htmlFor="addr">Address</Label>
              <Input id="addr" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="city">City</Label>
                <Input id="city" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="district">District</Label>
                <Input id="district" value={form.district} onChange={(e) => setForm({ ...form, district: e.target.value })} />
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="ghost" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button disabled={!form.address || !form.city || !form.district} onClick={() => setStep(3)}>
                Continue
              </Button>
            </div>
          </div>
        </div>
      )}

      {step === 3 && (
        <div>
          <h1 className="vyro-display text-4xl text-balance">Who should we contact?</h1>
          <div className="mt-8 space-y-4">
            <div>
              <Label htmlFor="c-person">Contact person</Label>
              <Input id="c-person" value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="c-phone">Phone</Label>
              <Input id="c-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="ghost" onClick={() => setStep(2)}>
                Back
              </Button>
              <Button loading={loading} disabled={!form.contactPerson || !form.phone} onClick={submit}>
                Enter VYRO
              </Button>
            </div>
          </div>
        </div>
      )}

      {types.length === 0 && step === 0 && <Surface className="p-8 text-sm text-ink-4">Loading categories…</Surface>}
    </div>
  );
}
