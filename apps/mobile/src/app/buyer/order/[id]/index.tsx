import { Gate } from '@/features/common/Gate';
import { OrderDetailScreen } from '@/features/buyer/orders/OrderDetailScreen';

export default function OrderDetailRoute() {
  return (
    <Gate need="business">
      <OrderDetailScreen />
    </Gate>
  );
}
