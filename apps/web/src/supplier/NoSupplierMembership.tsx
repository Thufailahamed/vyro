import { Link } from 'react-router-dom';
import { Surface } from '@/components/brand/Surface';
import { Button } from '@/components/ui';

export function NoSupplierMembership() {
  return (
    <div className="max-w-xl mx-auto py-16">
      <Surface kind="elevated" className="p-8 text-center space-y-4">
        <h1 className="vyro-display text-2xl">No supplier membership yet.</h1>
        <p className="text-sm text-ink-4">
          Onboard a supplier organization to manage products, pricing, inventory, and orders.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Link to="/onboarding/supplier">
            <Button variant="primary">Become a supplier</Button>
          </Link>
          <Link to="/">
            <Button variant="ghost">Back to marketplace</Button>
          </Link>
        </div>
      </Surface>
    </div>
  );
}
