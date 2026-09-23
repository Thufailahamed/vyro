import { useState } from 'react';
import { View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { CheckCircle2, Plus, Trash2 } from 'lucide-react-native';
import {
  Banner,
  Button,
  Card,
  ErrorState,
  Gutter,
  IconButton,
  Input,
  Loader,
  Screen,
  ScreenHeader,
  Select,
  Text,
} from '@/ui';
import { api, errorMessage } from '@/lib/api';
import { formatLKR } from '@/lib/format';
import { colors, fonts } from '@/theme/tokens';
import { SLUGS, UploadStatus, type LineItem, type Slug, type Upload } from './common';
import { go } from '../shared';

/** Review OCR-extracted invoice lines before they count toward analytics. */
export function InvoiceReviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const [lines, setLines] = useState<LineItem[]>([]);
  const [totalCents, setTotalCents] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ['invoice', id],
    queryFn: () => api.get<{ upload: Upload }>(`/documents/${id}`),
    enabled: !!id,
    refetchInterval: (query) => {
      const u = (query.state.data as { upload?: Upload } | undefined)?.upload;
      return u && (u.status === 'pending' || u.status === 'processing') ? 2000 : false;
    },
  });

  const upload = q.data?.upload;
  const [loadedId, setLoadedId] = useState<string | null>(null);
  if (upload && upload.id !== loadedId) {
    setLoadedId(upload.id);
    setLines(upload.items ?? []);
    setTotalCents(upload.totalCents ?? (upload.items ?? []).reduce((s, l) => s + (l.totalCents ?? 0), 0));
  }

  const status = upload?.status ?? 'pending';
  const reading = status === 'pending' || status === 'processing';
  const lowConfidence = (upload?.ocrConfidence ?? 0) < 60;
  const manualRequired = status === 'manual_required' || (upload && upload.items.length === 0);

  function updateLine(i: number, patch: Partial<LineItem>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await api.post(`/documents/${id}/review`, {
        totalCents,
        lines: lines.map((l, i) => ({
          lineNumber: l.lineNumber || i + 1,
          description: l.description.trim() || 'Untitled line',
          quantity: l.quantity,
          unit: l.unit,
          unitPriceCents: l.unitPriceCents,
          totalCents: l.totalCents,
          categorySlug: (l.categorySlug ?? 'other') as Slug,
        })),
      });
      setSaved(true);
      await qc.invalidateQueries({ queryKey: ['invoice', id] });
      await qc.invalidateQueries({ queryKey: ['invoices'] });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen
      footer={
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button title="Back to invoices" variant="ghost" onPress={() => go('/buyer/invoices')} style={{ flex: 1 }} />
          <Button title={saved ? 'Saved' : 'Save review'} icon={saved ? CheckCircle2 : undefined} variant="volt" loading={saving} disabled={reading} onPress={() => void save()} style={{ flex: 2 }} />
        </View>
      }
    >
      <ScreenHeader
        back
        kicker={lowConfidence ? 'Awaiting manual entry' : 'Awaiting review'}
        title={upload?.originalFilename ?? 'Invoice'}
        subtitle={manualRequired ? 'Enter each line manually — OCR could not read this document.' : 'Check every extracted line, fix categories, then save.'}
      />
      <Gutter style={{ gap: 14 }}>
        {error ? <Banner tone="danger" message={error} /> : null}
        {saved ? <Banner tone="success" title="Review saved" message="This invoice now counts toward spend analytics." /> : null}

        {reading ? (
          <Card kind="elevated" padding={28} style={{ alignItems: 'center', gap: 10 }}>
            <Loader label={status === 'pending' ? 'Queued for OCR…' : 'Reading invoice…'} />
            <Text variant="caption" color="ink4" align="center">
              This usually takes a few seconds. The page refreshes automatically.
            </Text>
          </Card>
        ) : q.isError ? (
          <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
        ) : upload ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <UploadStatus status={status} />
              {upload.ocrConfidence != null ? (
                <Text variant="caption" color="ink4">
                  OCR confidence {Math.round(upload.ocrConfidence)}%
                </Text>
              ) : null}
            </View>

            {lines.map((l, i) => (
              <Card key={l.id ?? i} padding={14} style={{ gap: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{ width: 32, height: 32, borderRadius: 11, borderCurve: 'continuous', backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontFamily: fonts.monoMedium, fontSize: 12, color: colors.volt }}>{l.lineNumber || i + 1}</Text>
                    </View>
                    <Text variant="overline" color="ink4">
                      Line {l.lineNumber || i + 1}
                    </Text>
                  </View>
                  <IconButton icon={Trash2} variant="ghost" size={32} accessibilityLabel="Remove line" onPress={() => setLines((p) => p.filter((_, x) => x !== i))} />
                </View>
                <Input value={l.description} onChangeText={(v) => updateLine(i, { description: v })} placeholder="Description" />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Input value={l.quantity != null ? String(l.quantity) : ''} onChangeText={(v) => updateLine(i, { quantity: Number(v) || null })} placeholder="Qty" keyboardType="decimal-pad" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Input value={l.unit ?? ''} onChangeText={(v) => updateLine(i, { unit: v })} placeholder="Unit" />
                  </View>
                  <View style={{ flex: 1.4 }}>
                    <Input
                      value={l.unitPriceCents != null ? (l.unitPriceCents / 100).toFixed(2) : ''}
                      onChangeText={(v) => {
                        const n = Math.round((Number(v) || 0) * 100);
                        updateLine(i, { unitPriceCents: n, totalCents: l.quantity ? n * l.quantity : n });
                      }}
                      placeholder="Unit price"
                      keyboardType="decimal-pad"
                    />
                  </View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Select<Slug> value={(l.categorySlug ?? 'other') as Slug} options={SLUGS.map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) }))} onChange={(v) => updateLine(i, { categorySlug: v, categorySource: 'manual' })} title="Category" />
                  <Text style={{ fontFamily: fonts.monoMedium, fontSize: 14, color: colors.ink }}>{formatLKR(l.totalCents ?? 0)}</Text>
                </View>
              </Card>
            ))}

            <Button title="Add line" icon={Plus} variant="secondary" full onPress={() => setLines((p) => [...p, { id: `new-${p.length}`, lineNumber: p.length + 1, description: '', quantity: 1, unit: 'unit', unitPriceCents: 0, totalCents: 0, categorySlug: 'other', categorySource: 'manual' }])} />

            <Card kind="ink" padding={18} flow="invoice-total" style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text variant="bodySm" color="paperMuted">
                Invoice total
              </Text>
              <Text style={{ fontFamily: fonts.monoMedium, fontSize: 22, letterSpacing: -0.6, color: colors.volt }}>{formatLKR(totalCents)}</Text>
            </Card>
          </>
        ) : null}
      </Gutter>
    </Screen>
  );
}
