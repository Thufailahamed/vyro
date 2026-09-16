import React from 'react';
import { useInvoices, usePayInvoice } from '../../hooks/useSponsored';
import { useSupplierId } from '../useSupplierId';

export function InvoicesPage() {
  const { supplierId } = useSupplierId();
  const invoices = useInvoices(supplierId);
  const pay = usePayInvoice(supplierId);
  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold">Invoices</h1>
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
                {i.status === 'pending' ? (
                  <button
                    type="button"
                    className="rounded bg-blue-600 px-2 py-0.5 text-xs text-white disabled:opacity-50"
                    disabled={pay.isPending}
                    onClick={() => pay.mutate(i.id)}
                  >
                    Mark paid
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}