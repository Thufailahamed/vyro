import { Home, LayoutGrid, Package, ShoppingBag, UserRound } from 'lucide-react-native';
import { PortalTabs } from '@/ui';
import { useCartCount } from '@/features/buyer/useCartCount';

export default function BuyerTabs() {
  const cartCount = useCartCount();
  return (
    <PortalTabs
      tabs={[
        { name: 'index', label: 'Home', icon: Home },
        { name: 'catalog', label: 'Catalog', icon: LayoutGrid },
        { name: 'orders', label: 'Orders', icon: Package },
        { name: 'cart', label: 'Cart', icon: ShoppingBag, badge: cartCount },
        { name: 'account', label: 'Account', icon: UserRound },
      ]}
    />
  );
}
