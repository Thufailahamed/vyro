import { Gate } from '@/features/common/Gate';
import { RfqDetailScreen } from '@/features/buyer/rfqs/RfqDetailScreen';

export default function RfqDetailRoute() {
  return (
    <Gate need="business">
      <RfqDetailScreen />
    </Gate>
  );
}
