import { Gate } from '@/features/common/Gate';
import { OrdersScreen } from '@/features/buyer/orders/OrdersScreen';

export default function OrdersTab() {
  return (
    <Gate need="business" tabBar>
      <OrdersScreen />
    </Gate>
  );
}
