import { useRef, useState } from 'react';
import { TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowRight, AtSign, Lock } from 'lucide-react-native';
import { AuthLayout } from '@/features/auth/AuthLayout';
import { Banner, Button, Field, Input, LinkText, Text } from '@/ui';
import { homeFor, useAuth } from '@/lib/auth';
import { errorMessage } from '@/lib/api';
import { haptic } from '@/lib/haptics';

export default function LoginScreen() {
  const { signIn, portal } = useAuth();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const pwRef = useRef<TextInput>(null);

  async function submit() {
    if (!email || !password) {
      setErr('Enter your email and password.');
      return;
    }
    setErr('');
    setLoading(true);
    try {
      const res = await signIn(email.trim(), password);
      if (!res.ok) {
        router.push({ pathname: '/two-factor', params: next ? { next } : {} });
        return;
      }
      haptic.success();
      const dest = next && next.startsWith('/') ? next : homeFor(res.user, portal);
      router.replace(dest as never);
    } catch (e) {
      haptic.error();
      setErr(errorMessage(e, 'Sign in failed. Please check your credentials.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      kicker="Sign in"
      title="Return to the flow."
      subtitle="Your procurement, suppliers and orders — in one operating layer."
      footer={
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
          <Text variant="bodySm" color="ink4">
            New to VYRO?
          </Text>
          <LinkText title="Create an account" onPress={() => router.replace('/signup')} />
        </View>
      }
    >
      {err ? <Banner tone="danger" message={err} /> : null}
      <Field label="Email">
        <Input
          icon={AtSign}
          value={email}
          onChangeText={setEmail}
          placeholder="you@business.lk"
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType="next"
          onSubmitEditing={() => pwRef.current?.focus()}
        />
      </Field>
      <Field label="Password" right={<LinkText title="Forgot password?" onPress={() => router.push('/forgot')} />}>
        <Input
          ref={pwRef}
          icon={Lock}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={submit}
        />
      </Field>
      <Button title="Enter workspace" size="lg" full loading={loading} onPress={submit} iconRight={ArrowRight} />
    </AuthLayout>
  );
}
