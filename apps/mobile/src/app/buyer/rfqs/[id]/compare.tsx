import { Gate } from '@/features/common/Gate';
import { RfqCompareScreen } from '@/features/buyer/rfqs/RfqCompareScreen';

export default function RfqCompareRoute() {
  return (
    <Gate need="business">
      <RfqCompareScreen />
    </Gate>
  );
}
