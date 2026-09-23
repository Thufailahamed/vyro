import { Gate } from '@/features/common/Gate';
import { ReturnsScreen } from '@/features/buyer/orders/ReturnsScreen';

export default function ReturnsRoute() {
  return (
    <Gate need="business">
      <ReturnsScreen />
    </Gate>
  );
}
