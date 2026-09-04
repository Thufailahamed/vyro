import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, ErrorBanner, Input, Label, Select, Textarea } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';

interface BusinessType { id: string; name: string; slug: string }

export function SupplierOnboardingPage() {
  const { user, refresh } = useAuth();
  const [types, setTypes] = useState<BusinessType[]>([]);
  const [form, setForm] = useState({
    name: '', businessTypeSlug: '', contactPerson: '', phone: '', email: user?.email ?? '',
    address: '', city: '', district: '', description: '',
  });
  const [err, setErr] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    api.get<{ types: BusinessType[] }>('/suppliers/types').then((d) => setTypes(d.types)).catch(() => {});
  }, []);

  if (!user) {
    return <ErrorBanner message="Sign in first to list your business." />;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    try {
      await api.post('/suppliers/onboard', form);
      await refresh();
      navigate('/profile');
    } catch (e) {
      setErr(e instanceof ApiError ? `${e.code}: ${e.message}` : 'Onboarding failed');
    }
  }

  return (
    <div className="max-w-xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">List your business</h1>
      <form onSubmit={submit} className="space-y-3 bg-white border rounded-lg p-6">
        <ErrorBanner message={err} />
        <div><Label>Business name</Label><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div><Label>Type</Label>
          <Select required value={form.businessTypeSlug} onChange={(e) => setForm({ ...form, businessTypeSlug: e.target.value })}>
            <option value="">Select type…</option>
            {types.map((t) => <option key={t.id} value={t.slug}>{t.name}</option>)}
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Contact person</Label><Input required value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} /></div>
          <div><Label>Phone</Label><Input required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
        </div>
        <div><Label>Email</Label><Input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
        <div><Label>Address</Label><Input required value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>City</Label><Input required value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
          <div><Label>District</Label><Input required value={form.district} onChange={(e) => setForm({ ...form, district: e.target.value })} /></div>
        </div>
        <div><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
        <Button type="submit" className="w-full">Publish listing</Button>
      </form>
    </div>
  );
}
