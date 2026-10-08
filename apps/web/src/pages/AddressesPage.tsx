import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { Badge, Button, ErrorBanner, Input, Label } from '@/components/ui';
import { Surface } from '@/components/brand/Surface';
import { useAuth } from '@/lib/auth';
import { usePageTitle } from '@/lib/usePageTitle';
import { useToast } from '@vyro/ui';
import {
  EMPTY_ADDRESS_FORM,
  isAddressFormValid,
  toAddressPayload,
  type AddressFormState,
} from '@/lib/addressBook';

interface AddressRow {
  id: string;
  label: string;
  contactName: string | null;
  phone: string | null;
  address: string;
  city: string;
  district: string;
  isDefault: boolean;
}

const DISTRICTS = [
  'Ampara', 'Anuradhapura', 'Badulla', 'Batticaloa', 'Colombo', 'Galle', 'Gampaha',
  'Hambantota', 'Jaffna', 'Kalutara', 'Kandy', 'Kegalle', 'Kilinochchi', 'Kurunegala',
  'Mannar', 'Matale', 'Matara', 'Monaragala', 'Mullaitivu', 'Nuwara Eliya',
  'Polonnaruwa', 'Puttalam', 'Ratnapura', 'Trincomalee', 'Vavuniya',
];

export function AddressesPage() {
  usePageTitle('Delivery Addresses');
  const { user } = useAuth();
  const businessId = user?.memberships?.[0]?.businessId;
  const qc = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState<AddressFormState>(EMPTY_ADDRESS_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [err, setErr] = useState('');

  const addresses = useQuery({
    queryKey: ['addresses', businessId],
    queryFn: () => api.get<{ addresses: AddressRow[] }>(`/businesses/${businessId}/addresses`),
    enabled: !!businessId,
  });

  function resetForm() {
    setForm(EMPTY_ADDRESS_FORM);
    setEditingId(null);
    setFormOpen(false);
    setErr('');
  }

  const save = useMutation({
    mutationFn: async () => {
      const payload = toAddressPayload(form);
      if (editingId) return api.patch(`/businesses/${businessId}/addresses/${editingId}`, payload);
      return api.post(`/businesses/${businessId}/addresses`, payload);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['addresses', businessId] });
      toast.success(editingId ? 'Address updated' : 'Address added');
      resetForm();
    },
    onError: (e) => setErr(e instanceof ApiError ? e.message : 'Could not save address'),
  });

  const setDefault = useMutation({
    mutationFn: (id: string) => api.patch(`/businesses/${businessId}/addresses/${id}`, { isDefault: true }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['addresses', businessId] });
      toast.success('Default address updated');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not set default'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/businesses/${businessId}/addresses/${id}`),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['addresses', businessId] });
      toast.success('Address removed');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not remove address'),
  });

  if (!businessId) {
    return (
      <div className="py-16 max-w-lg mx-auto text-center space-y-4">
        <h2 className="text-xl font-bold text-ink-1">No business profile found</h2>
        <p className="text-xs text-ink-3">Set up a business profile to manage delivery addresses.</p>
        <Link to="/onboarding/business">
          <Button variant="primary">Set Up Business Profile</Button>
        </Link>
      </div>
    );
  }

  const list = addresses.data?.addresses ?? [];

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink-1">Delivery addresses</h1>
          <p className="text-xs text-ink-3 mt-1">
            Choose a dock or receiving site at checkout. The first address you save becomes the default.
          </p>
        </div>
        <Button
          variant="primary"
          onClick={() => {
            setForm(EMPTY_ADDRESS_FORM);
            setEditingId(null);
            setFormOpen(true);
            setErr('');
          }}
        >
          + Add address
        </Button>
      </div>

      {err && <ErrorBanner message={err} />}

      {formOpen && (
        <Surface className="p-5 rounded-2xl border border-paper-subtle bg-paper space-y-4">
          <h2 className="text-sm font-bold text-ink-1">{editingId ? 'Edit address' : 'New address'}</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="addr-label">Label *</Label>
              <Input id="addr-label" value={form.label} maxLength={60}
                onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Main Depot" />
            </div>
            <div>
              <Label htmlFor="addr-contact">Contact name</Label>
              <Input id="addr-contact" value={form.contactName} maxLength={120}
                onChange={(e) => setForm({ ...form, contactName: e.target.value })} placeholder="Receiving officer" />
            </div>
            <div>
              <Label htmlFor="addr-phone">Phone</Label>
              <Input id="addr-phone" value={form.phone} maxLength={20}
                onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="077 000 0000" />
            </div>
            <div>
              <Label htmlFor="addr-city">City *</Label>
              <Input id="addr-city" value={form.city} maxLength={80}
                onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="Colombo" />
            </div>
            <div>
              <Label htmlFor="addr-district">District *</Label>
              <select
                id="addr-district"
                className="w-full mt-1 p-2.5 text-xs rounded-xl bg-paper border border-paper-subtle"
                value={form.district}
                onChange={(e) => setForm({ ...form, district: e.target.value })}
              >
                <option value="">Select district…</option>
                {DISTRICTS.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="addr-address">Address *</Label>
              <Input id="addr-address" value={form.address} maxLength={300}
                onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="12 Galle Road, Colombo 03" />
            </div>
            <label className="flex items-center gap-2 text-xs text-ink-2 sm:col-span-2">
              <input type="checkbox" checked={form.isDefault}
                onChange={(e) => setForm({ ...form, isDefault: e.target.checked })} />
              Make this the default delivery address
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={resetForm} disabled={save.isPending}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => save.mutate()}
              disabled={!isAddressFormValid(form) || save.isPending}
              loading={save.isPending}
            >
              {editingId ? 'Save changes' : 'Add address'}
            </Button>
          </div>
        </Surface>
      )}

      {addresses.isLoading ? (
        <div className="h-40 vyro-surface animate-pulse" />
      ) : list.length === 0 ? (
        <Surface className="p-10 text-center rounded-2xl border border-paper-subtle bg-paper space-y-2">
          <h3 className="text-sm font-bold text-ink-1">No saved addresses yet</h3>
          <p className="text-xs text-ink-3">
            Checkout uses your registered business address until you save one here.
          </p>
        </Surface>
      ) : (
        <div className="space-y-3">
          {list.map((a) => (
            <Surface key={a.id} className="p-4 rounded-2xl border border-paper-subtle bg-paper flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-ink-1 truncate">{a.label}</h3>
                  {a.isDefault && <Badge variant="neutral" className="text-[10px]">Default</Badge>}
                </div>
                <p className="text-xs text-ink-3 mt-1">{a.address}, {a.city}, {a.district}</p>
                {(a.contactName || a.phone) && (
                  <p className="text-[11px] text-ink-4 mt-0.5">
                    {a.contactName}{a.contactName && a.phone ? ' · ' : ''}{a.phone}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {!a.isDefault && (
                  <Button variant="ghost" size="sm" onClick={() => setDefault.mutate(a.id)} disabled={setDefault.isPending}>
                    Set default
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setForm({
                      label: a.label,
                      contactName: a.contactName ?? '',
                      phone: a.phone ?? '',
                      address: a.address,
                      city: a.city,
                      district: a.district,
                      isDefault: a.isDefault,
                    });
                    setEditingId(a.id);
                    setFormOpen(true);
                    setErr('');
                  }}
                >
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (window.confirm(`Remove ${a.label}?`)) remove.mutate(a.id);
                  }}
                  disabled={remove.isPending}
                >
                  Delete
                </Button>
              </div>
            </Surface>
          ))}
        </div>
      )}
    </div>
  );
}
