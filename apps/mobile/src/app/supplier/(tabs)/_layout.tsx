import { FileText, LayoutDashboard, Layers, Menu, Package } from 'lucide-react-native';
import { PortalTabs } from '@/ui';

export default function SupplierTabs() {
  return (
    <PortalTabs
      tabs={[
        { name: 'index', label: 'Dashboard', icon: LayoutDashboard },
        { name: 'orders', label: 'Orders', icon: Package },
        { name: 'products', label: 'Products', icon: Layers },
        { name: 'quotes', label: 'Quotes', icon: FileText },
        { name: 'more', label: 'More', icon: Menu },
      ]}
    />
  );
}
