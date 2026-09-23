import { Gate } from '@/features/common/Gate';
import { OnboardingFlow } from '@/features/onboarding/OnboardingFlow';

export default function SupplierOnboardingRoute() {
  return (
    <Gate need="auth">
      <OnboardingFlow kind="supplier" />
    </Gate>
  );
}
