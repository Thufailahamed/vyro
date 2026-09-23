import { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowRight, AtSign, Building2, Lock, Phone, Store, User } from 'lucide-react-native';
import { AuthLayout } from '@/features/auth/AuthLayout';
import { Banner, Button, Field, Input, LinkText, RadioCards, Text } from '@/ui';
import { useAuth } from '@/lib/auth';
import { api, errorMessage } from '@/lib/api';
import { haptic } from '@/lib/haptics';

type Intent = 'buyer' | 'supplier';

export default function SignupScreen() {
  const params = useLocalSearchParams<{ intent?: Intent }>();
  const { refresh } = useAuth();
  const [intent, setIntent] = useState<Intent>(params.intent === 'supplier' ? 'supplier' : 'buyer');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit() {
    setErr('');
    if (!name.trim() || !email.trim()) return setErr('Name and email are required.');
    if (password.length < 8) return setErr('Password must be at least 8 characters.');
    setLoading(true);
    try {
      await api.post('/auth/sign-up', {
        email: email.trim().toLowerCase(),
        password,
        name: name.trim(),
        ...(phone.trim() ? { phone: phone.trim() } : {}),
      });
      await refresh();
      haptic.success();
      router.replace(intent === 'supplier' ? '/onboarding/supplier' : '/onboarding/business');
    } catch (e) {
      haptic.error();
      setErr(errorMessage(e, 'Could not create your account.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      kicker="Create account"
      title="Open your workspace."
      subtitle="One account works across buying and supplying."
      footer={
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
          <Text variant="bodySm" color="ink4">
            Already on VYRO?
          </Text>
          <LinkText title="Sign in" onPress={() => router.replace('/login')} />
        </View>
      }
    >
      {err ? <Banner tone="danger" message={err} /> : null}
      <Field label="I'm joining as">
        <RadioCards<Intent>
          value={intent}
          onChange={setIntent}
          options={[
            { value: 'buyer', label: 'A buyer business', description: 'Shops, hotels, restaurants, distributors', icon: Building2 },
            { value: 'supplier', label: 'A supplier', description: 'Mills, wholesalers, manufacturers', icon: Store },
          ]}
        />
      </Field>
      <Field label="Full name" required>
        <Input icon={User} value={name} onChangeText={setName} placeholder="Nimal Perera" autoComplete="name" textContentType="name" />
      </Field>
      <Field label="Work email" required>
        <Input
          icon={AtSign}
          value={email}
          onChangeText={setEmail}
          placeholder="you@business.lk"
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
        />
      </Field>
      <Field label="Mobile" hint="Optional — used for delivery updates.">
        <Input icon={Phone} value={phone} onChangeText={setPhone} placeholder="+94 77 123 4567" keyboardType="phone-pad" autoComplete="tel" />
      </Field>
      <Field label="Password" required hint="At least 8 characters.">
        <Input icon={Lock} value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" textContentType="newPassword" />
      </Field>
      <Button title="Create account" size="lg" full loading={loading} onPress={submit} iconRight={ArrowRight} />
      <Text variant="caption" color="ink4" align="center">
        By continuing you agree to the VYRO Terms and Privacy Policy.
      </Text>
    </AuthLayout>
  );
}
