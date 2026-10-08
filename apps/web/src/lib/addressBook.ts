import type { BusinessAddressCreate } from '@vyro/validation';

export interface AddressFormState {
  label: string;
  contactName: string;
  phone: string;
  address: string;
  city: string;
  district: string;
  isDefault: boolean;
}

export const EMPTY_ADDRESS_FORM: AddressFormState = {
  label: '',
  contactName: '',
  phone: '',
  address: '',
  city: '',
  district: '',
  isDefault: false,
};

export function isAddressFormValid(form: AddressFormState): boolean {
  return (
    form.label.trim().length > 0 &&
    form.address.trim().length >= 3 &&
    form.city.trim().length > 0 &&
    form.district.trim().length > 0
  );
}

export function toAddressPayload(form: AddressFormState): BusinessAddressCreate {
  return {
    label: form.label.trim(),
    contactName: form.contactName.trim() || null,
    phone: form.phone.trim() || null,
    address: form.address.trim(),
    city: form.city.trim(),
    district: form.district.trim(),
    isDefault: form.isDefault,
  };
}
