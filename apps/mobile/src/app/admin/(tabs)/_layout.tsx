import { Banknote, Building, Gauge, Menu, Package } from 'lucide-react-native';
import { PortalTabs } from '@/ui';

export default function AdminTabs() {
  return (
    <PortalTabs
      tabs={[
        { name: 'index', label: 'Overview', icon: Gauge },
        { name: 'orders', label: 'Orders', icon: Package },
        { name: 'directory', label: 'Directory', icon: Building },
        { name: 'money', label: 'Money', icon: Banknote },
        { name: 'more', label: 'More', icon: Menu },
      ]}
    />
  );
}
