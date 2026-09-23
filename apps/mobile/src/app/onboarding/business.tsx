import { Gate } from '@/features/common/Gate';
import { OnboardingFlow } from '@/features/onboarding/OnboardingFlow';

export default function BusinessOnboardingRoute() {
  return (
    <Gate need="auth">
      <OnboardingFlow kind="business" />
    </Gate>
  );
}
