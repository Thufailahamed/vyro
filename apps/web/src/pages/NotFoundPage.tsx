import { Link } from 'react-router-dom';
import { Button, PageHeader, Surface } from '@/components/ui';
import { usePageTitle } from '@/lib/usePageTitle';

/**
 * Buyer-portal 404. Rendered inside `<Layout>` so the header, nav and footer
 * stay available — a dead URL should never strand the user on a bare page.
 */
export function NotFoundPage() {
  usePageTitle('Page not found');

  return (
    <div className="mx-auto max-w-3xl px-6 py-20">
      <PageHeader
        kicker="404"
        title="This page isn’t here."
        sub="The link may be outdated, or the record may have been removed."
      />
      <Surface className="mt-8 p-8">
        <p className="text-sm text-ink-4">
          If you followed a link from inside VYRO, the underlying order or product may have been
          deleted. Try one of these instead:
        </p>
        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          <li>
            <Link
              to="/search"
              className="block border border-ink/10 px-4 py-3 text-sm hover:border-ink/30 transition-colors"
            >
              <span className="font-medium">Browse the catalog</span>
              <span className="block text-xs text-ink-4">Find suppliers and products</span>
            </Link>
          </li>
          <li>
            <Link
              to="/orders"
              className="block border border-ink/10 px-4 py-3 text-sm hover:border-ink/30 transition-colors"
            >
              <span className="font-medium">Your orders</span>
              <span className="block text-xs text-ink-4">Track purchase orders and deliveries</span>
            </Link>
          </li>
          <li>
            <Link
              to="/dashboard"
              className="block border border-ink/10 px-4 py-3 text-sm hover:border-ink/30 transition-colors"
            >
              <span className="font-medium">Dashboard</span>
              <span className="block text-xs text-ink-4">Your workspace overview</span>
            </Link>
          </li>
          <li>
            <Link
              to="/notifications"
              className="block border border-ink/10 px-4 py-3 text-sm hover:border-ink/30 transition-colors"
            >
              <span className="font-medium">Notifications</span>
              <span className="block text-xs text-ink-4">Recent activity on your account</span>
            </Link>
          </li>
        </ul>
        <div className="mt-8">
          <Link to="/">
            <Button>Back to home</Button>
          </Link>
        </div>
      </Surface>
    </div>
  );
}
