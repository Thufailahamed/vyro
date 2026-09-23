import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { ShieldCheck } from 'lucide-react-native';
import { AuthLayout } from '@/features/auth/AuthLayout';
import { Banner, Button, Field, Input } from '@/ui';
import { api, errorMessage } from '@/lib/api';
import { homeFor, useAuth } from '@/lib/auth';
import { haptic } from '@/lib/haptics';

/** TOTP challenge shown when better-auth answers sign-in with `twoFactorRedirect`. */
export default function TwoFactorScreen() {
  const { next } = useLocalSearchParams<{ next?: string }>();
  const { refresh, portal } = useAuth();
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (code.replace(/\D/g, '').length < 6) return setErr('Enter the 6-digit code from your authenticator app.');
    setErr('');
    setLoading(true);
    try {
      await api.post('/auth/2fa/verify', { code: code.replace(/\D/g, '') });
      const user = await refresh();
      haptic.success();
      router.replace((next && next.startsWith('/') ? next : homeFor(user, portal)) as never);
    } catch (e) {
      haptic.error();
      setErr(errorMessage(e, 'That code did not match. Try again.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout kicker="Two-factor" title="Confirm it's you." subtitle="Open your authenticator app and enter the current code.">
      {err ? <Banner tone="danger" message={err} /> : null}
      <Field label="Authentication code">
        <Input
          icon={ShieldCheck}
          value={code}
          onChangeText={setCode}
          keyboardType="number-pad"
          maxLength={7}
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          placeholder="123 456"
          style={{ fontFamily: 'IBMPlexMono_500Medium', fontSize: 24, letterSpacing: 8 }}
          containerStyle={{ minHeight: 64 }}
          onSubmitEditing={submit}
          autoFocus
        />
      </Field>
      <Button title="Verify" size="lg" full loading={loading} onPress={submit} style={{ marginTop: 4 }} />
    </AuthLayout>
  );
}
