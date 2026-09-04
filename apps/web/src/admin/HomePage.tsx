import { StoreIcon } from './icons';

export function AdminHomePage() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 rounded-xl bg-brand-50 text-brand-700 flex items-center justify-center">
          <StoreIcon size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">VYRO admin</h1>
          <p className="text-sm text-slate-500">Operations console for the platform.</p>
        </div>
      </div>
      <p className="text-slate-600">Pick a tab above: <strong>Suppliers</strong>, <strong>Businesses</strong>, <strong>Disputed</strong>, or <strong>Audit</strong>.</p>
    </div>
  );
}
