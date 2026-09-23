import { Gate } from '@/features/common/Gate';
import { RfqCreateScreen } from '@/features/buyer/rfqs/RfqCreateScreen';

export default function RfqCreateRoute() {
  return (
    <Gate need="business">
      <RfqCreateScreen />
    </Gate>
  );
}
