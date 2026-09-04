import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';

interface Supplier { id: string; name: string; city: string; district: string; email: string }
interface Business { id: string; name: string; city: string; district: string; email: string }

export function SuppliersPage() {
  const { data } = useQuery({
    queryKey: ['admin-suppliers'],
    queryFn: () => api.get<{ suppliers: Supplier[] }>('/admin/suppliers'),
    retry: false,
  });
  return (
    <div>
      <h1 className="text-xl font-bold mb-4">Suppliers</h1>
      <Table rows={data?.suppliers ?? []} cols={['name', 'city', 'district', 'email']} />
    </div>
  );
}

export function BusinessesPage() {
  const { data } = useQuery({
    queryKey: ['admin-businesses'],
    queryFn: () => api.get<{ businesses: Business[] }>('/admin/businesses'),
    retry: false,
  });
  return (
    <div>
      <h1 className="text-xl font-bold mb-4">Businesses</h1>
      <Table rows={data?.businesses ?? []} cols={['name', 'city', 'district', 'email']} />
    </div>
  );
}

function Table({ rows, cols }: { rows: any[]; cols: string[] }) {
  if (rows.length === 0) return <p className="text-muted text-sm">No rows. Sign in as admin or no data.</p>;
  return (
    <table className="w-full text-sm bg-white border rounded-lg overflow-hidden">
      <thead className="bg-slate-50 text-left">
        <tr>{cols.map((c) => <th key={c} className="p-2 capitalize">{c}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className="border-t">
            {cols.map((c) => <td key={c} className="p-2">{r[c]}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

void ApiError;
