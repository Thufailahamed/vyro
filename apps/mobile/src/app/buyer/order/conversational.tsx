import { Gate } from '@/features/common/Gate';
import { ConversationalOrderScreen } from '@/features/buyer/orders/ConversationalOrderScreen';

export default function ConversationalOrderRoute() {
  return (
    <Gate need="business">
      <ConversationalOrderScreen />
    </Gate>
  );
}
