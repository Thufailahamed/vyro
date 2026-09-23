import { useState } from 'react';
import { View } from 'react-native';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { ShieldCheck } from 'lucide-react-native';
import { Badge, Banner, Button, Card, Field, Gutter, Input, Kicker, Loader, RadioCards, Screen, ScreenHeader, Text } from '@/ui';
import { api, errorMessage } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { go } from '../orders/kit';
import type { BusinessDetail } from '../commerce/types';

/** Cross-border buyer KYC — port of the web BuyerKycPage. */
export function KycScreen() {
  const { businessId: id } = useLocalSearchParams<{ businessId?: string }>();
  const [level, setLevel] = useState<'basic' | 'enhanced'>('basic');
  const [docs, setDocs] = useState('');
  const [submitErr, setSubmitErr] = useState('');

  const business = useQuery({
    queryKey: ['business-kyc', id],
    queryFn: () => api.get<{ business: BusinessDetail }>(`/businesses/${id}`),
    enabled: !!id,
  });

  const submit = useMutation({
    mutationFn: () =>
      api.post(`/admin/cross-border-kyc/${id}/submit`, {
        level,
        documentUrls: docs.split('\n').map((s) => s.trim()).filter(Boolean),
      }),
    onSuccess: () => {
      void business.refetch();
      go('/buyer/checkout');
    },
    onError: (e) => setSubmitErr(errorMessage(e)),
  });

  const kycLevel = business.data?.business?.kycLevel ?? 'none';
  const verifiedAt = business.data?.business?.kycVerifiedAt;
  const country = business.data?.business?.countryCode ?? 'LK';

  return (
    <Screen keyboard footer={kycLevel === 'none' ? <Button title="Submit for review" icon={ShieldCheck} variant="volt" loading={submit.isPending} onPress={() => { setSubmitErr(''); submit.mutate(); }} /> : undefined}>
      <ScreenHeader
        back
        kicker="Cross-Border Verification"
        title="Buyer KYC"
        subtitle="Verify once to earn the Verified buyer badge suppliers see on your RFQs. Submissions are reviewed manually within 1 business day."
      />
      <Gutter style={{ gap: 14 }}>
        {!id ? (
          <Banner tone="warning" message="No business ID provided." />
        ) : business.isLoading ? (
          <Loader label="Loading business…" />
        ) : (
          <>
            <Card style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Kicker>Business</Kicker>
                  <Text variant="h3">{business.data?.business?.name ?? '—'}</Text>
                  <Text variant="caption" color="ink4">
                    Country: <Text variant="caption" weight="semibold" color="ink">{country}</Text>
                    {kycLevel === 'none' ? ' · unverified' : ''}
                  </Text>
                </View>
                <Badge
                  tone={kycLevel === 'none' ? 'neutral' : 'success'}
                  icon={kycLevel === 'none' ? undefined : ShieldCheck}
                  label={kycLevel === 'none' ? 'Not verified' : `KYC ${kycLevel}`}
                />
              </View>
              {verifiedAt ? (
                <Text variant="caption" color="ink4">
                  Verified {formatDate(verifiedAt)}
                </Text>
              ) : null}
            </Card>

            {kycLevel === 'none' ? (
              <Card style={{ gap: 12 }}>
                <Text variant="h3">Submit verification documents</Text>
                <Field label="Verification level">
                  <RadioCards<'basic' | 'enhanced'>
                    value={level}
                    onChange={setLevel}
                    options={[
                      { value: 'basic', label: 'Basic', description: 'Business registration + address proof' },
                      { value: 'enhanced', label: 'Enhanced', description: 'Adds beneficial-owner and import licences' },
                    ]}
                  />
                </Field>
                <Field label="Document URLs" hint="One per line — hosted links to registration certificates, tax IDs, licences.">
                  <Input value={docs} onChangeText={setDocs} placeholder="https://…" multiline numberOfLines={4} autoCapitalize="none" style={{ minHeight: 96, textAlignVertical: 'top' }} />
                </Field>
                {submitErr ? <Banner tone="danger" message={submitErr} /> : null}
              </Card>
            ) : (
              <Card kind="bone" style={{ gap: 6 }}>
                <Text variant="bodySm" color="ink3">
                  {verifiedAt ? `Your business is verified at the ${kycLevel} level.` : 'Your documents are in the review queue. We will notify you once verification completes.'}
                </Text>
                <Button title="Back to checkout" variant="secondary" onPress={() => go('/buyer/checkout')} />
              </Card>
            )}
          </>
        )}
      </Gutter>
    </Screen>
  );
}
