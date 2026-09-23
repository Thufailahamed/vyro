import { Gate } from '@/features/common/Gate';
import { InvoiceScreen } from '@/features/buyer/orders/InvoiceScreen';

export default function InvoiceRoute() {
  return (
    <Gate need="business">
      <InvoiceScreen />
    </Gate>
  );
}
