import { Gate } from '@/features/common/Gate';
import { RfqsScreen } from '@/features/buyer/rfqs/RfqsScreen';

export default function RfqsRoute() {
  return (
    <Gate need="business">
      <RfqsScreen />
    </Gate>
  );
}
