import { useState } from 'react';
import { Button, ErrorBanner, Input, Label } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { usePageTitle } from '@/lib/usePageTitle';
import { useSupplierId } from './useSupplierId';
import { useSellerKyc, useSubmitKyc } from './useSellerKyc';

const STATUS_COPY: Record<string, { title: string; hint: string }> = {
  pending: {
    title: 'Verification pending',
    hint: 'Our team is reviewing your details. You can keep selling — this is just a heads-up.',
  },
  approved: {
    title: 'Verified',
    hint: 'Your supplier account is verified. Buyers can see your verified status.',
  },
  rejected: {
    title: 'Verification rejected',
    hint: 'Please fix the details below and resubmit.',
  },
  needs_more_info: {
    title: 'More information needed',
    hint: 'An admin asked for more detail. Update the form and resubmit.',
  },
};

export function SupplierVerificationPage() {
  usePageTitle('Verification');
  const { supplierId, supplierName } = useSupplierId();
  const { data, isLoading } = useSellerKyc();
  const submit = useSubmitKyc();
  const [form, setForm] = useState({
    registrationNo: '',
    taxId: '',
    bankName: '',
    bankAccountNo: '',
    bankBranch: '',
    bankAccountHolder: '',
  });
  const [err, setErr] = useState('');

  const kyc = data?.kyc ?? null;
  const status = kyc?.status ?? null;
  const canSubmit = status === null || status === 'rejected' || status === 'needs_more_info';
  const copy = status ? STATUS_COPY[status] : null;

  async function onSubmit() {
    setErr('');
    try {
      await submit.mutateAsync({ supplierId, ...form });
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Submission failed. Please try again.');
    }
  }

  const field = (key: keyof typeof form, label: string, placeholder: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={`kyc-${key}`}>{label}</Label>
      <Input
        id={`kyc-${key}`}
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        placeholder={placeholder}
        className="bg-paper"
      />
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <p className="vyro-kicker text-copper">Supplier verification</p>
        <h1 className="vyro-display text-3xl sm:text-4xl mt-1">{supplierName}</h1>
        <p className="mt-2 text-sm text-ink-3">
          Submit your business registration and payout details once. Admin approval verifies your
          supplier account.
        </p>
      </div>

      {isLoading ? (
        <p className="text-sm text-ink-4 animate-pulse">Loading verification status…</p>
      ) : (
        copy && (
          <div className="p-4 bg-paper border border-ink/10">
            <p className="text-sm font-semibold text-ink">{copy.title}</p>
            <p className="mt-1 text-xs text-ink-3">{copy.hint}</p>
            {kyc?.notes && <p className="mt-2 text-xs text-ink">Reviewer note: {kyc.notes}</p>}
          </div>
        )
      )}

      <ErrorBanner message={err} />

      <div className="p-5 bg-paper border border-ink/10 space-y-4">
        {field('registrationNo', 'Business registration no.', 'e.g. PV-00123456')}
        {field('taxId', 'Tax ID (optional)', 'e.g. 123456789-VAT')}
        {field('bankName', 'Bank name', 'e.g. Commercial Bank')}
        {field('bankAccountNo', 'Bank account no.', 'e.g. 8001234567')}
        {field('bankBranch', 'Bank branch', 'e.g. Dambulla')}
        {field('bankAccountHolder', 'Account holder', 'e.g. Lanka Agro Mills (Pvt) Ltd')}
        <Button
          loading={submit.isPending}
          disabled={!canSubmit || submit.isPending}
          onClick={onSubmit}
          className="w-full sm:w-auto"
        >
          {status === null
            ? 'Submit for verification'
            : status === 'approved'
              ? 'Verified ✓'
              : status === 'pending'
                ? 'Submitted — pending review'
                : 'Resubmit for verification'}
        </Button>
        {!canSubmit && status !== null && status !== 'approved' && (
          <p className="text-[11px] text-ink-4">Already submitted — waiting for review.</p>
        )}
      </div>
    </div>
  );
}
