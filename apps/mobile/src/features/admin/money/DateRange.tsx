import { useState } from 'react';
import { View , ScrollView } from 'react-native';
import { CalendarRange } from 'lucide-react-native';
import { Button, Chip, Field, Input, Sheet, Text } from '@/ui';
import { formatDate } from '@/lib/format';

export type RangePreset = 'all' | 'today' | '7d' | '30d' | '90d' | 'ytd' | 'custom';
export type DateRangeValue = { preset: RangePreset; from?: number; to?: number };

const DAY = 86_400_000;

export function rangeFor(preset: RangePreset): { from?: number; to?: number } {
  const now = Date.now();
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  switch (preset) {
    case 'today':
      return { from: start.getTime(), to: now };
    case '7d':
      return { from: now - 7 * DAY, to: now };
    case '30d':
      return { from: now - 30 * DAY, to: now };
    case '90d':
      return { from: now - 90 * DAY, to: now };
    case 'ytd':
      return { from: new Date(new Date().getFullYear(), 0, 1).getTime(), to: now };
    default:
      return {};
  }
}

function parseDay(s: string, endOfDay = false): number | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return undefined;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0);
  return Number.isNaN(d.getTime()) ? undefined : d.getTime();
}

const PRESETS: { value: RangePreset; label: string }[] = [
  { value: 'all', label: 'All time' },
  { value: 'today', label: 'Today' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
  { value: 'ytd', label: 'Year to date' },
];

/** Preset chips + custom from/to (YYYY-MM-DD) sheet — replaces the web's datetime-local inputs. */
export function DateRangeChips({ value, onChange }: { value: DateRangeValue; onChange: (v: DateRangeValue) => void }) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const customLabel =
    value.preset === 'custom' ? `${value.from ? formatDate(value.from) : '…'} → ${value.to ? formatDate(value.to) : 'now'}` : 'Custom';

  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 20 }}>
        {PRESETS.map((p) => (
          <Chip key={p.value} label={p.label} selected={value.preset === p.value} onPress={() => onChange({ preset: p.value, ...rangeFor(p.value) })} />
        ))}
        <Chip label={customLabel} icon={CalendarRange} selected={value.preset === 'custom'} onPress={() => setOpen(true)} />
      </ScrollView>
      <Sheet
        visible={open}
        onClose={() => setOpen(false)}
        title="Custom range"
        subtitle="Dates in your local time zone."
        footer={
          <Button
            title="Apply range"
            full
            size="lg"
            onPress={() => {
              const f = from ? parseDay(from) : undefined;
              const t = to ? parseDay(to, true) : undefined;
              if ((from && f === undefined) || (to && t === undefined)) {
                setErr('Use the YYYY-MM-DD format.');
                return;
              }
              if (f && t && f > t) {
                setErr('The start date must be before the end date.');
                return;
              }
              setErr(null);
              setOpen(false);
              onChange(f || t ? { preset: 'custom', from: f, to: t } : { preset: 'all' });
            }}
          />
        }
      >
        <View style={{ gap: 14 }}>
          <Field label="From" hint="e.g. 2026-01-01">
            <Input value={from} onChangeText={setFrom} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" autoCapitalize="none" />
          </Field>
          <Field label="To" hint="Leave empty for now" error={err}>
            <Input value={to} onChangeText={setTo} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" autoCapitalize="none" />
          </Field>
          <Text variant="caption" color="ink4">
            Ranges are inclusive of both days.
          </Text>
        </View>
      </Sheet>
    </>
  );
}
