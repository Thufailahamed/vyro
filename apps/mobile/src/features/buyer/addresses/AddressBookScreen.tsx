import { useState } from 'react';
import { View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MapPin } from 'lucide-react-native';
import { api, errorMessage } from '@/lib/api';
import { useAuth, useBusinessId } from '@/lib/auth';
import { SRI_LANKAN_DISTRICTS } from '@/lib/sriLanka';
import {
  Banner,
  Button,
  Checkbox,
  ConfirmSheet,
  EmptyState,
  ErrorState,
  Field,
  Input,
  ListRow,
  ListSection,
  Screen,
  Select,
  Sheet,
  Skeleton,
  useToast,
} from '@/ui';
import { Gate } from '../../common/Gate';

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

const WRITE_ROLES = ['owner', 'manager'];

export function AddressBookScreen() {
  return (
    <Gate need="business">
      <AddressBookInner />
    </Gate>
  );
}

function AddressBookInner() {
  const businessId = useBusinessId()!;
  const { business } = useAuth();
  const canWrite = !!business && WRITE_ROLES.includes(business.role);
  const qc = useQueryClient();
  const toast = useToast();

  const q = useQuery({
    queryKey: ['addresses', businessId],
    queryFn: () => api.get<{ addresses: AddressRow[] }>(`/businesses/${businessId}/addresses`),
  });

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AddressRow | null>(null);
  const [pendingDelete, setPendingDelete] = useState<AddressRow | null>(null);
  const [label, setLabel] = useState('');
  const [contactName, setContactName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [district, setDistrict] = useState<string | null>(null);
  const [isDefault, setIsDefault] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const valid =
    label.trim().length > 0 && address.trim().length >= 3 && city.trim().length > 0 && !!district;

  function reset() {
    setEditing(null);
    setLabel('');
    setContactName('');
    setPhone('');
    setAddress('');
    setCity('');
    setDistrict(null);
    setIsDefault(false);
    setErr(null);
  }

  function openCreate() {
    reset();
    setFormOpen(true);
  }

  function openEdit(a: AddressRow) {
    setEditing(a);
    setLabel(a.label);
    setContactName(a.contactName ?? '');
    setPhone(a.phone ?? '');
    setAddress(a.address);
    setCity(a.city);
    setDistrict(a.district);
    setIsDefault(a.isDefault);
    setErr(null);
    setFormOpen(true);
  }

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        label: label.trim(),
        contactName: contactName.trim() || null,
        phone: phone.trim() || null,
        address: address.trim(),
        city: city.trim(),
        district: (district ?? '').trim(),
        isDefault,
      };
      if (editing) return api.patch(`/businesses/${businessId}/addresses/${editing.id}`, payload);
      return api.post(`/businesses/${businessId}/addresses`, payload);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['addresses', businessId] });
      toast.success(editing ? 'Address updated' : 'Address added');
      setFormOpen(false);
      reset();
    },
    onError: (e) => setErr(errorMessage(e)),
  });

  const setDefault = useMutation({
    mutationFn: (id: string) => api.patch(`/businesses/${businessId}/addresses/${id}`, { isDefault: true }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['addresses', businessId] });
      toast.success('Default address updated');
    },
    onError: (e) => toast.error('Could not set default', errorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/businesses/${businessId}/addresses/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['addresses', businessId] });
      toast.success('Address removed');
      setPendingDelete(null);
    },
    onError: (e) => toast.error('Could not remove address', errorMessage(e)),
  });

  const header = {
    back: true as const,
    title: 'Delivery addresses',
    subtitle: 'Choose a dock or receiving site at checkout.',
  };
  const addresses = q.data?.addresses ?? [];

  return (
    <>
      <Screen
        {...header}
        onRefresh={() => void q.refetch()}
        footer={canWrite ? <Button title="Add address" size="lg" full onPress={openCreate} /> : undefined}
      >
        {q.isLoading ? <Skeleton height={220} radius={16} /> : null}
        {q.isError ? (
          <ErrorState
            message={errorMessage(q.error, 'Could not load addresses.')}
            onRetry={() => void q.refetch()}
          />
        ) : null}
        {!q.isLoading && !q.isError && addresses.length === 0 ? (
          <EmptyState
            icon={MapPin}
            title="No saved addresses"
            message="Checkout uses your registered business address until you save one here."
            action={canWrite ? { label: 'Add address', onPress: openCreate } : undefined}
          />
        ) : null}
        {addresses.length > 0 ? (
          <ListSection label="Saved addresses">
            {addresses.map((a, i) => (
              <ListRow
                key={a.id}
                icon={MapPin}
                iconTone={a.isDefault ? 'volt' : 'ink'}
                title={a.label}
                subtitle={`${a.address}, ${a.city}${a.isDefault ? ' · Default' : ''}`}
                last={i === addresses.length - 1}
                onPress={canWrite ? () => openEdit(a) : undefined}
                trailing={
                  canWrite ? (
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {!a.isDefault ? (
                        <Button title="Default" size="sm" variant="ghost" onPress={() => setDefault.mutate(a.id)} />
                      ) : null}
                      <Button title="Delete" size="sm" variant="ghost" onPress={() => setPendingDelete(a)} />
                    </View>
                  ) : undefined
                }
              />
            ))}
          </ListSection>
        ) : null}
      </Screen>

      <Sheet
        visible={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? 'Edit address' : 'New address'}
        scroll
        footer={
          <Button
            title={editing ? 'Save changes' : 'Add address'}
            size="lg"
            full
            loading={save.isPending}
            disabled={!valid}
            onPress={() => save.mutate()}
          />
        }
      >
        <View style={{ gap: 16 }}>
          {err ? <Banner tone="danger" message={err} /> : null}
          <Field label="Label">
            <Input value={label} onChangeText={setLabel} placeholder="Main Depot" maxLength={60} />
          </Field>
          <Field label="Contact name">
            <Input value={contactName} onChangeText={setContactName} placeholder="Receiving officer" maxLength={120} />
          </Field>
          <Field label="Phone">
            <Input value={phone} onChangeText={setPhone} placeholder="077 000 0000" maxLength={20} keyboardType="phone-pad" />
          </Field>
          <Field label="Address">
            <Input value={address} onChangeText={setAddress} placeholder="12 Galle Road, Colombo 03" maxLength={300} />
          </Field>
          <Field label="City">
            <Input value={city} onChangeText={setCity} placeholder="Colombo" maxLength={80} />
          </Field>
          <Field label="District">
            <Select
              value={district}
              options={SRI_LANKAN_DISTRICTS.map((d) => ({ value: d, label: d }))}
              onChange={setDistrict}
              title="Select district"
            />
          </Field>
          <Checkbox checked={isDefault} onChange={setIsDefault} label="Make this the default delivery address" />
        </View>
      </Sheet>

      <ConfirmSheet
        visible={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        title="Remove address"
        message={pendingDelete ? `Remove ${pendingDelete.label}?` : undefined}
        confirmLabel="Remove"
        variant="danger"
        loading={remove.isPending}
        onConfirm={() => {
          if (pendingDelete) remove.mutate(pendingDelete.id);
        }}
      />
    </>
  );
}
