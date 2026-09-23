import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { KeyRound, Lock } from 'lucide-react-native';
import { AuthLayout } from '@/features/auth/AuthLayout';
import { Banner, Button, Field, Input, useToast } from '@/ui';
import { api, errorMessage } from '@/lib/api';

/** Opened from the reset email deep link (`vyro://reset?token=…`) or by pasting the token. */
export default function ResetScreen() {
  const params = useLocalSearchParams<{ token?: string }>();
  const toast = useToast();
  const [token, setToken] = useState(params.token ?? '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit() {
    setErr('');
    if (!token.trim()) return setErr('Paste the reset token from your email.');
    if (password.length < 8) return setErr('Password must be at least 8 characters.');
    if (password !== confirm) return setErr('Passwords do not match.');
    setLoading(true);
    try {
      await api.post('/auth/reset-password', { newPassword: password, token: token.trim() });
      toast.success('Password updated', 'Sign in with your new password.');
      router.replace('/login');
    } catch (e) {
      setErr(errorMessage(e, 'This reset link is invalid or has expired.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout kicker="New password" title="Choose a new key." subtitle="Use something long and unique to your VYRO account.">
      {err ? <Banner tone="danger" message={err} /> : null}
      {!params.token ? (
        <Field label="Reset token" hint="The code at the end of the link in your email.">
          <Input icon={KeyRound} value={token} onChangeText={setToken} autoCapitalize="none" autoCorrect={false} />
        </Field>
      ) : null}
      <Field label="New password">
        <Input icon={Lock} value={password} onChangeText={setPassword} secureTextEntry textContentType="newPassword" />
      </Field>
      <Field label="Confirm password">
        <Input icon={Lock} value={confirm} onChangeText={setConfirm} secureTextEntry textContentType="newPassword" onSubmitEditing={submit} />
      </Field>
      <Button title="Update password" size="lg" full loading={loading} onPress={submit} style={{ marginTop: 4 }} />
    </AuthLayout>
  );
}
