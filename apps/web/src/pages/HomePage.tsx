import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { Card, Button } from '@/components/ui';

export function HomePage() {
  const { user } = useAuth();
  return (
    <div className="space-y-12">
      <section className="text-center py-12">
        <h1 className="text-4xl font-bold mb-2">B2B procurement, sorted.</h1>
        <p className="text-muted max-w-xl mx-auto">Search suppliers, compare offers, and place orders — built for Sri Lankan businesses.</p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <Link to="/search"><Button>Find products</Button></Link>
          {!user && <Link to="/onboarding/supplier"><Button className="bg-white text-brand-700 border border-brand-600">List your business</Button></Link>}
        </div>
      </section>
      <section className="grid md:grid-cols-3 gap-4">
        <Card>
          <h3 className="font-semibold mb-1">Search & compare</h3>
          <p className="text-sm text-muted">Browse verified suppliers and compare offers side by side.</p>
        </Card>
        <Card>
          <h3 className="font-semibold mb-1">Purchase orders</h3>
          <p className="text-sm text-muted">Track every order from acceptance to delivery with full audit history.</p>
        </Card>
        <Card>
          <h3 className="font-semibold mb-1">Built for SL</h3>
          <p className="text-sm text-muted">LKR by default. Designed around the realities of local wholesale.</p>
        </Card>
      </section>
    </div>
  );
}
