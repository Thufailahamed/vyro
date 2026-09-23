import { useState } from 'react';
import { router } from 'expo-router';
import { AtSign, KeyRound, MailCheck } from 'lucide-react-native';
import { AuthLayout } from '@/features/auth/AuthLayout';
import { Banner, Button, EmptyState, Field, Input } from '@/ui';
import { api, errorMessage } from '@/lib/api';

export default function ForgotScreen() {
  const [email, setEmail] = useState('');
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!email.trim()) return setErr('Enter the email on your account.');
    setErr('');
    setLoading(true);
    try {
      await api.post('/auth/forget-password', { email: email.trim().toLowerCase() });
      setDone(true);
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout kicker="Password reset" title="Lost the key?" subtitle="We'll email you a secure link to choose a new password.">
      {done ? (
        <>
          <EmptyState
            icon={MailCheck}
            title="Check your inbox"
            message={`If an account exists for ${email}, a reset link is on its way. It expires in 60 minutes.`}
          />
          <Button title="I have a reset code" variant="secondary" full icon={KeyRound} onPress={() => router.push('/reset')} />
          <Button title="Back to sign in" full onPress={() => router.replace('/login')} />
        </>
      ) : (
        <>
          {err ? <Banner tone="danger" message={err} /> : null}
          <Field label="Email">
            <Input icon={AtSign} value={email} onChangeText={setEmail} placeholder="you@business.lk" keyboardType="email-address" autoCapitalize="none" onSubmitEditing={submit} />
          </Field>
          <Button title="Send reset link" size="lg" full loading={loading} onPress={submit} />
        </>
      )}
    </AuthLayout>
  );
}
