import { View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, FileText, ScanLine, Upload } from 'lucide-react-native';
import { Button, Card, EmptyState, ErrorState, IconButton, IconTile, InkHero, Kicker, ListScreen, ListHeader, Gutter, Pulse, Row, SkeletonList, Text , ScreenHeader } from '@/ui';
import { Gate } from '@/features/common/Gate';
import { api, errorMessage } from '@/lib/api';
import { formatDate, formatRs } from '@/lib/format';
import { colors, fonts } from '@/theme/tokens';
import { go } from '../shared';
import { UploadStatus, type UploadRow } from './common';

export function InvoiceListScreen() {
  return (
    <Gate need="business">
      <Inner />
    </Gate>
  );
}

function Inner() {
  const q = useQuery({
    queryKey: ['invoices'],
    queryFn: () => api.get<{ uploads: UploadRow[] }>('/documents'),
    refetchInterval: (query) => {
      const list = (query.state.data as { uploads: UploadRow[] } | undefined)?.uploads ?? [];
      return list.some((u) => u.status === 'pending' || u.status === 'processing') ? 2000 : false;
    },
  });
  const rows = q.data?.uploads ?? [];
  const reading = rows.filter((u) => u.status === 'pending' || u.status === 'processing').length;
  const toReview = rows.filter((u) => u.status === 'ready' || u.status === 'manual_required').length;

  const header = (
    <ListHeader>
      <ScreenHeader
        back
        kicker="Document Intelligence"
        title="Uploaded invoices"
        subtitle="Every invoice you upload is read automatically. Review extracted lines before they affect your analytics."
        right={<IconButton icon={Upload} variant="ink" accessibilityLabel="Upload invoice" onPress={() => go('/buyer/invoices/upload')} />}
      />
      <Gutter>
        <InkHero seed="invoice-capture">
          <Row justify="space-between" align="flex-start">
            <View style={{ flex: 1, gap: 6 }}>
              <Kicker color="volt">Capture</Kicker>
              <Text variant="h1" color="paper">
                Snap a supplier invoice.
              </Text>
              <Text variant="bodySm" color="paperMuted">
                OCR reads lines and categorises spend. You confirm before it counts.
              </Text>
            </View>
            <IconTile icon={ScanLine} tone="volt" size={52} />
          </Row>
          <Row gap={10} style={{ marginTop: 16 }}>
            <HeroStat label="Uploaded" value={rows.length} />
            <HeroStat label="To review" value={toReview} accent={toReview > 0} />
            <HeroStat label="Reading" value={reading} pulse={reading > 0} />
          </Row>
          <Button title="Upload invoice" variant="volt" icon={Upload} full onPress={() => go('/buyer/invoices/upload')} style={{ marginTop: 16 }} />
        </InkHero>
      </Gutter>
    </ListHeader>
  );

  return (
    <ListScreen
      data={q.isLoading || q.isError ? [] : rows}
      keyExtractor={(u) => u.id}
      header={header}
      onRefresh={() => q.refetch()}
      ListEmptyComponent={
        q.isLoading ? (
          <SkeletonList rows={4} />
        ) : q.isError ? (
          <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
        ) : (
          <EmptyState
            icon={FileText}
            title="No invoices yet"
            message="Upload a supplier invoice to start tracking categorized spend."
            action={{ label: 'Upload your first invoice', onPress: () => go('/buyer/invoices/upload') }}
          />
        )
      }
      renderItem={({ item: u, index }) => (
        <Animated.View entering={FadeInDown.delay(Math.min(index, 8) * 45).duration(360)}>
          <Card onPress={() => go(`/buyer/invoices/${u.id}/review`)} padding={14} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <IconTile icon={FileText} tone={u.status === 'reviewed' ? 'success' : u.status === 'failed' ? 'danger' : u.status === 'ready' ? 'warning' : 'paper'} size={46} />
            <View style={{ flex: 1, gap: 5 }}>
              <Text variant="h3" numberOfLines={1}>
                {u.originalFilename}
              </Text>
              <UploadStatus status={u.status} />
              <Row gap={10} wrap>
                {u.ocrConfidence !== null ? <Meta>OCR {u.ocrConfidence}%</Meta> : null}
                {u.totalCents !== null ? <Meta>{formatRs(u.totalCents)}</Meta> : null}
                <Meta>{formatDate(u.createdAt)}</Meta>
              </Row>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, height: 30, paddingLeft: 12, paddingRight: 8, borderRadius: 15, backgroundColor: colors.bone }}>
              <Text variant="caption" weight="semibold" color="ink2">
                Review
              </Text>
              <ChevronRight size={14} color={colors.copper} />
            </View>
          </Card>
        </Animated.View>
      )}
    />
  );
}

function Meta({ children }: { children: React.ReactNode }) {
  return (
    <Text variant="caption" color="ink4" style={{ fontFamily: fonts.mono }}>
      {children}
    </Text>
  );
}

function HeroStat({ label, value, accent, pulse }: { label: string; value: number; accent?: boolean; pulse?: boolean }) {
  return (
    <View style={{ flex: 1, padding: 12, borderRadius: 14, borderCurve: 'continuous', backgroundColor: 'rgba(250,247,240,0.07)', gap: 2 }}>
      <Row gap={4}>
        <Text variant="overline" color="paperMuted">
          {label}
        </Text>
        {pulse ? <Pulse size={5} /> : null}
      </Row>
      <Text style={{ fontFamily: fonts.monoMedium, fontSize: 20, color: accent ? colors.volt : colors.paper }}>{value}</Text>
    </View>
  );
}
