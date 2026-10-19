import React, { useState } from 'react';
import { useInvoices, usePayInvoice } from '../../hooks/useSponsored';
import { useSupplierId } from '../useSupplierId';
import { useToast } from '@vyro/ui';

export function InvoicesPage() {
  const { supplierId } = useSupplierId();
  const invoices = useInvoices(supplierId);
  const pay = usePayInvoice(supplierId);
  const toast = useToast();
  const [reference, setReference] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const submit = (id: string) => {
    const ref = reference.trim();
    if (ref.length < 3) {
      toast.show(toast.error('Enter your payment reference', 'e.g. the bank transfer reference.'));
      return;
    }
    pay.mutate(
      { id, reference: ref },
      {
        onSuccess: () => {
          toast.show(toast.success('Payment proof submitted', 'We will confirm once the transfer clears.'));
          setReference('');
          setOpenId(null);
        },
        onError: (e: unknown) => {
          toast.show(
            toast.error('Could not submit proof', e instanceof Error ? e.message : 'Please try again.'),
          );
        },
      },
    );
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold">Invoices</h1>
      <p className="mt-1 text-sm text-gray-500">
        Transfer the invoice amount using the account on your invoice, then submit the payment
        reference. The platform confirms receipt and releases your campaign.
      </p>
      {invoices.isLoading ? <div className="mt-4">Loading…</div> : null}
      <table className="mt-4 w-full text-sm">
        <thead className="text-left text-gray-500">
          <tr><th>ID</th><th>Amount</th><th>Status</th><th>Created</th><th>Paid</th><th></th></tr>
        </thead>
        <tbody>
          {invoices.data?.map((i) => (
            <tr key={i.id} className="border-t">
              <td className="py-2 font-mono text-xs">{i.id.slice(0, 8)}</td>
              <td>LKR {(i.amountCents / 100).toLocaleString()}</td>
              <td>{i.status}</td>
              <td>{new Date(i.createdAt * 1000).toLocaleDateString()}</td>
              <td>{i.paidAt ? new Date(i.paidAt * 1000).toLocaleDateString() : '—'}</td>
              <td>
                {i.status === 'pending' || i.status === 'submitted' ? (
                  <div className="flex items-center gap-2">
                    {openId === i.id ? (
                      <>
                        <input
                          className="rounded border border-gray-300 px-2 py-1 text-xs"
                          placeholder="Transfer reference"
                          value={reference}
                          onChange={(e) => setReference(e.target.value)}
                        />
                        <button
                          type="button"
                          className="rounded bg-blue-600 px-2 py-0.5 text-xs text-white disabled:opacity-50"
                          disabled={pay.isPending}
                          onClick={() => submit(i.id)}
                        >
                          {pay.isPending ? 'Sending…' : 'Submit proof'}
                        </button>
                        <button
                          type="button"
                          className="text-xs text-gray-500"
                          onClick={() => { setOpenId(null); setReference(''); }}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="rounded bg-blue-600 px-2 py-0.5 text-xs text-white disabled:opacity-50"
                        disabled={pay.isPending}
                        onClick={() => setOpenId(i.id)}
                      >
                        {i.status === 'submitted' ? 'Resubmit proof' : 'Submit payment proof'}
                      </button>
                    )}
                  </div>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
