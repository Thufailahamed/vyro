import { describe, expect, it } from 'vitest';
import { EMPTY_ADDRESS_FORM, isAddressFormValid, toAddressPayload } from '../src/lib/addressBook';

describe('address book form helpers', () => {
  it('rejects an empty form and short addresses', () => {
    expect(isAddressFormValid(EMPTY_ADDRESS_FORM)).toBe(false);
    expect(
      isAddressFormValid({ ...EMPTY_ADDRESS_FORM, label: 'Main', address: 'ab', city: 'Colombo', district: 'Colombo' }),
    ).toBe(false);
  });

  it('accepts a complete form', () => {
    expect(
      isAddressFormValid({
        label: 'Main Depot',
        contactName: '',
        phone: '',
        address: '12 Galle Road',
        city: 'Colombo',
        district: 'Colombo',
        isDefault: false,
      }),
    ).toBe(true);
  });

  it('trims fields and maps empty optionals to null', () => {
    expect(
      toAddressPayload({
        label: '  Main Depot ',
        contactName: ' ',
        phone: '',
        address: ' 12 Galle Road ',
        city: ' Colombo ',
        district: ' Colombo ',
        isDefault: true,
      }),
    ).toEqual({
      label: 'Main Depot',
      contactName: null,
      phone: null,
      address: '12 Galle Road',
      city: 'Colombo',
      district: 'Colombo',
      isDefault: true,
    });
  });
});
